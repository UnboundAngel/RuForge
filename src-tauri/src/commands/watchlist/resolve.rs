use serde_json::Value;
use tauri::AppHandle;

use super::feed::{fetch_channel_feed, FeedError};
use super::model::{is_channel_id, watch_url, ResolvedChannel};
use crate::commands::youtube_feed::{fetch_player_response, is_video_id};

const INVALID_INPUT: &str = "Paste a YouTube channel or video link.";
const NOT_FOUND: &str = "Could not find that channel.";
const NO_SUCH_CHANNEL: &str = "That channel does not exist.";

#[derive(Debug, PartialEq)]
pub enum ChannelInput {
    Id(String),
    /// Includes the leading `@`.
    Handle(String),
    /// `/c/name` or `/user/name`, legacy custom URLs with no id in them.
    PagePath(String),
    Video(String),
}

fn is_handle(value: &str) -> bool {
    value.strip_prefix('@').is_some_and(|name| {
        !name.is_empty()
            && name.len() <= 100
            && !name
                .chars()
                .any(|c| c.is_whitespace() || c.is_control() || "/?#&\"'<>@".contains(c))
    })
}

fn is_page_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value.chars().all(|c| c.is_ascii_alphanumeric() || "-_.%".contains(c))
}

pub fn classify_input(input: &str) -> Option<ChannelInput> {
    let input = input.trim();
    if is_channel_id(input) {
        return Some(ChannelInput::Id(input.to_string()));
    }
    if input.starts_with('@') {
        return is_handle(input).then(|| ChannelInput::Handle(input.to_string()));
    }
    let with_scheme = if input.contains("://") {
        input.to_string()
    } else {
        format!("https://{input}")
    };
    let url = reqwest::Url::parse(&with_scheme).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let host = url.host_str()?.to_ascii_lowercase();
    let mut segments = url.path_segments()?.filter(|s| !s.is_empty());
    let first = segments.next()?;
    if host == "youtu.be" {
        return is_video_id(first).then(|| ChannelInput::Video(first.to_string()));
    }
    if !matches!(host.as_str(), "youtube.com" | "www.youtube.com" | "m.youtube.com") {
        return None;
    }
    match first {
        "channel" => segments
            .next()
            .filter(|id| is_channel_id(id))
            .map(|id| ChannelInput::Id(id.to_string())),
        "c" | "user" => segments
            .next()
            .filter(|name| is_page_name(name))
            .map(|name| ChannelInput::PagePath(format!("/{first}/{name}"))),
        "watch" => url
            .query_pairs()
            .find(|(k, _)| k == "v")
            .map(|(_, v)| v.into_owned())
            .filter(|id| is_video_id(id))
            .map(ChannelInput::Video),
        "live" => segments
            .next()
            .filter(|id| is_video_id(id))
            .map(|id| ChannelInput::Video(id.to_string())),
        handle if is_handle(handle) => Some(ChannelInput::Handle(handle.to_string())),
        // Shorts are unsupported, so a Shorts link is not a way in either.
        _ => None,
    }
}

fn quoted_after<'a>(html: &'a str, marker: &str) -> Option<&'a str> {
    let start = html.find(marker)? + marker.len();
    let len = html[start..].find('"')?;
    Some(&html[start..start + len])
}

fn valid_id(id: &str) -> Option<String> {
    is_channel_id(id).then(|| id.to_string())
}

