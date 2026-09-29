use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CACHE_TTL_SECS: u64 = 12 * 60 * 60;
/// The header sits well inside this window; searching the whole 1 MB page would pick up
/// featured channels further down.
const HEADER_WINDOW: usize = 40_000;
/// Wide enough for a full-width hero on a 1440p window without pulling the 2560 original.
const BANNER_MIN_WIDTH: u32 = 1600;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelProfile {
    pub title: Option<String>,
    pub handle: Option<String>,
    pub subscribers: Option<String>,
    pub video_count: Option<String>,
    pub banner_url: Option<String>,
    /// Large enough for the creator page hero; the cached card avatar is only 88px.
    pub avatar_url: Option<String>,
    pub verified: bool,
}

#[derive(Serialize, Deserialize)]
struct CachedProfile {
    fetched_at: u64,
    profile: ChannelProfile,
}

fn is_channel_id(id: &str) -> bool {
    id.len() == 24
        && id.starts_with("UC")
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn unescape(s: &str) -> String {
    s.replace("\\u0026", "&").replace("\\/", "/").replace("\\\"", "\"")
}

/// Every `"key":"value"` string in `hay`, in order.
fn string_values<'a>(hay: &'a str, key: &str) -> Vec<&'a str> {
    let marker = format!("\"{key}\":\"");
    let mut out = Vec::new();
    let mut rest = hay;
    while let Some(i) = rest.find(&marker) {
        rest = &rest[i + marker.len()..];
        let Some(end) = rest.find('"') else { break };
        out.push(&rest[..end]);
        rest = &rest[end..];
    }
    out
}

fn pick_banner(banner_block: &str) -> Option<String> {
    let list_start = banner_block.find("\"sources\":[")? + 11;
    let list = &banner_block[list_start..];
    let list = &list[..list.find(']')?];
    let mut sources: Vec<(u32, &str)> = list
        .split("{\"url\":\"")
        .skip(1)
        .filter_map(|entry| {
            let (url, tail) = entry.split_once('"')?;
            let width = tail
                .strip_prefix(",\"width\":")
                .and_then(|w| w.split(|c: char| !c.is_ascii_digit()).next())
                .and_then(|w| w.parse().ok())
                .unwrap_or(0);
            url.starts_with("https://").then_some((width, url))
        })
        .collect();
    sources.sort_by_key(|(w, _)| *w);
    sources
        .iter()
        .find(|(w, _)| *w >= BANNER_MIN_WIDTH)
        .or(sources.last())
        .map(|(_, url)| unescape(url))
}

/// Reads the channel header (`pageHeaderViewModel`) out of a channel page's inline data.
fn profile_from_channel_html(html: &str) -> Option<ChannelProfile> {
    let start = html.find("\"pageHeaderViewModel\":{")?;
    let end = (start + HEADER_WINDOW).min(html.len());
    let end = (end..html.len()).find(|&i| html.is_char_boundary(i)).unwrap_or(html.len());
    let header = &html[start..end];

    let banner_at = header.find("\"imageBannerViewModel\":{");
    let identity = &header[..banner_at.unwrap_or(header.len())];

    let mut profile = ChannelProfile {
        verified: identity.contains("CHECK_CIRCLE_FILLED"),
        banner_url: banner_at.and_then(|i| pick_banner(&header[i..])),
        avatar_url: string_values(identity, "url")
            .into_iter()
            .find(|u| u.starts_with("https://yt3.") && u.contains("=s"))
            .map(|u| format!("{}=s256-c-k-c0x00ffffff-no-rj", &u[..u.rfind("=s").unwrap_or(u.len())])),
        ..Default::default()
    };
    for (n, raw) in string_values(identity, "content").into_iter().enumerate() {
        let text = unescape(raw);
        let lower = text.to_ascii_lowercase();
        if n == 0 {
            profile.title = Some(text);
        } else if profile.handle.is_none() && text.starts_with('@') {
            profile.handle = Some(text);
        } else if profile.subscribers.is_none() && (lower.ends_with(" subscribers") || lower.ends_with(" subscriber")) {
            profile.subscribers = Some(text);
        } else if profile.video_count.is_none() && (lower.ends_with(" videos") || lower.ends_with(" video")) {
            profile.video_count = Some(text);
        }
    }
    Some(profile)
}

