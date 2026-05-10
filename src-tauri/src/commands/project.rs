use crate::models::project::Project;

#[tauri::command]
pub fn create_project(name: String, path: String) -> Result<Project, String> {
    let mut config = crate::models::config::load_config()?;
    let now = chrono::Utc::now().to_rfc3339();

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path,
        skill_ids: Vec::new(),
        created_at: now,
    };

    config.projects.push(project.clone());
    crate::models::config::save_config(&config)?;
    Ok(project)
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<Project>, String> {
    let config = crate::models::config::load_config()?;
    Ok(config.projects)
}

#[tauri::command]
pub fn add_skill_to_project(project_id: String, skill_id: String) -> Result<(), String> {
    let mut config = crate::models::config::load_config()?;

    // Remove skill from any existing project first (prevents stale membership)
    for project in &mut config.projects {
        project.skill_ids.retain(|id| id != &skill_id);
    }
    // Clear old project_id on the skill
    if let Some(skill) = config.skills.iter_mut().find(|s| s.id == skill_id) {
        skill.project_id = None;
    }

    let project = config.projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    if !project.skill_ids.contains(&skill_id) {
        project.skill_ids.push(skill_id.clone());
    }

    let skill = config.skills.iter_mut().find(|s| s.id == skill_id)
        .ok_or("Skill not found")?;
    skill.project_id = Some(project_id);

    crate::models::config::save_config(&config)?;
    Ok(())
}

#[tauri::command]
pub fn remove_skill_from_project(project_id: String, skill_id: String) -> Result<(), String> {
    let mut config = crate::models::config::load_config()?;

    let project = config.projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;
    project.skill_ids.retain(|id| id != &skill_id);

    if let Some(skill) = config.skills.iter_mut().find(|s| s.id == skill_id) {
        skill.project_id = None;
    }

    crate::models::config::save_config(&config)?;
    Ok(())
}

/// Delete a project and unassign all its skills (skills are not deleted)
#[tauri::command]
pub fn delete_project(id: String) -> Result<(), String> {
    let mut config = crate::models::config::load_config()?;

    let project = config.projects.iter().find(|p| p.id == id)
        .ok_or("Project not found")?
        .clone();

    // Unassign skills from this project
    for skill_id in &project.skill_ids {
        if let Some(skill) = config.skills.iter_mut().find(|s| s.id == *skill_id) {
            skill.project_id = None;
        }
    }

    config.projects.retain(|p| p.id != id);
    crate::models::config::save_config(&config)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> tempfile::TempDir {
        crate::test_helpers::setup_test_env()
    }

    fn make_skill(config: &mut crate::models::config::AppConfig, name: &str, project_id: Option<String>) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        config.skills.push(crate::models::skill::Skill {
            id: id.clone(),
            name: name.to_string(),
            description: String::new(),
            source_type: crate::models::skill::SourceType::Local,
            source_path: format!("/tmp/{name}"),
            github_url: None,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: "2026-01-01T00:00:00+00:00".to_string(),
            project_id: project_id.clone(),
        });
        id
    }

    fn make_project(config: &mut crate::models::config::AppConfig, name: &str, skill_ids: Vec<String>) -> String {
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
        let skill_id = make_skill(&mut config, "s1", None);
        let project_id = make_project(&mut config, "proj1", vec![skill_id.clone()]);
        config.skills.iter_mut().find(|s| s.id == skill_id).unwrap().project_id = Some(project_id.clone());
        crate::models::config::save_config(&config).unwrap();

        delete_project(project_id.clone()).unwrap();

        let config = crate::models::config::load_config().unwrap();
        assert!(config.projects.iter().all(|p| p.id != project_id));
        let skill = config.skills.iter().find(|s| s.id == skill_id).unwrap();
        assert!(skill.project_id.is_none(), "Skill should be unassigned from project");
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
        let skill_id = make_skill(&mut config, "s1", None);
        let proj1_id = make_project(&mut config, "proj1", vec![skill_id.clone()]);
        let proj2_id = make_project(&mut config, "proj2", vec![]);
        config.skills.iter_mut().find(|s| s.id == skill_id).unwrap().project_id = Some(proj1_id.clone());
        crate::models::config::save_config(&config).unwrap();

        add_skill_to_project(proj2_id.clone(), skill_id.clone()).unwrap();

        let config = crate::models::config::load_config().unwrap();
        let proj1 = config.projects.iter().find(|p| p.id == proj1_id).unwrap();
        assert!(!proj1.skill_ids.contains(&skill_id), "Skill should be removed from old project");
        let proj2 = config.projects.iter().find(|p| p.id == proj2_id).unwrap();
        assert!(proj2.skill_ids.contains(&skill_id), "Skill should be in new project");
        let skill = config.skills.iter().find(|s| s.id == skill_id).unwrap();
        assert_eq!(skill.project_id, Some(proj2_id));
    }

    #[test]
    fn test_remove_skill_from_project() {
        let _tmp = setup();
        let mut config = crate::models::config::load_config().unwrap();
        let skill_id = make_skill(&mut config, "s1", None);
        let proj_id = make_project(&mut config, "proj1", vec![skill_id.clone()]);
        config.skills.iter_mut().find(|s| s.id == skill_id).unwrap().project_id = Some(proj_id.clone());
        crate::models::config::save_config(&config).unwrap();

        remove_skill_from_project(proj_id.clone(), skill_id.clone()).unwrap();

        let config = crate::models::config::load_config().unwrap();
        let proj = config.projects.iter().find(|p| p.id == proj_id).unwrap();
        assert!(!proj.skill_ids.contains(&skill_id));
        let skill = config.skills.iter().find(|s| s.id == skill_id).unwrap();
        assert!(skill.project_id.is_none());
    }
}
