use serde_json::Value;

use crate::commands::watchlist::feed::{parse_channel_feed, FeedEntry, FeedError};
use crate::commands::watchlist::page_feed::initial_data;

const RSS_ATTEMPTS: u32 = 3;

/// Same flaky RSS endpoint as channels: a few quick retries, then the playlist page. The page only
/// lists the first ~100 videos, so on a very long playlist the RSS answer is the better source.
pub async fn fetch_playlist_feed(client: &reqwest::Client, list_id: &str) -> Result<Vec<FeedEntry>, FeedError> {
    for attempt in 0..RSS_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        }
        if let Ok(entries) = fetch_rss(client, list_id).await {
            return Ok(entries);
        }
    }
    fetch_page(client, list_id).await
}

async fn get_text(client: &reqwest::Client, url: String, page: bool) -> Result<String, FeedError> {
    let mut req = client.get(url);
    if page {
        req = req.header("Accept-Language", "en-US,en;q=0.9");
    }
    let res = req.send().await.map_err(|e| FeedError::Transient(e.to_string()))?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(FeedError::NotFound);
    }
    if !res.status().is_success() {
        return Err(FeedError::Transient(format!("HTTP {}", res.status())));
    }
    res.text().await.map_err(|e| FeedError::Transient(e.to_string()))
}

async fn fetch_rss(client: &reqwest::Client, list_id: &str) -> Result<Vec<FeedEntry>, FeedError> {
    let xml = get_text(
        client,
        format!("https://www.youtube.com/feeds/videos.xml?playlist_id={list_id}"),
        false,
    )
    .await?;
    parse_channel_feed(&xml).map_err(FeedError::Transient)
}

async fn fetch_page(client: &reqwest::Client, list_id: &str) -> Result<Vec<FeedEntry>, FeedError> {
    let html = get_text(client, format!("https://www.youtube.com/playlist?list={list_id}"), true).await?;
    parse_playlist_page(&html, chrono::Utc::now().timestamp())
        .ok_or_else(|| FeedError::Transient("Playlist page had no videos".into()))
}

fn collect_renderers<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(map) => {
            if let Some(r) = map.get("playlistVideoRenderer") {
                out.push(r);
            }
            map.values().for_each(|c| collect_renderers(c, out));
        }
        Value::Array(items) => items.iter().for_each(|c| collect_renderers(c, out)),
        _ => {}
    }
}

/// Dates are not on the page, so entries carry `now`; only the id matters for new-video detection.
pub fn parse_playlist_page(html: &str, now: i64) -> Option<Vec<FeedEntry>> {
    let data = initial_data(html)?;
    let mut renderers = Vec::new();
    collect_renderers(&data, &mut renderers);
    let entries: Vec<FeedEntry> = renderers
        .into_iter()
        .filter_map(|r| {
            let video_id = r.get("videoId")?.as_str()?.to_string();
            let title = r
                .pointer("/title/runs/0/text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            Some(FeedEntry {
                video_id,
                channel_id: String::new(),
                channel_title: String::new(),
                title,
                published_at: now,
                short: false,
            })
        })
        .collect();
    (!entries.is_empty()).then_some(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playlist_watch_page_parses_renderers() {
        let html = r#"<script>var ytInitialData = {"contents":[{"playlistVideoRenderer":{"videoId":"aaaaaaaaaaa","title":{"runs":[{"text":"One"}]}}},{"playlistVideoRenderer":{"videoId":"bbbbbbbbbbb","title":{"runs":[{"text":"Two"}]}}}]};</script>"#;
        let entries = parse_playlist_page(html, 5).expect("parsed");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[1].video_id, "bbbbbbbbbbb");
        assert_eq!(entries[1].title, "Two");
        assert!(parse_playlist_page("<html></html>", 5).is_none());
    }

    #[test]
    fn playlist_watch_rss_parses_like_channel_feed() {
        let xml = r#"<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom"><title>P</title><entry><yt:videoId>aaaaaaaaaaa</yt:videoId><title>One</title><link rel="alternate" href="https://www.youtube.com/watch?v=aaaaaaaaaaa"/></entry></feed>"#;
        let entries = parse_channel_feed(xml).unwrap();
        assert_eq!(entries[0].video_id, "aaaaaaaaaaa");
        assert!(!entries[0].short);
    }
}
