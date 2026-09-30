use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::downloader::{
    best_thumbnail_url, run_ytdlp_json, run_ytdlp_json_with_cookie_fallback,
    ytdlp_music_cookie_retry_args, ytdlp_push_cookie_cli_args,
};
use super::explorer_cookies::RuforgeCookieExport;
use super::music_preview::{most_replayed_start, MusicPreviewStream};

/// The signed-in home feed; yt-dlp maps it to youtube.com/feed/recommended.
const FEED_URL: &str = ":ytrec";
const FEED_PAGE_MAX: u32 = 60;
/// Matched by the frontend (`FEED_SIGNED_OUT_ERROR`) to show the sign-in prompt.
const FEED_SIGNED_OUT: &str = "youtube-feed-signed-out";

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeFeedItem {
    pub video_id: String,
    pub title: String,
    pub url: String,
    pub channel: Option<String>,
    pub channel_id: Option<String>,
    pub channel_verified: bool,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub view_count: Option<u64>,
    /// Unix seconds parsed from "3 days ago", so only as precise as that text.
    pub timestamp: Option<i64>,
    /// Vertical Short; the library gives these their own tall shelf instead of the 16:9 grid.
    pub short: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeFeedPage {
    pub items: Vec<YoutubeFeedItem>,
    pub has_more: bool,
}

pub(crate) fn is_video_id(id: &str) -> bool {
    id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Keeps single videos and Shorts: playlists and mixes have no single file to download, and live
/// or upcoming streams can't be downloaded as a finished video yet.
pub(crate) fn feed_item_from_entry(entry: &Value) -> Option<YoutubeFeedItem> {
    let id = entry.get("id").and_then(Value::as_str)?;
    let url = entry.get("url").and_then(Value::as_str).unwrap_or("");
    if !is_video_id(id) || url.contains("list=") {
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
        channel_id: entry.get("channel_id").and_then(Value::as_str).map(str::to_string),
        channel_verified: entry.get("channel_is_verified").and_then(Value::as_bool).unwrap_or(false),
        thumbnail: best_thumbnail_url(entry)
            .or_else(|| Some(format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"))),
        duration: entry.get("duration").and_then(Value::as_f64).filter(|d| *d > 0.0),
        view_count: entry.get("view_count").and_then(Value::as_u64),
        timestamp: entry.get("timestamp").and_then(Value::as_i64),
        short: url.contains("/shorts/"),
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

/// Google's auth cookies; without one YouTube serves the anonymous (empty) home feed.
const YOUTUBE_LOGIN_COOKIES: [&str; 3] = ["SAPISID", "__Secure-3PAPISID", "__Secure-1PAPISID"];

fn netscape_has_youtube_login(contents: &str) -> bool {
    contents.lines().any(|line| {
        let fields: Vec<&str> = line.split('\t').collect();
        fields.len() >= 7
            && fields[0].trim_start_matches("#HttpOnly_").ends_with("youtube.com")
            && YOUTUBE_LOGIN_COOKIES.contains(&fields[5])
    })
}

/// Unreadable files pass so yt-dlp reports the real error instead of a false "signed out".
fn cookie_file_has_youtube_login(path: &str) -> bool {
    std::fs::read_to_string(path).map_or(true, |c| netscape_has_youtube_login(&c))
}

/// Cookie args for a feed that only exists signed in (home, history), or `FEED_SIGNED_OUT`.
/// The guard keeps an exported Internal cookie file alive until yt-dlp has run.
pub(crate) async fn signed_in_cookie_args(
    app: &AppHandle,
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
) -> Result<(Vec<String>, Option<RuforgeCookieExport>), String> {
    let (browser, file, guard) = ytdlp_music_cookie_retry_args(app, browser_cookies, cookie_file).await?;
    if browser.as_deref().filter(|b| !b.is_empty() && *b != "chrome").is_none()
        && file.as_deref().filter(|f| !f.is_empty()).is_none()
    {
        return Err(FEED_SIGNED_OUT.into());
    }
    if let Some(path) = file.as_deref().filter(|f| !f.is_empty()) {
        if !cookie_file_has_youtube_login(path) {
            return Err(FEED_SIGNED_OUT.into());
        }
    }
    let mut args = Vec::new();
    ytdlp_push_cookie_cli_args(app, &mut args, file.as_deref(), browser.as_deref())?;
    Ok((args, guard))
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
    let (cookie_args, _cookie_guard) =
        signed_in_cookie_args(&app, browser_cookies.as_deref(), cookie_file.as_deref()).await?;
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
    args.extend(cookie_args);
    args.push(FEED_URL.into());
    let root = run_ytdlp_json(&app, args, "YouTube feed").await?;
    let no_entries = root
        .get("entries")
        .and_then(Value::as_array)
        .map_or(true, Vec::is_empty);
    // YouTube serves an empty home feed instead of an error when the cookies carry no login.
    if offset == 0 && no_entries {
        return Err(FEED_SIGNED_OUT.into());
    }
    Ok(feed_page_from_root(&root, limit))
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoStats {
    pub video_id: String,
    pub channel: Option<String>,
    pub channel_id: Option<String>,
    pub view_count: Option<u64>,
    /// Unix seconds; channel tab listings carry no date at all.
    pub published_at: Option<i64>,
}

fn video_stats_from_player(video_id: &str, player: &Value) -> Option<VideoStats> {
    let details = player.get("videoDetails")?;
    let published_at = player
        .pointer("/microformat/playerMicroformatRenderer/publishDate")
        .and_then(Value::as_str)
        .and_then(|d| chrono::DateTime::parse_from_rfc3339(d).ok())
        .map(|d| d.timestamp());
    Some(VideoStats {
        video_id: video_id.to_string(),
        channel: details.get("author").and_then(Value::as_str).map(str::to_string),
        channel_id: details.get("channelId").and_then(Value::as_str).map(str::to_string),
        view_count: details.get("viewCount").and_then(Value::as_str).and_then(|v| v.parse().ok()),
        published_at,
    })
}

const STATS_CONCURRENCY: usize = 4;

/// The cookie-free player endpoint: channel, views, duration and live state in about 10 KB.
pub(crate) async fn fetch_player_response(client: &reqwest::Client, video_id: &str) -> Option<Value> {
    let body = serde_json::json!({
        "videoId": video_id,
        "context": { "client": { "clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "en" } },
    });
    client
        .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
        .json(&body)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()
}

/// Flat feed entries carry no channel id or view count. The player endpoint returns both in
/// about 10 KB without cookies, far cheaper than a full yt-dlp extraction per card.
#[tauri::command]
pub async fn get_video_stats(video_ids: Vec<String>) -> Result<Vec<VideoStats>, String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .build()
        .map_err(|e| e.to_string())?;
    let ids: Vec<String> = video_ids.into_iter().filter(|id| is_video_id(id)).take(FEED_PAGE_MAX as usize).collect();
    let stats = futures_util::stream::iter(ids)
        .map(|id| {
            let client = client.clone();
            async move {
                let player = fetch_player_response(&client, &id).await?;
                video_stats_from_player(&id, &player)
            }
        })
        .buffer_unordered(STATS_CONCURRENCY)
        .filter_map(|s| async move { s })
        .collect()
        .await;
    Ok(stats)
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
    fn keeps_videos_and_shorts_and_drops_playlists_and_live() {
        let root = json!({
            "entries": [
                {
                    "id": "dQw4w9WgXcQ",
                    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "title": "A video",
                    "channel": "Someone",
                    "channel_id": "UCabcdefghijklmnopqrstuv",
                    "channel_is_verified": true,
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
                channel_id: Some("UCabcdefghijklmnopqrstuv".into()),
                channel_verified: true,
                thumbnail: Some("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg".into()),
                duration: Some(213.0),
                view_count: Some(1200),
                timestamp: Some(1_790_000_000),
                short: false,
            }, YoutubeFeedItem {
                video_id: "abcdefghijk".into(),
                title: "Short".into(),
                url: "https://www.youtube.com/watch?v=abcdefghijk".into(),
                channel: None,
                channel_id: None,
                channel_verified: false,
                thumbnail: Some("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg".into()),
                duration: None,
                view_count: None,
                timestamp: None,
                short: true,
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

    #[test]
    fn reads_channel_and_views_from_the_player_response() {
        let player = json!({
            "videoDetails": { "author": "Dan Dingle", "channelId": "UCY-PrcA-mjq3OhgsAH9C52A", "viewCount": "162571" },
            "microformat": { "playerMicroformatRenderer": { "publishDate": "2026-09-24T12:30:26-07:00" } },
        });
        assert_eq!(
            video_stats_from_player("5hVUPuuo2QM", &player),
            Some(VideoStats {
                video_id: "5hVUPuuo2QM".into(),
                channel: Some("Dan Dingle".into()),
                channel_id: Some("UCY-PrcA-mjq3OhgsAH9C52A".into()),
                view_count: Some(162_571),
                published_at: Some(1_790_278_226),
            })
        );
        assert_eq!(video_stats_from_player("x", &json!({ "playabilityStatus": {} })), None);
    }

    #[test]
    fn login_needs_a_youtube_auth_cookie() {
        let anon = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tVISITOR_INFO1_LIVE\tx\n";
        assert!(!netscape_has_youtube_login(anon));
        let google_only = ".google.com\tTRUE\t/\tTRUE\t0\tSAPISID\tx\n";
        assert!(!netscape_has_youtube_login(google_only));
        let signed_in = "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\t__Secure-3PAPISID\tx\n";
        assert!(netscape_has_youtube_login(signed_in));
    }
}