pub fn unescape_html(text: &str) -> String {
    text.replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

pub fn channel_id_from_page_html(html: &str) -> Option<String> {
    quoted_after(html, r#"<link rel="canonical" href=""#)
        .and_then(|href| href.split("/channel/").nth(1))
        .and_then(|rest| rest.split(['/', '?', '#']).next())
        .and_then(valid_id)
        .or_else(|| quoted_after(html, r#""externalId":""#).and_then(valid_id))
        .or_else(|| quoted_after(html, r#"<meta itemprop="identifier" content=""#).and_then(valid_id))
}

pub fn title_from_page_html(html: &str) -> Option<String> {
    quoted_after(html, r#"<meta property="og:title" content=""#)
        .map(|t| unescape_html(t).trim().to_string())
        .filter(|t| !t.is_empty())
}

pub fn handle_from_page_html(html: &str) -> Option<String> {
    quoted_after(html, r#""vanityChannelUrl":""#)
        .and_then(|url| url.rsplit('/').next())
        .filter(|h| is_handle(h))
        .map(str::to_string)
}

fn channel_from_page_html(html: &str, typed_handle: Option<&str>) -> Option<ResolvedChannel> {
    let channel_id = channel_id_from_page_html(html)?;
    Some(ResolvedChannel {
        title: title_from_page_html(html).unwrap_or_else(|| channel_id.clone()),
        handle: handle_from_page_html(html).or_else(|| typed_handle.map(str::to_string)),
        channel_id,
    })
}

fn channel_from_player(player: &Value) -> Option<ResolvedChannel> {
    let details = player.get("videoDetails")?;
    let channel_id = details.get("channelId").and_then(Value::as_str).and_then(valid_id)?;
    Some(ResolvedChannel {
        title: details
            .get("author")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map_or_else(|| channel_id.clone(), str::to_string),
        handle: None,
        channel_id,
    })
}

fn channel_from_ytdlp(root: &Value) -> Option<ResolvedChannel> {
    let text = |key: &str| {
        root.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|t| !t.is_empty())
    };
    let channel_id = text("channel_id").and_then(valid_id)?;
    Some(ResolvedChannel {
        title: text("channel")
            .or_else(|| text("uploader"))
            .map_or_else(|| channel_id.clone(), str::to_string),
        handle: text("uploader_id").filter(|h| is_handle(h)).map(str::to_string),
        channel_id,
    })
}

async fn page_lookup(
    client: &reqwest::Client,
    path: &str,
    typed_handle: Option<&str>,
) -> Option<ResolvedChannel> {
    let html = client
        .get(format!("https://www.youtube.com{path}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .await
        .ok()?;
    channel_from_page_html(&html, typed_handle)
}

/// Last resort (consent walls, page layout changes): yt-dlp is rate gated and slow.
async fn ytdlp_lookup(app: &AppHandle, url: String) -> Result<ResolvedChannel, String> {
    let args = vec![
        "--flat-playlist".into(),
        "--playlist-end".into(),
        "1".into(),
        "-J".into(),
        url,
    ];
    let root = crate::commands::downloader::run_ytdlp_json(app, args, "watchlist resolve")
        .await
        .map_err(|_| NOT_FOUND.to_string())?;
    channel_from_ytdlp(&root).ok_or_else(|| NOT_FOUND.into())
}

async fn resolve_page(
    app: &AppHandle,
    client: &reqwest::Client,
    path: &str,
    typed_handle: Option<&str>,
) -> Result<ResolvedChannel, String> {
    if let Some(found) = page_lookup(client, path, typed_handle).await {
        return Ok(found);
    }
    ytdlp_lookup(app, format!("https://www.youtube.com{path}/videos")).await
}

pub async fn resolve(
    app: &AppHandle,
    client: &reqwest::Client,
    input: &str,
) -> Result<ResolvedChannel, String> {
    match classify_input(input).ok_or(INVALID_INPUT)? {
        ChannelInput::Id(id) => match fetch_channel_feed(client, &id).await {
            Ok((entries, feed_title)) => Ok(ResolvedChannel {
                title: feed_title
                    .or_else(|| entries.first().map(|e| e.channel_title.clone()))
                    .filter(|t| !t.is_empty())
                    .unwrap_or_else(|| id.clone()),
                handle: None,
                channel_id: id,
            }),
            // The feed occasionally 404s for real channels, so the page gets a say first.
            Err(FeedError::NotFound) => page_lookup(client, &format!("/channel/{id}"), None)
                .await
                .ok_or_else(|| NO_SUCH_CHANNEL.into()),
            Err(FeedError::Transient(_)) => {
                resolve_page(app, client, &format!("/channel/{id}"), None).await
            }
        },
        ChannelInput::Video(id) => {
            match fetch_player_response(client, &id)
                .await
                .as_ref()
                .and_then(channel_from_player)
            {
                Some(found) => Ok(found),
                None => ytdlp_lookup(app, watch_url(&id)).await,
            }
        }
        ChannelInput::Handle(handle) => {
            resolve_page(app, client, &format!("/{handle}"), Some(handle.as_str())).await
        }
        ChannelInput::PagePath(path) => resolve_page(app, client, &path, None).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ID: &str = "UCY-PrcA-mjq3OhgsAH9C52A";

    fn id() -> Option<ChannelInput> {
        Some(ChannelInput::Id(ID.into()))
    }

    fn handle(h: &str) -> Option<ChannelInput> {
        Some(ChannelInput::Handle(h.into()))
    }

    fn video(v: &str) -> Option<ChannelInput> {
        Some(ChannelInput::Video(v.into()))
    }

    fn page(p: &str) -> Option<ChannelInput> {
        Some(ChannelInput::PagePath(p.into()))
    }

    #[test]
    fn watchlist_classify_input_table() {
        let cases: Vec<(&str, Option<ChannelInput>)> = vec![
            (ID, id()),
            ("  UCY-PrcA-mjq3OhgsAH9C52A  ", id()),
            ("@dandingles", handle("@dandingles")),
            ("https://www.youtube.com/channel/UCY-PrcA-mjq3OhgsAH9C52A", id()),
            ("https://www.youtube.com/channel/UCY-PrcA-mjq3OhgsAH9C52A/videos", id()),
            ("youtube.com/channel/UCY-PrcA-mjq3OhgsAH9C52A?si=abc", id()),
            ("https://www.youtube.com/@dandingles", handle("@dandingles")),
            ("https://m.youtube.com/@dandingles/videos?view=0", handle("@dandingles")),
            ("http://youtube.com/@Dan.Dingles_1/", handle("@Dan.Dingles_1")),
            ("https://www.youtube.com/c/DanDingles", page("/c/DanDingles")),
            ("https://www.youtube.com/user/dandingles/featured", page("/user/dandingles")),
            ("https://www.youtube.com/watch?v=5hVUPuuo2QM", video("5hVUPuuo2QM")),
            ("https://www.youtube.com/watch?list=PL1&v=5hVUPuuo2QM&t=42s", video("5hVUPuuo2QM")),
            ("https://m.youtube.com/watch?v=5hVUPuuo2QM", video("5hVUPuuo2QM")),
            ("https://www.youtube.com/live/5hVUPuuo2QM?feature=share", video("5hVUPuuo2QM")),
            ("https://youtu.be/5hVUPuuo2QM?si=xyz", video("5hVUPuuo2QM")),
            ("youtu.be/5hVUPuuo2QM", video("5hVUPuuo2QM")),
            ("https://www.youtube.com/shorts/5hVUPuuo2QM", None),
            ("https://www.youtube.com/watch?v=short", None),
            ("https://www.youtube.com/channel/UCnope", None),
            ("https://www.youtube.com/", None),
            ("https://www.youtube.com/feed/subscriptions", None),
            ("https://vimeo.com/@dandingles", None),
            ("https://notyoutube.com/@dandingles", None),
            ("ftp://www.youtube.com/@dandingles", None),
            ("@", None),
            ("@has space", None),
            ("hello world", None),
            ("", None),
        ];
        for (input, expected) in cases {
            assert_eq!(classify_input(input), expected, "input: {input:?}");
        }
    }

    #[test]
    fn watchlist_page_id_from_canonical() {
        let html = format!(
            r#"<head><link rel="canonical" href="https://www.youtube.com/channel/{ID}"><meta property="og:title" content="Tom &amp; Friends"></head>"#
        );
        assert_eq!(channel_id_from_page_html(&html).as_deref(), Some(ID));
        assert_eq!(title_from_page_html(&html).as_deref(), Some("Tom & Friends"));
    }

    #[test]
    fn watchlist_page_id_from_external_id() {
        let html = format!(
            r#"<link rel="canonical" href="https://www.youtube.com/@tom"><script>var ytInitialData = {{"metadata":{{"channelMetadataRenderer":{{"externalId":"{ID}","vanityChannelUrl":"http://www.youtube.com/@tom"}}}}}};</script>"#
        );
        assert_eq!(channel_id_from_page_html(&html).as_deref(), Some(ID));
        assert_eq!(handle_from_page_html(&html).as_deref(), Some("@tom"));
    }

    #[test]
    fn watchlist_page_id_from_meta_identifier() {
        let html = format!(r#"<meta itemprop="identifier" content="{ID}">"#);
        assert_eq!(channel_id_from_page_html(&html).as_deref(), Some(ID));
        assert_eq!(title_from_page_html(&html), None);
        assert_eq!(handle_from_page_html(&html), None);
    }

    #[test]
    fn watchlist_page_without_id_or_with_bad_id() {
        assert_eq!(channel_id_from_page_html("<html>consent</html>"), None);
        assert_eq!(
            channel_id_from_page_html(r#""externalId":"UC/../../etc""#),
            None
        );
    }

    #[test]
    fn watchlist_page_falls_back_to_typed_handle() {
        let html = format!(r#"<meta itemprop="identifier" content="{ID}">"#);
        let found = channel_from_page_html(&html, Some("@typed")).unwrap();
        assert_eq!(found.channel_id, ID);
        assert_eq!(found.title, ID);
        assert_eq!(found.handle.as_deref(), Some("@typed"));
    }

    #[test]
    fn watchlist_unescape_html() {
        assert_eq!(
            unescape_html("A &amp; B &quot;C&quot; D&#39;s &lt;E&gt; &amp;lt;"),
            "A & B \"C\" D's <E> &lt;"
        );
    }

    #[test]
    fn watchlist_channel_from_player() {
        let player = json!({ "videoDetails": { "author": "Dan Dingle", "channelId": ID } });
        let found = channel_from_player(&player).unwrap();
        assert_eq!(found.channel_id, ID);
        assert_eq!(found.title, "Dan Dingle");
        assert!(channel_from_player(&json!({ "playabilityStatus": { "status": "ERROR" } })).is_none());
    }

    #[test]
    fn watchlist_channel_from_ytdlp() {
        let root = json!({ "channel_id": ID, "channel": "Tom", "uploader_id": "@tom" });
        let found = channel_from_ytdlp(&root).unwrap();
        assert_eq!(found.title, "Tom");
        assert_eq!(found.handle.as_deref(), Some("@tom"));
        let legacy = json!({ "channel_id": ID, "uploader": "Tom", "uploader_id": "tomlegacy" });
        let found = channel_from_ytdlp(&legacy).unwrap();
        assert_eq!(found.title, "Tom");
        assert_eq!(found.handle, None);
        assert!(channel_from_ytdlp(&json!({ "channel": "Tom" })).is_none());
    }
}
