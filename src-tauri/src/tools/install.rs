use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;

use super::fetch::{self, Reporter};
use super::manifest::{self, FfmpegEntry};
use super::paths::{bin_dir, resolve, Tool};
use super::{ytdlp, ERR_INTEGRITY};

static RUNNING: AtomicBool = AtomicBool::new(false);

pub fn is_installing() -> bool {
    RUNNING.load(Ordering::Relaxed)
}

struct RunGuard;

impl Drop for RunGuard {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::Relaxed);
    }
}

/// Starts the install in the background and returns at once; progress arrives on
/// `tools-install-progress`. A second call while one runs is a no-op.
#[tauri::command]
pub async fn install_tools(app: AppHandle) -> Result<(), String> {
    if RUNNING.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    tauri::async_runtime::spawn(async move {
        let _guard = RunGuard;
        match run(&app).await {
            Ok(()) => fetch::emit_done(&app),
            Err(e) => {
                crate::rf_log!("tools.install", log::Level::Warn, "tools install failed: {}", e);
                fetch::emit_error(&app, e);
            }
        }
    });
    Ok(())
}

async fn run(app: &AppHandle) -> Result<(), String> {
    let mut reporter = Reporter::new(app, 1);
    reporter.emit("checking", None, 0, 0, true);

    let need_ffmpeg = resolve(app, Tool::Ffmpeg).is_none() || resolve(app, Tool::Ffprobe).is_none();
    let need_ytdlp = resolve(app, Tool::YtDlp).is_none();
    if !need_ffmpeg && !need_ytdlp {
        return Ok(());
    }

    let entry = if need_ffmpeg { Some(manifest::load().await.ffmpeg) } else { None };
    let total = entry.as_ref().map_or(0, |e| e.size) + if need_ytdlp { ytdlp::ESTIMATED_BYTES } else { 0 };
    let mut reporter = Reporter::new(app, total);

    let dir = bin_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    if let Some(entry) = entry {
        let want_ffmpeg = resolve(app, Tool::Ffmpeg).is_none();
        let want_ffprobe = resolve(app, Tool::Ffprobe).is_none();
        install_ffmpeg(app, &dir, &entry, want_ffmpeg, want_ffprobe, &mut reporter).await?;
    }
    if need_ytdlp {
        ytdlp::install(app, &mut reporter).await?;
    }
    Ok(())
}

async fn install_ffmpeg(
    app: &AppHandle,
    dir: &Path,
    entry: &FfmpegEntry,
    want_ffmpeg: bool,
    want_ffprobe: bool,
    reporter: &mut Reporter,
) -> Result<(), String> {
    let archive = dir.join("ffmpeg-archive.zip.part");
    let _ = std::fs::remove_file(&archive);
    let result = download_and_extract(app, dir, &archive, entry, want_ffmpeg, want_ffprobe, reporter).await;
    let _ = std::fs::remove_file(&archive);
    result?;
    reporter.step_done(entry.size);
    Ok(())
}

async fn download_and_extract(
    app: &AppHandle,
    dir: &Path,
    archive: &Path,
    entry: &FfmpegEntry,
    want_ffmpeg: bool,
    want_ffprobe: bool,
    reporter: &mut Reporter,
) -> Result<(), String> {
    let client = fetch::client(app)?;
    let (digest, received) =
        fetch::download(&client, &entry.url, archive, reporter, "ffmpeg", entry.size).await?;
    reporter.emit("verifying", Some("ffmpeg"), received, received, true);
    if digest != entry.sha256 {
        return Err(ERR_INTEGRITY.to_string());
    }
    reporter.emit("extracting", Some("ffmpeg"), 0, 0, true);

    let mut jobs: Vec<(String, PathBuf)> = Vec::new();
    if want_ffmpeg {
        jobs.push((entry.ffmpeg_path.clone(), dir.join(Tool::Ffmpeg.data_file_name())));
    }
    if want_ffprobe {
        jobs.push((entry.ffprobe_path.clone(), dir.join(Tool::Ffprobe.data_file_name())));
    }
    let archive = archive.to_path_buf();
    tokio::task::spawn_blocking(move || extract(&archive, &jobs))
        .await
        .map_err(|e| e.to_string())?
}

/// Writes each wanted entry to `<dest>.part`, then renames, so a crash never leaves a truncated exe.
fn extract(archive: &Path, jobs: &[(String, PathBuf)]) -> Result<(), String> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Downloaded archive is unreadable: {e}"))?;
    for (inner, dest) in jobs {
        let part = dest.with_extension("exe.part");
        let written = (|| -> Result<(), String> {
            let mut src = zip
                .by_name(inner)
                .map_err(|e| format!("Downloaded archive is missing a file: {e}"))?;
            let mut out = std::fs::File::create(&part).map_err(|e| e.to_string())?;
            std::io::copy(&mut src, &mut out).map_err(|e| e.to_string())?;
            drop(out);
            if dest.exists() {
                std::fs::remove_file(dest).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&part, dest).map_err(|e| e.to_string())
        })();
        if written.is_err() {
            let _ = std::fs::remove_file(&part);
        }
        written?;
    }
    Ok(())
}
