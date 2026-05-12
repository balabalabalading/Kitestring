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
    if depth > 5 {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Skip only .git and known non-skill build dirs; keep other hidden dirs (e.g. .agents, .claude)
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name == ".git" || name == "node_modules" || name == "target" {
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

/// Extract YAML-like front matter from markdown content.
/// Supports simple `key: value` pairs and block scalars (`key: |` and `key: >`).
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
        let lines: Vec<&str> = fm_str.lines().collect();
        let mut i = 0;

        while i < lines.len() {
            let line = lines[i].trim();
            if line.is_empty() || line.starts_with('#') {
                i += 1;
                continue;
            }

            if let Some(colon_pos) = line.find(':') {
                let key = line[..colon_pos].trim().to_string();
                let raw_value = line[colon_pos + 1..].trim();

                if key.is_empty() {
                    i += 1;
                    continue;
                }

                // Detect YAML block scalar: `key: |` or `key: >` (with optional strip `-` / keep `+` chars)
                let is_literal = raw_value == "|" || raw_value == "|-" || raw_value == "|+";
                let is_folded = raw_value == ">" || raw_value == ">-" || raw_value == ">+";

                if is_literal || is_folded {
                    let mut block_lines: Vec<String> = Vec::new();
                    i += 1;
                    while i < lines.len() {
                        let raw_line = lines[i];
                        // A non-empty, non-indented line signals end of block scalar
                        if !raw_line.is_empty() && !raw_line.starts_with(' ') && !raw_line.starts_with('\t') {
                            break;
                        }
                        // Strip 2-space indentation (standard YAML block indent)
                        let stripped = if raw_line.len() >= 2 && raw_line.starts_with("  ") {
                            &raw_line[2..]
                        } else {
                            raw_line.trim_start()
                        };
                        block_lines.push(stripped.to_string());
                        i += 1;
                    }

                    // Trim trailing blank lines
                    while block_lines.last().map(|l: &String| l.trim().is_empty()).unwrap_or(false) {
                        block_lines.pop();
                    }

                    let value = if is_folded {
                        // Folded: collapse newlines to spaces
                        block_lines.iter().map(|l| l.trim_end().to_string()).collect::<Vec<_>>().join(" ")
                    } else {
                        // Literal: preserve newlines
                        block_lines.join("\n")
                    };

                    map.insert(key, value);
                } else {
                    map.insert(key, raw_value.to_string());
                    i += 1;
                }
            } else {
                i += 1;
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
        // depth 6 (a/b/c/d/e/f): should not be found (max depth is 5)
        let deep = tmp.path().join("a").join("b").join("c").join("d").join("e").join("f");
        fs::create_dir_all(&deep).unwrap();
        fs::write(deep.join("SKILL.md"), "---\nname: deep\n---\n").unwrap();
        let results = find_skill_md_files(tmp.path());
        assert!(results.is_empty());
    }

    #[test]
    fn test_find_skill_md_skips_only_git_and_build_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        // .git should be skipped
        let git = tmp.path().join(".git");
        fs::create_dir_all(&git).unwrap();
        fs::write(git.join("SKILL.md"), "---\nname: git\n---\n").unwrap();
        // node_modules should be skipped
        let nm = tmp.path().join("node_modules");
        fs::create_dir_all(&nm).unwrap();
        fs::write(nm.join("SKILL.md"), "---\nname: nm\n---\n").unwrap();
        // target should be skipped
        let target = tmp.path().join("target");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("SKILL.md"), "---\nname: target\n---\n").unwrap();
        // .agents should NOT be skipped (hidden but not .git)
        let agents = tmp.path().join(".agents").join("skills").join("my-skill");
        fs::create_dir_all(&agents).unwrap();
        fs::write(agents.join("SKILL.md"), "---\nname: agents-skill\n---\n").unwrap();
        let results = find_skill_md_files(tmp.path());
        assert_eq!(results.len(), 1);
        assert!(results[0].to_string_lossy().contains("agents-skill") || results[0].to_string_lossy().contains(".agents"));
    }

    #[test]
    fn test_find_skill_md_deep_hidden_path() {
        // Simulate oz-skills structure: project/.agents/skills/skill-A/SKILL.md (depth 4)
        let tmp = tempfile::tempdir().unwrap();
        let deep = tmp.path().join("project").join(".agents").join("skills").join("skill-a");
        fs::create_dir_all(&deep).unwrap();
        fs::write(deep.join("SKILL.md"), "---\nname: deep-skill\n---\n").unwrap();
        let results = find_skill_md_files(tmp.path());
        assert_eq!(results.len(), 1);
        assert!(results[0].to_string_lossy().contains("skill-a"));
    }

    #[test]
    fn test_parse_block_scalar_literal() {
        let content = "---\nname: test\ndescription: |\n  Line one.\n  Line two.\n  Line three.\n---\n";
        let (fm, _) = extract_front_matter(content).unwrap();
        let desc = fm.get("description").unwrap();
        assert!(desc.contains("Line one."), "got: {desc}");
        assert!(desc.contains("Line two."), "got: {desc}");
        assert!(desc.contains("Line three."), "got: {desc}");
    }

    #[test]
    fn test_parse_block_scalar_folded() {
        let content = "---\nname: test\ndescription: >\n  Word one word two\n  word three.\n---\n";
        let (fm, _) = extract_front_matter(content).unwrap();
        let desc = fm.get("description").unwrap();
        // Folded: joined with space, not newline
        assert!(desc.contains("Word one word two"), "got: {desc}");
        assert!(desc.contains("word three."), "got: {desc}");
    }

    #[test]
    fn test_parse_block_scalar_with_colons_in_value() {
        // Trigger words with colons shouldn't break the key parser
        let content = "---\nname: hv-analysis\ndescription: |\n  触发词包括：横纵分析、研究一下。\n  Use this skill when: you need deep research.\n---\n";
        let (fm, _) = extract_front_matter(content).unwrap();
        let desc = fm.get("description").unwrap();
        assert!(desc.contains("触发词包括"), "got: {desc}");
        assert!(desc.contains("when: you need"), "got: {desc}");
    }

    #[test]
    fn test_find_skill_md_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let results = find_skill_md_files(tmp.path());
        assert!(results.is_empty());
    }
}
