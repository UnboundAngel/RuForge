//! Shared enumeration of media files, sidecars, and RuForge thumb trees.
//! Used by export, delete-to-trash, and download cleanup.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::utils::{vtt_sidecars_for_stem, THUMB_DIR_NAME};

pub fn strip_ytdlp_stream_suffix(stem: &str) -> &str {
    let Some(dot_f) = stem.rfind(".f") else {
        return stem;
    };
    let tail = &stem[dot_f + 2..];
    if tail.is_empty() {
        return stem;
    }
    if tail
        .chars()
        .all(|c| c.is_ascii_digit() || c == '-' || c == '.')
    {
        return &stem[..dot_f];
    }
    stem
}

pub fn stem_candidates(stem: &str) -> Vec<&str> {
    let stripped = strip_ytdlp_stream_suffix(stem);
    if stripped == stem {
        vec![stem]
    } else {
        vec![stem, stripped]
    }
}

/// Sidecar files next to one exact media stem (no stripped-stem variants).
pub fn collect_sidecar_sources_exact_stem(parent: &Path, stem: &str) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();

    for name in [
        format!("{stem}.jpg"),
        format!("{stem}.webp"),
        format!("{stem}.info.json"),
        format!("{stem}..info.json"),
        format!("{stem}.sponsorblock.json"),
        format!("{stem}.musicmeta.json"),
        format!("{stem}.lyrics.json"),
        format!("{stem}.comments.json"),
    ] {
        let p = parent.join(&name);
        if p.is_file() && seen.insert(p.clone()) {
            paths.push(p);
        }
    }

    if let Ok(vtts) = crate::utils::vtt_sidecars_for_stem(parent, stem) {
        for (p, _) in vtts {
            if seen.insert(p.clone()) {
                paths.push(p);
            }
        }
    }

    paths
}

/// Complete flat sidecar set next to a media file (matches export bundler).
pub fn collect_sidecar_sources(parent: &Path, stem: &str) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();

    for candidate in stem_candidates(stem) {
        for name in [
            format!("{candidate}.jpg"),
            format!("{candidate}.webp"),
            format!("{candidate}.info.json"),
            format!("{candidate}..info.json"),
            format!("{candidate}.sponsorblock.json"),
            format!("{candidate}.musicmeta.json"),
            format!("{candidate}.lyrics.json"),
            format!("{candidate}.comments.json"),
        ] {
            let p = parent.join(&name);
            if p.is_file() && seen.insert(p.clone()) {
                paths.push(p);
            }
        }
    }

    if let Ok(vtts) = vtt_sidecars_for_stem(parent, stem) {
        for (p, _) in vtts {
            if seen.insert(p.clone()) {
                paths.push(p);
            }
        }
    }

    paths
}

pub fn thumb_dir_candidates(parent: &Path, stem: &str) -> Vec<PathBuf> {
    stem_candidates(stem)
        .into_iter()
        .map(|s| parent.join(THUMB_DIR_NAME).join(s))
        .filter(|p| p.is_dir())
        .collect()
}

fn collect_files_in_dir(dir: &Path, out: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files_in_dir(&path, out, seen);
        } else if path.is_file() && seen.insert(path.clone()) {
            out.push(path);
        }
    }
}

/// Media file (if present), all export-complete sidecars, and thumb tree files.
pub fn collect_deletion_paths(media_path: &Path) -> Vec<PathBuf> {
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut paths: Vec<PathBuf> = Vec::new();

    if media_path.is_file() && seen.insert(media_path.to_path_buf()) {
        paths.push(media_path.to_path_buf());
    }

    let parent = match media_path.parent() {
        Some(p) => p,
        None => return paths,
    };
    let stem = match media_path.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s,
        None => return paths,
    };

    let sidecar_list = if strip_ytdlp_stream_suffix(stem) != stem {
        collect_sidecar_sources_exact_stem(parent, stem)
    } else {
        collect_sidecar_sources(parent, stem)
    };

    for sidecar in sidecar_list {
        if seen.insert(sidecar.clone()) {
            paths.push(sidecar);
        }
    }

    for thumb_dir in thumb_dir_candidates(parent, stem) {
        collect_files_in_dir(&thumb_dir, &mut paths, &mut seen);
    }

    paths
}

