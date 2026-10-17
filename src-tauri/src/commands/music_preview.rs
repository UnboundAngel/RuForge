use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::downloader::run_ytdlp_json_with_cookie_fallback;
use super::gallery::resolve_info_json_path;
use crate::library::path_access::allow_path;

/// The webview says which codec it can decode: WKWebView prefers AAC, and WebKitGTK without
/// gst-libav can't play AAC at all but handles Opus.
fn preview_format(prefer_opus: bool) -> &'static str {
    if prefer_opus {
        "bestaudio[ext=webm]/bestaudio/best"
    } else {
        "bestaudio[ext=m4a]/bestaudio/best"
    }
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusicPreviewStream {
    pub url: String,
    /// Set when `url` is video only and the sound comes from a second stream played alongside it.
    pub audio_url: Option<String>,
    pub duration: Option<f64>,
    /// Unix seconds from the URL's `expire` parameter; the frontend drops its cached URL before then.
    pub expires_at: Option<i64>,
    /// Start of YouTube's most replayed segment, which is usually the hook.
    pub hook_start: Option<f64>,
}

/// Replays pile up in the opening seconds from people just starting the video, so those never count as the hook.
const HOOK_MIN_START_SEC: f64 = 10.0;

pub(crate) fn most_replayed_start(root: &Value) -> Option<f64> {
    root.get("heatmap")
        .and_then(Value::as_array)?
        .iter()
        .filter_map(|seg| Some((seg.get("start_time")?.as_f64()?, seg.get("value")?.as_f64()?)))
        .filter(|(start, _)| *start >= HOOK_MIN_START_SEC)
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(start, _)| start)
}

fn is_audio_capable(format: &Value) -> bool {
    format.get("acodec").and_then(Value::as_str).map_or(true, |c| c != "none")
}

fn url_expire_param(url: &str) -> Option<i64> {
    let query = url.split_once('?')?.1;
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix("expire="))
        .and_then(|v| v.parse().ok())
}

/// The single selected format's URL sits on the root; `requested_formats` covers a merged pick.
pub(crate) fn preview_stream_from_root(root: &Value) -> Option<MusicPreviewStream> {
    let direct = root.get("url").and_then(Value::as_str).filter(|_| is_audio_capable(root));
    let url = direct.or_else(|| {
        root.get("requested_formats")
            .and_then(Value::as_array)?
            .iter()
            .find(|f| is_audio_capable(f))
            .and_then(|f| f.get("url"))
            .and_then(Value::as_str)
    })?;
    if !url.starts_with("http") {
        return None;
    }
    Some(MusicPreviewStream {
        url: url.to_string(),
        audio_url: None,
        duration: root.get("duration").and_then(Value::as_f64),
        expires_at: url_expire_param(url),
        hook_start: most_replayed_start(root),
    })
}

/// Resolves a playable audio stream for a song without downloading it, for Recommended previews.
#[tauri::command]
pub async fn resolve_music_preview_stream(
    app: AppHandle,
    url: String,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
    prefer_opus: Option<bool>,
) -> Result<MusicPreviewStream, String> {
    let prefix_args: Vec<String> = vec![
        "-J".into(),
        "--no-warnings".into(),
        "--no-playlist".into(),
        "-f".into(),
        preview_format(prefer_opus.unwrap_or(false)).into(),
    ];
    let root = run_ytdlp_json_with_cookie_fallback(
        &app,
        prefix_args,
        url,
        browser_cookies.as_deref(),
        cookie_file.as_deref(),
        "preview stream",
    )
    .await?;
    preview_stream_from_root(&root).ok_or_else(|| "No playable audio stream for this song".to_string())
}

fn local_hook_start(path: &Path) -> Option<f64> {
    let parent = path.parent()?;
    let stem = path.file_stem()?.to_str()?;
    let info = resolve_info_json_path(parent, stem)?;
    let root: Value = serde_json::from_slice(&std::fs::read(info).ok()?).ok()?;
    most_replayed_start(&root)
}

