//! Library-aware wrappers over [`crate::path_guard`] for Tauri commands that take paths.

use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};

use super::{config, LibraryState};
use crate::path_guard;

/// Sync so both sync and async commands can call it; the config lock is only write-held briefly
/// while settings change, and blocking on it from either context would deadlock or panic.
fn library_roots<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let Some(lib) = app.try_state::<LibraryState>() else {
        return Vec::new();
    };
    for _ in 0..50 {
        if let Ok(cfg) = lib.config.try_read() {
            let mut roots = config::effective_roots(&cfg);
            if !cfg.output_dir.trim().is_empty() {
                roots.push(cfg.output_dir.clone());
            }
            return roots;
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    Vec::new()
}

/// Read-side commands: any absolute local path, UNC only under a UNC library root.
pub fn allow_path<R: Runtime>(app: &AppHandle<R>, raw: &str) -> Result<PathBuf, String> {
    path_guard::check_path(raw, &library_roots(app))
}

/// Caller-supplied scan roots, minus any [`allow_path`] refuses.
pub fn allowed_roots<R: Runtime>(app: &AppHandle<R>, roots: &[String]) -> Vec<String> {
    let library = library_roots(app);
    roots
        .iter()
        .filter(|r| !r.trim().is_empty() && path_guard::check_path(r.trim(), &library).is_ok())
        .cloned()
        .collect()
}

/// `folder_name` must be a single path segment: no separators, drive colon, `.` or `..`.
pub fn check_folder_segment(folder_name: &str) -> Result<&str, String> {
    let folder = folder_name.trim();
    if folder.is_empty()
        || folder == "."
        || folder == ".."
        || folder.contains(['/', '\\', ':', '\0'])
    {
        return Err("Invalid playlist folder name".into());
    }
    Ok(folder)
}

/// Destructive commands: the canonical path must be inside a configured library root.
pub fn allow_library_path<R: Runtime>(app: &AppHandle<R>, raw: &str) -> Result<PathBuf, String> {
    path_guard::check_path_within_roots(raw, &library_roots(app))
}
