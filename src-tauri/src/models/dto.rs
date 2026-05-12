use serde::{Deserialize, Serialize};

/// Result of a GitHub skill pull operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullResultDto {
    pub new_skills: Vec<String>,
    pub removed_skills: Vec<String>,
    pub updated: bool,
}

/// A node in a skill's file tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}
