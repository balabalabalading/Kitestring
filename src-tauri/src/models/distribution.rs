use serde::{Deserialize, Serialize};

/// Whether the entry in the tool path is a real directory or a symlink.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "PascalCase")]
pub enum EntryType {
    /// A real (non-symlink) directory; the skill source lives directly here.
    #[default]
    Folder,
    /// A symlink pointing to a skill source elsewhere (local folder or AgentNexus download).
    Symlink,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Distribution {
    pub id: String,
    pub skill_id: String,
    pub tool: Tool,
    pub scope: Scope,
    pub target_path: String,
    pub status: DistStatus,
    /// Whether the target_path is a real folder or a symlink. Defaults to Symlink for legacy records.
    #[serde(default)]
    pub entry_type: EntryType,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum Tool {
    ClaudeCode,
    CopilotCLI,
    GeminiCLI,
    Codex,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum Scope {
    Global,
    Project,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum DistStatus {
    Linked,
    Broken,
    Pending,
}

impl std::fmt::Display for Tool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Tool::ClaudeCode => write!(f, "ClaudeCode"),
            Tool::CopilotCLI => write!(f, "CopilotCLI"),
            Tool::GeminiCLI => write!(f, "GeminiCLI"),
            Tool::Codex => write!(f, "Codex"),
        }
    }
}

impl std::str::FromStr for Tool {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "ClaudeCode" => Ok(Tool::ClaudeCode),
            "CopilotCLI" => Ok(Tool::CopilotCLI),
            "GeminiCLI" => Ok(Tool::GeminiCLI),
            "Codex" => Ok(Tool::Codex),
            _ => Err(format!("Unknown tool: {s}")),
        }
    }
}

impl std::fmt::Display for Scope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Scope::Global => write!(f, "Global"),
            Scope::Project => write!(f, "Project"),
        }
    }
}

impl std::str::FromStr for Scope {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Global" => Ok(Scope::Global),
            "Project" => Ok(Scope::Project),
            _ => Err(format!("Unknown scope: {s}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_display() {
        assert_eq!(Tool::ClaudeCode.to_string(), "ClaudeCode");
        assert_eq!(Tool::CopilotCLI.to_string(), "CopilotCLI");
        assert_eq!(Tool::GeminiCLI.to_string(), "GeminiCLI");
        assert_eq!(Tool::Codex.to_string(), "Codex");
    }

    #[test]
    fn test_tool_from_str() {
        assert_eq!("ClaudeCode".parse::<Tool>(), Ok(Tool::ClaudeCode));
        assert_eq!("CopilotCLI".parse::<Tool>(), Ok(Tool::CopilotCLI));
        assert_eq!("GeminiCLI".parse::<Tool>(), Ok(Tool::GeminiCLI));
        assert_eq!("Codex".parse::<Tool>(), Ok(Tool::Codex));
        assert!("UnknownTool".parse::<Tool>().is_err());
    }

    #[test]
    fn test_scope_display() {
        assert_eq!(Scope::Global.to_string(), "Global");
        assert_eq!(Scope::Project.to_string(), "Project");
    }

    #[test]
    fn test_scope_from_str() {
        assert_eq!("Global".parse::<Scope>(), Ok(Scope::Global));
        assert_eq!("Project".parse::<Scope>(), Ok(Scope::Project));
        assert!("Invalid".parse::<Scope>().is_err());
    }

    #[test]
    fn test_distribution_serialization() {
        let dist = Distribution {
            id: "dist-1".to_string(),
            skill_id: "skill-1".to_string(),
            tool: Tool::ClaudeCode,
            scope: Scope::Global,
            target_path: "/tmp/test".to_string(),
            status: DistStatus::Linked,
            entry_type: EntryType::Symlink,
        };
        let json = serde_json::to_string(&dist).unwrap();
        // PascalCase enum values
        assert!(json.contains("\"ClaudeCode\""));
        assert!(json.contains("\"Global\""));
        assert!(json.contains("\"Linked\""));
        assert!(json.contains("\"Symlink\""));
    }

    #[test]
    fn test_distribution_deserialization() {
        let json = r#"{
            "id": "dist-1",
            "skill_id": "skill-1",
            "tool": "CopilotCLI",
            "scope": "Project",
            "target_path": "/tmp/test",
            "status": "Broken"
        }"#;
        let dist: Distribution = serde_json::from_str(json).unwrap();
        assert_eq!(dist.id, "dist-1");
        assert_eq!(dist.tool, Tool::CopilotCLI);
        assert_eq!(dist.scope, Scope::Project);
        assert_eq!(dist.status, DistStatus::Broken);
        // entry_type defaults to Folder for legacy records without the field
        assert_eq!(dist.entry_type, EntryType::Folder);
    }
}
