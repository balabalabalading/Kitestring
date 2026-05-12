use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitInfo {
    pub branch: Option<String>,
    pub commit_count: usize,
    pub last_commit_time: Option<String>,
    pub is_git_repo: bool,
    pub remote_url: Option<String>,
}

/// Get git information for a given path
pub fn get_git_info(path: &str) -> Result<GitInfo, String> {
    let dir = Path::new(path);
    let repo = match git2::Repository::discover(dir) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitInfo {
                branch: None,
                commit_count: 0,
                last_commit_time: None,
                is_git_repo: false,
                remote_url: None,
            });
        }
    };

    let branch = repo.head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()));

    let commit_count = count_commits(&repo).unwrap_or(0);

    let last_commit_time = repo.head()
        .ok()
        .and_then(|head| head.target())
        .and_then(|oid| repo.find_commit(oid).ok())
        .and_then(|commit| {
            let time = commit.time();
            let secs = time.seconds();
            let utc = chrono::DateTime::from_timestamp(secs, 0)?;
            Some(utc.to_rfc3339())
        });

    let remote_url = repo.find_remote("origin")
        .ok()
        .and_then(|r| r.url().map(|s| s.to_string()));

    Ok(GitInfo {
        branch,
        commit_count,
        last_commit_time,
        is_git_repo: true,
        remote_url,
    })
}

fn count_commits(repo: &git2::Repository) -> Result<usize, String> {
    let head = repo.head().map_err(|e| format!("Failed to get HEAD: {e}"))?;
    let oid = head.target().ok_or("HEAD has no target")?;
    let mut revwalk = repo.revwalk().map_err(|e| format!("Failed to create revwalk: {e}"))?;
    revwalk.push(oid).map_err(|e| format!("Failed to push OID: {e}"))?;
    Ok(revwalk.count())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_get_git_info_non_git_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let info = get_git_info(tmp.path().to_str().unwrap()).unwrap();
        assert!(!info.is_git_repo);
        assert!(info.branch.is_none());
        assert_eq!(info.commit_count, 0);
    }

    #[test]
    fn test_get_git_info_git_repo() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(&tmp).unwrap();
        // Create an initial commit
        let sig = git2::Signature::now("Test", "test@test.com").unwrap();
        let tree_id = {
            let mut index = repo.index().unwrap();
            let file_path = tmp.path().join("README.md");
            fs::write(&file_path, "# Test").unwrap();
            index.add_path(Path::new("README.md")).unwrap();
            index.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "Initial commit",
            &tree,
            &[],
        )
        .unwrap();

        let info = get_git_info(tmp.path().to_str().unwrap()).unwrap();
        assert!(info.is_git_repo);
        assert!(info.branch.is_some());
        assert_eq!(info.commit_count, 1);
        assert!(info.last_commit_time.is_some());
    }

    #[test]
    fn test_get_git_info_empty_repo() {
        let tmp = tempfile::tempdir().unwrap();
        git2::Repository::init(&tmp).unwrap();
        // No commits — HEAD doesn't point to anything
        let info = get_git_info(tmp.path().to_str().unwrap()).unwrap();
        assert!(info.is_git_repo);
        assert_eq!(info.commit_count, 0);
    }
}
