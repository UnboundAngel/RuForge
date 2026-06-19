use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

use crate::commands::recently_deleted::append_manifest_entry;
use crate::media_bundle::{collect_deletion_paths, prune_empty_dirs_after_media_delete};
use crate::process_tree::kill_shell_child_tree;
use crate::utils::{duration_from_ytdlp_info_json, thumb_dir_for_stem, POSTER_FILE, THUMB_DIR_NAME};

struct FfmpegVideoSlot {
    lock: Arc<Mutex<()>>,
    child: Arc<Mutex<Option<CommandChild>>>,
}

/// One ffmpeg pipeline at a time per video path (avoids overlapping sidecars from
/// Strict Mode double-mounts, main + mini player, or poster backfill + scrubber extract).
static FFMPEG_PER_VIDEO: OnceLock<Mutex<HashMap<String, Arc<FfmpegVideoSlot>>>> = OnceLock::new();

fn ffmpeg_slot_map() -> &'static Mutex<HashMap<String, Arc<FfmpegVideoSlot>>> {
    FFMPEG_PER_VIDEO.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn ffmpeg_slot_for(video_path: &str) -> Arc<FfmpegVideoSlot> {
    let key = video_path.to_string();
    let mut map = ffmpeg_slot_map().lock().await;
    map.entry(key)
        .or_insert_with(|| {
            Arc::new(FfmpegVideoSlot {
                lock: Arc::new(Mutex::new(())),
                child: Arc::new(Mutex::new(None)),
            })
        })
        .clone()
}

/// Stop any in-flight RuForge ffmpeg sidecar for this file (preview sprites / poster).
pub async fn cancel_ffmpeg_for_video(video_path: &str) {
    let slot = {
        let map = ffmpeg_slot_map().lock().await;
        map.get(video_path).cloned()
    };
    let Some(slot) = slot else {
        return;
    };
    let child = slot.child.lock().await.take();
    if let Some(child) = child {
        kill_shell_child_tree(child);
    }
}

async fn with_per_video_ffmpeg_lock<F, Fut, T>(video_path: &str, run: F) -> T
where
    F: FnOnce(Arc<FfmpegVideoSlot>) -> Fut,
    Fut: Future<Output = T>,
{
    let slot = ffmpeg_slot_for(video_path).await;
    let _guard = slot.lock.lock().await;
    run(slot.clone()).await
}

/// Caller must already hold `slot.lock` (via [`with_per_video_ffmpeg_lock`]).
/// Uses [`Command::output`] (same as ffprobe) so the sidecar always drains and exits cleanly;
/// the spawn + event-channel path could hang with a live ffmpeg child and no Terminated event.
async fn run_ffmpeg_sidecar_unlocked(
    app: &AppHandle,
    _slot: &Arc<FfmpegVideoSlot>,
    args: Vec<&str>,
) -> Result<(), String> {
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to run ffmpeg sidecar: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        let msg = err.trim();
        Err(if msg.is_empty() {
            "ffmpeg sidecar failed".into()
        } else {
            format!("ffmpeg sidecar failed: {}", msg)
        })
    }
}

/// Matches `fps=1/5` × `tile=10x10`: 100 frames per sheet, 5 seconds per frame → 500s video span per sheet.
fn sprite_sheets_required(duration_secs: f64) -> usize {
    const SECONDS_PER_SHEET: f64 = 500.0;
    if !duration_secs.is_finite() || duration_secs <= 0.0 {
        return 1;
    }
    ((duration_secs / SECONDS_PER_SHEET).ceil() as usize).max(1)
}

pub fn preview_sprites_complete(thumb_dir: &Path, duration_secs: f64) -> bool {
    let n = collect_sprite_paths(thumb_dir).len();
    n >= sprite_sheets_required(duration_secs)
}

pub fn scrub_sprites_complete_for_path(video_path: &Path, duration_secs: f64) -> bool {
    let video_dir = match video_path.parent() {
        Some(d) => d,
        None => return false,
    };
    let video_name = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    let thumb_dir = thumb_dir_for_stem(video_dir, video_name);
    preview_sprites_complete(&thumb_dir, duration_secs)
}

