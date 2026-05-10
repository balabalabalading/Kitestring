use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub skill_ids: Vec<String>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_serialization_roundtrip() {
        let project = Project {
            id: "proj-1".to_string(),
            name: "my-project".to_string(),
            path: "/tmp/project".to_string(),
            skill_ids: Vec::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        };
        let json = serde_json::to_string(&project).unwrap();
        let deserialized: Project = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, project.id);
        assert_eq!(deserialized.name, project.name);
        assert_eq!(deserialized.path, project.path);
        assert!(deserialized.skill_ids.is_empty());
    }

    #[test]
    fn test_project_with_skills() {
        let project = Project {
            id: "proj-2".to_string(),
            name: "with-skills".to_string(),
            path: "/tmp/proj".to_string(),
            skill_ids: vec!["skill-1".to_string(), "skill-2".to_string()],
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        };
        let json = serde_json::to_string(&project).unwrap();
        let deserialized: Project = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.skill_ids.len(), 2);
        assert_eq!(deserialized.skill_ids[0], "skill-1");
    }
}
