//! Resolved yt-dlp executable: prefers AppData `bin/` install over bundled sidecar.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::Command, ShellExt};

/// yt-dlp release asset basename for this OS (must match GitHub release filenames).
pub fn upstream_asset_basename() -> &'static str {
    #[cfg(windows)]
    {
        "yt-dlp.exe"
    }
    #[cfg(target_os = "macos")]
    {
        "yt-dlp_macos"
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        "yt-dlp"
    }
}

/// Local userdata filename under `app_data/bin/` (matches downloaded asset basename).
pub fn userdata_ytdlp_filename() -> &'static str {
    upstream_asset_basename()
}

pub fn userdata_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("bin").join(userdata_ytdlp_filename()))
}

pub fn userdata_ytdlp_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("bin"))
}

fn userdata_looks_present(path: &Path) -> bool {
    path.is_file()
        && std::fs::metadata(path)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
}

/// True when `app_data/bin/<asset>` exists and is non-empty (same rule as [`ytdlp_shell_command`]).
pub fn is_userdata_ytdlp_active(app: &AppHandle) -> bool {
    userdata_ytdlp_path(app)
        .map(|p| userdata_looks_present(&p))
        .unwrap_or(false)
}

/// Shell command for yt-dlp: AppData binary if present, else bundled sidecar.
pub fn ytdlp_shell_command(app: &AppHandle) -> Result<Command, String> {
    if let Ok(user_path) = userdata_ytdlp_path(app) {
        if userdata_looks_present(&user_path) {
            crate::rf_log!(
                "download.binary",
                log::Level::Info,
                "yt-dlp: using userdata binary {}",
                user_path.display()
            );
            return Ok(app.shell().command(&user_path));
        }
    }

    crate::rf_log!("download.binary", log::Level::Debug, "yt-dlp: using bundled sidecar");
    app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())
}

/// Always the bundled external binary (`--version` / baseline for "update available").
pub fn bundled_ytdlp_command(app: &AppHandle) -> Result<Command, String> {
    app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())
}

/// If the user has installed Deno into `app_data/bin/`, appends `--js-runtimes deno:<path>` to `args`.
///
/// Called immediately after [`ytdlp_push_politeness_args`] at every yt-dlp spawn site so YouTube's
/// n-challenge can be solved without the user having to install Deno manually.
pub fn ytdlp_push_js_runtime_args(app: &AppHandle, args: &mut Vec<String>) {
    if let Some(deno_path) = crate::deno_binary::resolved_deno_path_if_present(app) {
        crate::rf_log!(
            "download.binary",
            log::Level::Debug,
            "yt-dlp: injecting --js-runtimes deno:{}",
            deno_path.display()
        );
        args.push("--js-runtimes".into());
        args.push(format!("deno:{}", deno_path.display()));
    }
}