fn emit_scrub_sprite_event(app: &AppHandle, event: &str, video_path: &str) {
    let _ = app.emit(event, serde_json::json!({ "videoPath": video_path }));
}

fn collect_sprite_paths(thumb_dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(thumb_dir) {
        for e in rd.flatten() {
            let p = e.path();
            let Some(fname) = p.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            if fname.starts_with("sprite_") && fname.ends_with(".jpg") {
                out.push(p);
            }
        }
    }
    out.sort();
    out
}

async fn write_poster_jpeg(
    app: &AppHandle,
    slot: &Arc<FfmpegVideoSlot>,
    video_path: &str,
    dest: &std::path::Path,
) -> Result<(), String> {
    let dest_str = dest.to_str().ok_or("Invalid poster path")?;
    run_ffmpeg_sidecar_unlocked(
        app,
        slot,
        vec![
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            "0.1",
            "-i",
            video_path,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            dest_str,
        ],
    )
    .await
    .map_err(|_| "ffmpeg sidecar failed to write poster.jpg".to_string())
}

#[tauri::command]
pub async fn ensure_poster_if_missing(app: AppHandle, video_path: String) -> Result<(), String> {
    let vk = video_path.clone();
    with_per_video_ffmpeg_lock(&vk, |slot| {
        let app = app.clone();
        let video_path = video_path;
        async move { ensure_poster_if_missing_inner(app, video_path, slot).await }
    })
    .await
}

async fn ensure_poster_if_missing_inner(
    app: AppHandle,
    video_path: String,
    slot: Arc<FfmpegVideoSlot>,
) -> Result<(), String> {
    let video_file_path = Path::new(&video_path);
    if !video_file_path.is_file() {
        return Ok(());
    }
    let video_dir = video_file_path.parent().ok_or("Invalid video path")?;
    let video_name = video_file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    let thumb_root = video_dir.join(THUMB_DIR_NAME);
    let thumb_dir = thumb_dir_for_stem(video_dir, video_name);
    let poster_dest = thumb_dir.join(POSTER_FILE);
    if poster_dest.is_file() {
        return Ok(());
    }

    let duration_secs = duration_from_ytdlp_info_json(video_file_path);
    if preview_sprites_complete(&thumb_dir, duration_secs) {
        return Ok(());
    }

    if !thumb_root.exists() {
        std::fs::create_dir_all(&thumb_root).map_err(|e| e.to_string())?;
        #[cfg(target_os = "windows")]
        {
            let mut attrib_cmd = std::process::Command::new("attrib");
            let _ = attrib_cmd.args(["+h", thumb_root.to_str().unwrap()]).status();
        }
    }
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    write_poster_jpeg(&app, &slot, &video_path, &poster_dest).await
}

fn list_existing_sprite_paths(thumb_dir: &Path) -> Vec<String> {
    collect_sprite_paths(thumb_dir)
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

pub fn list_scrub_sprite_paths_for_video(video_path: &Path) -> Vec<String> {
    let video_dir = match video_path.parent() {
        Some(d) => d,
        None => return Vec::new(),
    };
    let video_name = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    let thumb_dir = thumb_dir_for_stem(video_dir, video_name);
    if !thumb_dir.is_dir() {
        return Vec::new();
    }
    list_existing_sprite_paths(&thumb_dir)
}

#[tauri::command]
pub fn list_scrub_sprite_paths(video_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&video_path);
    if !path.is_file() {
        return Err("Invalid video path".into());
    }
    Ok(list_scrub_sprite_paths_for_video(path))
}

