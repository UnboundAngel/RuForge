use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tool {
    YtDlp,
    Ffmpeg,
    Ffprobe,
}

impl Tool {
    /// Name inside `app_data/bin` (yt-dlp keeps its upstream asset name).
    pub fn data_file_name(self) -> String {
        match self {
            Tool::YtDlp => crate::ytdlp_binary::userdata_ytdlp_filename().to_string(),
            _ => self.exe_file_name(),
        }
    }

    fn stem(self) -> &'static str {
        match self {
            Tool::YtDlp => "yt-dlp",
            Tool::Ffmpeg => "ffmpeg",
            Tool::Ffprobe => "ffprobe",
        }
    }

    /// Name beside the app exe, where the installer used to place sidecars.
    fn exe_file_name(self) -> String {
        format!("{}{}", self.stem(), std::env::consts::EXE_SUFFIX)
    }

    /// Name in `src-tauri/binaries`, kept locally so dev works without a download.
    fn dev_file_name(self) -> String {
        format!("{}-{}{}", self.stem(), DEV_TRIPLE, std::env::consts::EXE_SUFFIX)
    }
}

#[cfg(all(windows, target_arch = "x86_64"))]
const DEV_TRIPLE: &str = "x86_64-pc-windows-msvc";
#[cfg(not(all(windows, target_arch = "x86_64")))]
const DEV_TRIPLE: &str = "x86_64-unknown-linux-gnu";

pub fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("bin"))
}

/// Resolution order: `data_bin`, beside the exe, then the dev binaries folder.
pub fn candidates(
    tool: Tool,
    data_bin: Option<&Path>,
    exe_dir: Option<&Path>,
    dev_dir: Option<&Path>,
) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(d) = data_bin {
        out.push(d.join(tool.data_file_name()));
    }
    out.extend(bundled_candidates(tool, exe_dir, dev_dir));
    out
}

fn bundled_candidates(tool: Tool, exe_dir: Option<&Path>, dev_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(d) = exe_dir {
        out.push(d.join(tool.exe_file_name()));
    }
    if let Some(d) = dev_dir {
        out.push(d.join(tool.dev_file_name()));
    }
    out
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

fn dev_dir() -> Option<PathBuf> {
    cfg!(debug_assertions).then(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries"))
}

fn first_present(list: Vec<PathBuf>) -> Option<PathBuf> {
    list.into_iter()
        .find(|p| std::fs::metadata(p).map(|m| m.is_file() && m.len() > 0).unwrap_or(false))
}

pub fn resolve(app: &AppHandle, tool: Tool) -> Option<PathBuf> {
    let data = bin_dir(app).ok();
    first_present(candidates(tool, data.as_deref(), exe_dir().as_deref(), dev_dir().as_deref()))
}

/// Legacy sidecar location only (beside the exe, or the dev binaries folder).
pub fn resolve_bundled(tool: Tool) -> Option<PathBuf> {
    first_present(bundled_candidates(tool, exe_dir().as_deref(), dev_dir().as_deref()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_is_data_then_exe_then_dev() {
        let list = candidates(
            Tool::Ffmpeg,
            Some(Path::new("data")),
            Some(Path::new("exe")),
            Some(Path::new("dev")),
        );
        assert_eq!(list.len(), 3);
        assert!(list[0].starts_with("data"));
        assert!(list[1].starts_with("exe"));
        assert!(list[2].starts_with("dev"));
    }

    #[test]
    fn skips_absent_roots() {
        assert!(candidates(Tool::Ffprobe, None, None, None).is_empty());
    }
}
