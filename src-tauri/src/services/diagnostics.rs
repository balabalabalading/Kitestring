use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::models::config::{config_dir, config_file_path, load_config, AppConfig};
use crate::models::distribution::{DistStatus, EntryType};
use crate::utils::path::expand_home;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticLevel {
    Ok,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticCategory {
    Config,
    ToolPath,
    SkillSource,
    Distribution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticItem {
    pub id: String,
    pub level: DiagnosticLevel,
    pub category: DiagnosticCategory,
    pub code: String,
    pub path: Option<String>,
    pub tool: Option<String>,
    pub skill_name: Option<String>,
    pub skill_id: Option<String>,
    pub distribution_id: Option<String>,
    pub status: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiagnosticSummary {
    pub ok: usize,
    pub warning: usize,
    pub error: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticReport {
    pub summary: DiagnosticSummary,
    pub items: Vec<DiagnosticItem>,
}

pub fn run_diagnostics() -> DiagnosticReport {
    let mut items = Vec::new();

    match load_config() {
        Ok(config) => {
            items.push(
                item(
                    "config.readable",
                    DiagnosticLevel::Ok,
                    DiagnosticCategory::Config,
                    "config_readable",
                )
                .with_path(config_file_path()),
            );
            check_config_writable(&mut items);
            check_tool_paths(&config, &mut items);
            check_skill_sources(&config, &mut items);
            check_distributions(&config, &mut items);
        }
        Err(error) => {
            items.push(
                item(
                    "config.readable",
                    DiagnosticLevel::Error,
                    DiagnosticCategory::Config,
                    "config_unreadable",
                )
                .with_path(config_file_path())
                .with_detail(error),
            );
        }
    }

    DiagnosticReport {
        summary: summarize(&items),
        items,
    }
}

fn check_config_writable(items: &mut Vec<DiagnosticItem>) {
    let dir = config_dir();
    if let Err(error) = fs::create_dir_all(&dir) {
        items.push(
            item(
                "config.writable",
                DiagnosticLevel::Error,
                DiagnosticCategory::Config,
                "config_dir_unwritable",
            )
            .with_path(dir)
            .with_detail(error.to_string()),
        );
        return;
    }

    let config_path = config_file_path();
    let write_result = test_file_replacement(&dir, ".config-diagnostic");

    match write_result {
        Ok(()) => {
            items.push(
                item(
                    "config.writable",
                    DiagnosticLevel::Ok,
                    DiagnosticCategory::Config,
                    "config_writable",
                )
                .with_path(config_path),
            );
        }
        Err(error) => {
            items.push(
                item(
                    "config.writable",
                    DiagnosticLevel::Error,
                    DiagnosticCategory::Config,
                    "config_unwritable",
                )
                .with_path(config_path)
                .with_detail(error.to_string()),
            );
        }
    }
}

fn check_tool_paths(config: &AppConfig, items: &mut Vec<DiagnosticItem>) {
    for (tool, paths) in &config.tool_paths {
        let id = format!("tool_path.{tool}.global");
        let expanded = match expand_home(&paths.global) {
            Some(path) => PathBuf::from(path),
            None => {
                items.push(
                    item(
                        &id,
                        DiagnosticLevel::Error,
                        DiagnosticCategory::ToolPath,
                        "tool_path_expand_failed",
                    )
                    .with_tool(tool)
                    .with_path(paths.global.as_str()),
                );
                continue;
            }
        };

        if !expanded.exists() {
            items.push(
                item(
                    &id,
                    DiagnosticLevel::Warning,
                    DiagnosticCategory::ToolPath,
                    "tool_path_missing",
                )
                .with_tool(tool)
                .with_path(expanded),
            );
            continue;
        }

        if !expanded.is_dir() {
            items.push(
                item(
                    &id,
                    DiagnosticLevel::Error,
                    DiagnosticCategory::ToolPath,
                    "tool_path_not_directory",
                )
                .with_tool(tool)
                .with_path(expanded),
            );
            continue;
        }

        match fs::read_dir(&expanded) {
            Ok(_) => items.push(
                item(
                    &format!("{id}.readable"),
                    DiagnosticLevel::Ok,
                    DiagnosticCategory::ToolPath,
                    "tool_path_readable",
                )
                .with_tool(tool)
                .with_path(&expanded),
            ),
            Err(error) => {
                items.push(
                    item(
                        &format!("{id}.readable"),
                        DiagnosticLevel::Error,
                        DiagnosticCategory::ToolPath,
                        "tool_path_unreadable",
                    )
                    .with_tool(tool)
                    .with_path(&expanded)
                    .with_detail(error.to_string()),
                );
                continue;
            }
        }

        match test_directory_writable(&expanded, ".kitestring-diagnostic") {
            Ok(()) => {
                items.push(
                    item(
                        &format!("{id}.writable"),
                        DiagnosticLevel::Ok,
                        DiagnosticCategory::ToolPath,
                        "tool_path_writable",
                    )
                    .with_tool(tool)
                    .with_path(expanded),
                );
            }
            Err(error) => {
                items.push(
                    item(
                        &format!("{id}.writable"),
                        DiagnosticLevel::Error,
                        DiagnosticCategory::ToolPath,
                        "tool_path_unwritable",
                    )
                    .with_tool(tool)
                    .with_path(expanded)
                    .with_detail(error.to_string()),
                );
            }
        }
    }
}

fn check_skill_sources(config: &AppConfig, items: &mut Vec<DiagnosticItem>) {
    for skill in &config.skills {
        let source = Path::new(&skill.source_path);
        let level = if source.is_dir() {
            DiagnosticLevel::Ok
        } else {
            DiagnosticLevel::Error
        };
        let code = if level == DiagnosticLevel::Ok {
            "skill_source_exists"
        } else {
            "skill_source_missing"
        };
        items.push(
            item(
                &format!("skill_source.{}", skill.id),
                level,
                DiagnosticCategory::SkillSource,
                code,
            )
            .with_skill_name(&skill.name)
            .with_skill_id(&skill.id)
            .with_path(skill.source_path.as_str()),
        );
    }
}

fn check_distributions(config: &AppConfig, items: &mut Vec<DiagnosticItem>) {
    for dist in &config.distributions {
        let skill = config.skills.iter().find(|s| s.id == dist.skill_id);
        let status = derive_distribution_status(
            Path::new(&dist.target_path),
            skill.map(|s| s.source_path.as_str()),
            &dist.entry_type,
        );

        let (level, code) = match status {
            DistStatus::Linked => (DiagnosticLevel::Ok, "distribution_linked"),
            DistStatus::Pending => (DiagnosticLevel::Warning, "distribution_pending"),
            DistStatus::Broken => (DiagnosticLevel::Error, "distribution_broken"),
        };

        items.push(
            item(
                &format!("distribution.{}", dist.id),
                level,
                DiagnosticCategory::Distribution,
                code,
            )
            .with_tool(dist.tool.to_string())
            .with_skill_name(skill.map(|s| s.name.as_str()).unwrap_or(""))
            .with_skill_id(&dist.skill_id)
            .with_distribution_id(&dist.id)
            .with_path(dist.target_path.as_str())
            .with_status(format!("{status:?}")),
        );
    }
}

fn test_directory_writable(dir: &Path, prefix: &str) -> std::io::Result<()> {
    let tmp_path = dir.join(format!("{prefix}-{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&tmp_path, b"kitestring diagnostic")?;
    fs::remove_file(tmp_path)
}

fn test_file_replacement(dir: &Path, prefix: &str) -> std::io::Result<()> {
    let id = uuid::Uuid::new_v4();
    let source = dir.join(format!("{prefix}-{id}.tmp"));
    let target = dir.join(format!("{prefix}-{id}.json"));

    if let Err(error) = fs::write(&target, b"old") {
        return Err(error);
    }
    if let Err(error) = fs::write(&source, b"new") {
        let _ = fs::remove_file(&target);
        return Err(error);
    }

    let result = fs::rename(&source, &target);
    let _ = fs::remove_file(&source);
    let _ = fs::remove_file(&target);
    result
}

fn derive_distribution_status(
    target: &Path,
    source: Option<&str>,
    entry_type: &EntryType,
) -> DistStatus {
    if *entry_type == EntryType::Folder {
        return if target.is_dir() {
            DistStatus::Linked
        } else {
            DistStatus::Pending
        };
    }

    let is_symlink = target
        .symlink_metadata()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);

    if !is_symlink && !target.exists() {
        return DistStatus::Pending;
    }

    let Some(source) = source else {
        return DistStatus::Broken;
    };

    match fs::read_link(target) {
        Ok(link_target) => {
            let link_path = if link_target.is_absolute() {
                link_target
            } else {
                target
                    .parent()
                    .unwrap_or_else(|| Path::new(""))
                    .join(link_target)
            };
            let link_real = fs::canonicalize(&link_path);
            let source_real = fs::canonicalize(source);
            if matches!((link_real, source_real), (Ok(link), Ok(source)) if link == source) {
                DistStatus::Linked
            } else {
                DistStatus::Broken
            }
        }
        Err(_) => DistStatus::Broken,
    }
}

fn summarize(items: &[DiagnosticItem]) -> DiagnosticSummary {
    let mut summary = DiagnosticSummary::default();
    for item in items {
        match item.level {
            DiagnosticLevel::Ok => summary.ok += 1,
            DiagnosticLevel::Warning => summary.warning += 1,
            DiagnosticLevel::Error => summary.error += 1,
        }
    }
    summary
}

fn item(
    id: &str,
    level: DiagnosticLevel,
    category: DiagnosticCategory,
    code: &str,
) -> DiagnosticItem {
    DiagnosticItem {
        id: id.to_string(),
        level,
        category,
        code: code.to_string(),
        path: None,
        tool: None,
        skill_name: None,
        skill_id: None,
        distribution_id: None,
        status: None,
        detail: None,
    }
}

impl DiagnosticItem {
    fn with_path(mut self, path: impl AsRef<Path>) -> Self {
        self.path = Some(path.as_ref().to_string_lossy().to_string());
        self
    }

    fn with_tool(mut self, tool: impl Into<String>) -> Self {
        self.tool = Some(tool.into());
        self
    }

    fn with_skill_name(mut self, skill_name: impl Into<String>) -> Self {
        self.skill_name = Some(skill_name.into());
        self
    }

    fn with_skill_id(mut self, skill_id: impl Into<String>) -> Self {
        self.skill_id = Some(skill_id.into());
        self
    }

    fn with_distribution_id(mut self, distribution_id: impl Into<String>) -> Self {
        self.distribution_id = Some(distribution_id.into());
        self
    }

    fn with_status(mut self, status: impl Into<String>) -> Self {
        self.status = Some(status.into());
        self
    }

    fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::config::{save_config, ToolPaths};
    use crate::models::distribution::{Distribution, Scope, Tool};
    use crate::test_helpers::{make_sample_skill, setup_test_env};

    fn setup_config_with_tool_dirs() -> tempfile::TempDir {
        let tmp = setup_test_env();
        let mut config = load_config().unwrap();
        for (tool, paths) in config.tool_paths.iter_mut() {
            let dir = tmp.path().join(format!("tool-{tool}"));
            fs::create_dir_all(&dir).unwrap();
            *paths = ToolPaths {
                global: dir.to_string_lossy().to_string(),
                project: format!(".{tool}/skills/"),
                extra_globals: vec![],
            };
        }
        save_config(&config).unwrap();
        tmp
    }

    #[test]
    fn test_run_diagnostics_reports_clean_config_and_tool_paths() {
        let _tmp = setup_config_with_tool_dirs();

        let report = run_diagnostics();

        assert_eq!(report.summary.error, 0);
        assert_eq!(report.summary.warning, 0);
        assert!(report.items.iter().any(|i| i.code == "config_readable"));
        assert!(report.items.iter().any(|i| i.code == "config_writable"));
        assert_eq!(
            report
                .items
                .iter()
                .filter(|i| i.code == "tool_path_writable")
                .count(),
            5
        );
        assert_eq!(
            report
                .items
                .iter()
                .filter(|i| i.code == "tool_path_readable")
                .count(),
            5
        );
    }

    #[test]
    fn test_run_diagnostics_reports_missing_skill_source() {
        let tmp = setup_config_with_tool_dirs();
        let mut config = load_config().unwrap();
        let missing_source = tmp.path().join("missing-source");
        config.skills.push(make_sample_skill(
            "skill-1",
            "missing",
            &missing_source.to_string_lossy(),
        ));
        save_config(&config).unwrap();

        let report = run_diagnostics();

        assert_eq!(report.summary.error, 1);
        assert!(report.items.iter().any(|i| {
            i.code == "skill_source_missing"
                && i.skill_name.as_deref() == Some("missing")
                && i.skill_id.as_deref() == Some("skill-1")
        }));
    }

    #[test]
    fn test_run_diagnostics_reports_pending_distribution() {
        let tmp = setup_config_with_tool_dirs();
        let source = tmp.path().join("source");
        fs::create_dir_all(&source).unwrap();
        let target = tmp.path().join("missing-target");
        let mut config = load_config().unwrap();
        config.skills.push(make_sample_skill(
            "skill-1",
            "source",
            &source.to_string_lossy(),
        ));
        config.distributions.push(Distribution {
            id: "dist-1".to_string(),
            skill_id: "skill-1".to_string(),
            tool: Tool::ClaudeCode,
            scope: Scope::Global,
            target_path: target.to_string_lossy().to_string(),
            status: DistStatus::Linked,
            entry_type: EntryType::Symlink,
        });
        save_config(&config).unwrap();

        let report = run_diagnostics();

        assert_eq!(report.summary.warning, 1);
        assert!(report.items.iter().any(|i| {
            i.code == "distribution_pending"
                && i.distribution_id.as_deref() == Some("dist-1")
                && i.skill_id.as_deref() == Some("skill-1")
        }));
    }

    #[cfg(unix)]
    #[test]
    fn test_run_diagnostics_reports_unwritable_config_directory() {
        use std::os::unix::fs::PermissionsExt;

        let _tmp = setup_config_with_tool_dirs();
        let path = config_dir();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o500)).unwrap();

        let report = run_diagnostics();

        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(report.items.iter().any(|i| i.code == "config_unwritable"));
    }

    #[cfg(unix)]
    #[test]
    fn test_run_diagnostics_accepts_read_only_config_file_in_writable_directory() {
        use std::os::unix::fs::PermissionsExt;

        let _tmp = setup_config_with_tool_dirs();
        let path = config_file_path();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o400)).unwrap();

        let report = run_diagnostics();

        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        assert!(report.items.iter().any(|i| i.code == "config_writable"));
        assert!(!report.items.iter().any(|i| i.code == "config_unwritable"));
    }

    #[cfg(unix)]
    #[test]
    fn test_run_diagnostics_reports_unreadable_tool_path() {
        use std::os::unix::fs::PermissionsExt;

        let tmp = setup_config_with_tool_dirs();
        let mut config = load_config().unwrap();
        let path = tmp.path().join("unreadable-tool");
        fs::create_dir_all(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o300)).unwrap();
        config.tool_paths.get_mut("Codex").unwrap().global = path.to_string_lossy().to_string();
        save_config(&config).unwrap();

        let report = run_diagnostics();

        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(report
            .items
            .iter()
            .any(|i| { i.code == "tool_path_unreadable" && i.tool.as_deref() == Some("Codex") }));
    }

    #[cfg(unix)]
    #[test]
    fn test_run_diagnostics_reports_unwritable_tool_path() {
        use std::os::unix::fs::PermissionsExt;

        let tmp = setup_config_with_tool_dirs();
        let mut config = load_config().unwrap();
        let path = tmp.path().join("unwritable-tool");
        fs::create_dir_all(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o500)).unwrap();
        config.tool_paths.get_mut("Codex").unwrap().global = path.to_string_lossy().to_string();
        save_config(&config).unwrap();

        let report = run_diagnostics();

        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(report
            .items
            .iter()
            .any(|i| { i.code == "tool_path_unwritable" && i.tool.as_deref() == Some("Codex") }));
    }

    #[cfg(unix)]
    #[test]
    fn test_run_diagnostics_reports_broken_distribution_with_skill_id() {
        use std::os::unix::fs::symlink;

        let tmp = setup_config_with_tool_dirs();
        let source = tmp.path().join("source");
        let wrong_source = tmp.path().join("wrong-source");
        let target = tmp.path().join("broken-link");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&wrong_source).unwrap();
        symlink(&wrong_source, &target).unwrap();
        let mut config = load_config().unwrap();
        config.skills.push(make_sample_skill(
            "skill-1",
            "source",
            &source.to_string_lossy(),
        ));
        config.distributions.push(Distribution {
            id: "dist-1".to_string(),
            skill_id: "skill-1".to_string(),
            tool: Tool::ClaudeCode,
            scope: Scope::Global,
            target_path: target.to_string_lossy().to_string(),
            status: DistStatus::Linked,
            entry_type: EntryType::Symlink,
        });
        save_config(&config).unwrap();

        let report = run_diagnostics();

        assert!(report.items.iter().any(|i| {
            i.code == "distribution_broken" && i.skill_id.as_deref() == Some("skill-1")
        }));
    }
}
