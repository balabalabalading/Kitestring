use std::fs;
use std::path::Path;

use crate::models::config::{load_config, save_config, AppConfig};
use crate::models::distribution::{DistStatus, Distribution, EntryType, Scope, Tool};
use crate::models::skill::{Skill, SourceType};
use crate::services::skill_parser::{find_skill_md_files, parse_skill_md};

/// Delete a skill and clean up all associated distributions (remove symlinks unless keep_symlinks)
pub fn delete_skill(skill_id: &str, keep_symlinks: bool) -> Result<(), String> {
    let mut config = load_config()?;

    let _skill = config.skills.iter().find(|s| s.id == skill_id)
        .ok_or("Skill not found")?
        .clone();

    // Remove all associated distributions (symlinks + records)
    let dist_ids: Vec<String> = config.distributions.iter()
        .filter(|d| d.skill_id == skill_id)
        .map(|d| d.id.clone())
        .collect();

    for dist_id in &dist_ids {
        let dist = config.distributions.iter().find(|d| d.id == *dist_id).unwrap();
        // Only remove the filesystem symlink; never delete real folder entries
        if !keep_symlinks && dist.entry_type == EntryType::Symlink {
            let target = Path::new(&dist.target_path);
            if target.exists() || target.symlink_metadata().is_ok() {
                let _ = fs::remove_file(target);
            }
        }
    }

    config.distributions.retain(|d| d.skill_id != skill_id);

    // Remove skill from any projects' skill_ids
    for project in &mut config.projects {
        project.skill_ids.retain(|id| id != skill_id);
    }

    // Remove skill record
    config.skills.retain(|s| s.id != skill_id);

    save_config(&config)?;
    Ok(())
}

/// Import a skill from a local folder path
pub fn import_local_skill(path: &str) -> Result<Vec<Skill>, String> {
    let dir = Path::new(path);
    if !dir.exists() && !dir.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        return Err(format!("Path does not exist or is not a directory: {path}"));
    }

    let abs_path = fs::canonicalize(dir)
        .map_err(|e| format!("Failed to resolve absolute path: {e}"))?;

    let skill_files = find_skill_md_files(&abs_path);
    if skill_files.is_empty() {
        return Err("No SKILL.md found in the specified directory".to_string());
    }

    let mut config = load_config()?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut new_skills = Vec::new();

    for skill_md_path in skill_files {
        let skill_source_path = skill_md_path
            .parent()
            .unwrap_or(&abs_path);

        // If the skill directory is a symlink, resolve it to the real source path.
        // We still create a Skill instance using the real path as source_path.
        let is_symlink = skill_source_path
            .symlink_metadata()
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);

        let resolved_source_path;
        let effective_source_path = if is_symlink {
            match fs::canonicalize(skill_source_path) {
                Ok(real) => {
                    resolved_source_path = real;
                    resolved_source_path.as_path()
                }
                Err(_) => continue, // can't resolve broken symlink — skip
            }
        } else {
            skill_source_path
        };

        let skill_source = effective_source_path.to_string_lossy().to_string();

        // Primary dedup: same real source path
        if config.skills.iter().any(|s| s.source_path == skill_source) {
            continue;
        }

        // Re-read SKILL.md from the resolved path if needed
        let effective_skill_md = if is_symlink {
            effective_source_path.join("SKILL.md")
        } else {
            skill_md_path.clone()
        };
        let meta = parse_skill_md(&effective_skill_md)?;
        let (source_type, github_url, has_git) = detect_source_info(effective_source_path);

        let skill = Skill {
            id: uuid::Uuid::new_v4().to_string(),
            name: meta.name,
            description: meta.description,
            source_type,
            source_path: skill_source,
            github_url,
            has_git,
            created_at: now.clone(),
            updated_at: now.clone(),
            group: None,
        };

        new_skills.push(skill.clone());
        config.skills.push(skill);
    }

    save_config(&config)?;
    Ok(new_skills)
}

/// A conflict detected during GitHub import: a skill with this name already exists locally.
#[derive(serde::Serialize, Clone)]
pub struct GithubConflict {
    /// Name of the conflicting skill (from SKILL.md in the cloned repo)
    pub skill_name: String,
    /// ID of the existing local skill that conflicts
    pub existing_skill_id: String,
    /// True when the existing skill shares the same GitHub URL → offer pull.
    /// False when it's a different repo with the same skill name → offer create new.
    pub has_git: bool,
    /// Absolute path of the skill inside the cloned repo (used for force-import)
    pub source_path: String,
    /// The GitHub URL being imported
    pub github_url: String,
}

/// Result returned by import_github_skill
#[derive(serde::Serialize)]
pub struct ImportGithubResult {
    pub imported: Vec<Skill>,
    pub conflicts: Vec<GithubConflict>,
}

/// Normalize a GitHub URL for comparison: strip trailing `.git` and `/`.
fn normalize_github_url(url: &str) -> String {
    url.trim_end_matches('/')
        .trim_end_matches(".git")
        .to_lowercase()
}

