//! Resolved Deno executable path: userdata `bin/deno.exe` when present.
//!
//! Deno is used indirectly by yt-dlp via `--js-runtimes deno:<path>` to solve
//! YouTube's n-challenge. RuForge never spawns Deno directly.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Deno release asset zip name for this OS (must match denoland/deno GitHub release filenames).
#[cfg(windows)]
pub fn upstream_asset_zip_name() -> &'static str {
    "deno-x86_64-pc-windows-msvc.zip"
}

#[cfg(target_os = "macos")]
pub fn upstream_asset_zip_name() -> &'static str {
    "deno-aarch64-apple-darwin.zip"
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn upstream_asset_zip_name() -> &'static str {
    "deno-x86_64-unknown-linux-gnu.zip"
}

/// Local Deno filename under `app_data/bin/`.
pub fn userdata_deno_filename() -> &'static str {
    #[cfg(windows)]
    {
        "deno.exe"
    }
    #[cfg(not(windows))]
    {
        "deno"
    }
}

pub fn userdata_deno_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("bin").join(userdata_deno_filename()))
}

fn userdata_looks_present(path: &Path) -> bool {
    path.is_file()
        && std::fs::metadata(path)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
}

/// True when `app_data/bin/deno[.exe]` exists and is non-empty.
pub fn is_userdata_deno_active(app: &AppHandle) -> bool {
    userdata_deno_path(app)
        .map(|p| userdata_looks_present(&p))
        .unwrap_or(false)
}

/// Returns `Some(path)` when the userdata Deno binary exists and is non-empty; `None` otherwise.
///
/// Callers use this to decide whether to pass `--js-runtimes deno:<path>` to yt-dlp.
pub fn resolved_deno_path_if_present(app: &AppHandle) -> Option<PathBuf> {
    let path = userdata_deno_path(app).ok()?;
    if userdata_looks_present(&path) {
        Some(path)
    } else {
        None
    }
}
