use crate::models::config::AppConfig;
use std::collections::HashMap;

#[tauri::command]
pub fn get_app_config() -> Result<AppConfig, String> {
    crate::models::config::load_config()
}

#[tauri::command]
pub fn update_tool_paths(tool_paths: HashMap<String, serde_json::Value>) -> Result<(), String> {
    let mut config = crate::models::config::load_config()?;
    for (tool, paths_val) in tool_paths {
        let global = paths_val.get("global")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Missing 'global' for tool '{tool}'"))?
            .to_string();
        let project = paths_val.get("project")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Missing 'project' for tool '{tool}'"))?
            .to_string();
        let entry = config.tool_paths.entry(tool).or_insert_with(|| crate::models::config::ToolPaths {
            global: String::new(),
            project: String::new(),
        });
        entry.global = global;
        entry.project = project;
    }
    crate::models::config::save_config(&config)
}
