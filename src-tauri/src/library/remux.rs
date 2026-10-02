//! Stream-copy remux for companion streaming. Ingestion-time concern: computed once
//! by `library::scanner` when a file's container is not browser-playable but its
//! codecs are, cached on disk under the app cache dir, never re-run per HTTP request.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

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

    // A run killed by RuForge exiting must not leave a file the freshness check above trusts.
    static RUN: AtomicU64 = AtomicU64::new(0);
    let partial = cache_dir.join(format!(
        "{id}.companion.{}.partial.mp4",
        RUN.fetch_add(1, Ordering::Relaxed)
    ));
    let output = crate::child_job::output_detached(app.shell().sidecar("ffmpeg").ok()?.args([
        "-y",
        "-i",
        &source.to_string_lossy(),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        &partial.to_string_lossy(),
    ]))
    .await;

    let ok = matches!(&output, Ok(o) if o.status.success()) && partial.exists();
    if ok && std::fs::rename(&partial, &out_path).is_ok() {
        Some(out_path)
    } else {
        let _ = std::fs::remove_file(&partial);
        None
    }
}
