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
