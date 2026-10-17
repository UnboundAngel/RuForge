//! Fallback when the RSS feed misbehaves: since late 2026 `feeds/videos.xml` answers real channels with
//! a random mix of 404, 500 and 200. The channel's Videos tab carries the same recent uploads in
//! `ytInitialData`, with relative publish times instead of timestamps.

use serde_json::Value;

use super::feed::{FeedEntry, FeedError};

pub(crate) fn initial_data(html: &str) -> Option<Value> {
    let start = html.find("var ytInitialData = ")? + "var ytInitialData = ".len();
    let rest = &html[start..];
    let end = rest.find(";</script>")?;
    serde_json::from_str(&rest[..end]).ok()
}

pub(crate) fn collect_lockups<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(map) => {
            if let Some(lockup) = map.get("lockupViewModel") {
                out.push(lockup);
            }
            for child in map.values() {
                collect_lockups(child, out);
            }
        }
        Value::Array(items) => items.iter().for_each(|c| collect_lockups(c, out)),
        _ => {}
    }
}

/// "3 days ago", "1 hour ago", "Streamed 2 weeks ago". Months and years are approximate, which is fine:
/// anything that old is far behind the follow cutoff.
pub fn seconds_ago(label: &str) -> Option<i64> {
    let words: Vec<&str> = label.split_whitespace().collect();
    let ago = words.iter().position(|w| w.eq_ignore_ascii_case("ago"))?;
    if ago < 2 {
        return None;
    }
    let n: i64 = words[ago - 2].parse().ok()?;
    let unit = words[ago - 1].trim_end_matches('s').to_ascii_lowercase();
    let secs = match unit.as_str() {
        "second" => 1,
        "minute" => 60,
        "hour" => 3600,
        "day" => 86_400,
        "week" => 7 * 86_400,
        "month" => 30 * 86_400,
        "year" => 365 * 86_400,
        _ => return None,
    };
    Some(n * secs)
}

fn published_label(lockup: &Value) -> Option<&str> {
    lockup
        .pointer("/metadata/lockupMetadataViewModel/metadata/contentMetadataViewModel/metadataRows")?
        .as_array()?
        .iter()
        .filter_map(|row| row.get("metadataParts")?.as_array())
        .flatten()
        .filter_map(|part| part.get("accessibilityLabel")?.as_str())
        .find(|label| label.contains(" ago"))
}

/// Entries without a relative time are live or upcoming, so they count as posted now.
pub fn parse_videos_page(html: &str, channel_id: &str, now: i64) -> Option<(Vec<FeedEntry>, Option<String>)> {
    let data = initial_data(html)?;
    let channel_title = data
        .pointer("/metadata/channelMetadataRenderer/title")
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|t| !t.is_empty());
    let mut lockups = Vec::new();
    collect_lockups(&data, &mut lockups);
    let entries: Vec<FeedEntry> = lockups
        .into_iter()
        .filter(|l| l.get("contentType").and_then(Value::as_str) == Some("LOCKUP_CONTENT_TYPE_VIDEO"))
        .filter_map(|l| {
            let video_id = l.get("contentId")?.as_str()?.to_string();
            let title = l
                .pointer("/metadata/lockupMetadataViewModel/title/content")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let ago = published_label(l).and_then(seconds_ago).unwrap_or(0);
            Some(FeedEntry {
                video_id,
                channel_id: channel_id.to_string(),
                channel_title: channel_title.clone().unwrap_or_default(),
                title,
                published_at: now - ago,
                short: false,
            })
        })
        .collect();
    if entries.is_empty() {
        return None;
    }
    Some((entries, channel_title))
}

pub async fn fetch_videos_page(
    client: &reqwest::Client,
    channel_id: &str,
) -> Result<(Vec<FeedEntry>, Option<String>), FeedError> {
    let res = client
        .get(format!("https://www.youtube.com/channel/{channel_id}/videos"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| FeedError::Transient(e.to_string()))?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(FeedError::NotFound);
    }
    if !res.status().is_success() {
        return Err(FeedError::Transient(format!("HTTP {}", res.status())));
    }
    let html = res.text().await.map_err(|e| FeedError::Transient(e.to_string()))?;
    let now = chrono::Utc::now().timestamp();
    parse_videos_page(&html, channel_id, now)
        .ok_or_else(|| FeedError::Transient("Videos page had no uploads".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watchlist_seconds_ago_units() {
        assert_eq!(seconds_ago("13 days ago"), Some(13 * 86_400));
        assert_eq!(seconds_ago("1 hour ago"), Some(3600));
        assert_eq!(seconds_ago("Streamed 2 weeks ago"), Some(14 * 86_400));
        assert_eq!(seconds_ago("267 million views"), None);
    }

    #[test]
    fn watchlist_parse_videos_page_lockups() {
        let html = r#"<script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"title":"Tom"}},"contents":[{"richItemRenderer":{"content":{"lockupViewModel":{"contentId":"aaaaaaaaaaa","contentType":"LOCKUP_CONTENT_TYPE_VIDEO","metadata":{"lockupMetadataViewModel":{"title":{"content":"Rock"},"metadata":{"contentMetadataViewModel":{"metadataRows":[{"metadataParts":[{"accessibilityLabel":"5 views"},{"accessibilityLabel":"2 days ago"}]}]}}}}}}}},{"richItemRenderer":{"content":{"lockupViewModel":{"contentId":"PLx","contentType":"LOCKUP_CONTENT_TYPE_PLAYLIST"}}}}]};</script>"#;
        let (entries, title) = parse_videos_page(html, "UCx", 1_000_000).expect("parsed");
        assert_eq!(title.as_deref(), Some("Tom"));
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].video_id, "aaaaaaaaaaa");
        assert_eq!(entries[0].title, "Rock");
        assert_eq!(entries[0].published_at, 1_000_000 - 2 * 86_400);
    }
}
