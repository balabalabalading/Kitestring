use std::path::Path;

/// Expand ~ to home directory in a path string
#[allow(dead_code)]
pub fn expand_home(path: &str) -> Option<String> {
    if path.starts_with("~/") {
        let home = dirs::home_dir()?;
        let rest = &path[2..];
        Some(home.join(rest).to_string_lossy().to_string())
    } else {
        Some(path.to_string())
    }
}

/// Check if a path is a symlink
#[allow(dead_code)]
pub fn is_symlink(path: &Path) -> bool {
    path.symlink_metadata()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_expand_home_tilde() {
        let expanded = expand_home("~/test/path").unwrap();
        let home = dirs::home_dir().unwrap();
        assert_eq!(expanded, home.join("test/path").to_string_lossy().to_string());
    }

    #[test]
    fn test_expand_home_absolute() {
        let result = expand_home("/absolute/path").unwrap();
        assert_eq!(result, "/absolute/path");
    }

    #[test]
    fn test_expand_home_relative() {
        let result = expand_home("relative/path").unwrap();
        assert_eq!(result, "relative/path");
    }

    #[test]
    fn test_is_symlink_true() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("target");
        let link = tmp.path().join("link");
        fs::create_dir_all(&target).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &link).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&target, &link).unwrap();
        assert!(is_symlink(&link));
    }

    #[test]
    fn test_is_symlink_false() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("regular.txt");
        fs::write(&file_path, "hello").unwrap();
        assert!(!is_symlink(&file_path));
    }

    #[test]
    fn test_is_symlink_nonexistent() {
        assert!(!is_symlink(Path::new("/nonexistent/path/xyz")));
    }
}
