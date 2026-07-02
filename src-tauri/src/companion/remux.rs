use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

pub async fn ensure_remuxed(
    app: &AppHandle,
    cache_dir: &Path,
    id: &str,
    source: &Path,
) -> Option<PathBuf> {
    let out_path = cache_dir.join(format!("{id}.companion.mp4"));

    if let (Ok(out_meta), Ok(src_meta)) = (std::fs::metadata(&out_path), std::fs::metadata(source)) {
        if let (Ok(out_mtime), Ok(src_mtime)) = (out_meta.modified(), src_meta.modified()) {
            if out_mtime >= src_mtime && out_meta.len() > 0 {
                return Some(out_path);
            }
        }
    }

    let output = app
        .shell()
        .sidecar("ffmpeg")
        .ok()?
        .args([
            "-y",
            "-i",
            &source.to_string_lossy(),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            &out_path.to_string_lossy(),
        ])
        .output()
        .await
        .ok()?;

    if output.status.success() && out_path.exists() {
        Some(out_path)
    } else {
        let _ = std::fs::remove_file(&out_path);
        None
    }
}
