use std::fs;
use std::path::Path;

/// Parsed front matter from SKILL.md
#[derive(Debug, Clone)]
pub struct SkillMeta {
    pub name: String,
    pub description: String,
}

/// Parse SKILL.md and extract front matter (name, description)
pub fn parse_skill_md(path: &Path) -> Result<SkillMeta, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read SKILL.md: {e}"))?;

    let (front_matter, _body) = extract_front_matter(&content)?;

    let name = front_matter
        .get("name")
        .cloned()
        .unwrap_or_else(|| {
            path.parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string()
        });

    let description = front_matter.get("description").cloned().unwrap_or_default();

    Ok(SkillMeta { name, description })
}

/// Find all SKILL.md files in a directory (recursive, max depth 3)
pub fn find_skill_md_files(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut results = Vec::new();
    scan_for_skill_md(dir, &mut results, 0);
    results
}

fn scan_for_skill_md(dir: &Path, results: &mut Vec<std::path::PathBuf>, depth: usize) {
    if depth > 3 {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Skip hidden directories and common non-skill dirs
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with('.') || name == "node_modules" || name == "target" {
                        continue;
                    }
                }
                scan_for_skill_md(&path, results, depth + 1);
            } else if path.file_name().and_then(|n| n.to_str()) == Some("SKILL.md") {
                results.push(path);
            }
        }
    }
}

/// Extract YAML-like front matter from markdown content
fn extract_front_matter(content: &str) -> Result<(std::collections::HashMap<String, String>, String), String> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return Ok((std::collections::HashMap::new(), content.to_string()));
    }

    let after_open = &trimmed[3..];
    if let Some(end_idx) = after_open.find("---") {
        let fm_str = after_open[..end_idx].trim();
        let body = after_open[end_idx + 3..].trim().to_string();

        let mut map = std::collections::HashMap::new();
        for line in fm_str.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some(colon_pos) = line.find(':') {
                let key = line[..colon_pos].trim().to_string();
                let value = line[colon_pos + 1..].trim().to_string();
                if !key.is_empty() {
                    map.insert(key, value);
                }
            }
        }
        Ok((map, body))
    } else {
        Ok((std::collections::HashMap::new(), content.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_parse_front_matter() {
        let content = "---\nname: my-skill\ndescription: A test skill\n---\n# Body";
        let (fm, body) = extract_front_matter(content).unwrap();
        assert_eq!(fm.get("name").unwrap(), "my-skill");
        assert_eq!(fm.get("description").unwrap(), "A test skill");
        assert!(body.starts_with("# Body"));
    }

    #[test]
    fn test_no_front_matter() {
        let content = "# Just a regular markdown file";
        let (fm, _) = extract_front_matter(content).unwrap();
        assert!(fm.is_empty());
    }

    #[test]
    fn test_parse_skill_md_with_name() {
        let tmp = tempfile::tempdir().unwrap();
        let skill_dir = tmp.path().join("my-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: custom-name\ndescription: Custom desc\n---\n# Body",
        )
        .unwrap();
        let meta = parse_skill_md(&skill_dir.join("SKILL.md")).unwrap();
        assert_eq!(meta.name, "custom-name");
        assert_eq!(meta.description, "Custom desc");
    }

    #[test]
    fn test_parse_skill_md_without_name() {
        let tmp = tempfile::tempdir().unwrap();
        let skill_dir = tmp.path().join("fallback-name");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\ndescription: No name field\n---\n",
        )
        .unwrap();
        let meta = parse_skill_md(&skill_dir.join("SKILL.md")).unwrap();
        assert_eq!(meta.name, "fallback-name");
    }

    #[test]
    fn test_parse_skill_md_with_colon_in_description() {
        let tmp = tempfile::tempdir().unwrap();
        let skill_dir = tmp.path().join("skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: test\ndescription: This: has colons: in it\n---\n",
        )
        .unwrap();
        let meta = parse_skill_md(&skill_dir.join("SKILL.md")).unwrap();
        assert_eq!(meta.description, "This: has colons: in it");
    }

    #[test]
    fn test_parse_skill_md_empty_front_matter() {
        let tmp = tempfile::tempdir().unwrap();
        let skill_dir = tmp.path().join("empty-fm");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\n---\n# No metadata").unwrap();
        let meta = parse_skill_md(&skill_dir.join("SKILL.md")).unwrap();
        assert_eq!(meta.name, "empty-fm");
        assert_eq!(meta.description, "");
    }

    #[test]
    fn test_find_skill_md_single() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("SKILL.md"), "---\nname: test\n---\n").unwrap();
        let results = find_skill_md_files(tmp.path());
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_find_skill_md_nested() {
        let tmp = tempfile::tempdir().unwrap();
        // Root-level SKILL.md
        fs::write(tmp.path().join("SKILL.md"), "---\nname: root\n---\n").unwrap();
        // Nested skill
        let nested = tmp.path().join("subdir");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("SKILL.md"), "---\nname: nested\n---\n").unwrap();
        let results = find_skill_md_files(tmp.path());
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_find_skill_md_max_depth() {
        let tmp = tempfile::tempdir().unwrap();
        // depth 4: should not be found
        let deep = tmp.path().join("a").join("b").join("c").join("d");
        fs::create_dir_all(&deep).unwrap();
        fs::write(deep.join("SKILL.md"), "---\nname: deep\n---\n").unwrap();
        let results = find_skill_md_files(tmp.path());
        assert!(results.is_empty());
    }

    #[test]
    fn test_find_skill_md_skips_hidden() {
        let tmp = tempfile::tempdir().unwrap();
        // hidden dir
        let hidden = tmp.path().join(".hidden");
        fs::create_dir_all(&hidden).unwrap();
        fs::write(hidden.join("SKILL.md"), "---\nname: hidden\n---\n").unwrap();
        // node_modules
        let nm = tmp.path().join("node_modules");
        fs::create_dir_all(&nm).unwrap();
        fs::write(nm.join("SKILL.md"), "---\nname: nm\n---\n").unwrap();
        // target
        let target = tmp.path().join("target");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("SKILL.md"), "---\nname: target\n---\n").unwrap();
        let results = find_skill_md_files(tmp.path());
        assert!(results.is_empty());
    }

    #[test]
    fn test_find_skill_md_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let results = find_skill_md_files(tmp.path());
        assert!(results.is_empty());
    }
}
