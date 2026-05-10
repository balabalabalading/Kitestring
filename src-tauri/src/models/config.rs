use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use super::skill::Skill;
use super::distribution::Distribution;
use super::project::Project;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPaths {
    pub global: String,
    pub project: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: String,
    pub skills: Vec<Skill>,
    pub distributions: Vec<Distribution>,
    pub projects: Vec<Project>,
    pub tool_paths: HashMap<String, ToolPaths>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut tool_paths = HashMap::new();
        tool_paths.insert(
            "ClaudeCode".to_string(),
            ToolPaths {
                global: "~/.claude/skills/".to_string(),
                project: ".claude/skills/".to_string(),
            },
        );
        tool_paths.insert(
            "CopilotCLI".to_string(),
            ToolPaths {
                global: "~/.copilot/skills/".to_string(),
                project: ".copilot/skills/".to_string(),
            },
        );
        tool_paths.insert(
            "GeminiCLI".to_string(),
            ToolPaths {
                global: "~/.gemini/skills/".to_string(),
                project: ".gemini/skills/".to_string(),
            },
        );
        tool_paths.insert(
            "Codex".to_string(),
            ToolPaths {
                global: "~/.codex/skills/".to_string(),
                project: ".codex/skills/".to_string(),
            },
        );

        Self {
            version: "1".to_string(),
            skills: Vec::new(),
            distributions: Vec::new(),
            projects: Vec::new(),
            tool_paths,
        }
    }
}

use std::cell::RefCell;

thread_local! {
    static CONFIG_DIR_OVERRIDE: RefCell<Option<PathBuf>> = RefCell::new(None);
}

#[cfg(test)]
pub fn set_config_dir_for_test(dir: PathBuf) {
    CONFIG_DIR_OVERRIDE.with(|cell| {
        *cell.borrow_mut() = Some(dir);
    });
}

fn config_dir() -> PathBuf {
    if let Some(override_dir) = CONFIG_DIR_OVERRIDE.with(|cell| cell.borrow().clone()) {
        return override_dir;
    }
    let home = dirs::home_dir().expect("Cannot determine home directory");
    home.join(".agentnexus")
}

fn config_file_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load_config() -> Result<AppConfig, String> {
    let path = config_file_path();
    if !path.exists() {
        let dir = config_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
        let config = AppConfig::default();
        save_config(&config)?;
        return Ok(config);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {e}"))
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    let content = serde_json::to_string_pretty(config).map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(config_file_path(), content).map_err(|e| format!("Failed to write config: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> tempfile::TempDir {
        crate::test_helpers::setup_test_env()
    }

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.version, "1");
        assert!(config.skills.is_empty());
        assert!(config.distributions.is_empty());
        assert!(config.projects.is_empty());
        assert_eq!(config.tool_paths.len(), 4);
    }

    #[test]
    fn test_tool_paths_default_values() {
        let config = AppConfig::default();
        let claude = config.tool_paths.get("ClaudeCode").unwrap();
        assert_eq!(claude.global, "~/.claude/skills/");
        assert_eq!(claude.project, ".claude/skills/");

        let copilot = config.tool_paths.get("CopilotCLI").unwrap();
        assert_eq!(copilot.global, "~/.copilot/skills/");
        assert_eq!(copilot.project, ".copilot/skills/");

        let gemini = config.tool_paths.get("GeminiCLI").unwrap();
        assert_eq!(gemini.global, "~/.gemini/skills/");
        assert_eq!(gemini.project, ".gemini/skills/");

        let codex = config.tool_paths.get("Codex").unwrap();
        assert_eq!(codex.global, "~/.codex/skills/");
        assert_eq!(codex.project, ".codex/skills/");
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let _tmp = setup();
        let mut config = AppConfig::default();
        config.skills.push(crate::models::skill::Skill {
            id: "test-id".to_string(),
            name: "test-skill".to_string(),
            description: "desc".to_string(),
            source_type: crate::models::skill::SourceType::Local,
            source_path: "/tmp/test".to_string(),
            github_url: None,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: "2026-01-01T00:00:00+00:00".to_string(),
            project_id: None,
        });
        save_config(&config).unwrap();
        let loaded = load_config().unwrap();
        assert_eq!(loaded.version, "1");
        assert_eq!(loaded.skills.len(), 1);
        assert_eq!(loaded.skills[0].name, "test-skill");
    }

    #[test]
    fn test_load_creates_default_if_missing() {
        let _tmp = setup();
        // Delete the config file that setup created
        fs::remove_file(config_file_path()).unwrap();
        let config = load_config().unwrap();
        assert_eq!(config.version, "1");
        assert!(config.skills.is_empty());
        // Config file should now exist
        assert!(config_file_path().exists());
    }

    #[test]
    fn test_config_serialization_format() {
        let config = AppConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        // tool_paths keys should be the string names
        assert!(json.contains("\"ClaudeCode\""));
        assert!(json.contains("\"CopilotCLI\""));
        // version field
        assert!(json.contains("\"version\""));
    }

    #[test]
    fn test_update_tool_paths_merges() {
        let _tmp = setup();
        // update only ClaudeCode global path
        let mut updates = std::collections::HashMap::new();
        updates.insert(
            "ClaudeCode".to_string(),
            serde_json::json!({
                "global": "~/custom/claude/skills/",
                "project": ".claude/skills/"
            }),
        );
        crate::commands::config::update_tool_paths(updates).unwrap();

        let config = load_config().unwrap();
        let claude = config.tool_paths.get("ClaudeCode").unwrap();
        assert_eq!(claude.global, "~/custom/claude/skills/");
        // Other tools should still exist
        assert!(config.tool_paths.contains_key("CopilotCLI"));
        assert!(config.tool_paths.contains_key("GeminiCLI"));
    }

    #[test]
    fn test_update_tool_paths_rejects_missing_field() {
        let _tmp = setup();
        let mut updates = std::collections::HashMap::new();
        // Missing "project" field
        updates.insert(
            "ClaudeCode".to_string(),
            serde_json::json!({ "global": "~/x/" }),
        );
        let result = crate::commands::config::update_tool_paths(updates);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("project"));
    }
}
