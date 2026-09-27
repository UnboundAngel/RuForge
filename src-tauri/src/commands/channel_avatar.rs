use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Manager};

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
/// Twice the largest card avatar so it stays sharp on 2x displays.
const AVATAR_SIZE_PX: u32 = 88;

fn is_channel_id(id: &str) -> bool {
    id.len() == 24
        && id.starts_with("UC")
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The channel page's `og:image` is its avatar; the `=s900` suffix picks the rendered size.
fn avatar_url_from_channel_html(html: &str) -> Option<String> {
    let marker = r#"<meta property="og:image" content=""#;
    let start = html.find(marker)? + marker.len();
    let url = &html[start..start + html[start..].find('"')?];
    if !url.starts_with("https://") {
        return None;
    }
    Some(match url.rfind("=s") {
        Some(i) => format!("{}=s{AVATAR_SIZE_PX}-c-k-c0x00ffffff-no-rj", &url[..i]),
        None => url.to_string(),
    })
}

fn avatar_cache_path(app: &AppHandle, channel_id: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("channel-avatars");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{channel_id}.jpg")))
}

/// Local path to a YouTube channel's avatar, fetched once and cached on disk. No cookies:
/// channel pages are public, and the library card must not wait on a session export.
#[tauri::command]
pub async fn get_channel_avatar(app: AppHandle, channel_id: String) -> Result<Option<String>, String> {
    if !is_channel_id(&channel_id) {
        return Ok(None);
    }
    let path = avatar_cache_path(&app, &channel_id)?;
    if path.is_file() {
        return Ok(Some(path.to_string_lossy().into_owned()));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(BROWSER_UA)
        .build()
        .map_err(|e| e.to_string())?;
    let html = client
        .get(format!("https://www.youtube.com/channel/{channel_id}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let Some(url) = avatar_url_from_channel_html(&html) else {
        return Ok(None);
    };
    let bytes = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    let tmp = path.with_extension("part");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resizes_the_og_image_avatar() {
        let html = r#"<meta property="og:title" content="x"><meta property="og:image" content="https://yt3.googleusercontent.com/abc=s900-c-k-c0x00ffffff-no-rj">"#;
        assert_eq!(
            avatar_url_from_channel_html(html).as_deref(),
            Some("https://yt3.googleusercontent.com/abc=s88-c-k-c0x00ffffff-no-rj")
        );
        assert_eq!(avatar_url_from_channel_html("<html></html>"), None);
    }

    #[test]
    fn only_real_channel_ids_hit_the_network() {
        assert!(is_channel_id("UCY-PrcA-mjq3OhgsAH9C52A"));
        assert!(!is_channel_id("@dandingles"));
        assert!(!is_channel_id("UC/../../etc"));
    }
}
