use std::fs;
use std::path::Path;

use crate::models::config::{load_config, save_config, ToolPaths};
use crate::models::distribution::{DistStatus, Distribution, Scope, Tool};

/// Create a symlink from source skill path to the target tool directory
pub fn distribute_skill(
    skill_id: &str,
    tool: &Tool,
    scope: &Scope,
    project_id: Option<&str>,
) -> Result<Distribution, String> {
    let mut config = load_config()?;

    let skill = config.skills.iter().find(|s| s.id == skill_id)
        .ok_or("Skill not found")?
        .clone();

    let tool_paths = config.tool_paths.get(&tool.to_string())
        .ok_or(format!("Unknown tool: {tool}"))?
        .clone();

    let target_base = resolve_target_base(&tool_paths, scope, project_id, &config)?;
    let target_path = target_base.join(&skill.name);

    // Check if target already exists
    if target_path.exists() {
        let metadata = fs::symlink_metadata(&target_path)
            .map_err(|e| format!("Failed to read target metadata: {e}"))?;

        if metadata.is_symlink() {
            // Overwrite existing symlink
            fs::remove_file(&target_path)
                .map_err(|e| format!("Failed to remove existing symlink: {e}"))?;
        } else {
            return Err(format!(
                "Target path already exists as a real directory: {}",
                target_path.display()
            ));
        }
    }

    // Ensure parent directory exists
    if let Some(parent) = target_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
        }
    }

    // Create symlink
    let source_path = Path::new(&skill.source_path);
    create_symlink(source_path, &target_path)?;

    let dist = Distribution {
        id: uuid::Uuid::new_v4().to_string(),
        skill_id: skill_id.to_string(),
        tool: tool.clone(),
        scope: scope.clone(),
        target_path: target_path.to_string_lossy().to_string(),
        status: DistStatus::Linked,
    };

    config.distributions.push(dist.clone());
    save_config(&config)?;

    Ok(dist)
}

/// Remove a distribution (delete symlink)
pub fn remove_distribution(dist_id: &str) -> Result<(), String> {
    let mut config = load_config()?;

    let dist = config.distributions.iter().find(|d| d.id == dist_id)
        .ok_or("Distribution not found")?
        .clone();

    let target = Path::new(&dist.target_path);
    if target.exists() {
        fs::remove_file(target)
            .map_err(|e| format!("Failed to remove symlink: {e}"))?;
    }

    config.distributions.retain(|d| d.id != dist_id);
    save_config(&config)?;

    Ok(())
}

/// Check all distributions and update their status
pub fn check_distribution_status() -> Result<Vec<Distribution>, String> {
    let mut config = load_config()?;
    let mut changed = false;

    for dist in &mut config.distributions {
        let target = Path::new(&dist.target_path);
        let source = config.skills.iter().find(|s| s.id == dist.skill_id)
            .map(|s| s.source_path.as_str())
            .unwrap_or("");

        // Use symlink_metadata to distinguish between "no symlink" vs "broken symlink"
        let is_symlink = target.symlink_metadata()
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);

        if !is_symlink && !target.exists() {
            dist.status = DistStatus::Pending;
            changed = true;
            continue;
        }

        // Check if symlink still points to the correct source
        match fs::read_link(target) {
            Ok(link_target) => {
                let link_str = link_target.to_string_lossy();
                if (link_str == source || link_str.ends_with(&format!("/{}", Path::new(source).file_name().unwrap_or_default().to_string_lossy())))
                    && Path::new(source).exists()
                {
                    dist.status = DistStatus::Linked;
                } else {
                    dist.status = DistStatus::Broken;
                }
            }
            Err(_) => {
                // Not a symlink or can't read - it's a real directory
                dist.status = DistStatus::Broken;
            }
        }
        changed = true;
    }

    if changed {
        save_config(&config)?;
    }

    Ok(config.distributions)
}

