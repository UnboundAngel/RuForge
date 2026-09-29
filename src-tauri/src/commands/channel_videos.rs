use serde_json::Value;
use tauri::AppHandle;

use super::downloader::run_ytdlp_json;
use super::youtube_feed::{feed_item_from_entry, signed_in_cookie_args, YoutubeFeedItem};

/// Enough uploads to rank the popular ones by views without paging the channel tab.
const CHANNEL_VIDEOS_MAX: u32 = 30;
/// Deep enough to find a channel the user watched last week, shallow enough to stay one request.
const HISTORY_MAX: u32 = 100;

fn is_channel_id(id: &str) -> bool {
    id.len() == 24 && id.starts_with("UC") && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn items_from_root(root: &Value) -> Vec<YoutubeFeedItem> {
    let entries = root.get("entries").and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    entries
        .iter()
        .filter_map(feed_item_from_entry)
        .filter(|item| seen.insert(item.video_id.clone()))
        .collect()
}

/// Tab entries leave out who uploaded them; the tab root names the channel for all of them.
fn channel_items_from_root(root: &Value) -> Vec<YoutubeFeedItem> {
    let channel = root.get("channel").or_else(|| root.get("uploader")).and_then(Value::as_str);
    let channel_id = root.get("channel_id").and_then(Value::as_str);
    let verified = root.get("channel_is_verified").and_then(Value::as_bool).unwrap_or(false);
    items_from_root(root)
        .into_iter()
        .map(|mut item| {
            if item.channel.is_none() {
                item.channel = channel.map(str::to_string);
            }
            if item.channel_id.is_none() {
                item.channel_id = channel_id.map(str::to_string);
            }
            item.channel_verified |= verified;
            item
        })
        .collect()
}

/// A channel's newest uploads, newest first. Public, so no cookies.
#[tauri::command]
pub async fn get_channel_videos(app: AppHandle, channel_id: String) -> Result<Vec<YoutubeFeedItem>, String> {
    if !is_channel_id(&channel_id) {
        return Err("Not a YouTube channel id".into());
    }
    let args: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
        "--extractor-args".into(),
        "youtubetab:approximate_date".into(),
        "--playlist-end".into(),
        CHANNEL_VIDEOS_MAX.to_string(),
        format!("https://www.youtube.com/channel/{channel_id}/videos"),
    ];
    let root = run_ytdlp_json(&app, args, "channel videos").await?;
    Ok(channel_items_from_root(&root))
}

/// The signed-in user's YouTube watch history, most recent first. Empty is a real answer here.
#[tauri::command]
pub async fn get_youtube_history(
    app: AppHandle,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<Vec<YoutubeFeedItem>, String> {
    let (cookie_args, _cookie_guard) =
        signed_in_cookie_args(&app, browser_cookies.as_deref(), cookie_file.as_deref()).await?;
    let mut args: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
        "--playlist-end".into(),
        HISTORY_MAX.to_string(),
    ];
    args.extend(cookie_args);
    args.push(":ythis".into());
    let root = run_ytdlp_json(&app, args, "YouTube history").await?;
    Ok(items_from_root(&root))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn channel_ids_are_uc_plus_22() {
        assert!(is_channel_id("UCY-PrcA-mjq3OhgsAH9C52A"));
        assert!(!is_channel_id("@dandingles"));
        assert!(!is_channel_id("UCY-PrcA-mjq3OhgsAH9C52A/../x"));
    }

    #[test]
    fn tab_entries_take_the_channel_from_the_root() {
        let root = json!({
            "channel": "Dan Dingle",
            "channel_id": "UCY-PrcA-mjq3OhgsAH9C52A",
            "entries": [
                { "id": "wo5nSOSHwpc", "url": "https://www.youtube.com/watch?v=wo5nSOSHwpc", "title": "AI Game Ideas", "duration": 652.0 },
                { "id": "wo5nSOSHwpc", "url": "https://www.youtube.com/watch?v=wo5nSOSHwpc", "title": "Repeat" },
                { "id": "abcdefghijk", "url": "https://www.youtube.com/watch?v=abcdefghijk", "title": "Other", "channel": "Guest", "channel_id": "UCzzzzzzzzzzzzzzzzzzzzzz" },
            ],
        });
        let items = channel_items_from_root(&root);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].channel.as_deref(), Some("Dan Dingle"));
        assert_eq!(items[0].channel_id.as_deref(), Some("UCY-PrcA-mjq3OhgsAH9C52A"));
        assert_eq!(items[0].duration, Some(652.0));
        assert_eq!(items[1].channel.as_deref(), Some("Guest"));
    }
}