fn cache_path(app: &AppHandle, channel_id: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("channel-profiles");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{channel_id}.json")))
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn read_cache(path: &PathBuf) -> Option<CachedProfile> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

/// Banner, handle, subscriber count and verified mark for a creator page. Public page, no
/// cookies, cached on disk; a failed refresh falls back to the stale copy.
#[tauri::command]
pub async fn get_channel_profile(app: AppHandle, channel_id: String) -> Result<Option<ChannelProfile>, String> {
    if !is_channel_id(&channel_id) {
        return Ok(None);
    }
    let path = cache_path(&app, &channel_id)?;
    let cached = read_cache(&path);
    if let Some(c) = &cached {
        if now_secs().saturating_sub(c.fetched_at) < CACHE_TTL_SECS {
            return Ok(Some(c.profile.clone()));
        }
    }
    let fetched = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(BROWSER_UA)
            .build()
            .map_err(|e| e.to_string())?;
        client
            .get(format!("https://www.youtube.com/channel/{channel_id}"))
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())
    }
    .await;
    let profile = match fetched.map(|html| profile_from_channel_html(&html)) {
        Ok(Some(p)) => p,
        Ok(None) | Err(_) => return Ok(cached.map(|c| c.profile)),
    };
    let body = serde_json::to_vec(&CachedProfile { fetched_at: now_secs(), profile: profile.clone() })
        .map_err(|e| e.to_string())?;
    let tmp = path.with_extension("part");
    if std::fs::write(&tmp, body).is_ok() {
        let _ = std::fs::rename(&tmp, &path);
    }
    Ok(Some(profile))
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER: &str = r#"x"pageHeaderViewModel":{"title":{"dynamicTextViewModel":{"text":{"content":"CaseOh","attachmentRuns":[{"element":{"type":{"imageType":{"image":{"sources":[{"clientResource":{"imageName":"CHECK_CIRCLE_FILLED"}}]}}}}}]}}},"image":{"decoratedAvatarViewModel":{"avatar":{"avatarViewModel":{"image":{"sources":[{"url":"https://yt3.googleusercontent.com/av=s72","width":72}]}}}}},"metadata":{"contentMetadataViewModel":{"metadataRows":[{"metadataParts":[{"text":{"content":"@caseoh_"}}]},{"metadataParts":[{"text":{"content":"11.1M subscribers"}},{"text":{"content":"2.6K videos"}}]}]}},"banner":{"imageBannerViewModel":{"image":{"sources":[{"url":"https://yt3.googleusercontent.com/b=w1060-fcrop\u0026x","width":1060,"height":175},{"url":"https://yt3.googleusercontent.com/b=w1707","width":1707,"height":283},{"url":"https://yt3.googleusercontent.com/b=w2560","width":2560,"height":424}]}}}}"subscriberCountText":{"simpleText":"2.65M subscribers"}"#;

    #[test]
    fn reads_the_channel_header() {
        let p = profile_from_channel_html(HEADER).unwrap();
        assert_eq!(p.title.as_deref(), Some("CaseOh"));
        assert_eq!(p.handle.as_deref(), Some("@caseoh_"));
        assert_eq!(p.subscribers.as_deref(), Some("11.1M subscribers"));
        assert_eq!(p.video_count.as_deref(), Some("2.6K videos"));
        assert!(p.verified);
        assert_eq!(p.banner_url.as_deref(), Some("https://yt3.googleusercontent.com/b=w1707"));
        assert_eq!(p.avatar_url.as_deref(), Some("https://yt3.googleusercontent.com/av=s256-c-k-c0x00ffffff-no-rj"));
    }

    #[test]
    fn falls_back_to_the_widest_banner_and_unescapes() {
        let block = r#""imageBannerViewModel":{"image":{"sources":[{"url":"https://yt3.googleusercontent.com/b=w1060\u0026x","width":1060}]}}"#;
        assert_eq!(pick_banner(block).as_deref(), Some("https://yt3.googleusercontent.com/b=w1060&x"));
    }

    #[test]
    fn no_banner_and_no_verified_badge() {
        let html = r#""pageHeaderViewModel":{"title":{"dynamicTextViewModel":{"text":{"content":"Small"}}},"metadata":{"contentMetadataViewModel":{"metadataRows":[{"metadataParts":[{"text":{"content":"@small"}}]},{"metadataParts":[{"text":{"content":"1 subscriber"}},{"text":{"content":"1 video"}}]}]}}}"#;
        let p = profile_from_channel_html(html).unwrap();
        assert_eq!(p.title.as_deref(), Some("Small"));
        assert_eq!(p.subscribers.as_deref(), Some("1 subscriber"));
        assert_eq!(p.video_count.as_deref(), Some("1 video"));
        assert!(!p.verified);
        assert_eq!(p.banner_url, None);
    }

    #[test]
    fn pages_without_a_header_give_nothing() {
        assert_eq!(profile_from_channel_html("<html></html>"), None);
    }

    #[test]
    fn only_real_channel_ids_hit_the_network() {
        assert!(is_channel_id("UCY-PrcA-mjq3OhgsAH9C52A"));
        assert!(!is_channel_id("UC/../../etc"));
    }
}
