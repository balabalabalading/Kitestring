use crate::models::distribution::{Distribution, Scope, Tool};

#[tauri::command]
pub fn distribute_skill(
    skill_id: String,
    tool: String,
    scope: String,
    project_id: Option<String>,
) -> Result<Distribution, String> {
    let tool: Tool = tool.parse().map_err(|e: String| e)?;
    let scope: Scope = scope.parse().map_err(|e: String| e)?;
    crate::services::distributor::distribute_skill(&skill_id, &tool, &scope, project_id.as_deref())
}

#[tauri::command]
pub fn distribute_to_dir(skill_id: String, tool: String, target_dir: String) -> Result<Distribution, String> {
    let tool: Tool = tool.parse().map_err(|e: String| e)?;
    crate::services::distributor::distribute_to_dir(&skill_id, &tool, &target_dir)
}

#[tauri::command]
pub fn remove_distribution(id: String) -> Result<(), String> {
    crate::services::distributor::remove_distribution(&id)
}

#[tauri::command]
pub fn check_distribution_status() -> Result<Vec<Distribution>, String> {
    crate::services::distributor::check_distribution_status()
}
