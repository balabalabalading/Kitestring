use std::fs;
use std::path::Path;

use crate::models::config::{set_config_dir_for_test, save_config, AppConfig};
use crate::models::skill::{Skill, SourceType};

/// Set up isolated test environment with a temp config directory.
/// Returns the TempDir (caller must keep it alive for the test duration).
pub fn setup_test_env() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().expect("Failed to create temp dir");
    // Create a .agentnexus subdirectory so config_dir points there
    let config_dir = tmp.path().join(".agentnexus");
    fs::create_dir_all(&config_dir).expect("Failed to create config dir");
    set_config_dir_for_test(config_dir);
    // Initialize with default config
    save_config(&AppConfig::default()).expect("Failed to init config");
    tmp
}

/// Create a SKILL.md file directly in the given directory.
pub fn create_skill_md(dir: &Path, name: &str, description: &str) {
    fs::create_dir_all(dir).expect("Failed to create dir");
    let content = format!("---\nname: {name}\ndescription: {description}\n---\n# {name}\n");
    fs::write(dir.join("SKILL.md"), content).expect("Failed to write SKILL.md");
}

/// Create a nested skill: base/skill_dir/SKILL.md
pub fn create_nested_skill_md(base: &Path, skill_dir: &str, name: &str, desc: &str) {
    let dir = base.join(skill_dir);
    create_skill_md(&dir, name, desc);
}

/// Build a sample Skill struct for testing.
pub fn make_sample_skill(id: &str, name: &str, source_path: &str) -> Skill {
    Skill {
        id: id.to_string(),
        name: name.to_string(),
        description: format!("Description for {name}"),
        source_type: SourceType::Local,
        source_path: source_path.to_string(),
        github_url: None,
        has_git: false,
        created_at: "2026-01-01T00:00:00+00:00".to_string(),
        updated_at: "2026-01-01T00:00:00+00:00".to_string(),
        group: None,
    }
}
