use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::models::skill::Skill;
use crate::services::importer;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullResultDto {
    pub new_skills: Vec<String>,
    pub removed_skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

#[tauri::command]
pub fn import_local_skill(path: String) -> Result<Vec<Skill>, String> {
    importer::import_local_skill(&path)
}

#[tauri::command]
pub fn import_github_skill(url: String) -> Result<Vec<Skill>, String> {
    importer::import_github_skill(&url)
}

#[tauri::command]
pub fn list_skills(project_id: Option<String>) -> Result<Vec<Skill>, String> {
    let config = crate::models::config::load_config()?;
    let skills = match project_id {
        Some(pid) => config
            .skills
            .into_iter()
            .filter(|s| s.project_id == Some(pid.clone()))
            .collect(),
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
    })
}

/// Delete a skill and all its associated distributions
#[tauri::command]
pub fn delete_skill(id: String) -> Result<(), String> {
    importer::delete_skill(&id)
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