/// Import skills from a Github repository URL.
/// Returns imported skills plus any conflicts (same-path or same-name existing skills).
pub fn import_github_skill(url: &str) -> Result<ImportGithubResult, String> {
    // Clone the repo to ~/.kitestring/repos/
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let repos_dir = home.join(".kitestring").join("repos");
    fs::create_dir_all(&repos_dir)
        .map_err(|e| format!("Failed to create repos directory: {e}"))?;

    // Extract repo name from URL
    let repo_name = url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("repo")
        .trim_end_matches(".git");

    let owner = url
        .trim_end_matches('/')
        .rsplit('/')
        .nth(1)
        .unwrap_or("unknown");

    let clone_dir = repos_dir.join(format!("{owner}-{repo_name}"));

    // Clone if not exists, pull if exists
    if clone_dir.exists() {
        pull_repo(&clone_dir)?;
    } else {
        clone_repo(url, &clone_dir)?;
    }

    let abs_path = fs::canonicalize(&clone_dir)
        .map_err(|e| format!("Failed to resolve clone path: {e}"))?;

    let skill_files = find_skill_md_files(&abs_path);
    if skill_files.is_empty() {
        return Err("No SKILL.md found in the cloned repository".to_string());
    }

    let mut config = load_config()?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut new_skills = Vec::new();
    let mut conflicts = Vec::new();
    let normalized_url = normalize_github_url(url);

    for skill_md_path in skill_files {
        let meta = parse_skill_md(&skill_md_path)?;

        let skill_source = skill_md_path
            .parent()
            .unwrap_or(&abs_path)
            .to_string_lossy()
            .to_string();

        // Primary dedup: exact source path already in config
        if config.skills.iter().any(|s| s.source_path == skill_source) {
            continue;
        }

        // Secondary: check by name against existing skills
        let name_conflict = config.skills.iter().find(|s| s.name == meta.name);
        if let Some(existing) = name_conflict {
            // Distinguish conflict type: same upstream repo vs coincidental same name
            let existing_norm = existing.github_url.as_deref()
                .map(normalize_github_url)
                .unwrap_or_default();
            let same_repo = !existing_norm.is_empty() && existing_norm == normalized_url;

            conflicts.push(GithubConflict {
                skill_name: meta.name,
                existing_skill_id: existing.id.clone(),
                // has_git=true → offer pull (same repo); has_git=false → offer create new
                has_git: same_repo,
                source_path: skill_source,
                github_url: url.to_string(),
            });
            continue;
        }

        let skill = Skill {
            id: uuid::Uuid::new_v4().to_string(),
            name: meta.name,
            description: meta.description,
            source_type: SourceType::Github,
            source_path: skill_source,
            github_url: Some(url.to_string()),
            has_git: true,
            created_at: now.clone(),
            updated_at: now.clone(),
            group: None,
        };

        new_skills.push(skill.clone());
        config.skills.push(skill);
    }

    save_config(&config)?;
    Ok(ImportGithubResult { imported: new_skills, conflicts })
}

/// Force-import a skill from an already-cloned path, bypassing name conflict checks.
/// Used when user confirms "create new skill" from a GitHub conflict dialog.
pub fn force_import_skill(source_path: &str, github_url: &str) -> Result<Skill, String> {
    let path = Path::new(source_path);
    let skill_md = path.join("SKILL.md");
    if !skill_md.exists() {
        return Err("SKILL.md not found at the given source path".to_string());
    }

    let meta = parse_skill_md(&skill_md)?;
    let mut config = load_config()?;
    let now = chrono::Utc::now().to_rfc3339();

    let skill = Skill {
        id: uuid::Uuid::new_v4().to_string(),
        name: meta.name,
        description: meta.description,
        source_type: SourceType::Github,
        source_path: source_path.to_string(),
        github_url: Some(github_url.to_string()),
        has_git: true,
        created_at: now.clone(),
        updated_at: now.clone(),
        group: None,
    };

    config.skills.push(skill.clone());
    save_config(&config)?;
    Ok(skill)
}

fn clone_repo(url: &str, dest: &Path) -> Result<(), String> {
    git2::Repository::clone(url, dest)
        .map_err(|e| format!("Failed to clone repository: {e}"))?;
    Ok(())
}

fn pull_repo(repo_path: &Path) -> Result<bool, String> {
    let repo = git2::Repository::open(repo_path)
        .map_err(|e| format!("Failed to open repository: {e}"))?;

    // Remove corrupted FETCH_HEAD before fetching (git2 will rewrite it)
    let fetch_head_path = repo_path.join(".git").join("FETCH_HEAD");
    if fetch_head_path.exists() && repo.find_reference("FETCH_HEAD").is_err() {
        let _ = fs::remove_file(&fetch_head_path);
    }

    let mut remote = repo.find_remote("origin")
        .map_err(|e| format!("Failed to find remote: {e}"))?;

    remote.fetch(&["main"], None, None)
        .or_else(|_| remote.fetch(&["master"], None, None))
        .map_err(|e| format!("Failed to fetch: {e}"))?;

    // Try FETCH_HEAD first, fall back to tracking branch refs
    let fetch_ref = repo.find_reference("FETCH_HEAD")
        .or_else(|_| repo.find_reference("refs/remotes/origin/main"))
        .or_else(|_| repo.find_reference("refs/remotes/origin/master"))
        .map_err(|e| format!("Failed to find fetch ref: {e}"))?;

    let fetch_commit = repo.reference_to_annotated_commit(&fetch_ref)
        .map_err(|e| format!("Failed to resolve fetch commit: {e}"))?;

    let (analysis, _) = repo.merge_analysis(&[&fetch_commit])
        .map_err(|e| format!("Failed to analyze merge: {e}"))?;

    if analysis.is_up_to_date() {
        return Ok(false);
    }

    if analysis.is_fast_forward() {
        let refname = "refs/heads/main";
        let mut reference = repo.find_reference(refname)
            .or_else(|_| repo.find_reference("refs/heads/master"))
            .map_err(|e| format!("Failed to find branch ref: {e}"))?;

        reference.set_target(fetch_commit.id(), "Fast-forward")
            .map_err(|e| format!("Failed to set target: {e}"))?;
        repo.set_head(refname)
            .map_err(|e| format!("Failed to set head: {e}"))?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(|e| format!("Failed to checkout: {e}"))?;

        return Ok(true);
    }

    // Diverged or unborn — nothing was actually changed
    Ok(false)
}

