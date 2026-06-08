use crate::models::project::Project;

#[tauri::command]
pub fn create_project(name: String, path: Option<String>) -> Result<Project, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let project_path = path.unwrap_or_default();

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path: project_path.clone(),
        skill_ids: Vec::new(),
        created_at: now,
    };

    crate::models::config::with_config_lock(|| {
        let mut config = crate::models::config::load_config()?;
        config.projects.push(project.clone());
        // Save the project first so import_local_skill can resolve project membership
        crate::models::config::save_config(&config)
    })?;

    if !project_path.is_empty() {
        // Import skills at the project root (mirrors rescan_project logic)
        // Ignore error if no SKILL.md is found
        let _ = crate::services::importer::import_local_skill(&project_path);

        crate::models::config::with_config_lock(|| {
            // Reload config after import (import_local_skill saves internally)
            let mut config = crate::models::config::load_config()?;

            // Scan project tool dirs for symlink/folder entries
            crate::services::importer::scan_project_folder(
                &project.id,
                &project_path,
                &mut config,
            )?;

            crate::models::config::save_config(&config)
        })?;
    }

    // Return the updated project (skill_ids may have been populated by the scan)
    let config = crate::models::config::load_config()?;
    let updated = config
        .projects
        .into_iter()
        .find(|p| p.id == project.id)
        .unwrap_or(project);

    Ok(updated)
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<Project>, String> {
    let config = crate::models::config::load_config()?;
    Ok(config.projects)
}

#[tauri::command]
pub fn add_skill_to_project(project_id: String, skill_id: String) -> Result<(), String> {
    crate::models::config::with_config_lock(|| {
        let mut config = crate::models::config::load_config()?;

        // Remove skill from any existing project first (prevents stale membership)
        for project in &mut config.projects {
            project.skill_ids.retain(|id| id != &skill_id);
        }

        let project = config
            .projects
            .iter_mut()
            .find(|p| p.id == project_id)
            .ok_or("Project not found")?;

        if !project.skill_ids.contains(&skill_id) {
            project.skill_ids.push(skill_id.clone());
        }

        crate::models::config::save_config(&config)?;
        Ok(())
    })
}

#[tauri::command]
pub fn remove_skill_from_project(project_id: String, skill_id: String) -> Result<(), String> {
    crate::models::config::with_config_lock(|| {
        let mut config = crate::models::config::load_config()?;

        let project = config
            .projects
            .iter_mut()
            .find(|p| p.id == project_id)
            .ok_or("Project not found")?;
        project.skill_ids.retain(|id| id != &skill_id);

        crate::models::config::save_config(&config)?;
        Ok(())
    })
}

/// Re-scan a project folder for skills and update distribution records.
/// Called when the user clicks "重新检测" in the project panel.
#[tauri::command]
pub fn rescan_project(project_id: String) -> Result<Vec<crate::models::skill::Skill>, String> {
    let config = crate::models::config::load_config()?;

    let project_path = config
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .map(|p| p.path.clone())
        .ok_or("Project not found")?;

    if project_path.is_empty() {
        return Ok(vec![]);
    }

    // First, import any new skills from the project folder
    let imported = crate::services::importer::import_local_skill(&project_path)?;

    crate::models::config::with_config_lock(|| {
        // Reload config after import (import_local_skill saves internally)
        let mut config = crate::models::config::load_config()?;

        // Then scan the project for tool-path entries and update distribution records
        crate::services::importer::scan_project_folder(&project_id, &project_path, &mut config)?;

        crate::models::config::save_config(&config)
    })?;

    Ok(imported)
}