async fn extract_frames_generate_inner(
    app: AppHandle,
    video_path: String,
    slot: Arc<FfmpegVideoSlot>,
) -> Result<Vec<String>, String> {
    let video_file_path = Path::new(&video_path);
    let video_dir = video_file_path.parent().ok_or("Invalid video path")?;
    let video_name = video_file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");

    let thumb_root = video_dir.join(THUMB_DIR_NAME);
    let thumb_dir = thumb_dir_for_stem(video_dir, video_name);

    if !thumb_root.exists() {
        std::fs::create_dir_all(&thumb_root).map_err(|e| e.to_string())?;
        #[cfg(target_os = "windows")]
        {
            let mut attrib_cmd = std::process::Command::new("attrib");
            let _ = attrib_cmd.args(["+h", thumb_root.to_str().unwrap()]).status();
        }
    }

    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    let poster_dest = thumb_dir.join(POSTER_FILE);
    let duration_secs = duration_from_ytdlp_info_json(video_file_path);

    if preview_sprites_complete(&thumb_dir, duration_secs) {
        return Ok(list_existing_sprite_paths(&thumb_dir));
    }

    let output_pattern = thumb_dir.join("sprite_%03d.jpg");
    emit_scrub_sprite_event(&app, "scrub-sprites-started", &video_path);

    let ffmpeg_result = run_ffmpeg_sidecar_unlocked(
        &app,
        &slot,
        vec![
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-threads",
            "0",
            "-i",
            video_path.as_str(),
            "-an",
            "-sn",
            "-dn",
            "-vf",
            "fps=1/5,scale=160:90,tile=10x10",
            "-q:v",
            "5",
            output_pattern.to_str().ok_or("Bad sprite path")?,
        ],
    )
    .await;

    emit_scrub_sprite_event(&app, "scrub-sprites-finished", &video_path);

    ffmpeg_result.map_err(|e| format!("Failed to run ffmpeg sidecar: {}", e))?;

    let sprites = collect_sprite_paths(&thumb_dir);
    if sprites.is_empty() {
        return Err("ffmpeg sidecar produced no sprite sheets".to_string());
    }

    if !poster_dest.is_file() {
        let _ = write_poster_jpeg(&app, &slot, &video_path, &poster_dest).await;
    }

    Ok(list_existing_sprite_paths(&thumb_dir))
}

#[tauri::command]
pub async fn extract_frames(
    app: AppHandle,
    video_path: String,
    allow_generate: Option<bool>,
) -> Result<Vec<String>, String> {
    let allow_generate = allow_generate.unwrap_or(true);
    let vk = video_path.clone();
    let video_file_path = Path::new(&video_path);
    if !video_file_path.is_file() {
        return Err("Invalid video path".into());
    }
    let video_dir = video_file_path.parent().ok_or("Invalid video path")?;
    let video_name = video_file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    let thumb_dir = thumb_dir_for_stem(video_dir, video_name);
    let duration_secs = duration_from_ytdlp_info_json(video_file_path);
    let existing = if thumb_dir.is_dir() {
        list_existing_sprite_paths(&thumb_dir)
    } else {
        Vec::new()
    };

    if preview_sprites_complete(&thumb_dir, duration_secs) || !allow_generate {
        return Ok(existing);
    }

    let result = with_per_video_ffmpeg_lock(&vk, |slot| {
        let app = app.clone();
        let video_path = video_path.clone();
        async move { extract_frames_generate_inner(app, video_path, slot).await }
    })
    .await;
    if let Ok(ref paths) = result {
        if !paths.is_empty() {
            let _ = app.emit(
                "scrub-sprites-updated",
                serde_json::json!({ "videoPath": vk }),
            );
        }
    }
    result
}

