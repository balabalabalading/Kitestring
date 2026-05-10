use std::fs;
use std::path::Path;

use crate::models::config::{load_config, save_config};
use crate::models::skill::{Skill, SourceType};
use crate::services::skill_parser::{find_skill_md_files, parse_skill_md};

/// Delete a skill and clean up all associated distributions (remove symlinks)
pub fn delete_skill(skill_id: &str) -> Result<(), String> {
    let mut config = load_config()?;

    let skill = config.skills.iter().find(|s| s.id == skill_id)
        .ok_or("Skill not found")?
        .clone();

    // Remove all associated distributions (symlinks + records)
    let dist_ids: Vec<String> = config.distributions.iter()
        .filter(|d| d.skill_id == skill_id)
        .map(|d| d.id.clone())
        .collect();

    for dist_id in &dist_ids {
        let dist = config.distributions.iter().find(|d| d.id == *dist_id).unwrap();
        let target = Path::new(&dist.target_path);
        if target.exists() {
            let _ = fs::remove_file(target);
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
    if !dir.exists() || !dir.is_dir() {
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
        let meta = parse_skill_md(&skill_md_path)?;

        // Check for duplicate by source_path
        let skill_source = skill_md_path
            .parent()
            .unwrap_or(&abs_path)
            .to_string_lossy()
            .to_string();

        if config.skills.iter().any(|s| s.source_path == skill_source) {
            continue;
        }

        let skill = Skill {
            id: uuid::Uuid::new_v4().to_string(),
            name: meta.name,
            description: meta.description,
            source_type: SourceType::Local,
            source_path: skill_source,
            github_url: None,
            created_at: now.clone(),
            updated_at: now.clone(),
            project_id: None,
        };

        new_skills.push(skill.clone());
        config.skills.push(skill);
    }

    save_config(&config)?;
    Ok(new_skills)
}

/// Import skills from a Github repository URL
pub fn import_github_skill(url: &str) -> Result<Vec<Skill>, String> {
    // Clone the repo to ~/.agentnexus/repos/
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let repos_dir = home.join(".agentnexus").join("repos");
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
        // Pull latest
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

    for skill_md_path in skill_files {
        let meta = parse_skill_md(&skill_md_path)?;

        let skill_source = skill_md_path
            .parent()
            .unwrap_or(&abs_path)
            .to_string_lossy()
            .to_string();

        if config.skills.iter().any(|s| s.source_path == skill_source) {
            continue;
        }

        let skill = Skill {
            id: uuid::Uuid::new_v4().to_string(),
            name: meta.name,
            description: meta.description,
            source_type: SourceType::Github,
            source_path: skill_source,
            github_url: Some(url.to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
            project_id: None,
        };

        new_skills.push(skill.clone());
        config.skills.push(skill);
    }

    save_config(&config)?;
    Ok(new_skills)
}

fn clone_repo(url: &str, dest: &Path) -> Result<(), String> {
    git2::Repository::clone(url, dest)
        .map_err(|e| format!("Failed to clone repository: {e}"))?;
    Ok(())
}

fn pull_repo(repo_path: &Path) -> Result<(), String> {
    let repo = git2::Repository::open(repo_path)
        .map_err(|e| format!("Failed to open repository: {e}"))?;

    let mut remote = repo.find_remote("origin")
        .map_err(|e| format!("Failed to find remote: {e}"))?;

    remote.fetch(&["main"], None, None)
        .or_else(|_| remote.fetch(&["master"], None, None))
        .map_err(|e| format!("Failed to fetch: {e}"))?;

    let fetch_head = repo.find_reference("FETCH_HEAD")
        .map_err(|e| format!("Failed to find FETCH_HEAD: {e}"))?;

    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)
        .map_err(|e| format!("Failed to resolve fetch commit: {e}"))?;

    let (analysis, _) = repo.merge_analysis(&[&fetch_commit])
        .map_err(|e| format!("Failed to analyze merge: {e}"))?;

    if analysis.is_up_to_date() {
        return Ok(());
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
    }

    Ok(())
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

    pull_repo(&repo_path)?;

    // Re-scan for SKILL.md files
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
                created_at: now.clone(),
                updated_at: now.clone(),
                project_id: None,
            };

            config.skills.push(skill);
        }

        save_config(&config)?;
    }

    Ok(PullResult { new_skills, removed_skills })
}

pub struct PullResult {
    pub new_skills: Vec<String>,
    pub removed_skills: Vec<String>,
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

        delete_skill(&skill_id).unwrap();

        let config = crate::models::config::load_config().unwrap();
        assert!(!config.skills.iter().any(|s| s.id == skill_id));
    }

    #[test]
    fn test_delete_skill_not_found() {
        let _tmp = setup();
        let result = delete_skill("nonexistent-id");
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
        });
        crate::models::config::save_config(&config).unwrap();

        delete_skill(&skill_id).unwrap();

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
        });
        crate::models::config::save_config(&config).unwrap();

        delete_skill(&skill_id).unwrap();

        assert!(!symlink_path.exists(), "symlink should be removed");
        let config = crate::models::config::load_config().unwrap();
        assert!(config.distributions.is_empty());
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

        delete_skill(&skill_id).unwrap();

        let config = crate::models::config::load_config().unwrap();
        let project = config.projects.iter().find(|p| p.id == project_id).unwrap();
        assert!(!project.skill_ids.contains(&skill_id));
    }
}