/// Delete a project and remove it from config (skills are not deleted)
#[tauri::command]
pub fn delete_project(id: String) -> Result<(), String> {
    crate::models::config::with_config_lock(|| {
        let mut config = crate::models::config::load_config()?;

        if !config.projects.iter().any(|p| p.id == id) {
            return Err("Project not found".to_string());
        }

        config.projects.retain(|p| p.id != id);
        crate::models::config::save_config(&config)?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> tempfile::TempDir {
        crate::test_helpers::setup_test_env()
    }

    fn make_skill(config: &mut crate::models::config::AppConfig, name: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        config.skills.push(crate::models::skill::Skill {
            id: id.clone(),
            name: name.to_string(),
            description: String::new(),
            source_type: crate::models::skill::SourceType::Local,
            source_path: format!("/tmp/{name}"),
            github_url: None,
            has_git: false,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: "2026-01-01T00:00:00+00:00".to_string(),
            group: None,
        });
        id
    }

    fn make_project(
        config: &mut crate::models::config::AppConfig,
        name: &str,
        skill_ids: Vec<String>,
    ) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        config.projects.push(Project {
            id: id.clone(),
            name: name.to_string(),
            path: format!("/tmp/{name}"),
            skill_ids,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        id
    }

    #[test]
    fn test_delete_project_unassigns_skills() {
        let _tmp = setup();
        let mut config = crate::models::config::load_config().unwrap();
        let skill_id = make_skill(&mut config, "s1");
        let project_id = make_project(&mut config, "proj1", vec![skill_id.clone()]);
        crate::models::config::save_config(&config).unwrap();

        delete_project(project_id.clone()).unwrap();

        let config = crate::models::config::load_config().unwrap();
        assert!(config.projects.iter().all(|p| p.id != project_id));
        // Skill itself should still exist, just no longer in any project
        assert!(
            config.skills.iter().any(|s| s.id == skill_id),
            "Skill should still exist after project deletion"
        );
    }

    #[test]
    fn test_delete_project_not_found() {
        let _tmp = setup();
        let result = delete_project("nonexistent-id".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Project not found"));
    }

    #[test]
    fn test_add_skill_to_project_removes_from_old_project() {
        let _tmp = setup();
        let mut config = crate::models::config::load_config().unwrap();
        let skill_id = make_skill(&mut config, "s1");
        let proj1_id = make_project(&mut config, "proj1", vec![skill_id.clone()]);
        let proj2_id = make_project(&mut config, "proj2", vec![]);
        crate::models::config::save_config(&config).unwrap();

        add_skill_to_project(proj2_id.clone(), skill_id.clone()).unwrap();

        let config = crate::models::config::load_config().unwrap();
        let proj1 = config.projects.iter().find(|p| p.id == proj1_id).unwrap();
        assert!(
            !proj1.skill_ids.contains(&skill_id),
            "Skill should be removed from old project"
        );
        let proj2 = config.projects.iter().find(|p| p.id == proj2_id).unwrap();
        assert!(
            proj2.skill_ids.contains(&skill_id),
            "Skill should be in new project"
        );
    }

    #[test]
    fn test_remove_skill_from_project() {
        let _tmp = setup();
        let mut config = crate::models::config::load_config().unwrap();
        let skill_id = make_skill(&mut config, "s1");
        let proj_id = make_project(&mut config, "proj1", vec![skill_id.clone()]);
        crate::models::config::save_config(&config).unwrap();

        remove_skill_from_project(proj_id.clone(), skill_id.clone()).unwrap();

        let config = crate::models::config::load_config().unwrap();
        let proj = config.projects.iter().find(|p| p.id == proj_id).unwrap();
        assert!(!proj.skill_ids.contains(&skill_id));
    }

    #[test]
    fn test_create_project_auto_detects_skills() {
        let _tmp = setup();
        let project_dir = tempfile::tempdir().unwrap();

        // Create a skill in the project's .claude/skills/ subdirectory
        let skill_dir = project_dir
            .path()
            .join(".claude")
            .join("skills")
            .join("auto-skill");
        crate::test_helpers::create_skill_md(&skill_dir, "auto-skill", "Auto-detected");

        let project = create_project(
            "auto-project".to_string(),
            Some(project_dir.path().to_string_lossy().to_string()),
        )
        .unwrap();

        // Project should have the skill in skill_ids immediately after creation
        assert!(
            !project.skill_ids.is_empty(),
            "project should have auto-detected skill_ids"
        );

        let config = crate::models::config::load_config().unwrap();
        assert_eq!(config.skills.len(), 1, "skill should be imported");
        assert_eq!(config.skills[0].name, "auto-skill");

        let p = config.projects.iter().find(|p| p.id == project.id).unwrap();
        assert!(p.skill_ids.contains(&config.skills[0].id));
    }

    #[test]
    fn test_create_project_no_skills() {
        let _tmp = setup();
        let project_dir = tempfile::tempdir().unwrap();

        // No SKILL.md files — create_project should succeed and return empty skill_ids
        let project = create_project(
            "empty-project".to_string(),
            Some(project_dir.path().to_string_lossy().to_string()),
        )
        .unwrap();

        assert!(project.skill_ids.is_empty());
        let config = crate::models::config::load_config().unwrap();
        assert!(config.skills.is_empty());
    }

    #[test]
    fn test_rescan_project_imports_and_creates_distributions() {
        let _tmp = setup();
        let project_dir = tempfile::tempdir().unwrap();

        // Create a skill in the project's .claude/skills/ subdirectory
        let skill_dir = project_dir
            .path()
            .join(".claude")
            .join("skills")
            .join("rescan-skill");
        crate::test_helpers::create_skill_md(&skill_dir, "rescan-skill", "Rescanned");

        // Create project in config
        let mut config = crate::models::config::load_config().unwrap();
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(Project {
            id: project_id.clone(),
            name: "rescan-project".to_string(),
            path: project_dir.path().to_string_lossy().to_string(),
            skill_ids: Vec::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        crate::models::config::save_config(&config).unwrap();

        // Run rescan
        let imported = rescan_project(project_id.clone()).unwrap();

        // Should import the skill
        assert_eq!(
            imported.len(),
            1,
            "should import 1 skill from project folder"
        );
        assert_eq!(imported[0].name, "rescan-skill");

        // Verify config state
        let config = crate::models::config::load_config().unwrap();
        // Skill should exist in config
        assert_eq!(config.skills.len(), 1);
        // Project should have the skill in skill_ids
        let project = config.projects.iter().find(|p| p.id == project_id).unwrap();
        assert!(project.skill_ids.contains(&imported[0].id));
        // Distribution should be created
        let project_dists: Vec<_> = config
            .distributions
            .iter()
            .filter(|d| d.skill_id == imported[0].id)
            .collect();
        assert_eq!(
            project_dists.len(),
            1,
            "should create 1 distribution record"
        );
        assert_eq!(
            project_dists[0].entry_type,
            crate::models::distribution::EntryType::Folder
        );
        assert_eq!(
            project_dists[0].status,
            crate::models::distribution::DistStatus::Linked
        );
    }

    #[test]
    fn test_rescan_project_idempotent() {
        let _tmp = setup();
        let project_dir = tempfile::tempdir().unwrap();

        let skill_dir = project_dir
            .path()
            .join(".claude")
            .join("skills")
            .join("idem-skill");
        crate::test_helpers::create_skill_md(&skill_dir, "idem-skill", "Idempotent");

        let mut config = crate::models::config::load_config().unwrap();
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(Project {
            id: project_id.clone(),
            name: "idem-project".to_string(),
            path: project_dir.path().to_string_lossy().to_string(),
            skill_ids: Vec::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        crate::models::config::save_config(&config).unwrap();

        // First rescan
        let first = rescan_project(project_id.clone()).unwrap();
        assert_eq!(first.len(), 1);

        // Second rescan — should not duplicate
        let second = rescan_project(project_id.clone()).unwrap();
        assert!(second.is_empty(), "second rescan should find no new skills");

        let config = crate::models::config::load_config().unwrap();
        assert_eq!(config.skills.len(), 1, "should not duplicate skills");
        let skill_dists: Vec<_> = config
            .distributions
            .iter()
            .filter(|d| d.skill_id == first[0].id)
            .collect();
        assert_eq!(skill_dists.len(), 1, "should not duplicate distributions");
    }

    #[test]
    fn test_rescan_project_not_found() {
        let _tmp = setup();
        let result = rescan_project("nonexistent-id".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Project not found"));
    }

    #[test]
    fn test_rescan_project_empty_path() {
        let _tmp = setup();
        let mut config = crate::models::config::load_config().unwrap();
        let project_id = uuid::Uuid::new_v4().to_string();
        config.projects.push(Project {
            id: project_id.clone(),
            name: "no-path".to_string(),
            path: String::new(),
            skill_ids: Vec::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        });
        crate::models::config::save_config(&config).unwrap();

        let result = rescan_project(project_id).unwrap();
        assert!(result.is_empty());
    }
}