/// Most replayed start for a downloaded song, from the `.info.json` yt-dlp saved beside it.
#[tauri::command]
pub async fn music_preview_local_hook(app: AppHandle, path: String) -> Result<Option<f64>, String> {
    allow_path(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || local_hook_start(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct HeatmapPoint {
    pub start: f64,
    pub end: f64,
    pub value: f64,
}

pub(crate) fn heatmap_points(root: &Value) -> Vec<HeatmapPoint> {
    root.get("heatmap")
        .and_then(Value::as_array)
        .map(|segs| {
            segs.iter()
                .filter_map(|seg| {
                    Some(HeatmapPoint {
                        start: seg.get("start_time")?.as_f64()?,
                        end: seg.get("end_time")?.as_f64()?,
                        value: seg.get("value")?.as_f64()?.clamp(0.0, 1.0),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn read_local_info(path: &Path) -> Option<Value> {
    let parent = path.parent()?;
    let stem = path.file_stem()?.to_str()?;
    let info = resolve_info_json_path(parent, stem)?;
    serde_json::from_slice(&std::fs::read(info).ok()?).ok()
}

/// YouTube watch id from a saved info.json, only for YouTube downloads.
fn youtube_id(root: &Value) -> Option<String> {
    let key = root.get("extractor_key").and_then(Value::as_str).unwrap_or("");
    if !key.eq_ignore_ascii_case("youtube") {
        return None;
    }
    let id = root.get("id").and_then(Value::as_str)?;
    (id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .then(|| id.to_string())
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ExtraChapter {
    pub title: String,
    pub start_time: f64,
    pub end_time: f64,
}

pub(crate) fn chapter_rows(root: &Value) -> Vec<ExtraChapter> {
    root.get("chapters")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(|c| {
                    let start_time = c.get("start_time")?.as_f64().filter(|s| s.is_finite() && *s >= 0.0)?;
                    Some(ExtraChapter {
                        title: c.get("title").and_then(Value::as_str).unwrap_or("Chapter").to_string(),
                        start_time,
                        end_time: c.get("end_time").and_then(Value::as_f64).unwrap_or(0.0),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Serialize, Debug, Default)]
pub struct YoutubeExtras {
    pub heatmap: Vec<HeatmapPoint>,
    pub chapters: Vec<ExtraChapter>,
}

#[derive(Serialize, Deserialize)]
struct ExtrasCacheEntry {
    fetched_at: u64,
    points: Vec<HeatmapPoint>,
    /// Absent in entries written before chapters were cached; those are fetched again.
    #[serde(default)]
    chapters: Option<Vec<ExtraChapter>>,
}

/// YouTube adds the replay curve once a video has enough views and auto chapters some time after upload,
/// so a missing piece is asked again later.
const EMPTY_EXTRAS_RETRY_SECS: u64 = 7 * 24 * 3600;

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn heatmap_cache_path(app: &AppHandle, id: &str) -> Option<PathBuf> {
    let dir = app.path().app_cache_dir().ok()?.join("heatmaps");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(format!("{id}.json")))
}

/// After a failed fetch (offline, YouTube blocking) the same video is left alone this long, so reopening it does
/// not hammer yt-dlp. Kept in memory only, so a restart tries again.
const FAILED_FETCH_COOLDOWN_SECS: u64 = 3600;

fn failed_fetches() -> &'static std::sync::Mutex<std::collections::HashMap<String, u64>> {
    static FAILED: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, u64>>> =
        std::sync::OnceLock::new();
    FAILED.get_or_init(Default::default)
}

fn fetch_on_cooldown(id: &str) -> bool {
    failed_fetches()
        .lock()
        .ok()
        .and_then(|m| m.get(id).copied())
        .is_some_and(|at| unix_now().saturating_sub(at) < FAILED_FETCH_COOLDOWN_SECS)
}

fn merge_extras(saved: YoutubeExtras, points: Vec<HeatmapPoint>, chapters: Vec<ExtraChapter>) -> YoutubeExtras {
    YoutubeExtras {
        heatmap: if saved.heatmap.is_empty() { points } else { saved.heatmap },
        chapters: if saved.chapters.is_empty() { chapters } else { saved.chapters },
    }
}

/// YouTube's "most replayed" curve and chapters for a downloaded video. Uses the saved `.info.json` first;
/// when either is missing, asks YouTube once through yt-dlp and caches the answer per video.
#[tauri::command]
pub async fn local_media_youtube_extras(
    app: AppHandle,
    path: String,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<YoutubeExtras, String> {
    allow_path(&app, &path)?;
    let root = tauri::async_runtime::spawn_blocking(move || read_local_info(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?;
    let Some(root) = root else { return Ok(YoutubeExtras::default()) };
    let saved = YoutubeExtras { heatmap: heatmap_points(&root), chapters: chapter_rows(&root) };
    if !saved.heatmap.is_empty() && !saved.chapters.is_empty() {
        return Ok(saved);
    }
    let Some(id) = youtube_id(&root) else { return Ok(saved) };
    let cache_path = heatmap_cache_path(&app, &id);
    if let Some(entry) = cache_path
        .as_ref()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice::<ExtrasCacheEntry>(&b).ok())
    {
        if let Some(chapters) = entry.chapters {
            let merged = merge_extras(saved, entry.points, chapters);
            let complete = !merged.heatmap.is_empty() && !merged.chapters.is_empty();
            if complete || unix_now().saturating_sub(entry.fetched_at) < EMPTY_EXTRAS_RETRY_SECS {
                return Ok(merged);
            }
            return fetch_and_cache_extras(&app, &id, cache_path, browser_cookies, cookie_file, merged).await;
        }
    }
    fetch_and_cache_extras(&app, &id, cache_path, browser_cookies, cookie_file, saved).await
}

async fn fetch_and_cache_extras(
    app: &AppHandle,
    id: &str,
    cache_path: Option<PathBuf>,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
    saved: YoutubeExtras,
) -> Result<YoutubeExtras, String> {
    if fetch_on_cooldown(id) {
        return Ok(saved);
    }
    let prefix_args: Vec<String> = vec![
        "-J".into(),
        "--no-warnings".into(),
        "--no-playlist".into(),
        "--ignore-no-formats-error".into(),
    ];
    let fetched = match run_ytdlp_json_with_cookie_fallback(
        app,
        prefix_args,
        format!("https://www.youtube.com/watch?v={id}"),
        browser_cookies.as_deref(),
        cookie_file.as_deref(),
        "replay graph",
    )
    .await
    {
        Ok(root) => root,
        Err(e) => {
            if let Ok(mut m) = failed_fetches().lock() {
                m.insert(id.to_string(), unix_now());
            }
            crate::rf_log!("download.ytdlp", log::Level::Info, "YouTube extras fetch failed for {id}: {}", e.lines().next().unwrap_or(&e));
            return Ok(saved);
        }
    };
    let entry = ExtrasCacheEntry {
        fetched_at: unix_now(),
        points: heatmap_points(&fetched),
        chapters: Some(chapter_rows(&fetched)),
    };
    if let (Some(p), Ok(bytes)) = (cache_path, serde_json::to_vec(&entry)) {
        let _ = std::fs::write(p, bytes);
    }
    Ok(merge_extras(saved, entry.points, entry.chapters.unwrap_or_default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn picks_root_url_for_single_format() {
        let root = json!({
            "url": "https://rr1.googlevideo.com/videoplayback?expire=1790000000&itag=140",
            "acodec": "mp4a.40.2",
            "vcodec": "none",
            "duration": 213.0,
        });
        assert_eq!(
            preview_stream_from_root(&root),
            Some(MusicPreviewStream {
                url: "https://rr1.googlevideo.com/videoplayback?expire=1790000000&itag=140".into(),
                audio_url: None,
                duration: Some(213.0),
                expires_at: Some(1_790_000_000),
                hook_start: None,
            })
        );
    }

    #[test]
    fn hook_is_the_most_replayed_segment_past_the_intro() {
        let root = json!({
            "heatmap": [
                { "start_time": 0.0, "end_time": 2.1, "value": 1.0 },
                { "start_time": 42.0, "end_time": 44.1, "value": 0.8 },
                { "start_time": 63.0, "end_time": 65.1, "value": 0.9 },
            ],
        });
        assert_eq!(most_replayed_start(&root), Some(63.0));
        assert_eq!(most_replayed_start(&json!({ "heatmap": null })), None);
        assert_eq!(most_replayed_start(&json!({})), None);
    }

    #[test]
    fn heatmap_points_skip_broken_segments() {
        let root = json!({
            "heatmap": [
                { "start_time": 0.0, "end_time": 2.0, "value": 0.4 },
                { "start_time": 2.0, "value": 0.9 },
                { "start_time": 4.0, "end_time": 6.0, "value": 1.2 },
            ],
        });
        assert_eq!(
            heatmap_points(&root),
            vec![
                HeatmapPoint { start: 0.0, end: 2.0, value: 0.4 },
                HeatmapPoint { start: 4.0, end: 6.0, value: 1.0 },
            ]
        );
        assert!(heatmap_points(&json!({ "heatmap": null })).is_empty());
    }

    #[test]
    fn falls_back_to_audio_of_requested_formats() {
        let root = json!({
            "requested_formats": [
                { "url": "https://v.example/video", "acodec": "none", "vcodec": "avc1" },
                { "url": "https://v.example/audio", "acodec": "opus", "vcodec": "none" },
            ],
        });
        let stream = preview_stream_from_root(&root).expect("stream");
        assert_eq!(stream.url, "https://v.example/audio");
        assert_eq!(stream.expires_at, None);
    }

    #[test]
    fn rejects_video_only_and_non_http_urls() {
        assert_eq!(preview_stream_from_root(&json!({ "url": "https://v.example/v", "acodec": "none" })), None);
        assert_eq!(preview_stream_from_root(&json!({ "url": "manifest.mpd" })), None);
        assert_eq!(preview_stream_from_root(&json!({})), None);
    }
}
