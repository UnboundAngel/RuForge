use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::downloader::run_ytdlp_json_with_cookie_fallback;
use super::gallery::resolve_info_json_path;

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
pub async fn music_preview_local_hook(path: String) -> Result<Option<f64>, String> {
    tauri::async_runtime::spawn_blocking(move || local_hook_start(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())
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
