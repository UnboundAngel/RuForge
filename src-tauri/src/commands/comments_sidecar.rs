//! YouTube comment sidecars (`{stem}.comments.json`) for single-video downloads.

use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

pub const COMMENTS_SIDECAR_V: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommentsSidecarEntry {
    pub id: String,
    pub text: String,
    pub author: String,
    pub author_id: String,
    pub author_thumbnail: String,
    pub author_is_uploader: bool,
    pub author_is_verified: bool,
    pub like_count: u64,
    pub is_pinned: bool,
    pub parent: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    #[serde(rename = "_time_text")]
    pub time_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommentsSidecar {
    pub v: u32,
    pub video_id: String,
    pub comment_count: usize,
    pub fetched_at: String,
    pub comments: Vec<CommentsSidecarEntry>,
}

pub fn single_video_download_gate(
    options: &crate::commands::downloader::DownloadOptions,
    filename_template_eff: &str,
) -> (&'static str, bool) {
    if options.audio_only {
        return ("audio_only", false);
    }
    if options
        .playlist_output_folder
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty())
    {
        return ("playlist_output_folder", false);
    }
    if options.playlist_index.is_some() {
        return ("playlist_index", false);
    }
    if filename_template_eff.starts_with("Playlists/") {
        return ("template_playlists_prefix", false);
    }
    ("ok", true)
}

pub fn is_single_video_download(
    options: &crate::commands::downloader::DownloadOptions,
    filename_template_eff: &str,
) -> bool {
    single_video_download_gate(options, filename_template_eff).1
}

/// Strip yt-dlp stream suffix (e.g. `.f398`) so sidecar matches plain `Title.comments.json`.
/// Mirrors `stripYtdlpStreamSuffix` in `loadVideoComments.ts`.
pub fn strip_ytdlp_stream_suffix(stem: &str) -> &str {
    let Some(dot_f) = stem.rfind(".f") else {
        return stem;
    };
    let tail = &stem[dot_f + 2..];
    if tail.is_empty() {
        return stem;
    }
    if tail
        .chars()
        .all(|c| c.is_ascii_digit() || c == '.' || c == '-')
    {
        return &stem[..dot_f];
    }
    stem
}

pub fn comments_sidecar_path_for_media(media_path: &Path) -> Option<PathBuf> {
    let parent = media_path.parent()?;
    let stem = media_path.file_stem()?.to_str()?;
    let stem = strip_ytdlp_stream_suffix(stem);
    Some(parent.join(format!("{stem}.comments.json")))
}

/// Candidate sidecar paths beside `media_path` (plain stem, then yt-dlp stream suffix variant).
pub fn comments_sidecar_candidate_paths(media_path: &Path) -> Vec<PathBuf> {
    let Some(parent) = media_path.parent() else {
        return Vec::new();
    };
    let Some(file_stem) = media_path.file_stem().and_then(|s| s.to_str()) else {
        return Vec::new();
    };
    let stripped = strip_ytdlp_stream_suffix(file_stem);
    let mut stems = vec![file_stem.to_string()];
    if stripped != file_stem {
        stems.push(stripped.to_string());
    }
    stems
        .into_iter()
        .map(|stem| parent.join(format!("{stem}.comments.json")))
        .collect()
}

const MAX_COMMENTS_SIDECAR_BYTES: u64 = 2 * 1024 * 1024;

/// Read `{stem}.comments.json` for a library video (Rust I/O; avoids plugin-fs scope limits).
#[tauri::command]
pub fn read_video_comments_sidecar(media_path: String) -> Result<Option<String>, String> {
    let media = PathBuf::from(&media_path);
    let candidates = comments_sidecar_candidate_paths(&media);
    for path in candidates {
        let meta = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() {
            continue;
        }
        if meta.len() > MAX_COMMENTS_SIDECAR_BYTES {
            return Err(format!(
                "comments sidecar too large ({} bytes; max {})",
                meta.len(),
                MAX_COMMENTS_SIDECAR_BYTES
            ));
        }
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        return Ok(Some(raw));
    }
    Ok(None)
}

