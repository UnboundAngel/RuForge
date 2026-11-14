use serde::Serialize;
use tauri::AppHandle;

use super::paths::{resolve, Tool};
use super::{install::is_installing, manifest, ytdlp};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsStatus {
    pub ytdlp: bool,
    pub ffmpeg: bool,
    pub ffprobe: bool,
    pub installing: bool,
    pub download_bytes: u64,
}

/// Approximate bytes still to fetch, from the embedded manifest sizes plus a yt-dlp estimate.
fn bytes_needed(ytdlp: bool, ffmpeg: bool, ffprobe: bool) -> u64 {
    let ff = if ffmpeg && ffprobe { 0 } else { manifest::embedded().ffmpeg.size };
    ff + if ytdlp { 0 } else { ytdlp::ESTIMATED_BYTES }
}

#[tauri::command]
pub async fn get_tools_status(app: AppHandle) -> ToolsStatus {
    let ytdlp = resolve(&app, Tool::YtDlp).is_some();
    let ffmpeg = resolve(&app, Tool::Ffmpeg).is_some();
    let ffprobe = resolve(&app, Tool::Ffprobe).is_some();
    ToolsStatus {
        ytdlp,
        ffmpeg,
        ffprobe,
        installing: is_installing(),
        download_bytes: bytes_needed(ytdlp, ffmpeg, ffprobe),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytes_needed_counts_only_missing() {
        assert_eq!(bytes_needed(true, true, true), 0);
        assert_eq!(bytes_needed(false, true, true), ytdlp::ESTIMATED_BYTES);
        assert!(bytes_needed(true, true, false) > 100_000_000);
    }
}