fn dir_is_empty(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .map(|mut it| it.next().is_none())
        .unwrap_or(false)
}

fn try_remove_empty_dir(dir: &Path) {
    if dir.is_dir() && dir_is_empty(dir) {
        let _ = std::fs::remove_dir(dir);
    }
}

/// After delete/trash, remove empty item folder and empty `.ruforge_thumbs/{stem}` tree.
pub fn prune_empty_dirs_after_media_delete(media_path: &Path) {
    let parent = match media_path.parent() {
        Some(p) => p,
        None => return,
    };
    let stem = match media_path.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s,
        None => return,
    };

    try_remove_empty_dir(parent);

    for thumb_dir in thumb_dir_candidates(parent, stem) {
        try_remove_empty_dir(&thumb_dir);
    }

    let thumbs_root = parent.join(THUMB_DIR_NAME);
    try_remove_empty_dir(&thumbs_root);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::POSTER_FILE;

    #[test]
    fn stream_duplicate_delete_keeps_shared_stripped_stem_sidecars() {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path();
        let keeper = parent.join("Title.webm");
        let duplicate = parent.join("Title.f398.mp4");
        std::fs::write(&keeper, b"keeper").unwrap();
        std::fs::write(&duplicate, b"dup").unwrap();
        std::fs::write(parent.join("Title.comments.json"), br#"{"v":1}"#).unwrap();
        std::fs::write(parent.join("Title.info.json"), br#"{"id":"x"}"#).unwrap();
        std::fs::write(parent.join("Title.f398.info.json"), br#"{"id":"x"}"#).unwrap();

        let paths = collect_deletion_paths(&duplicate);
        assert!(paths.iter().any(|p| p.ends_with("Title.f398.mp4")));
        assert!(paths.iter().any(|p| p.ends_with("Title.f398.info.json")));
        assert!(!paths.iter().any(|p| p.ends_with("Title.comments.json")));
        assert!(!paths.iter().any(|p| p.ends_with("Title.info.json")));
    }

    #[test]
    fn collect_deletion_paths_includes_comments_and_thumb_tree() {
        let dir = tempfile::tempdir().unwrap();
        let media = dir.path().join("clip.mkv");
        std::fs::write(&media, b"v").unwrap();
        std::fs::write(dir.path().join("clip.comments.json"), b"{}").unwrap();
        let thumb_dir = dir.path().join(THUMB_DIR_NAME).join("clip");
        std::fs::create_dir_all(&thumb_dir).unwrap();
        std::fs::write(thumb_dir.join(POSTER_FILE), b"p").unwrap();

        let paths = collect_deletion_paths(&media);
        assert!(paths.iter().any(|p| p.ends_with("clip.mkv")));
        assert!(paths.iter().any(|p| p.ends_with("clip.comments.json")));
        assert!(paths.iter().any(|p| p.ends_with(POSTER_FILE)));
    }

    #[test]
    fn prune_removes_empty_item_and_thumb_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let item_dir = dir.path().join("Videos").join("My Title");
        std::fs::create_dir_all(&item_dir).unwrap();
        let media = item_dir.join("My Title.mkv");
        std::fs::write(&media, b"v").unwrap();
        let thumb_dir = item_dir.join(THUMB_DIR_NAME).join("My Title");
        std::fs::create_dir_all(&thumb_dir).unwrap();
        std::fs::write(thumb_dir.join(POSTER_FILE), b"p").unwrap();

        std::fs::remove_file(&media).unwrap();
        std::fs::remove_file(thumb_dir.join(POSTER_FILE)).unwrap();
        std::fs::remove_dir(&thumb_dir).unwrap();

        prune_empty_dirs_after_media_delete(&media);
        assert!(!item_dir.exists());
    }
}
