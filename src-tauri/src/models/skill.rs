use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source_type: SourceType,
    pub source_path: String,
    pub github_url: Option<String>,
    /// Whether git version control was detected in the skill's directory.
    #[serde(default)]
    pub has_git: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Optional group label set by user (e.g. when importing multi-skill folders)
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum SourceType {
    Local,
    Github,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_source_type_serialization() {
        assert_eq!(serde_json::to_string(&SourceType::Local).unwrap(), "\"Local\"");
        assert_eq!(serde_json::to_string(&SourceType::Github).unwrap(), "\"Github\"");
    }

    #[test]
    fn test_source_type_deserialization() {
        let local: SourceType = serde_json::from_str("\"Local\"").unwrap();
        assert_eq!(local, SourceType::Local);
        let github: SourceType = serde_json::from_str("\"Github\"").unwrap();
        assert_eq!(github, SourceType::Github);
    }

    #[test]
    fn test_skill_serialization_roundtrip() {
        let skill = Skill {
            id: "id-1".to_string(),
            name: "my-skill".to_string(),
            description: "A test skill".to_string(),
            source_type: SourceType::Local,
            source_path: "/tmp/skill".to_string(),
            github_url: Some("https://github.com/test/repo".to_string()),
            has_git: true,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: "2026-01-01T00:00:00+00:00".to_string(),
            group: None,
        };
        let json = serde_json::to_string(&skill).unwrap();
        let deserialized: Skill = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, skill.id);
        assert_eq!(deserialized.name, skill.name);
        assert_eq!(deserialized.source_type, SourceType::Local);
        assert_eq!(deserialized.github_url, skill.github_url);
    }

    #[test]
    fn test_skill_with_optional_fields() {
        let skill = Skill {
            id: "id-2".to_string(),
            name: "local-skill".to_string(),
            description: "desc".to_string(),
            source_type: SourceType::Local,
            source_path: "/tmp/local".to_string(),
            github_url: None,
            has_git: false,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: "2026-01-01T00:00:00+00:00".to_string(),
            group: None,
        };
        let json = serde_json::to_string(&skill).unwrap();
        let deserialized: Skill = serde_json::from_str(&json).unwrap();
        assert!(deserialized.github_url.is_none());
    }

    /// Verify that legacy config.json files with a `project_id` field on skills
    /// are deserialized without errors (unknown fields are ignored by serde default).
    #[test]
    fn test_skill_legacy_project_id_field_ignored() {
        let json = r#"{
            "id": "id-3",
            "name": "legacy-skill",
            "description": "desc",
            "source_type": "Local",
            "source_path": "/tmp/legacy",
            "has_git": false,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
            "project_id": "some-project-id"
        }"#;
        let skill: Skill = serde_json::from_str(json).unwrap();
        assert_eq!(skill.id, "id-3");
        assert_eq!(skill.name, "legacy-skill");
    }
}
