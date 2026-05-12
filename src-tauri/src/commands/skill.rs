use std::fs;
use std::path::Path;

use crate::models::dto::{FileNode, PullResultDto};
use crate::models::skill::Skill;
use crate::services::importer::{self, ImportGithubResult};

#[tauri::command]
pub fn import_local_skill(path: String) -> Result<Vec<Skill>, String> {
    importer::import_local_skill(&path)
}

#[tauri::command]
pub fn import_github_skill(url: String) -> Result<ImportGithubResult, String> {
    importer::import_github_skill(&url)
}

/// Force-import a skill from an already-cloned path, bypassing name conflict checks.
#[tauri::command]
pub fn force_import_skill(source_path: String, github_url: String) -> Result<Skill, String> {
    importer::force_import_skill(&source_path, &github_url)
}

#[tauri::command]
pub fn list_skills(project_id: Option<String>) -> Result<Vec<Skill>, String> {
    let config = crate::models::config::load_config()?;
    let skills: Vec<Skill> = match project_id {
        Some(pid) => {
            let project = config.projects.iter().find(|p| p.id == pid);
            let skill_ids: std::collections::HashSet<String> = project
                .map(|p| p.skill_ids.iter().cloned().collect())
                .unwrap_or_default();
            let project_path = project.map(|p| p.path.as_str()).unwrap_or("");

            config.skills.into_iter().filter(|s| {
                // Rule 1: explicitly associated via project.skill_ids
                skill_ids.contains(&s.id)
                // Rule 2: skill source_path is under the project directory
                || (!project_path.is_empty() && s.source_path.starts_with(project_path))
                // Rule 3: skill has a distribution whose target_path is under the project directory
                || (!project_path.is_empty() && config.distributions.iter().any(|d| {
                    d.skill_id == s.id && d.target_path.starts_with(project_path)
                }))
            }).collect()
        }
        None => config.skills,
    };
    Ok(skills)
}

#[tauri::command]
pub fn get_skill_detail(id: String) -> Result<Skill, String> {
    let config = crate::models::config::load_config()?;
    config
        .skills
        .into_iter()
        .find(|s| s.id == id)
        .ok_or("Skill not found".to_string())
}

#[tauri::command]
pub fn pull_github_skill(id: String) -> Result<PullResultDto, String> {
    let result = importer::pull_skill(&id)?;
    Ok(PullResultDto {
        new_skills: result.new_skills,
        removed_skills: result.removed_skills,
        updated: result.updated,
    })
}

/// Delete a skill and all its associated distributions
#[tauri::command]
pub fn delete_skill(id: String, keep_symlinks: bool) -> Result<(), String> {
    importer::delete_skill(&id, keep_symlinks)
}

/// Delete all skills and their associated distributions
#[tauri::command]
pub fn delete_all_skills(keep_symlinks: bool) -> Result<(), String> {
    importer::delete_all_skills(keep_symlinks)
}

/// Set or clear the group label for a skill
#[tauri::command]
pub fn set_skill_group(id: String, group: Option<String>) -> Result<(), String> {
    let mut config = crate::models::config::load_config()?;
    let skill = config.skills.iter_mut().find(|s| s.id == id).ok_or("Skill not found")?;
    skill.group = group.clone();
    // Maintain invariant: every skill.group value must appear in config.groups
    if let Some(ref name) = group {
        let trimmed = name.trim().to_string();
        if !trimmed.is_empty() && !config.groups.contains(&trimmed) {
            config.groups.push(trimmed);
        }
    }
    crate::models::config::save_config(&config)?;
    Ok(())
}

/// Return all persisted group names
#[tauri::command]
pub fn list_groups() -> Result<Vec<String>, String> {
    let config = crate::models::config::load_config()?;
    Ok(config.groups.clone())
}

/// Create a named group (persists even when empty)
#[tauri::command]
pub fn create_group(name: String) -> Result<(), String> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err("分组名不能为空".to_string());
    }
    let mut config = crate::models::config::load_config()?;
    if !config.groups.contains(&trimmed) {
        config.groups.push(trimmed);
        crate::models::config::save_config(&config)?;
    }
    Ok(())
}

/// Delete a group: removes from config.groups and clears skill.group for all skills in this group
#[tauri::command]
pub fn delete_group(name: String) -> Result<(), String> {
    let mut config = crate::models::config::load_config()?;
    config.groups.retain(|g| g != &name);
    for skill in &mut config.skills {
        if skill.group.as_deref() == Some(&name) {
            skill.group = None;
        }
    }
    crate::models::config::save_config(&config)?;
    Ok(())
}

/// Discover and import skills from all tool global paths (resolves symlinks)
#[tauri::command]
pub fn discover_skills() -> Result<Vec<Skill>, String> {
    importer::discover_skills_from_tool_paths()
}

