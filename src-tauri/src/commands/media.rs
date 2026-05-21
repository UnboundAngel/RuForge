use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

use crate::process_tree::kill_shell_child_tree;
use crate::utils::{POSTER_FILE, THUMB_DIR_NAME};

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
async fn run_ffmpeg_sidecar_unlocked(
    app: &AppHandle,
    slot: &Arc<FfmpegVideoSlot>,
    args: Vec<&str>,
) -> Result<(), String> {
    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg sidecar: {}", e))?;

    *slot.child.lock().await = Some(child);

    let mut success = false;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Terminated(payload) => {
                success = payload.code == Some(0);
                break;
            }
            CommandEvent::Error(err) => {
                *slot.child.lock().await = None;
                return Err(format!("ffmpeg sidecar error: {}", err));
            }
            CommandEvent::Stdout(_) | CommandEvent::Stderr(_) => {}
            _ => {}
        }
    }

    *slot.child.lock().await = None;
    if success {
        Ok(())
    } else {
        Err("ffmpeg sidecar failed".into())
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

fn duration_from_ytdlp_info_json(video_path: &Path) -> f64 {
    let parent = match video_path.parent() {
        Some(p) => p,
        None => return 0.0,
    };
    let stem = match video_path.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s,
        None => return 0.0,
    };
    let info_path = parent.join(format!("{}.info.json", stem));
    let Ok(txt) = std::fs::read_to_string(&info_path) else {
        return 0.0;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&txt) else {
        return 0.0;
    };
    json["duration"]
        .as_f64()
        .or_else(|| json["duration"].as_u64().map(|u| u as f64))
        .or_else(|| json["duration"].as_i64().map(|i| i as f64))
        .filter(|d| d.is_finite() && *d > 0.0)
        .unwrap_or(0.0)
}

fn preview_sprites_complete(thumb_dir: &Path, duration_secs: f64) -> bool {
    let n = collect_sprite_paths(thumb_dir).len();
    n >= sprite_sheets_required(duration_secs)
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
    let thumb_dir = thumb_root.join(video_name);
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

async fn extract_frames_inner(
    app: AppHandle,
    video_path: String,
    allow_generate: bool,
    slot: Arc<FfmpegVideoSlot>,
) -> Result<Vec<String>, String> {
    let video_file_path = Path::new(&video_path);
    let video_dir = video_file_path.parent().ok_or("Invalid video path")?;
    let video_name = video_file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");

    let thumb_root = video_dir.join(THUMB_DIR_NAME);
    let thumb_dir = thumb_root.join(video_name);

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

    let existing: Vec<String> = collect_sprite_paths(&thumb_dir)
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    if preview_sprites_complete(&thumb_dir, duration_secs) && poster_dest.is_file() {
        return Ok(existing);
    }

    if !allow_generate {
        return Ok(existing);
    }

    if !preview_sprites_complete(&thumb_dir, duration_secs) {
        let output_pattern = thumb_dir.join("sprite_%03d.jpg");

        run_ffmpeg_sidecar_unlocked(
            &app,
            &slot,
            vec![
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                video_path.as_str(),
                "-vf",
                "fps=1/5,scale=160:90,tile=10x10",
                "-q:v",
                "5",
                output_pattern.to_str().ok_or("Bad sprite path")?,
            ],
        )
        .await
        .map_err(|e| format!("Failed to run ffmpeg sidecar: {}", e))?;

        let sprites = collect_sprite_paths(&thumb_dir);
        if sprites.is_empty() {
            return Err("ffmpeg sidecar produced no sprite sheets".to_string());
        }
    }

    if !poster_dest.is_file() {
        let _ = write_poster_jpeg(&app, &slot, &video_path, &poster_dest).await;
    }

    let out: Vec<String> = collect_sprite_paths(&thumb_dir)
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    Ok(out)
}

#[tauri::command]
pub async fn extract_frames(
    app: AppHandle,
    video_path: String,
    allow_generate: Option<bool>,
) -> Result<Vec<String>, String> {
    let allow_generate = allow_generate.unwrap_or(true);
    let vk = video_path.clone();
    with_per_video_ffmpeg_lock(&vk, |slot| {
        let app = app.clone();
        let video_path = video_path;
        async move { extract_frames_inner(app, video_path, allow_generate, slot).await }
    })
    .await
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

#[tauri::command]
pub async fn delete_media_batch(paths: Vec<String>) -> Result<u64, String> {
    let mut deleted_bytes: u64 = 0;
    for video_path in paths {
        if let Ok(meta) = std::fs::metadata(&video_path) {
            if meta.is_file() {
                deleted_bytes = deleted_bytes.saturating_add(meta.len());
            }
        }
        delete_media(video_path).await?;
    }
    Ok(deleted_bytes)
}

#[tauri::command]
pub async fn delete_media(video_path: String) -> Result<(), String> {
    cancel_ffmpeg_for_video(&video_path).await;
    wait_ffmpeg_slot_idle(&video_path, Duration::from_secs(2)).await;

    let video_file_path = std::path::Path::new(&video_path);
    let video_dir = video_file_path.parent().ok_or("Invalid video path")?;
    let video_name = video_file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");

    let thumb_dir = video_dir.join(THUMB_DIR_NAME).join(video_name);

    if video_file_path.exists() {
        std::fs::remove_file(video_file_path).map_err(|e| e.to_string())?;
    }

    if thumb_dir.exists() {
        std::fs::remove_dir_all(thumb_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
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