fn read_sidecar_raw_from_disk(media: &Path) -> Result<Option<String>, String> {
    for path in comments_sidecar_candidate_paths(media) {
        let meta = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() {
            continue;
        }
        if meta.len() > MAX_COMMENTS_SIDECAR_BYTES {
            return Err(format!(
                "comments sidecar too large ({} bytes; max {})",
                meta.len(),
                MAX_COMMENTS_SIDECAR_BYTES
            ));
        }
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        return Ok(Some(raw));
    }
    Ok(None)
}

fn resolve_source_url_for_media(media: &Path, source_url: Option<String>) -> Option<String> {
    if let Some(url) = source_url.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        return Some(url);
    }
    let parent = media.parent()?;
    let stem = media.file_stem()?.to_str()?;
    for candidate in crate::media_bundle::stem_candidates(stem) {
        let Some(info_path) = crate::utils::resolve_info_json_path(parent, candidate) else {
            continue;
        };
        let Ok(text) = std::fs::read_to_string(&info_path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        if let Some(url) = json.get("webpage_url").and_then(|v| v.as_str()) {
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

/// Read comments sidecar from disk, or fetch + write when missing and a source URL is known.
#[tauri::command]
pub async fn ensure_video_comments_sidecar(
    app: AppHandle,
    media_path: String,
    source_url: Option<String>,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<Option<String>, String> {
    let media = PathBuf::from(&media_path);
    if let Some(raw) = read_sidecar_raw_from_disk(&media)? {
        return Ok(Some(raw));
    }

    let Some(url) = resolve_source_url_for_media(&media, source_url) else {
        return Ok(None);
    };

    let cookie_fallback =
        crate::commands::downloader::video_info_cookie_probe(browser_cookies, cookie_file);
    let json = crate::commands::downloader::fetch_ytdlp_comments_json(
        &app,
        &url,
        cookie_fallback.as_ref(),
    )
    .await?;
    let video_id = json
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if video_id.is_empty() {
        return Err("comments fetch returned no video id".to_string());
    }
    let raw_comments = json
        .get("comments")
        .and_then(|v| v.as_array())
        .map(|a| a.as_slice())
        .unwrap_or(&[]);
    let entries = map_ytdlp_comments(raw_comments);
    let media_for_write = media.clone();
    tokio::task::spawn_blocking(move || write_comments_sidecar(&media_for_write, &video_id, &entries))
        .await
        .map_err(|e| format!("comments sidecar write task: {e}"))??;

    read_sidecar_raw_from_disk(&PathBuf::from(&media_path))
}

pub fn map_ytdlp_comment(raw: &Value) -> Option<CommentsSidecarEntry> {
    let id = raw.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    if id.is_empty() {
        return None;
    }
    let text = raw
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if text.trim().is_empty() {
        return None;
    }

    let author = raw
        .get("author")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let author_id = raw
        .get("author_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let author_thumbnail = raw
        .get("author_thumbnail")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let author_is_uploader = raw
        .get("author_is_uploader")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let author_is_verified = raw
        .get("author_is_verified")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let like_count = raw
        .get("like_count")
        .and_then(|v| v.as_u64())
        .or_else(|| {
            raw.get("like_count")
                .and_then(|v| v.as_i64())
                .filter(|n| *n >= 0)
                .map(|n| n as u64)
        })
        .unwrap_or(0);
    let is_pinned = raw
        .get("is_pinned")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let parent = raw
        .get("parent")
        .and_then(|v| v.as_str())
        .unwrap_or("root")
        .to_string();
    let timestamp = raw
        .get("timestamp")
        .and_then(|v| v.as_i64())
        .or_else(|| raw.get("timestamp").and_then(|v| v.as_u64()).map(|n| n as i64));
    let time_text = raw
        .get("time_text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Some(CommentsSidecarEntry {
        id: id.to_string(),
        text,
        author,
        author_id,
        author_thumbnail,
        author_is_uploader,
        author_is_verified,
        like_count,
        is_pinned,
        parent,
        timestamp,
        time_text,
    })
}

pub fn map_ytdlp_comments(raw_comments: &[Value]) -> Vec<CommentsSidecarEntry> {
    raw_comments
        .iter()
        .filter_map(map_ytdlp_comment)
        .collect()
}

pub fn write_comments_sidecar(
    media_path: &Path,
    video_id: &str,
    comments: &[CommentsSidecarEntry],
) -> Result<PathBuf, String> {
    let sidecar_path = comments_sidecar_path_for_media(media_path)
        .ok_or_else(|| "invalid media path for comments sidecar".to_string())?;
    let sidecar = CommentsSidecar {
        v: COMMENTS_SIDECAR_V,
        video_id: video_id.to_string(),
        comment_count: comments.len(),
        fetched_at: Utc::now().to_rfc3339(),
        comments: comments.to_vec(),
    };
    let json = serde_json::to_string_pretty(&sidecar)
        .map_err(|e| format!("comments sidecar serialize: {e}"))?;
    if let Some(parent) = sidecar_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create sidecar dir: {e}"))?;
    }
    std::fs::write(&sidecar_path, json).map_err(|e| format!("write comments sidecar: {e}"))?;
    Ok(sidecar_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_ytdlp_comment_fields() {
        let raw = json!({
            "id": "abc123",
            "text": "hello world",
            "author": "Tester",
            "author_id": "UCabc",
            "author_thumbnail": "https://example.com/a.jpg",
            "author_is_uploader": true,
            "author_is_verified": false,
            "like_count": 12,
            "is_pinned": false,
            "parent": "root",
            "timestamp": 1717156800,
            "time_text": "2 weeks ago"
        });
        let mapped = map_ytdlp_comment(&raw).expect("mapped");
        assert_eq!(mapped.id, "abc123");
        assert_eq!(mapped.like_count, 12);
        assert_eq!(mapped.time_text, "2 weeks ago");
        assert_eq!(mapped.parent, "root");
    }

    #[test]
    fn strip_ytdlp_stream_suffix_from_format_stem() {
        assert_eq!(
            strip_ytdlp_stream_suffix("The weird situation with Fable.f398"),
            "The weird situation with Fable"
        );
        assert_eq!(strip_ytdlp_stream_suffix("Plain Title"), "Plain Title");
    }

    #[test]
    fn sidecar_path_strips_ytdlp_stream_suffix() {
        let media = Path::new(r"C:\Library\Videos\Clip\Clip.f399.mp4");
        let path = comments_sidecar_path_for_media(media).expect("path");
        assert_eq!(
            path,
            Path::new(r"C:\Library\Videos\Clip\Clip.comments.json")
        );
    }

    #[test]
    fn writes_v1_sidecar_next_to_media() {
        let dir = tempfile::tempdir().expect("tempdir");
        let media = dir.path().join("Sample Title").join("Sample Title.mp4");
        std::fs::create_dir_all(media.parent().unwrap()).expect("mkdir");
        std::fs::write(&media, b"fake").expect("touch media");

        let entries = vec![CommentsSidecarEntry {
            id: "c1".into(),
            text: "nice".into(),
            author: "fan".into(),
            author_id: "UC1".into(),
            author_thumbnail: String::new(),
            author_is_uploader: false,
            author_is_verified: false,
            like_count: 3,
            is_pinned: false,
            parent: "root".into(),
            timestamp: Some(1),
            time_text: "1 day ago".into(),
        }];

        let path = write_comments_sidecar(&media, "vid123", &entries).expect("write");
        assert!(path.ends_with("Sample Title.comments.json"));

        let parsed: CommentsSidecar =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(parsed.v, 1);
        assert_eq!(parsed.video_id, "vid123");
        assert_eq!(parsed.comment_count, 1);
        assert_eq!(parsed.comments[0].text, "nice");
        assert_eq!(parsed.comments[0].time_text, "1 day ago");
    }

    #[test]
    fn single_video_gate_skips_playlist_batch() {
        use crate::commands::downloader::DownloadOptions;

        let mut opts = DownloadOptions {
            format: String::new(),
            output_dir: String::new(),
            filename_template: String::new(),
            browser_cookies: None,
            cookie_file: None,
            sub_langs: String::new(),
            audio_only: false,
            audio_format: "m4a".into(),
            auto_scrub_previews: true,
            playlist_output_folder: Some("My List".into()),
            playlist_index: Some(1),
            stamp_artist_tags: true,
            download_comments: true,
        };
        assert!(!is_single_video_download(
            &opts,
            "Playlists/My List/01 - title/01 - title.%(ext)s"
        ));

        opts.playlist_output_folder = None;
        opts.playlist_index = None;
        assert!(is_single_video_download(
            &opts,
            "Videos/%(title)s/%(title)s.%(ext)s"
        ));
    }
}