/// Refresh a skill's name and description from its SKILL.md on disk
#[tauri::command]
pub fn refresh_skill(id: String) -> Result<Skill, String> {
    let mut config = crate::models::config::load_config()?;
    let skill = config.skills.iter_mut().find(|s| s.id == id).ok_or("Skill not found")?;
    let skill_md = Path::new(&skill.source_path).join("SKILL.md");
    let meta = crate::services::skill_parser::parse_skill_md(&skill_md)?;
    skill.name = meta.name;
    skill.description = meta.description;
    skill.updated_at = chrono::Utc::now().to_rfc3339();
    let updated = skill.clone();
    crate::models::config::save_config(&config)?;
    Ok(updated)
}

/// List all files in a skill's source directory as a tree
#[tauri::command]
pub fn list_skill_files(skill_id: String) -> Result<Vec<FileNode>, String> {
    let config = crate::models::config::load_config()?;
    let skill = config
        .skills
        .iter()
        .find(|s| s.id == skill_id)
        .ok_or("Skill not found")?;

    let root = Path::new(&skill.source_path);
    if !root.exists() {
        return Err("Skill source path does not exist".to_string());
    }

    Ok(build_file_tree(root, root, 3))
}

/// Read a file's text content
#[tauri::command]
pub fn read_skill_file(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }
    if file_path.is_dir() {
        return Err("Path is a directory, not a file".to_string());
    }
    fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {e}"))
}

