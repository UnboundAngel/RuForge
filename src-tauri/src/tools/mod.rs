//! Download tools (ffmpeg, ffprobe, yt-dlp) are not bundled in the installer. They are fetched
//! into `app_data/bin` on first launch after the user confirms; legacy installs and dev builds
//! keep working from the files beside the app exe.

mod fetch;
mod hash;
pub mod install;
mod manifest;
pub mod paths;
pub mod status;
mod ytdlp;

use tauri::AppHandle;
use tauri_plugin_shell::{process::Command, ShellExt};

use paths::Tool;

/// Marker prefix on errors caused by missing download tools so the frontend can offer the install.
pub const TOOLS_MISSING_PREFIX: &str = "TOOLS_MISSING: ";

pub(crate) const ERR_OFFLINE: &str =
    "Could not reach the download server. Check your internet connection and try again.";
pub(crate) const ERR_INTEGRITY: &str = "Downloaded file failed its integrity check.";

pub fn missing_message() -> String {
    format!("{TOOLS_MISSING_PREFIX}RuForge is still getting its download tools.")
}

/// Shell command for ffmpeg or ffprobe, or the missing-tools error.
pub fn tool_command(app: &AppHandle, tool: Tool) -> Result<Command, String> {
    let path = paths::resolve(app, tool).ok_or_else(missing_message)?;
    Ok(app.shell().command(path))
}

/// yt-dlp command for a download job. Every download is treated as needing ffmpeg (merge, remux,
/// audio extraction), so a missing ffmpeg fails here instead of mid-job.
pub fn download_ytdlp_command(app: &AppHandle) -> Result<Command, String> {
    if paths::resolve(app, Tool::Ffmpeg).is_none() {
        return Err(missing_message());
    }
    crate::ytdlp_binary::ytdlp_shell_command(app)
}