/// Pull updates for a skill (works for both Github and Local skills in git repos)
pub fn pull_skill(skill_id: &str) -> Result<PullResult, String> {
    let config = load_config()?;
    let skill = config.skills.iter().find(|s| s.id == skill_id)
        .ok_or("Skill not found")?;

    let source_path = Path::new(&skill.source_path);
    // Navigate to the repo root (may be a subdirectory within the cloned repo)
    let repo_path = find_git_repo_root(source_path)
        .ok_or("Skill is not in a git repository")?;

    // Record existing skill names before pull
    let before_skills: Vec<String> = config.skills.iter()
        .filter(|s| s.source_path.starts_with(repo_path.to_string_lossy().as_ref()))
        .map(|s| s.name.clone())
        .collect();

    let updated = pull_repo(&repo_path)?;
    let skill_files = find_skill_md_files(&repo_path);
    let after_names: Vec<String> = skill_files.iter()
        .filter_map(|p| parse_skill_md(p).ok())
        .map(|m| m.name.clone())
        .collect();

    let new_skills: Vec<String> = after_names.iter()
        .filter(|n| !before_skills.contains(n))
        .cloned()
        .collect();

    let removed_skills: Vec<String> = before_skills.iter()
        .filter(|n| !after_names.contains(n))
        .cloned()
        .collect();

    // Import any new skills found
    if !new_skills.is_empty() {
        let mut config = load_config()?;
        let now = chrono::Utc::now().to_rfc3339();

        for skill_md_path in &skill_files {
            let meta = parse_skill_md(skill_md_path)?;
            if !new_skills.contains(&meta.name) {
                continue;
            }

            let skill_source = skill_md_path
                .parent()
                .unwrap_or(&repo_path)
                .to_string_lossy()
                .to_string();

            let skill = Skill {
                id: uuid::Uuid::new_v4().to_string(),
                name: meta.name,
                description: meta.description,
                source_type: SourceType::Github,
                source_path: skill_source,
                github_url: skill.github_url.clone(),
                has_git: true,
                created_at: now.clone(),
                updated_at: now.clone(),
                group: None,
            };

            config.skills.push(skill);
        }

        save_config(&config)?;
    }

    // Soft-delete skills that no longer exist in the repo
    if !removed_skills.is_empty() {
        let mut config = load_config()?;
        let repo_str = repo_path.to_string_lossy().to_string();

        // Find IDs of skills whose source_path is under the repo and whose name was removed
        let removed_ids: Vec<String> = config
            .skills
            .iter()
            .filter(|s| {
                s.source_path.starts_with(&repo_str) && removed_skills.contains(&s.name)
            })
            .map(|s| s.id.clone())
            .collect();

        if !removed_ids.is_empty() {
            // Remove distribution records (keep symlinks — caller can clean up)
            config.distributions.retain(|d| !removed_ids.contains(&d.skill_id));

            // Remove from project skill_ids
            for project in &mut config.projects {
                project.skill_ids.retain(|id| !removed_ids.contains(id));
            }

            // Remove skill records
            config.skills.retain(|s| !removed_ids.contains(&s.id));

            save_config(&config)?;
        }
    }
    Ok(PullResult { new_skills, removed_skills, updated })
}

pub struct PullResult {
    pub new_skills: Vec<String>,
    pub removed_skills: Vec<String>,
    pub updated: bool,
}

/// Walk up from a path to find the git repository root
fn find_git_repo_root(path: &Path) -> Option<std::path::PathBuf> {
    let mut current = path;
    loop {
        if current.join(".git").exists() {
            return Some(current.to_path_buf());
        }
        current = current.parent()?;
    }
}

/// Discover and import skills from all configured tool global paths.
/// Resolves symlinks to real targets so users who already have skills
/// linked from other tools get them imported automatically.
/// For each symlink found, a Distribution record (Linked) is created.
/// Shared context for the skill-discovery pass.
struct DiscoveryContext<'a> {
    config: &'a mut AppConfig,
    imported: Vec<Skill>,
    config_changed: bool,
    now: String,
    ignored_abs: Vec<std::path::PathBuf>,
}

impl<'a> DiscoveryContext<'a> {
    fn new(config: &'a mut AppConfig) -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        let ignored_abs = config.ignored_paths.iter()
            .map(|p| home.join(p.trim_start_matches("~/")))
            .collect();
        let now = chrono::Utc::now().to_rfc3339();
        DiscoveryContext { config, imported: Vec::new(), config_changed: false, now, ignored_abs }
    }

    fn is_ignored(&self, path: &std::path::Path) -> bool {
        self.ignored_abs.iter().any(|ig| path.starts_with(ig))
    }

    /// Scan a primary global dir (one level, symlink-aware).
    fn scan_global_path(&mut self, dir: &std::path::Path, tool: &Tool) {
        if self.is_ignored(dir) || !dir.exists() { return; }
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let is_symlink = entry_path.symlink_metadata()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);
            let real_path = if is_symlink || entry_path.is_dir() {
                match fs::canonicalize(&entry_path) {
                    Ok(p) => p,
                    Err(_) => { if is_symlink { continue; } else { entry_path.clone() } },
                }
            } else {
                continue;
            };
            if !real_path.is_dir() { continue; }
            let real_path_str = real_path.to_string_lossy().to_string();
            let skill_id = find_or_import_skill(
                &real_path, &real_path_str, &self.now.clone(),
                self.config, &mut self.imported, &mut self.config_changed,
            );
            let skill_id = match skill_id { Some(id) => id, None => continue };
            let entry_path_str = entry_path.to_string_lossy().to_string();
            let entry_type = if is_symlink { EntryType::Symlink } else { EntryType::Folder };
            add_distribution_if_missing(
                skill_id, tool.clone(), entry_path_str, entry_type,
                self.config, &mut self.config_changed,
            );
        }
    }

    /// Recursively scan an extra_globals dir (up to depth 5).
    fn scan_extra_global(&mut self, eg_dir: &std::path::Path, tool: &Tool) {
        if !eg_dir.exists() || self.is_ignored(eg_dir) { return; }
        let skill_dirs = find_skill_dirs_recursive(eg_dir, 5);
        for skill_dir in skill_dirs {
            if self.is_ignored(&skill_dir) { continue; }
            let is_symlink = skill_dir.symlink_metadata()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);
            let real_path = match fs::canonicalize(&skill_dir) {
                Ok(p) => p,
                Err(_) => { if is_symlink { continue; } else { skill_dir.clone() } },
            };
            if !real_path.is_dir() { continue; }
            let real_path_str = real_path.to_string_lossy().to_string();
            let skill_id = find_or_import_skill(
                &real_path, &real_path_str, &self.now.clone(),
                self.config, &mut self.imported, &mut self.config_changed,
            );
            let skill_id = match skill_id { Some(id) => id, None => continue };
            let entry_path_str = skill_dir.to_string_lossy().to_string();
            let entry_type = if is_symlink { EntryType::Symlink } else { EntryType::Folder };
            add_distribution_if_missing(
                skill_id, tool.clone(), entry_path_str, entry_type,
                self.config, &mut self.config_changed,
            );
        }
    }
}