fn resolve_target_base(
    tool_paths: &ToolPaths,
    scope: &Scope,
    project_id: Option<&str>,
    config: &crate::models::config::AppConfig,
) -> Result<std::path::PathBuf, String> {
    match scope {
        Scope::Global => {
            let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
            let path_str = tool_paths.global.trim_start_matches("~/");
            Ok(home.join(path_str))
        }
        Scope::Project => {
            let pid = project_id.ok_or("Project scope requires a project_id")?;
            let project = config.projects.iter().find(|p| p.id == pid)
                .ok_or("Project not found")?;
            Ok(Path::new(&project.path).join(tool_paths.project.trim_start_matches("./")))
        }
    }
}

#[cfg(unix)]
fn create_symlink(source: &Path, target: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(source, target)
        .map_err(|e| format!("Failed to create symlink: {e}"))
}

#[cfg(windows)]
fn create_symlink(source: &Path, target: &Path) -> Result<(), String> {
    // On Windows, directory symlinks require elevated privileges or developer mode.
    // Try junction as a fallback since it doesn't require special permissions.
    if source.is_dir() {
        std::os::windows::fs::symlink_dir(source, target)
            .map_err(|e| format!(
                "Failed to create symlink. Ensure Developer Mode is enabled or run as administrator: {e}"
            ))
    } else {
        std::os::windows::fs::symlink_file(source, target)
            .map_err(|e| format!("Failed to create file symlink: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Set up isolated test environment with tool_paths redirected to a temp directory.
    /// This ensures distributor symlinks never touch real tool directories like ~/.claude/skills/.
    fn setup() -> tempfile::TempDir {
        let tmp = crate::test_helpers::setup_test_env();
        // Redirect all tool_paths to temp directory so symlinks are fully isolated
        let tmp_path = tmp.path().to_string_lossy().to_string();
        let mut config = load_config().unwrap();
        for (key, paths) in config.tool_paths.iter_mut() {
            let dir_name = key.to_lowercase();
            paths.global = format!("{tmp_path}/{dir_name}/global/skills/");
            paths.project = format!("{dir_name}/project/skills/");
        }
        save_config(&config).unwrap();
        tmp
    }

    fn add_skill_to_config(name: &str, source_path: &str) -> String {
        let mut config = load_config().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        config.skills.push(crate::models::skill::Skill {
            id: id.clone(),
            name: name.to_string(),
            description: format!("Desc for {name}"),
            source_type: crate::models::skill::SourceType::Local,
            source_path: source_path.to_string(),
            github_url: None,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: "2026-01-01T00:00:00+00:00".to_string(),
            project_id: None,
        });
        save_config(&config).unwrap();
        id
    }

    fn add_project_to_config(name: &str, path: &str) -> String {
        let mut config = load_config().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        config.projects.push(crate::models::project::Project {
            id: id.clone(),
            name: name.to_string(),
            path: path.to_string(),
            skill_ids: Vec::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        save_config(&config).unwrap();
        id
    }

    #[test]
    fn test_distribute_skill_creates_symlink() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(skill_dir.path()).unwrap();
        let skill_id = add_skill_to_config("symlink-test", skill_dir.path().to_str().unwrap());

        let dist = distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Global, None).unwrap();
        assert_eq!(dist.status, DistStatus::Linked);
        assert!(Path::new(&dist.target_path).exists());
        assert!(Path::new(&dist.target_path).symlink_metadata().unwrap().is_symlink());
    }

    #[test]
    fn test_distribute_skill_creates_config_entry() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("config-entry", skill_dir.path().to_str().unwrap());

        distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Global, None).unwrap();
        let config = load_config().unwrap();
        assert_eq!(config.distributions.len(), 1);
        assert_eq!(config.distributions[0].skill_id, skill_id);
    }

    #[test]
    fn test_distribute_skill_not_found() {
        let _tmp = setup();
        let result = distribute_skill("nonexistent", &Tool::ClaudeCode, &Scope::Global, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Skill not found"));
    }

    #[test]
    fn test_distribute_skill_overwrites_existing_symlink() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("overwrite-test", skill_dir.path().to_str().unwrap());

        let _dist1 = distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Global, None).unwrap();
        // Remove first distribution record to allow re-distribution
        let mut config = load_config().unwrap();
        config.distributions.clear();
        save_config(&config).unwrap();

        let dist2 = distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Global, None).unwrap();
        assert_eq!(dist2.status, DistStatus::Linked);
    }

    #[test]
    fn test_distribute_skill_refuses_real_directory() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("refuse-test", skill_dir.path().to_str().unwrap());

        // Pre-create a real directory at the target path
        let config = load_config().unwrap();
        let tool_paths = config.tool_paths.get("ClaudeCode").unwrap();
        let home = dirs::home_dir().unwrap();
        let target_base = home.join(tool_paths.global.trim_start_matches("~/"));
        let target = target_base.join("refuse-test");
        fs::create_dir_all(&target).unwrap();

        let result = distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Global, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("real directory"));
    }

    #[test]
    fn test_distribute_skill_creates_parent_dir() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("parent-dir-test", skill_dir.path().to_str().unwrap());

        let dist = distribute_skill(&skill_id, &Tool::GeminiCLI, &Scope::Global, None).unwrap();
        assert!(Path::new(&dist.target_path).exists());
    }

    #[test]
    fn test_remove_distribution_deletes_symlink() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("remove-test", skill_dir.path().to_str().unwrap());

        let dist = distribute_skill(&skill_id, &Tool::Codex, &Scope::Global, None).unwrap();
        assert!(Path::new(&dist.target_path).exists());

        remove_distribution(&dist.id).unwrap();
        assert!(!Path::new(&dist.target_path).exists());
        let config = load_config().unwrap();
        assert!(config.distributions.is_empty());
    }

    #[test]
    fn test_remove_distribution_not_found() {
        let _tmp = setup();
        let result = remove_distribution("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_check_status_linked() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("linked-test", skill_dir.path().to_str().unwrap());

        distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Global, None).unwrap();
        let dists = check_distribution_status().unwrap();
        let dist = dists.iter().find(|d| d.skill_id == skill_id).unwrap();
        assert_eq!(dist.status, DistStatus::Linked);
    }

    #[test]
    fn test_check_status_broken() {
        let _tmp = setup();
        // Use a temp source that we'll delete
        let skill_source = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("broken-test", skill_source.path().to_str().unwrap());

        let dist = distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Global, None).unwrap();
        // Delete source — symlink becomes broken
        fs::remove_dir_all(skill_source.path()).unwrap();
        let dists = check_distribution_status().unwrap();
        let dist = dists.iter().find(|d| d.id == dist.id).unwrap();
        assert_eq!(dist.status, DistStatus::Broken);
    }

    #[test]
    fn test_check_status_pending() {
        let _tmp = setup();
        let mut config = load_config().unwrap();
        let dist = Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id: "fake-skill".to_string(),
            tool: Tool::ClaudeCode,
            scope: Scope::Global,
            target_path: format!("{}/nonexistent/skill", _tmp.path().to_string_lossy()),
            status: DistStatus::Linked,
        };
        config.distributions.push(dist);
        save_config(&config).unwrap();

        let dists = check_distribution_status().unwrap();
        assert_eq!(dists[0].status, DistStatus::Pending);
    }

    #[test]
    fn test_distribute_skill_project_scope() {
        let _tmp = setup();
        let project_dir = tempfile::tempdir().unwrap();
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("proj-skill", skill_dir.path().to_str().unwrap());
        let project_id = add_project_to_config("test-project", project_dir.path().to_str().unwrap());

        let dist = distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Project, Some(&project_id)).unwrap();
        // target_path should be inside the project directory
        assert!(dist.target_path.starts_with(project_dir.path().to_str().unwrap()));
        assert_eq!(dist.status, DistStatus::Linked);
    }

    #[test]
    fn test_distribute_skill_project_scope_without_id() {
        let _tmp = setup();
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_id = add_skill_to_config("no-proj", skill_dir.path().to_str().unwrap());

        let result = distribute_skill(&skill_id, &Tool::ClaudeCode, &Scope::Project, None);
        assert!(result.is_err());
    }
}