fn build_file_tree(base: &Path, current: &Path, max_depth: usize) -> Vec<FileNode> {
    if max_depth == 0 {
        return Vec::new();
    }

    let Ok(entries) = fs::read_dir(current) else {
        return Vec::new();
    };

    let mut nodes: Vec<FileNode> = entries
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            // Skip hidden files and common non-essential dirs
            !name.starts_with('.')
                && name != "node_modules"
                && name != "target"
                && name != ".git"
        })
        .filter_map(|e| {
            let path = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            let is_dir = path.is_dir();
            let rel_path = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();

            let children = if is_dir {
                Some(build_file_tree(base, &path, max_depth - 1))
            } else {
                None
            };

            Some(FileNode {
                name,
                path: rel_path,
                is_dir,
                children,
            })
        })
        .collect();

    // Sort: directories first, then files, alphabetically
    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    nodes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::setup_test_env;

    fn add_skill_with_md(name: &str) -> (String, tempfile::TempDir) {
        let skill_dir = tempfile::tempdir().unwrap();
        let skill_md_path = skill_dir.path().join("SKILL.md");
        std::fs::write(&skill_md_path, format!("---\nname: {name}\ndescription: original desc\n---\n")).unwrap();

        let mut config = crate::models::config::load_config().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        config.skills.push(crate::models::skill::Skill {
            id: id.clone(),
            name: name.to_string(),
            description: "original desc".to_string(),
            source_path: skill_dir.path().to_str().unwrap().to_string(),
            source_type: crate::models::skill::SourceType::Local,
            group: None,
            has_git: false,
            github_url: None,
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-01".to_string(),
        });
        crate::models::config::save_config(&config).unwrap();
        (id, skill_dir)
    }

    #[test]
    fn test_refresh_skill_updates_name_and_description() {
        let _tmp = setup_test_env();
        let (id, skill_dir) = add_skill_with_md("original-name");

        // Modify SKILL.md on disk
        let skill_md_path = skill_dir.path().join("SKILL.md");
        std::fs::write(&skill_md_path, "---\nname: updated-name\ndescription: updated desc\n---\n").unwrap();

        let updated = refresh_skill(id.clone()).unwrap();
        assert_eq!(updated.name, "updated-name");
        assert_eq!(updated.description, "updated desc");
        // updated_at should have changed and be valid RFC3339
        assert_ne!(updated.updated_at, "2024-01-01", "updated_at should be updated");
        chrono::DateTime::parse_from_rfc3339(&updated.updated_at)
            .expect("updated_at should be valid RFC3339");

        // Verify persisted to config
        let config = crate::models::config::load_config().unwrap();
        let persisted = config.skills.iter().find(|s| s.id == id).unwrap();
        assert_eq!(persisted.name, "updated-name");
        assert_ne!(persisted.updated_at, "2024-01-01", "persisted updated_at should be updated");
    }

    #[test]
    fn test_refresh_skill_not_found() {
        let _tmp = setup_test_env();
        let result = refresh_skill("nonexistent-id".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_lowercase().contains("not found"));
    }

    fn make_project(config: &mut crate::models::config::AppConfig, path: &str, skill_ids: Vec<String>) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        config.projects.push(crate::models::project::Project {
            id: id.clone(),
            name: "test-proj".to_string(),
            path: path.to_string(),
            skill_ids,
            created_at: "2024-01-01".to_string(),
        });
        id
    }

    fn make_skill_record(config: &mut crate::models::config::AppConfig, name: &str, source_path: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        config.skills.push(crate::models::skill::Skill {
            id: id.clone(),
            name: name.to_string(),
            description: String::new(),
            source_path: source_path.to_string(),
            source_type: crate::models::skill::SourceType::Local,
            group: None,
            has_git: false,
            github_url: None,
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-01".to_string(),
        });
        id
    }

    #[test]
    fn test_list_skills_rule1_explicit_skill_ids() {
        let _tmp = setup_test_env();
        let mut config = crate::models::config::load_config().unwrap();
        let id_a = make_skill_record(&mut config, "skill-a", "/other/path/skill-a");
        let id_b = make_skill_record(&mut config, "skill-b", "/other/path/skill-b");
        let proj_id = make_project(&mut config, "/proj", vec![id_a.clone()]);
        crate::models::config::save_config(&config).unwrap();

        let result = list_skills(Some(proj_id)).unwrap();
        let ids: Vec<&str> = result.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&id_a.as_str()), "explicitly associated skill should appear");
        assert!(!ids.contains(&id_b.as_str()), "unassociated skill should not appear");
    }

    #[test]
    fn test_list_skills_rule2_source_path_prefix() {
        let _tmp = setup_test_env();
        let mut config = crate::models::config::load_config().unwrap();
        let id_inside = make_skill_record(&mut config, "inside", "/proj/skills/inside");
        let id_outside = make_skill_record(&mut config, "outside", "/other/skills/outside");
        let proj_id = make_project(&mut config, "/proj", vec![]);
        crate::models::config::save_config(&config).unwrap();

        let result = list_skills(Some(proj_id)).unwrap();
        let ids: Vec<&str> = result.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&id_inside.as_str()), "skill under project path should appear via rule 2");
        assert!(!ids.contains(&id_outside.as_str()), "skill outside project path should not appear");
    }

    #[test]
    fn test_list_skills_rule3_distribution_target_prefix() {
        let _tmp = setup_test_env();
        let mut config = crate::models::config::load_config().unwrap();
        let id_dist = make_skill_record(&mut config, "dist-skill", "/external/source/dist-skill");
        let id_none = make_skill_record(&mut config, "nodist-skill", "/external/source/nodist-skill");
        let proj_id = make_project(&mut config, "/proj", vec![]);

        // Add a distribution whose target_path is under the project
        config.distributions.push(crate::models::distribution::Distribution {
            id: uuid::Uuid::new_v4().to_string(),
            skill_id: id_dist.clone(),
            tool: crate::models::distribution::Tool::ClaudeCode,
            scope: crate::models::distribution::Scope::Project,
            target_path: "/proj/.claude/skills/dist-skill".to_string(),
            status: crate::models::distribution::DistStatus::Linked,
            entry_type: crate::models::distribution::EntryType::Symlink,
        });
        crate::models::config::save_config(&config).unwrap();

        let result = list_skills(Some(proj_id)).unwrap();
        let ids: Vec<&str> = result.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&id_dist.as_str()), "skill with distribution in project should appear via rule 3");
        assert!(!ids.contains(&id_none.as_str()), "skill with no project distribution should not appear");
    }

    #[test]
    fn test_create_group_persists() {
        let _tmp = setup_test_env();
        create_group("web-tools".to_string()).unwrap();
        let groups = list_groups().unwrap();
        assert!(groups.contains(&"web-tools".to_string()), "created group should be persisted");
    }

    #[test]
    fn test_create_group_dedup() {
        let _tmp = setup_test_env();
        create_group("my-group".to_string()).unwrap();
        create_group("my-group".to_string()).unwrap();
        let groups = list_groups().unwrap();
        assert_eq!(groups.iter().filter(|g| *g == "my-group").count(), 1, "duplicate group should not be created");
    }

    #[test]
    fn test_create_group_empty_name_rejected() {
        let _tmp = setup_test_env();
        let result = create_group("   ".to_string());
        assert!(result.is_err(), "empty group name should be rejected");
    }

    #[test]
    fn test_delete_group_removes_name_and_clears_skills() {
        let _tmp = setup_test_env();
        // Create group and assign a skill to it
        create_group("old-group".to_string()).unwrap();
        let mut config = crate::models::config::load_config().unwrap();
        let skill_id = make_skill_record(&mut config, "grouped-skill", "/path/grouped-skill");
        config.skills.iter_mut().find(|s| s.id == skill_id).unwrap().group = Some("old-group".to_string());
        crate::models::config::save_config(&config).unwrap();

        delete_group("old-group".to_string()).unwrap();

        let groups = list_groups().unwrap();
        assert!(!groups.contains(&"old-group".to_string()), "deleted group should not appear in list");
        let config = crate::models::config::load_config().unwrap();
        let skill = config.skills.iter().find(|s| s.id == skill_id).unwrap();
        assert_eq!(skill.group, None, "skill.group should be cleared when group is deleted");
    }

    #[test]
    fn test_set_skill_group_upserts_to_groups() {
        let _tmp = setup_test_env();
        let mut config = crate::models::config::load_config().unwrap();
        let skill_id = make_skill_record(&mut config, "some-skill", "/path/some-skill");
        crate::models::config::save_config(&config).unwrap();

        // Assigning a group via set_skill_group should auto-upsert the group name
        set_skill_group(skill_id.clone(), Some("auto-group".to_string())).unwrap();
        let groups = list_groups().unwrap();
        assert!(groups.contains(&"auto-group".to_string()), "set_skill_group should upsert group name to config.groups");
    }
}