pub fn discover_skills_from_tool_paths() -> Result<Vec<Skill>, String> {
    let mut config = load_config()?;
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;

    // Collect (tool, global_dir, extra_global_dirs) before borrowing config mutably
    let tool_scan_paths: Vec<(Tool, std::path::PathBuf, Vec<std::path::PathBuf>)> = config.tool_paths.iter()
        .filter_map(|(k, v)| {
            let tool: Tool = k.parse().ok()?;
            let global_dir = home.join(v.global.trim_start_matches("~/"));
            let extra_dirs = v.extra_globals.iter()
                .map(|eg| home.join(eg.trim_start_matches("~/")))
                .collect();
            Some((tool, global_dir, extra_dirs))
        })
        .collect();

    let mut ctx = DiscoveryContext::new(&mut config);

    for (tool, global_dir, extra_dirs) in &tool_scan_paths {
        ctx.scan_global_path(global_dir, tool);
        for eg_dir in extra_dirs {
            ctx.scan_extra_global(eg_dir, tool);
        }
    }

    if ctx.config_changed {
        save_config(ctx.config)?;
    }

    Ok(ctx.imported)}

/// Find all directories that contain SKILL.md, up to `max_depth` levels deep.
fn find_skill_dirs_recursive(dir: &Path, max_depth: u32) -> Vec<std::path::PathBuf> {
    let mut result = Vec::new();
    if max_depth == 0 || !dir.is_dir() {
        return result;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return result,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() || path.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false) {
            if path.join("SKILL.md").exists() {
                result.push(path);
            } else if path.is_dir() {
                result.extend(find_skill_dirs_recursive(&path, max_depth - 1));
            }
        }
    }
    result
}

/// Find existing skill record by source_path, or import a new one.
/// Returns the skill_id, or None if SKILL.md is missing/unparseable.
fn find_or_import_skill(
    real_path: &Path,
    real_path_str: &str,
    now: &str,
    config: &mut crate::models::config::AppConfig,
    imported: &mut Vec<Skill>,
    config_changed: &mut bool,
) -> Option<String> {
    if let Some(existing) = config.skills.iter().find(|s| s.source_path == real_path_str) {
        return Some(existing.id.clone());
    }

    let skill_md = real_path.join("SKILL.md");
    if !skill_md.exists() {
        return None;
    }

    let meta = parse_skill_md(&skill_md).ok()?;
    let (source_type, github_url, has_git) = detect_source_info(real_path);

    let skill = Skill {
        id: uuid::Uuid::new_v4().to_string(),
        name: meta.name,
        description: meta.description,
        source_type,
        source_path: real_path_str.to_string(),
        github_url,
        has_git,
        created_at: now.to_string(),
        updated_at: now.to_string(),
        group: None,
    };

    let id = skill.id.clone();
    imported.push(skill.clone());
    config.skills.push(skill);
    *config_changed = true;
    Some(id)
}

/// Add a Distribution record if one with the same skill_id + target_path doesn't exist.
fn add_distribution_if_missing(
    skill_id: String,
    tool: Tool,
    target_path: String,
    entry_type: EntryType,
    config: &mut crate::models::config::AppConfig,
    config_changed: &mut bool,
) {
    let already_exists = config.distributions.iter()
        .any(|d| d.skill_id == skill_id && d.target_path == target_path);

    if !already_exists {
        config.distributions.push(Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id,
            tool,
            scope: Scope::Global,
            target_path,
            status: DistStatus::Linked,
            entry_type,
        });
        *config_changed = true;
    }
}

/// Detect source type, GitHub URL, and git presence by inspecting the git remote of a path.
/// Returns (source_type, github_url, has_git).
fn detect_source_info(path: &Path) -> (SourceType, Option<String>, bool) {
    let repo_root = match find_git_repo_root(path) {
        Some(r) => r,
        None => return (SourceType::Local, None, false),
    };

    let repo = match git2::Repository::open(&repo_root) {
        Ok(r) => r,
        Err(_) => return (SourceType::Local, None, true), // .git exists but can't open — still has git
    };

    let remote = match repo.find_remote("origin") {
        Ok(r) => r,
        Err(_) => return (SourceType::Local, None, true), // git repo but no remote
    };

    let url = remote.url().unwrap_or("").to_string();
    if url.contains("github.com") {
        (SourceType::Github, Some(url), true)
    } else {
        (SourceType::Local, None, true) // non-GitHub remote, still has git
    }
}


/// Scan a project folder for skills inside each tool's project-relative subdir.
/// For each discovered skill dir:
///   - find or import the skill (by real path)
///   - assign it to the project (add to skill_ids)
///   - if the entry is a symlink, create a Project-scoped Distribution record
///
/// Does NOT call save_config — the caller is responsible for saving.
pub fn scan_project_folder(
    project_id: &str,
    project_path: &str,
    config: &mut crate::models::config::AppConfig,
) -> Result<(), String> {
    let project_dir = Path::new(project_path);
    if !project_dir.exists() {
        return Ok(());
    }

    let now = chrono::Utc::now().to_rfc3339();
    let mut imported = Vec::new();
    let mut config_changed = false;

    // Snapshot tool configs before mutating config
    let tool_configs: Vec<(String, String)> = config.tool_paths.iter()
        .map(|(k, v)| (k.clone(), v.project.clone()))
        .collect();

    for (tool_name, tool_project_rel) in &tool_configs {
        let tool_dir = project_dir.join(tool_project_rel.trim_start_matches('/'));
        if !tool_dir.exists() {
            continue;
        }

        let entries = match fs::read_dir(&tool_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let entry_path = entry.path();

            let is_symlink = entry_path
                .symlink_metadata()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);

            let real_path = if is_symlink {
                match fs::canonicalize(&entry_path) {
                    Ok(p) => p,
                    Err(_) => continue,
                }
            } else if entry_path.is_dir() {
                match fs::canonicalize(&entry_path) {
                    Ok(p) => p,
                    Err(_) => entry_path.clone(),
                }
            } else {
                continue;
            };

            if !real_path.is_dir() {
                continue;
            }

            let real_path_str = real_path.to_string_lossy().to_string();

            let skill_id = match find_or_import_skill(
                &real_path,
                &real_path_str,
                &now,
                config,
                &mut imported,
                &mut config_changed,
            ) {
                Some(id) => id,
                None => continue,
            };

            // Add skill to project.skill_ids if not already there
            let already_in_project = config
                .projects
                .iter()
                .find(|p| p.id == project_id)
                .map(|p| p.skill_ids.contains(&skill_id))
                .unwrap_or(false);

            if !already_in_project {
                if let Some(project) = config.projects.iter_mut().find(|p| p.id == project_id) {
                    project.skill_ids.push(skill_id.clone());
                    config_changed = true;
                }
            }

            // Create a Project-scoped Distribution for both real folders and symlinks
            {                let tool: Tool = match tool_name.parse() {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                let entry_path_str = entry_path.to_string_lossy().to_string();
                let entry_type = if is_symlink { EntryType::Symlink } else { EntryType::Folder };

                let already_exists = config
                    .distributions
                    .iter()
                    .any(|d| d.skill_id == skill_id && d.target_path == entry_path_str);

                if !already_exists {
                    config.distributions.push(Distribution {
                        id: uuid::Uuid::new_v4().to_string(),
                        skill_id,
                        tool,
                        scope: Scope::Project,
                        target_path: entry_path_str,
                        status: DistStatus::Linked,
                        entry_type,
                    });
                    config_changed = true;
                }
            }
        }
    }

    let _ = config_changed; // caller saves
    Ok(())
}

