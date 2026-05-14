use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

use crate::utils::{POSTER_FILE, THUMB_DIR_NAME};

/// One ffmpeg/ffprobe pipeline at a time per video path (avoids overlapping sidecars from
/// Strict Mode double-mounts, main + mini player, or poster backfill + scrubber extract).
static FFMPEG_PER_VIDEO: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();

fn ffmpeg_lock_map() -> &'static Mutex<HashMap<String, Arc<Mutex<()>>>> {
    FFMPEG_PER_VIDEO.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn with_per_video_ffmpeg_lock<F, Fut, T>(video_path: &str, run: F) -> T
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    let key = video_path.to_string();
    let slot = {
        let mut map = ffmpeg_lock_map().lock().await;
        map.entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = slot.lock().await;
    run().await
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

async fn write_poster_jpeg(app: &AppHandle, video_path: &str, dest: &std::path::Path) -> Result<(), String> {
    let dest_str = dest.to_str().ok_or("Invalid poster path")?;
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
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
        ])
        .output()
        .await
        .map_err(|e| format!("ffmpeg sidecar poster: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err("ffmpeg sidecar failed to write poster.jpg".into())
    }
}

async fn ensure_poster_if_missing_inner(app: AppHandle, video_path: String) -> Result<(), String> {
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
    write_poster_jpeg(&app, &video_path, &poster_dest).await
}

#[tauri::command]
pub async fn ensure_poster_if_missing(app: AppHandle, video_path: String) -> Result<(), String> {
    let vk = video_path.clone();
    with_per_video_ffmpeg_lock(&vk, || {
        let app = app.clone();
        let video_path = video_path;
        async move { ensure_poster_if_missing_inner(app, video_path).await }
    })
    .await
}

async fn extract_frames_inner(app: AppHandle, video_path: String) -> Result<Vec<String>, String> {
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

    if preview_sprites_complete(&thumb_dir, duration_secs) && poster_dest.is_file() {
        return Ok(collect_sprite_paths(&thumb_dir)
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect());
    }

    if !preview_sprites_complete(&thumb_dir, duration_secs) {
        let output_pattern = thumb_dir.join("sprite_%03d.jpg");

        let output = app
            .shell()
            .sidecar("ffmpeg")
            .map_err(|e| e.to_string())?
            .args([
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
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to run ffmpeg sidecar: {}", e))?;

        if !output.status.success() {
            return Err("ffmpeg sidecar failed to extract frames".to_string());
        }

        let sprites = collect_sprite_paths(&thumb_dir);
        if sprites.is_empty() {
            return Err("ffmpeg sidecar produced no sprite sheets".to_string());
        }
    }

    if !poster_dest.is_file() {
        let _ = write_poster_jpeg(&app, &video_path, &poster_dest).await;
    }

    let out: Vec<String> = collect_sprite_paths(&thumb_dir)
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    Ok(out)
}

#[tauri::command]
pub async fn extract_frames(app: AppHandle, video_path: String) -> Result<Vec<String>, String> {
    let vk = video_path.clone();
    with_per_video_ffmpeg_lock(&vk, || {
        let app = app.clone();
        let video_path = video_path;
        async move { extract_frames_inner(app, video_path).await }
    })
    .await
}

#[tauri::command]
pub async fn delete_media(video_path: String) -> Result<(), String> {
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
    let label = match key.as_str() {
        "und" => return "Default".to_string(),
        "en" | "eng" => "English",
        "ja" | "jp" | "jpn" => "Japanese",
        "ko" | "kor" => "Korean",
        "zh" | "zho" | "cmn" => "Chinese",
        "zh-cn" | "zh-hans" => "Chinese (Simplified)",
        "zh-tw" | "zh-hant" => "Chinese (Traditional)",
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
    if label.is_empty() {
        lang_tag.to_uppercase()
    } else {
        label.to_string()
    }
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
