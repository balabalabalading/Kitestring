use crate::models::config::AppConfig;

#[tauri::command]
pub fn get_app_config() -> Result<AppConfig, String> {
    crate::models::config::load_config()
}