/// After canceling ffmpeg, wait briefly for the per-file lock (best effort).
async fn wait_ffmpeg_slot_idle(video_path: &str, max_wait: Duration) {
    let slot = ffmpeg_slot_for(video_path).await;
    let deadline = tokio::time::Instant::now() + max_wait;
    while tokio::time::Instant::now() < deadline {
        cancel_ffmpeg_for_video(video_path).await;
        if let Ok(guard) = slot.lock.try_lock() {
            drop(guard);
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMediaResult {
    pub removed: bool,
    pub already_missing: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sidecar_warnings: Vec<String>,
}

fn delete_title_from_path(video_path: &Path) -> String {
    video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.replace('_', " "))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Media".to_string())
}

fn trash_paths(paths: &[PathBuf]) -> Vec<String> {
    let mut warnings = Vec::new();
    for path in paths {
        if !path.exists() {
            continue;
        }
        if let Err(e) = trash::delete(path) {
            warnings.push(format!("{}: {e}", path.display()));
        }
    }
    warnings
}

fn delete_media_filesystem(app: &AppHandle, video_path: &str) -> Result<DeleteMediaResult, String> {
    let video_file_path = Path::new(video_path);
    if video_file_path.parent().is_none() {
        return Err("Invalid video path".into());
    }

    let had_media = video_file_path.is_file();
    let already_missing = !had_media;

    let paths = collect_deletion_paths(video_file_path);
    let trashed_files: Vec<String> = paths
        .iter()
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    let sidecar_warnings = trash_paths(&paths);
    for warning in &sidecar_warnings {
        crate::rf_log!("library.delete", log::Level::Warn, "delete trash: {warning}");
    }

    prune_empty_dirs_after_media_delete(video_file_path);

    if !trashed_files.is_empty() {
        let title = delete_title_from_path(video_file_path);
        let _ = append_manifest_entry(app, &title, video_path, trashed_files);
    }

    Ok(DeleteMediaResult {
        removed: had_media,
        already_missing,
        sidecar_warnings,
    })
}

#[tauri::command]
pub async fn delete_media_batch(app: AppHandle, paths: Vec<String>) -> Result<u64, String> {
    let mut deleted_bytes: u64 = 0;
    for video_path in paths {
        if let Ok(meta) = std::fs::metadata(&video_path) {
            if meta.is_file() {
                deleted_bytes = deleted_bytes.saturating_add(meta.len());
            }
        }
        delete_media(app.clone(), video_path).await?;
    }
    Ok(deleted_bytes)
}

#[tauri::command]
pub async fn delete_media(
    app: AppHandle,
    video_path: String,
) -> Result<DeleteMediaResult, String> {
    cancel_ffmpeg_for_video(&video_path).await;
    wait_ffmpeg_slot_idle(&video_path, Duration::from_secs(2)).await;
    delete_media_filesystem(&app, &video_path)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub label: String,
    pub lang: String,
    pub src: String,
}

fn subtitle_display_label(lang_tag: &str) -> String {
    let key = lang_tag.to_ascii_lowercase();
    if key == "und" {
        return "Default".to_string();
    }
    if key == "en-orig" || key.starts_with("en-orig") {
        return format!("English (original) · {lang_tag}");
    }
    if key == "live_chat" {
        return format!("Live chat · {lang_tag}");
    }

    let base = key.split('-').next().unwrap_or(key.as_str());
    let label = match base {
        "en" | "eng" => "English",
        "ja" | "jp" | "jpn" => "Japanese",
        "ko" | "kor" => "Korean",
        "zh" | "zho" | "cmn" => "Chinese",
        "es" | "spa" => "Spanish",
        "fr" | "fra" | "fre" => "French",
        "de" | "deu" | "ger" => "German",
        "it" | "ita" => "Italian",
        "pt" | "por" => "Portuguese",
        "ru" | "rus" => "Russian",
        "ar" | "ara" => "Arabic",
        "hi" | "hin" => "Hindi",
        "th" | "tha" => "Thai",
        "vi" | "vie" => "Vietnamese",
        "tr" | "tur" => "Turkish",
        "pl" | "pol" => "Polish",
        "nl" | "nld" | "dut" => "Dutch",
        "sv" | "swe" => "Swedish",
        "no" | "nor" => "Norwegian",
        "da" | "dan" => "Danish",
        "fi" | "fin" => "Finnish",
        "uk" | "ukr" => "Ukrainian",
        _ => "",
    };

    let human = if label.is_empty() {
        return lang_tag.to_string();
    } else if key == base {
        label.to_string()
    } else {
        match key.as_str() {
            "zh-cn" | "zh-hans" => "Chinese (Simplified)".to_string(),
            "zh-tw" | "zh-hant" => "Chinese (Traditional)".to_string(),
            _ => label.to_string(),
        }
    };
    format!("{human} · {lang_tag}")
}

/// Discover sidecar WebVTT files next to the video: `{stem}.vtt`, `{stem}.{lang}.vtt`.
#[tauri::command]
pub fn get_subtitle_tracks(video_path: String) -> Result<Vec<SubtitleTrack>, String> {
    let path = PathBuf::from(&video_path);
    let parent = path
        .parent()
        .ok_or_else(|| "Video path has no parent directory".to_string())?;
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Video file name is not valid UTF-8".to_string())?;

    let mut pairs = crate::utils::vtt_sidecars_for_stem(parent, stem).map_err(|e| e.to_string())?;
    crate::utils::sort_vtt_sidecars_lang_first(&mut pairs);

    let tracks = pairs
        .into_iter()
        .map(|(p, lang)| SubtitleTrack {
            label: subtitle_display_label(&lang),
            lang,
            src: p.to_string_lossy().to_string(),
        })
        .collect();

    Ok(tracks)
}

const MAX_SUBTITLE_VTT_BYTES: u64 = 6 * 1024 * 1024;

/// Read a local `.vtt` for `<track>` blob URLs (avoids cross-origin load from `asset.localhost` vs dev UI origin).
#[tauri::command]
pub fn read_local_subtitle_vtt(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let is_vtt = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("vtt"));
    if !is_vtt {
        return Err("Path must be a .vtt file".to_string());
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Subtitle path is not a file".to_string());
    }
    let len = meta.len();
    if len > MAX_SUBTITLE_VTT_BYTES {
        return Err(format!(
            "Subtitle file too large ({} bytes; max {})",
            len, MAX_SUBTITLE_VTT_BYTES
        ));
    }
    std::fs::read_to_string(&p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod delete_media_tests {
    use super::*;
    use crate::media_bundle::collect_deletion_paths;
    use crate::utils::POSTER_FILE;

    fn write_fixture(dir: &Path) -> PathBuf {
        let item_dir = dir.join("Videos").join("My Clip");
        std::fs::create_dir_all(&item_dir).unwrap();
        let media = item_dir.join("clip.mkv");
        std::fs::write(&media, b"video-payload").unwrap();
        std::fs::write(item_dir.join("clip.info.json"), br#"{"id":"x"}"#).unwrap();
        std::fs::write(item_dir.join("clip.vtt"), b"WEBVTT\n").unwrap();
        std::fs::write(item_dir.join("clip.jpg"), b"thumb").unwrap();
        std::fs::write(item_dir.join("clip.sponsorblock.json"), br#"{"segments":[]}"#).unwrap();
        std::fs::write(item_dir.join("clip.comments.json"), br#"{"comments":[]}"#).unwrap();
        let thumb_dir = item_dir.join(THUMB_DIR_NAME).join("clip");
        std::fs::create_dir_all(&thumb_dir).unwrap();
        std::fs::write(thumb_dir.join(POSTER_FILE), b"poster").unwrap();
        media
    }

    #[test]
    fn collect_deletion_paths_includes_full_sidecar_set() {
        let dir = tempfile::tempdir().unwrap();
        let media = write_fixture(dir.path());
        let paths = collect_deletion_paths(&media);
        assert!(paths.iter().any(|p| p.ends_with("clip.comments.json")));
        assert!(paths.iter().any(|p| p.ends_with(POSTER_FILE)));
    }

    #[test]
    fn delete_media_trashes_video_sidecars_and_prunes_empty_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let media = write_fixture(dir.path());
        let item_dir = media.parent().unwrap();
        let paths = collect_deletion_paths(&media);
        let warnings = trash_paths(&paths);
        assert!(warnings.is_empty(), "{warnings:?}");
        prune_empty_dirs_after_media_delete(&media);
        assert!(!media.exists());
        assert!(!item_dir.join("clip.info.json").exists());
        assert!(!item_dir.join("clip.vtt").exists());
        assert!(!item_dir.join("clip.jpg").exists());
        assert!(!item_dir.join("clip.sponsorblock.json").exists());
        assert!(!item_dir.join("clip.comments.json").exists());
        assert!(!item_dir.join(THUMB_DIR_NAME).exists());
        assert!(!item_dir.exists());
    }

    #[test]
    fn delete_media_already_missing_still_trashes_sidecars() {
        let dir = tempfile::tempdir().unwrap();
        let media = write_fixture(dir.path());
        let item_dir = media.parent().unwrap();
        std::fs::remove_file(&media).unwrap();
        let paths = collect_deletion_paths(&media);
        let warnings = trash_paths(&paths);
        assert!(warnings.is_empty(), "{warnings:?}");
        prune_empty_dirs_after_media_delete(&media);
        assert!(!item_dir.join("clip.info.json").exists());
        assert!(!item_dir.join(THUMB_DIR_NAME).exists());
        assert!(!item_dir.exists());
    }
}
