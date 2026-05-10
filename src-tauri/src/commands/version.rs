use crate::services::git_service::{self, GitInfo};

#[tauri::command]
pub fn get_git_info(path: String) -> Result<GitInfo, String> {
    git_service::get_git_info(&path)
}