/// Delete all skills and their associated distributions
pub fn delete_all_skills(keep_symlinks: bool) -> Result<(), String> {
    let mut config = load_config()?;

    if !keep_symlinks {
        for dist in &config.distributions {
            // Only remove symlinks, never real folder entries
            if dist.entry_type == EntryType::Symlink {
                let target = Path::new(&dist.target_path);
                if target.exists() || target.symlink_metadata().is_ok() {
                    let _ = fs::remove_file(target);
                }
            }
        }
    }

    config.distributions.clear();
    config.skills.clear();

    for project in &mut config.projects {
        project.skill_ids.clear();
    }

    save_config(&config)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup() -> tempfile::TempDir {
        crate::test_helpers::setup_test_env()
    }

    #[test]
    fn test_import_local_skill_single() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "test-skill", "A test");
        let skills = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "test-skill");
        assert_eq!(skills[0].source_type, SourceType::Local);
    }

    #[test]
    fn test_import_local_skill_multiple() {
        let _tmp = setup();
        let base = tempfile::tempdir().unwrap();
        crate::test_helpers::create_nested_skill_md(base.path(), "skill-a", "skill-a", "Desc A");
        crate::test_helpers::create_nested_skill_md(base.path(), "skill-b", "skill-b", "Desc B");
        let skills = import_local_skill(base.path().to_str().unwrap()).unwrap();
        assert_eq!(skills.len(), 2);
        let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"skill-a"));
        assert!(names.contains(&"skill-b"));
    }

    #[test]
    fn test_import_local_skill_no_skill_md() {
        let _tmp = setup();
        let empty_dir = tempfile::tempdir().unwrap();
        let result = import_local_skill(empty_dir.path().to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No SKILL.md"));
    }

    #[test]
    fn test_import_local_skill_not_directory() {
        let _tmp = setup();
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("not-a-dir.txt");
        fs::write(&file_path, "hello").unwrap();
        let result = import_local_skill(file_path.to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn test_import_local_skill_duplicate_skip() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "dup-skill", "First import");
        let first = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();
        assert_eq!(first.len(), 1);
        // Import same path again — should skip duplicate
        let second = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();
        assert!(second.is_empty());
    }

    #[test]
    fn test_import_local_skill_creates_config_entry() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "config-test", "Check config");
        import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();
        let config = crate::models::config::load_config().unwrap();
        assert_eq!(config.skills.len(), 1);
        assert_eq!(config.skills[0].name, "config-test");
    }

    #[test]
    fn test_find_git_repo_root() {
        let tmp = tempfile::tempdir().unwrap();
        git2::Repository::init(&tmp).unwrap();
        let subdir = tmp.path().join("a").join("b");
        fs::create_dir_all(&subdir).unwrap();
        let root = find_git_repo_root(&subdir);
        assert_eq!(root.unwrap(), tmp.path());
    }

    #[test]
    fn test_find_git_repo_root_not_git() {
        let tmp = tempfile::tempdir().unwrap();
        let root = find_git_repo_root(tmp.path());
        assert!(root.is_none());
    }

    #[test]
    fn test_delete_skill_removes_record() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "to-delete", "Delete me");
        let skills = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();
        let skill_id = skills[0].id.clone();

        delete_skill(&skill_id, false).unwrap();

        let config = crate::models::config::load_config().unwrap();
        assert!(!config.skills.iter().any(|s| s.id == skill_id));
    }

    #[test]
    fn test_delete_skill_not_found() {
        let _tmp = setup();
        let result = delete_skill("nonexistent-id", false);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Skill not found"));
    }

    #[test]
    fn test_delete_skill_removes_distributions() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "dist-skill", "Has distributions");
        let skills = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();
        let skill_id = skills[0].id.clone();

        // Add a distribution record (no actual symlink needed for this check)
        let mut config = crate::models::config::load_config().unwrap();
        config.distributions.push(crate::models::distribution::Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id: skill_id.clone(),
            tool: crate::models::distribution::Tool::ClaudeCode,
            scope: crate::models::distribution::Scope::Global,
            target_path: "/nonexistent/path/dist-skill".to_string(),
            status: crate::models::distribution::DistStatus::Pending,
            entry_type: crate::models::distribution::EntryType::Symlink,
        });
        crate::models::config::save_config(&config).unwrap();

        delete_skill(&skill_id, false).unwrap();

        let config = crate::models::config::load_config().unwrap();
        assert!(config.distributions.iter().all(|d| d.skill_id != skill_id));
    }

    #[test]
    #[cfg(unix)]
    fn test_delete_skill_removes_symlinks() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let symlink_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "symlink-skill", "Has symlinks");
        let skills = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();
        let skill_id = skills[0].id.clone();

        // Create an actual symlink pointing at the skill source dir
        let symlink_path = symlink_dir.path().join("symlink-skill");
        std::os::unix::fs::symlink(skill_dir.path(), &symlink_path).unwrap();
        assert!(symlink_path.symlink_metadata().unwrap().file_type().is_symlink());

        // Register it as a distribution
        let mut config = crate::models::config::load_config().unwrap();
        config.distributions.push(crate::models::distribution::Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id: skill_id.clone(),
            tool: crate::models::distribution::Tool::ClaudeCode,
            scope: crate::models::distribution::Scope::Global,
            target_path: symlink_path.to_string_lossy().to_string(),
            status: crate::models::distribution::DistStatus::Linked,
            entry_type: crate::models::distribution::EntryType::Symlink,
        });
        crate::models::config::save_config(&config).unwrap();

        delete_skill(&skill_id, false).unwrap();

        assert!(!symlink_path.exists(), "symlink should be removed");
        let config = crate::models::config::load_config().unwrap();
        assert!(config.distributions.is_empty());
    }

    #[test]
    #[cfg(unix)]
    fn test_scan_project_folder_mixed_entry_types() {
        let _tmp = setup();
        let project_dir = tempfile::tempdir().unwrap();

        // Create a real skill directory inside the project
        let real_skill_dir = project_dir.path().join(".claude").join("skills").join("real-skill");
        crate::test_helpers::create_skill_md(&real_skill_dir, "real-skill", "A real folder skill");

        // Create a skill source outside the project, then symlink it in
        let symlink_source = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(symlink_source.path(), "symlink-skill", "A symlinked skill");
        let symlink_target = project_dir.path().join(".claude").join("skills").join("symlink-skill");
        std::os::unix::fs::symlink(symlink_source.path(), &symlink_target).unwrap();

        // Set up a project in config
        let mut config = load_config().unwrap();
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(crate::models::project::Project {
            id: project_id.clone(),
            name: "test-project".to_string(),
            path: project_dir.path().to_string_lossy().to_string(),
            skill_ids: Vec::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        save_config(&config).unwrap();

        // Run scan
        let mut config = load_config().unwrap();
        scan_project_folder(&project_id, project_dir.path().to_str().unwrap(), &mut config).unwrap();
        save_config(&config).unwrap();

        let config = load_config().unwrap();

        // Should have 2 distributions
        let project_dists: Vec<_> = config.distributions.iter()
            .filter(|d| d.scope == Scope::Project)
            .collect();
        assert_eq!(project_dists.len(), 2, "should have 2 project-scoped distributions");

        // Real folder → Folder entry_type
        let real_dist = project_dists.iter().find(|d| d.target_path.contains("real-skill")).unwrap();
        assert_eq!(real_dist.entry_type, EntryType::Folder, "real directory should be Folder type");

        // Symlink → Symlink entry_type
        let sym_dist = project_dists.iter().find(|d| d.target_path.contains("symlink-skill")).unwrap();
        assert_eq!(sym_dist.entry_type, EntryType::Symlink, "symlink should be Symlink type");

        // Both should be Linked
        assert_eq!(real_dist.status, DistStatus::Linked);
        assert_eq!(sym_dist.status, DistStatus::Linked);

        // Skills should be imported with real paths
        assert_eq!(config.skills.len(), 2);
        // All skills should use canonical (real) paths
        assert!(config.skills.iter().all(|s| !s.source_path.contains("symlink-skill") || s.source_path == symlink_source.path().to_string_lossy().to_string()));
    }

    #[test]
    fn test_scan_project_folder_empty_dir() {
        let _tmp = setup();
        let project_dir = tempfile::tempdir().unwrap();

        let mut config = load_config().unwrap();
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(crate::models::project::Project {
            id: project_id.clone(),
            name: "empty-project".to_string(),
            path: project_dir.path().to_string_lossy().to_string(),
            skill_ids: Vec::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        save_config(&config).unwrap();

        let mut config = load_config().unwrap();
        scan_project_folder(&project_id, project_dir.path().to_str().unwrap(), &mut config).unwrap();

        assert!(config.distributions.is_empty());
        assert!(config.skills.is_empty());
    }

    #[test]
    fn test_scan_project_folder_nonexistent_path() {
        let _tmp = setup();
        let mut config = load_config().unwrap();
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(crate::models::project::Project {
            id: project_id.clone(),
            name: "missing-project".to_string(),
            path: "/nonexistent/project/path".to_string(),
            skill_ids: Vec::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        save_config(&config).unwrap();

        let mut config = load_config().unwrap();
        let result = scan_project_folder(&project_id, "/nonexistent/project/path", &mut config);
        assert!(result.is_ok(), "should gracefully handle nonexistent path");
    }

    #[test]
    fn test_delete_skill_removes_from_project() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "proj-skill", "In project");
        let skills = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();
        let skill_id = skills[0].id.clone();

        // Add a project that references this skill
        let mut config = crate::models::config::load_config().unwrap();
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(crate::models::project::Project {
            id: project_id.clone(),
            name: "my-project".to_string(),
            path: "/some/project/path".to_string(),
            skill_ids: vec![skill_id.clone()],
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        crate::models::config::save_config(&config).unwrap();

        delete_skill(&skill_id, false).unwrap();

        let config = crate::models::config::load_config().unwrap();
        let project = config.projects.iter().find(|p| p.id == project_id).unwrap();
        assert!(!project.skill_ids.contains(&skill_id));
    }

    /// Set up isolated test env with all tool paths redirected to temp directory.
    fn setup_discover() -> tempfile::TempDir {
        let tmp = setup();
        let tmp_path = tmp.path().to_string_lossy().to_string();
        let mut config = load_config().unwrap();
        for (key, paths) in config.tool_paths.iter_mut() {
            let dir_name = key.to_lowercase();
            paths.global = format!("{tmp_path}/{dir_name}/global/skills/");
            paths.project = format!("{dir_name}/project/skills/");
            paths.extra_globals = Vec::new();
        }
        // Add real system extra_globals paths to ignored_paths so they won't be scanned
        // even if load_config migration re-adds them
        config.ignored_paths.push("~/.claude/plugins/marketplaces".to_string());
        save_config(&config).unwrap();
        tmp
    }

    #[test]
    fn test_discover_skills_from_tool_paths_real_directory() {
        let _tmp = setup_discover();
        // Create a skill in a temp "tool global path"
        let tmp_path = _tmp.path().to_string_lossy().to_string();
        let tool_skills_dir = std::path::PathBuf::from(format!("{tmp_path}/claudecode/global/skills/"));
        let skill_dir = tool_skills_dir.join("discovered-skill");
        crate::test_helpers::create_skill_md(&skill_dir, "discovered-skill", "Found by discovery");

        let imported = discover_skills_from_tool_paths().unwrap();
        assert_eq!(imported.len(), 1, "should discover 1 skill from tool path");
        assert_eq!(imported[0].name, "discovered-skill");

        let config = load_config().unwrap();
        // Real directory → Folder entry_type
        let dist = config.distributions.iter().find(|d| d.skill_id == imported[0].id).unwrap();
        assert_eq!(dist.entry_type, EntryType::Folder, "real directory should create Folder distribution");
        assert_eq!(dist.status, DistStatus::Linked);
    }

    #[test]
    #[cfg(unix)]
    fn test_discover_skills_from_tool_paths_symlink() {
        let _tmp = setup_discover();
        // Create a real skill source
        let real_skill = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(real_skill.path(), "sym-skill", "Symlinked");

        // Create a symlink in the tool path pointing to real skill
        let tmp_path = _tmp.path().to_string_lossy().to_string();
        let tool_skills_dir = std::path::PathBuf::from(format!("{tmp_path}/claudecode/global/skills/"));
        fs::create_dir_all(&tool_skills_dir).unwrap();
        let symlink_path = tool_skills_dir.join("sym-skill");
        std::os::unix::fs::symlink(real_skill.path(), &symlink_path).unwrap();

        let imported = discover_skills_from_tool_paths().unwrap();
        assert_eq!(imported.len(), 1);

        let config = load_config().unwrap();
        // Symlink → Symlink entry_type
        let dist = config.distributions.iter().find(|d| d.skill_id == imported[0].id).unwrap();
        assert_eq!(dist.entry_type, EntryType::Symlink, "symlink in tool path should create Symlink distribution");

        // Skill source_path should be the real (canonicalized) path
        let expected_real = fs::canonicalize(real_skill.path()).unwrap();
        assert_eq!(imported[0].source_path, expected_real.to_string_lossy().to_string(),
            "skill source_path should be resolved to real path");
    }

    #[test]
    fn test_discover_skills_from_tool_paths_idempotent() {
        let _tmp = setup_discover();
        let tmp_path = _tmp.path().to_string_lossy().to_string();
        let tool_skills_dir = std::path::PathBuf::from(format!("{tmp_path}/claudecode/global/skills/"));
        let skill_dir = tool_skills_dir.join("idem-skill");
        crate::test_helpers::create_skill_md(&skill_dir, "idem-skill", "Idempotent discovery");

        let first = discover_skills_from_tool_paths().unwrap();
        assert_eq!(first.len(), 1);

        let second = discover_skills_from_tool_paths().unwrap();
        assert!(second.is_empty(), "second discovery should find no new skills");

        let config = load_config().unwrap();
        assert_eq!(config.skills.len(), 1, "should not duplicate skills");
        let skill_dists: Vec<_> = config.distributions.iter()
            .filter(|d| d.skill_id == first[0].id)
            .collect();
        assert_eq!(skill_dists.len(), 1, "should not duplicate distributions");
    }

    #[test]
    fn test_delete_all_skills_clears_records() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "bulk-clear", "Will be cleared");
        import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();

        delete_all_skills(true).unwrap();

        let config = crate::models::config::load_config().unwrap();
        assert!(config.skills.is_empty(), "all skills should be removed");
        assert!(config.distributions.is_empty(), "all distributions should be removed");
    }

    #[test]
    #[cfg(unix)]
    fn test_delete_all_skills_removes_symlinks() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let symlink_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "bulk-sym", "Bulk symlink delete");
        let skills = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();

        let symlink_path = symlink_dir.path().join("bulk-sym");
        std::os::unix::fs::symlink(skill_dir.path(), &symlink_path).unwrap();
        let mut config = crate::models::config::load_config().unwrap();
        config.distributions.push(crate::models::distribution::Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id: skills[0].id.clone(),
            tool: crate::models::distribution::Tool::ClaudeCode,
            scope: crate::models::distribution::Scope::Global,
            target_path: symlink_path.to_string_lossy().to_string(),
            status: crate::models::distribution::DistStatus::Linked,
            entry_type: crate::models::distribution::EntryType::Symlink,
        });
        crate::models::config::save_config(&config).unwrap();

        delete_all_skills(false).unwrap();

        assert!(!symlink_path.symlink_metadata().is_ok(), "symlink should be removed from filesystem");
        let config = crate::models::config::load_config().unwrap();
        assert!(config.skills.is_empty());
        assert!(config.distributions.is_empty());
    }

    #[test]
    #[cfg(unix)]
    fn test_delete_all_skills_preserves_symlinks_when_flag_set() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let symlink_dir = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir.path(), "keep-sym", "Keep with flag");
        let skills = import_local_skill(skill_dir.path().to_str().unwrap()).unwrap();

        let symlink_path = symlink_dir.path().join("keep-sym");
        std::os::unix::fs::symlink(skill_dir.path(), &symlink_path).unwrap();
        let mut config = crate::models::config::load_config().unwrap();
        config.distributions.push(crate::models::distribution::Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id: skills[0].id.clone(),
            tool: crate::models::distribution::Tool::ClaudeCode,
            scope: crate::models::distribution::Scope::Global,
            target_path: symlink_path.to_string_lossy().to_string(),
            status: crate::models::distribution::DistStatus::Linked,
            entry_type: crate::models::distribution::EntryType::Symlink,
        });
        crate::models::config::save_config(&config).unwrap();

        delete_all_skills(true).unwrap(); // keep_symlinks = true

        assert!(symlink_path.symlink_metadata().is_ok(), "symlink should be preserved with keep_symlinks=true");
        let config = crate::models::config::load_config().unwrap();
        assert!(config.skills.is_empty(), "skill records should still be cleared");
        assert!(config.distributions.is_empty(), "distribution records should still be cleared");
    }

    #[test]
    fn test_delete_all_skills_clears_project_skill_ids() {
        let _tmp = setup();
        let skill_dir_a = tempfile::tempdir().unwrap();
        let skill_dir_b = tempfile::tempdir().unwrap();
        crate::test_helpers::create_skill_md(skill_dir_a.path(), "bulk-a", "A");
        crate::test_helpers::create_skill_md(skill_dir_b.path(), "bulk-b", "B");
        let skills_a = import_local_skill(skill_dir_a.path().to_str().unwrap()).unwrap();
        let skills_b = import_local_skill(skill_dir_b.path().to_str().unwrap()).unwrap();

        let mut config = crate::models::config::load_config().unwrap();
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(crate::models::project::Project {
            id: project_id.clone(),
            name: "bulk-proj".to_string(),
            path: "/some/path".to_string(),
            skill_ids: vec![skills_a[0].id.clone(), skills_b[0].id.clone()],
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        crate::models::config::save_config(&config).unwrap();

        delete_all_skills(true).unwrap();

        let config = crate::models::config::load_config().unwrap();
        let project = config.projects.iter().find(|p| p.id == project_id).unwrap();
        assert!(project.skill_ids.is_empty(), "project.skill_ids should be cleared");
    }

    #[test]
    fn test_delete_all_skills_preserves_folder_directories() {
        let _tmp = setup();
        let real_dir = tempfile::tempdir().unwrap();
        fs::write(real_dir.path().join("data.txt"), "important data").unwrap();

        let mut config = crate::models::config::load_config().unwrap();
        let skill_id = uuid::Uuid::new_v4().to_string();
        config.skills.push(crate::models::skill::Skill {
            id: skill_id.clone(),
            name: "folder-bulk".to_string(),
            description: String::new(),
            source_type: crate::models::skill::SourceType::Local,
            source_path: real_dir.path().to_string_lossy().to_string(),
            github_url: None,
            has_git: false,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: "2026-01-01T00:00:00+00:00".to_string(),
            group: None,
        });
        config.distributions.push(crate::models::distribution::Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id,
            tool: crate::models::distribution::Tool::ClaudeCode,
            scope: crate::models::distribution::Scope::Global,
            target_path: real_dir.path().to_string_lossy().to_string(),
            status: crate::models::distribution::DistStatus::Linked,
            entry_type: crate::models::distribution::EntryType::Folder,
        });
        crate::models::config::save_config(&config).unwrap();

        delete_all_skills(false).unwrap();

        assert!(real_dir.path().exists(), "real directory should not be deleted");
        assert!(real_dir.path().join("data.txt").exists(), "files inside should be preserved");
        let config = crate::models::config::load_config().unwrap();
        assert!(config.skills.is_empty());
        assert!(config.distributions.is_empty());
    }

    /// Helper: create a fake skill record in config with the given source_path (no SKILL.md needed)
    fn insert_skill(config: &mut crate::models::config::AppConfig, name: &str, source_path: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        config.skills.push(crate::models::skill::Skill {
            id: id.clone(),
            name: name.to_string(),
            description: String::new(),
            source_type: crate::models::skill::SourceType::Github,
            source_path: source_path.to_string(),
            github_url: None,
            has_git: true,
            created_at: "2026-01-01".to_string(),
            updated_at: "2026-01-01".to_string(),
            group: None,
        });
        id
    }

    #[test]
    fn test_pull_skill_removed_skills_soft_deleted() {
        let _tmp = setup();
        // Create a fake repo directory with two skills, then simulate one being removed
        let repo_dir = tempfile::tempdir().unwrap();
        let skill_a_dir = repo_dir.path().join("skill-a");
        let skill_b_dir = repo_dir.path().join("skill-b");
        fs::create_dir_all(&skill_a_dir).unwrap();
        fs::create_dir_all(&skill_b_dir).unwrap();
        crate::test_helpers::create_skill_md(&skill_a_dir, "skill-a", "A");
        crate::test_helpers::create_skill_md(&skill_b_dir, "skill-b", "B");

        // Pre-populate config as if both skills were previously imported from this repo
        let mut config = load_config().unwrap();
        let repo_path = repo_dir.path().to_string_lossy().to_string();
        let id_a = insert_skill(&mut config, "skill-a", &format!("{repo_path}/skill-a"));
        let id_b = insert_skill(&mut config, "skill-b", &format!("{repo_path}/skill-b"));
        // skill-b is also in a project
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(crate::models::project::Project {
            id: project_id.clone(),
            name: "my-proj".to_string(),
            path: "/some/proj".to_string(),
            skill_ids: vec![id_b.clone()],
            created_at: "2026-01-01".to_string(),
        });
        // Add a distribution record for skill-b
        config.distributions.push(crate::models::distribution::Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id: id_b.clone(),
            tool: crate::models::distribution::Tool::ClaudeCode,
            scope: crate::models::distribution::Scope::Global,
            target_path: "/tmp/fake-dist/skill-b".to_string(),
            status: crate::models::distribution::DistStatus::Linked,
            entry_type: crate::models::distribution::EntryType::Symlink,
        });
        save_config(&config).unwrap();

        // Now remove skill-b from the repo (simulate file deletion before pull)
        fs::remove_dir_all(&skill_b_dir).unwrap();

        // Manually invoke the removed_skills soft-delete logic
        // (We can't call pull_skill directly as it needs a real git remote,
        // so we test the logic via the internal state mutation)
        let removed_skills = vec!["skill-b".to_string()];
        let mut config = load_config().unwrap();
        let removed_ids: Vec<String> = config.skills.iter()
            .filter(|s| s.source_path.starts_with(&repo_path) && removed_skills.contains(&s.name))
            .map(|s| s.id.clone())
            .collect();
        assert_eq!(removed_ids, vec![id_b.clone()]);

        config.distributions.retain(|d| !removed_ids.contains(&d.skill_id));
        for project in &mut config.projects {
            project.skill_ids.retain(|id| !removed_ids.contains(id));
        }
        config.skills.retain(|s| !removed_ids.contains(&s.id));
        save_config(&config).unwrap();

        let config = load_config().unwrap();
        assert!(config.skills.iter().any(|s| s.id == id_a), "skill-a should remain");
        assert!(!config.skills.iter().any(|s| s.id == id_b), "skill-b should be removed");
        assert!(config.distributions.is_empty(), "distribution for skill-b should be removed");
        let project = config.projects.iter().find(|p| p.id == project_id).unwrap();
        assert!(!project.skill_ids.contains(&id_b), "skill-b should be removed from project");
    }
}
