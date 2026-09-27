use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::downloader::{
    best_thumbnail_url, run_ytdlp_json, run_ytdlp_json_with_cookie_fallback,
    ytdlp_music_cookie_retry_args, ytdlp_push_cookie_cli_args,
};
use super::music_preview::{most_replayed_start, MusicPreviewStream};

/// The signed-in home feed; yt-dlp maps it to youtube.com/feed/recommended.
const FEED_URL: &str = ":ytrec";
const FEED_PAGE_MAX: u32 = 60;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeFeedItem {
    pub video_id: String,
    pub title: String,
    pub url: String,
    pub channel: Option<String>,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub view_count: Option<u64>,
    /// Unix seconds parsed from "3 days ago", so only as precise as that text.
    pub timestamp: Option<i64>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeFeedPage {
    pub items: Vec<YoutubeFeedItem>,
    pub has_more: bool,
}

fn is_video_id(id: &str) -> bool {
    id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Keeps plain videos only: playlists and mixes have no single file to download, Shorts don't fit
/// a 16:9 grid, and live or upcoming streams can't be downloaded as a finished video yet.
fn feed_item_from_entry(entry: &Value) -> Option<YoutubeFeedItem> {
    let id = entry.get("id").and_then(Value::as_str)?;
    let url = entry.get("url").and_then(Value::as_str).unwrap_or("");
    if !is_video_id(id) || url.contains("/shorts/") || url.contains("list=") {
        return None;
    }
    let live = entry.get("live_status").and_then(Value::as_str);
    if matches!(live, Some("is_live" | "is_upcoming")) {
        return None;
    }
    let title = entry.get("title").and_then(Value::as_str).unwrap_or("").trim();
    if title.is_empty() {
        return None;
    }
    let channel = entry
        .get("channel")
        .or_else(|| entry.get("uploader"))
        .and_then(Value::as_str)
        .map(str::to_string);
    Some(YoutubeFeedItem {
        video_id: id.to_string(),
        title: title.to_string(),
        url: format!("https://www.youtube.com/watch?v={id}"),
        channel,
        thumbnail: best_thumbnail_url(entry)
            .or_else(|| Some(format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"))),
        duration: entry.get("duration").and_then(Value::as_f64).filter(|d| *d > 0.0),
        view_count: entry.get("view_count").and_then(Value::as_u64),
        timestamp: entry.get("timestamp").and_then(Value::as_i64),
    })
}

fn feed_page_from_root(root: &Value, limit: u32) -> YoutubeFeedPage {
    let entries = root.get("entries").and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    let items = entries
        .iter()
        .filter_map(feed_item_from_entry)
        .filter(|item| seen.insert(item.video_id.clone()))
        .collect();
    YoutubeFeedPage {
        items,
        has_more: entries.len() as u32 >= limit,
    }
}

/// One page of the user's YouTube home feed. Cookies go on the first attempt because the
/// signed-out feed is empty, so a cookieless try would only cost a slow round trip.
#[tauri::command]
pub async fn get_youtube_feed_page(
    app: AppHandle,
    offset: u32,
    limit: u32,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<YoutubeFeedPage, String> {
    let limit = limit.clamp(1, FEED_PAGE_MAX);
    let (browser, file, _cookie_guard) =
        ytdlp_music_cookie_retry_args(&app, browser_cookies.as_deref(), cookie_file.as_deref()).await?;
    if browser.as_deref().filter(|b| !b.is_empty() && *b != "chrome").is_none()
        && file.as_deref().filter(|f| !f.is_empty()).is_none()
    {
        return Err("Sign in to YouTube to see your feed".into());
    }
    let mut args: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
        "--extractor-args".into(),
        "youtubetab:approximate_date".into(),
        "--playlist-start".into(),
        (offset + 1).to_string(),
        "--playlist-end".into(),
        (offset + limit).to_string(),
    ];
    ytdlp_push_cookie_cli_args(&app, &mut args, file.as_deref(), browser.as_deref())?;
    args.push(FEED_URL.into());
    let root = run_ytdlp_json(&app, args, "YouTube feed").await?;
    Ok(feed_page_from_root(&root, limit))
}

/// A progressive stream so a plain `<video>` element can play it: itag 18 is 360p with audio,
/// small enough to start fast and sharp enough for a card-sized preview.
const VIDEO_PREVIEW_FORMAT: &str =
    "18/best[height<=480][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]";

fn has_codec(format: &Value, key: &str) -> bool {
    format.get(key).and_then(Value::as_str).map_or(true, |c| c != "none")
}

fn url_expire_param(url: &str) -> Option<i64> {
    url.split_once('?')?
        .1
        .split('&')
        .find_map(|pair| pair.strip_prefix("expire="))
        .and_then(|v| v.parse().ok())
}

pub(crate) fn video_preview_stream_from_root(root: &Value) -> Option<MusicPreviewStream> {
    if !has_codec(root, "vcodec") || !has_codec(root, "acodec") {
        return None;
    }
    let url = root.get("url").and_then(Value::as_str).filter(|u| u.starts_with("http"))?;
    Some(MusicPreviewStream {
        url: url.to_string(),
        duration: root.get("duration").and_then(Value::as_f64),
        expires_at: url_expire_param(url),
        hook_start: most_replayed_start(root),
    })
}

/// Resolves a playable video stream for a feed card's preview without downloading it.
#[tauri::command]
pub async fn resolve_video_preview_stream(
    app: AppHandle,
    url: String,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<MusicPreviewStream, String> {
    let prefix_args: Vec<String> = vec![
        "-J".into(),
        "--no-warnings".into(),
        "--no-playlist".into(),
        "-f".into(),
        VIDEO_PREVIEW_FORMAT.into(),
    ];
    let root = run_ytdlp_json_with_cookie_fallback(
        &app,
        prefix_args,
        url,
        browser_cookies.as_deref(),
        cookie_file.as_deref(),
        "video preview",
    )
    .await?;
    video_preview_stream_from_root(&root).ok_or_else(|| "No playable stream for this video".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_videos_and_drops_playlists_shorts_and_live() {
        let root = json!({
            "entries": [
                {
                    "id": "dQw4w9WgXcQ",
                    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "title": "A video",
                    "channel": "Someone",
                    "duration": 213.0,
                    "view_count": 1200,
                    "timestamp": 1790000000,
                    "thumbnails": [{ "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" }],
                },
                { "id": "PLabcdefghijklmnop", "url": "https://www.youtube.com/playlist?list=PLabcdefghijklmnop", "title": "Mix" },
                { "id": "abcdefghijk", "url": "https://www.youtube.com/shorts/abcdefghijk", "title": "Short" },
                { "id": "livelivelive", "url": "https://www.youtube.com/watch?v=livelivelive", "title": "Live" },
                { "id": "LiveLive123", "url": "https://www.youtube.com/watch?v=LiveLive123", "title": "Live", "live_status": "is_live" },
                { "id": "dQw4w9WgXcQ", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "Duplicate" },
            ],
        });
        let page = feed_page_from_root(&root, 6);
        assert_eq!(
            page.items,
            vec![YoutubeFeedItem {
                video_id: "dQw4w9WgXcQ".into(),
                title: "A video".into(),
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ".into(),
                channel: Some("Someone".into()),
                thumbnail: Some("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg".into()),
                duration: Some(213.0),
                view_count: Some(1200),
                timestamp: Some(1_790_000_000),
            }]
        );
        assert!(page.has_more);
    }

    #[test]
    fn falls_back_to_the_standard_thumbnail_and_uploader() {
        let item = feed_item_from_entry(&json!({
            "id": "abc_def-123",
            "title": " Spaced ",
            "uploader": "Uploader",
        }))
        .expect("item");
        assert_eq!(item.title, "Spaced");
        assert_eq!(item.channel.as_deref(), Some("Uploader"));
        assert_eq!(item.thumbnail.as_deref(), Some("https://i.ytimg.com/vi/abc_def-123/hqdefault.jpg"));
        assert!(!feed_page_from_root(&json!({ "entries": [] }), 24).has_more);
    }

    #[test]
    fn video_preview_needs_video_and_audio() {
        let root = json!({
            "url": "https://rr1.googlevideo.com/videoplayback?expire=1790000000&itag=18",
            "vcodec": "avc1.42001E",
            "acodec": "mp4a.40.2",
            "duration": 600.0,
        });
        let stream = video_preview_stream_from_root(&root).expect("stream");
        assert_eq!(stream.expires_at, Some(1_790_000_000));
        assert_eq!(stream.duration, Some(600.0));
        assert_eq!(video_preview_stream_from_root(&json!({ "url": "https://v/a", "vcodec": "none" })), None);
        assert_eq!(video_preview_stream_from_root(&json!({ "url": "https://v/v", "acodec": "none" })), None);
        assert_eq!(video_preview_stream_from_root(&json!({ "url": "manifest.mpd" })), None);
    }
}
