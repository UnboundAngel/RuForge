use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::download_job_manager::{kill_ytdlp_tree, DownloadJobManager};
use crate::ytdlp_binary::ytdlp_shell_command;
use crate::ytdlp_rate_limit::{
    ytdlp_push_politeness_args, ytdlp_register_rate_limit_from_stderr,
    ytdlp_subprocess_rate_gate_wait, ytdlp_stderr_is_rate_limited,
};

use crate::commands::explorer_cookies::{export_ruforge_cookies_for_ytdlp, RuforgeCookieExport};
use crate::commands::gallery::cleanup_orphan_downloads_under;
use crate::commands::media::extract_frames;
use crate::commands::musicmeta::{enrich_music_meta_path, find_recent_audio_files};
use crate::utils::is_media_ext;

/// Where yt-dlp wrote files for this job: playlist subfolder if template has a fixed prefix, else output root.
fn post_download_diag_listing_root(output_dir: &Path, filename_template_eff: &str) -> std::path::PathBuf {
    if let Some((first, _)) = filename_template_eff.split_once('/') {
        if !first.is_empty() && !first.contains('%') {
            return output_dir.join(first);
        }
    }
    output_dir.to_path_buf()
}

/// Log paths (relative to `root`) for files under `root` modified on/after `since` (with slack for clock skew).
fn log_post_download_files_written(root: &Path, since: SystemTime) {
    const SLACK_SECS: u64 = 15;
    let cutoff = since
        .checked_sub(std::time::Duration::from_secs(SLACK_SECS))
        .unwrap_or(since);

    let mut rel_paths: Vec<String> = Vec::new();

    fn walk(
        dir: &Path,
        root: &Path,
        depth: u32,
        max_depth: u32,
        cutoff: SystemTime,
        out: &mut Vec<String>,
    ) {
        if depth > max_depth {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for ent in rd.flatten() {
            let p = ent.path();
            let rel = p
                .strip_prefix(root)
                .map(|x| x.display().to_string())
                .unwrap_or_else(|_| p.display().to_string());
            if p.is_dir() {
                walk(&p, root, depth + 1, max_depth, cutoff, out);
            } else if p.is_file() {
                let recent = std::fs::metadata(&p)
                    .and_then(|m| m.modified())
                    .map(|t| t >= cutoff)
                    .unwrap_or(true);
                if recent {
                    out.push(rel);
                }
            }
        }
    }

    if !root.is_dir() {
        crate::rf_log!(
            "download.post",
            log::Level::Info,
            "post-download file list skipped (not a directory): {}",
            root.display()
        );
        return;
    }

    walk(root, root, 0, 8, cutoff, &mut rel_paths);
    rel_paths.sort();
    crate::rf_log!(
        "download.post",
        log::Level::Info,
        "post-download files under {} (count={}, mtime cutoff ~{}s before job start): {:?}",
        root.display(),
        rel_paths.len(),
        SLACK_SECS,
        rel_paths
    );
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItemPreview {
    pub title: String,
    pub thumbnail: String,
    pub duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webpage_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_audio: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_video: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub title: String,
    pub thumbnail: String,
    pub duration: f64,
    pub formats: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes: Option<u64>,
    /// Best-effort audio-only estimate from one `-J` formats pass (`bestaudio/best`-class).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_audio: Option<u64>,
    /// Best-effort muxed video estimate (`bestvideo+bestaudio`-class for the height cap).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_bytes_video: Option<u64>,
    #[serde(default)]
    pub is_playlist: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_items: Option<Vec<PlaylistItemPreview>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploader: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
}

fn ytdlp_uploader_channel(json: &serde_json::Value) -> (Option<String>, Option<String>) {
    let pick_str =
        |key: &str| {
            json.get(key)
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        };
    let uploader = pick_str("uploader").or_else(|| pick_str("artist"));
    let channel = pick_str("channel").or_else(|| pick_str("playlist_channel"));
    (uploader, channel)
}

/// Largest single `clen=` value in a stream URL (avoid summing duplicate/segment params).
fn max_clen_bytes_in_url(url: &str) -> Option<u64> {
    const NEEDLES: [&str; 3] = ["clen=", "clen%3D", "clen%253D"];
    let mut best = 0u64;
    let mut any = false;
    for needle in NEEDLES {
        let mut rest = url;
        while let Some(i) = rest.find(needle) {
            let after = &rest[i + needle.len()..];
            let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(n) = digits.parse::<u64>() {
                if n > best {
                    best = n;
                    any = true;
                }
            }
            rest = after;
        }
    }
    any.then_some(best).filter(|&s| s > 0)
}

fn estimate_bytes_from_bitrate(duration_secs: f64, tbr_kbps: f64) -> Option<u64> {
    if !(duration_secs > 0.0 && tbr_kbps > 0.0) {
        return None;
    }
    let bytes = duration_secs * tbr_kbps * 1000.0 / 8.0;
    if !bytes.is_finite() || bytes <= 0.0 {
        return None;
    }
    Some(bytes.min(u64::MAX as f64) as u64)
}

fn tbr_kbps_from_json(json: &serde_json::Value) -> Option<f64> {
    json.get("tbr")
        .and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|u| u as f64)))
        .filter(|&t| t > 0.0)
}

fn video_file_size_from_ytdlp_json(json: &serde_json::Value) -> Option<u64> {
    fn u64_from_field(v: &serde_json::Value) -> Option<u64> {
        v.as_u64().or_else(|| v.as_i64().filter(|&i| i >= 0).map(|i| i as u64))
    }

    fn size_from_format_entry(fmt: &serde_json::Value) -> Option<u64> {
        fmt.get("filesize")
            .and_then(u64_from_field)
            .filter(|&n| n > 0)
            .or_else(|| {
                fmt.get("filesize_approx")
                    .and_then(u64_from_field)
                    .filter(|&n| n > 0)
            })
            .or_else(|| {
                fmt.get("url")
                    .and_then(|v| v.as_str())
                    .and_then(max_clen_bytes_in_url)
            })
            .or_else(|| {
                fmt.get("manifest_url")
                    .and_then(|v| v.as_str())
                    .and_then(max_clen_bytes_in_url)
            })
    }

    fn sum_sizes_from_format_array(arr: &[serde_json::Value]) -> Option<u64> {
        if arr.is_empty() {
            return None;
        }
        let mut sum = 0u64;
        let mut any = false;
        for f in arr {
            if let Some(n) = size_from_format_entry(f) {
                sum = sum.saturating_add(n);
                any = true;
            }
        }
        any.then_some(sum).filter(|&s| s > 0)
    }

    if let Some(n) = json.get("filesize").and_then(u64_from_field).filter(|&n| n > 0) {
        return Some(n);
    }
    if let Some(n) = json.get("filesize_approx").and_then(u64_from_field).filter(|&n| n > 0) {
        return Some(n);
    }

    for key in ["requested_formats", "requested_downloads"] {
        if let Some(arr) = json.get(key).and_then(|v| v.as_array()) {
            if let Some(sum) = sum_sizes_from_format_array(arr) {
                return Some(sum);
            }
        }
    }

    if let Some(fid) = json.get("format_id").and_then(|v| v.as_str()) {
        if let Some(arr) = json.get("formats").and_then(|v| v.as_array()) {
            if fid.contains('+') {
                let mut sum = 0u64;
                let mut any = false;
                for part in fid.split('+') {
                    let part = part.trim();
                    if part.is_empty() {
                        continue;
                    }
                    for f in arr {
                        if f.get("format_id").and_then(|v| v.as_str()) == Some(part) {
                            if let Some(n) = size_from_format_entry(f) {
                                sum = sum.saturating_add(n);
                                any = true;
                            }
                            break;
                        }
                    }
                }
                if any && sum > 0 {
                    return Some(sum);
                }
            } else {
                for f in arr {
                    if f.get("format_id").and_then(|v| v.as_str()) == Some(fid) {
                        if let Some(n) = size_from_format_entry(f) {
                            return Some(n);
                        }
                    }
                }
            }
        }
    }

    if let Some(dur) = ytdlp_duration_secs(json) {
        if let Some(tbr) = tbr_kbps_from_json(json) {
            if let Some(est) = estimate_bytes_from_bitrate(dur, tbr) {
                return Some(est);
            }
        }
    }

    None
}

fn ytdlp_codec_is_none(raw: Option<&str>) -> bool {
    match raw.map(str::trim) {
        None => true,
        Some(s) if s.is_empty() => true,
        Some(s) => s.eq_ignore_ascii_case("none"),
    }
}

fn format_stream_score_kbps(fmt: &serde_json::Value) -> Option<f64> {
    fmt.get("abr")
        .and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|u| u as f64)))
        .filter(|&t| t > 0.0)
        .or_else(|| tbr_kbps_from_json(fmt))
}

fn max_height_from_ytdlp_format(format: &str) -> Option<u32> {
    let needle = "height<=";
    let mut rest = format;
    let mut best: Option<u32> = None;
    while let Some(i) = rest.find(needle) {
        let after = &rest[i + needle.len()..];
        let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(h) = digits.parse::<u32>() {
            if h > 0 {
                best = Some(best.map(|b| b.max(h)).unwrap_or(h));
            }
        }
        rest = after;
    }
    best
}

fn ytdlp_json_has_simulated_selection(json: &serde_json::Value) -> bool {
    json.get("requested_formats").is_some() || json.get("requested_downloads").is_some()
}

/// Upper bound from the highest-bitrate pure-audio row (fallback when simulate omits sizes).
fn max_audio_bitrate_ceiling_bytes(
    formats: &[serde_json::Value],
    duration_secs: f64,
) -> Option<u64> {
    if !(duration_secs > 0.0) {
        return None;
    }
    let mut best_kbps = 0f64;
    for fmt in formats {
        if ytdlp_codec_is_none(fmt.get("acodec").and_then(|v| v.as_str())) {
            continue;
        }
        if !ytdlp_codec_is_none(fmt.get("vcodec").and_then(|v| v.as_str())) {
            continue;
        }
        let kbps = format_stream_score_kbps(fmt).unwrap_or(0.0);
        if kbps > best_kbps {
            best_kbps = kbps;
        }
    }
    if best_kbps > 0.0 {
        estimate_bytes_from_bitrate(duration_secs, best_kbps)
    } else {
        None
    }
}

fn pick_best_audio_size_from_formats(
    formats: &[serde_json::Value],
    duration_secs: f64,
) -> Option<u64> {
    let mut best: Option<(f64, u64)> = None;
    for fmt in formats {
        if ytdlp_codec_is_none(fmt.get("acodec").and_then(|v| v.as_str())) {
            continue;
        }
        if !ytdlp_codec_is_none(fmt.get("vcodec").and_then(|v| v.as_str())) {
            continue;
        }
        let score = format_stream_score_kbps(fmt).unwrap_or(0.0);
        let size = size_from_format_entry_for_dual(fmt, duration_secs)?;
        let replace = match best {
            None => true,
            Some((prev_score, _)) => score > prev_score || (score == prev_score && score == 0.0),
        };
        if replace {
            best = Some((score, size));
        }
    }
    best.map(|(_, n)| n).filter(|&n| n > 0)
}

fn pick_best_video_only_size_from_formats(
    formats: &[serde_json::Value],
    max_height: Option<u32>,
    duration_secs: f64,
) -> Option<u64> {
    let mut best: Option<(u32, f64, u64)> = None;
    for fmt in formats {
        if ytdlp_codec_is_none(fmt.get("vcodec").and_then(|v| v.as_str())) {
            continue;
        }
        if !ytdlp_codec_is_none(fmt.get("acodec").and_then(|v| v.as_str())) {
            continue;
        }
        let height = height_from_format_entry(fmt).unwrap_or(0);
        if let Some(cap) = max_height {
            if height > cap {
                continue;
            }
        }
        let score = format_stream_score_kbps(fmt).unwrap_or(0.0);
        let size = size_from_format_entry_for_dual(fmt, duration_secs)?;
        let replace = match best {
            None => true,
            Some((prev_h, prev_score, _)) => {
                height > prev_h || (height == prev_h && score > prev_score)
            }
        };
        if replace {
            best = Some((height, score, size));
        }
    }
    best.map(|(_, _, n)| n).filter(|&n| n > 0)
}

fn size_from_format_entry_for_dual(
    fmt: &serde_json::Value,
    duration_secs: f64,
) -> Option<u64> {
    fn u64_from_field(v: &serde_json::Value) -> Option<u64> {
        v.as_u64()
            .or_else(|| v.as_i64().filter(|&i| i >= 0).map(|i| i as u64))
    }
    fmt.get("filesize")
        .and_then(u64_from_field)
        .filter(|&n| n > 0)
        .or_else(|| {
            fmt.get("filesize_approx")
                .and_then(u64_from_field)
                .filter(|&n| n > 0)
        })
        .or_else(|| {
            fmt.get("url")
                .and_then(|v| v.as_str())
                .and_then(max_clen_bytes_in_url)
        })
        .or_else(|| {
            tbr_kbps_from_json(fmt).and_then(|tbr| estimate_bytes_from_bitrate(duration_secs, tbr))
        })
}

fn height_from_format_entry(fmt: &serde_json::Value) -> Option<u32> {
    fmt.get("height")
        .and_then(|v| v.as_u64().or_else(|| v.as_i64().filter(|&i| i >= 0).map(|i| i as u64)))
        .map(|h| h as u32)
        .filter(|&h| h > 0)
}

fn dual_file_sizes_from_entry_json(
    json: &serde_json::Value,
    max_height: Option<u32>,
    audio_primary: bool,
) -> (Option<u64>, Option<u64>) {
    let duration = ytdlp_duration_secs(json).unwrap_or(0.0);

    if audio_primary {
        let simulated = video_file_size_from_ytdlp_json(json);
        let ceiling = json
            .get("formats")
            .and_then(|v| v.as_array())
            .and_then(|arr| max_audio_bitrate_ceiling_bytes(arr, duration));
        let audio = match (simulated, ceiling) {
            (Some(s), Some(c)) => Some(s.max(c)),
            (Some(s), None) => Some(s),
            (None, Some(c)) => Some(c),
            (None, None) => json
                .get("formats")
                .and_then(|v| v.as_array())
                .and_then(|arr| pick_best_audio_size_from_formats(arr, duration)),
        };
        return (audio.filter(|&n| n > 0), None);
    }

    if ytdlp_json_has_simulated_selection(json) {
        if let Some(simulated) = video_file_size_from_ytdlp_json(json) {
            return (None, Some(simulated));
        }
    }

    if let Some(formats) = json.get("formats").and_then(|v| v.as_array()) {
        if !formats.is_empty() {
            let audio = pick_best_audio_size_from_formats(formats, duration);
            let video_only = pick_best_video_only_size_from_formats(formats, max_height, duration);
            let video = match (video_only, audio) {
                (Some(v), Some(a)) => Some(v.saturating_add(a)),
                (Some(v), None) => Some(v),
                (None, Some(a)) => Some(a),
                (None, None) => video_file_size_from_ytdlp_json(json),
            };
            return (audio, video);
        }
    }
    let fallback = video_file_size_from_ytdlp_json(json);
    (fallback, fallback)
}

fn dual_file_sizes_from_ytdlp_json(
    json: &serde_json::Value,
    video_format: Option<&str>,
    audio_primary: bool,
) -> (Option<u64>, Option<u64>) {
    let max_height = video_format.and_then(max_height_from_ytdlp_format);
    if let Some(entries) = ytdlp_usable_playlist_entries(json) {
        let mut audio_sum = 0u64;
        let mut video_sum = 0u64;
        let mut any_audio = false;
        let mut any_video = false;
        for entry in entries {
            let (a, v) = dual_file_sizes_from_entry_json(entry, max_height, audio_primary);
            if let Some(n) = a {
                audio_sum = audio_sum.saturating_add(n);
                any_audio = true;
            }
            if let Some(n) = v {
                video_sum = video_sum.saturating_add(n);
                any_video = true;
            }
        }
        return (
            any_audio.then_some(audio_sum).filter(|&s| s > 0),
            any_video.then_some(video_sum).filter(|&s| s > 0),
        );
    }
    dual_file_sizes_from_entry_json(json, max_height, audio_primary)
}

fn sanitize_playlist_folder_name(raw: &str) -> String {
    let trimmed = raw.trim();
    let mut out: String = trimmed
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    while out.ends_with('.') || out.ends_with(char::is_whitespace) {
        if out.is_empty() {
            break;
        }
        out.pop();
    }
    let out = out.trim().to_string();
    if out.is_empty() {
        "playlist".to_string()
    } else {
        out.chars().take(200).collect()
    }
}

fn ytdlp_duration_secs(v: &serde_json::Value) -> Option<f64> {
    v.get("duration")
        .and_then(|d| {
            d.as_f64()
                .or_else(|| d.as_u64().map(|u| u as f64))
                .or_else(|| d.as_i64().map(|i| i as f64))
        })
        .filter(|x| x.is_finite() && *x >= 0.0)
}

/// Reject page URLs yt-dlp sometimes puts in thumbnail fields (causes broken img tags in the UI).
fn is_probable_image_url(url: &str) -> bool {
    let u = url.trim().to_lowercase();
    if u.is_empty() {
        return false;
    }
    if u.contains("youtube.com/playlist")
        || u.contains("music.youtube.com/playlist")
        || u.contains("youtube.com/watch")
        || u.contains("music.youtube.com/watch")
        || u.contains("youtube.com/channel")
        || u.contains("music.youtube.com/channel")
        || u.contains("music.youtube.com/browse")
        || u.contains("youtu.be/")
    {
        return false;
    }
    if u.contains("ytimg.com")
        || u.contains("ggpht.com")
        || u.contains("googleusercontent.com")
        || u.contains("gstatic.com")
    {
        return true;
    }
    u.ends_with(".jpg")
        || u.ends_with(".jpeg")
        || u.ends_with(".png")
        || u.ends_with(".webp")
        || u.ends_with(".gif")
}

fn normalize_thumbnail_url(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    let normalized = if s.starts_with("//") {
        format!("https:{s}")
    } else {
        s.to_string()
    };
    if is_probable_image_url(&normalized) {
        Some(normalized)
    } else {
        None
    }
}

fn thumbnail_from_thumbnails_array(arr: &[serde_json::Value]) -> Option<String> {
    arr.iter()
        .rev()
        .find_map(|t| t.get("url").and_then(|u| u.as_str()))
        .and_then(|s| normalize_thumbnail_url(s))
}

fn ytdlp_entry_thumbnail(entry: &serde_json::Value) -> String {
    best_thumbnail_url(entry).unwrap_or_default()
}

fn ytdlp_entry_is_usable(entry: &serde_json::Value) -> bool {
    !(entry.is_null() || entry.as_object().is_some_and(|m| m.is_empty()))
}

fn ytdlp_usable_playlist_entries(json: &serde_json::Value) -> Option<Vec<&serde_json::Value>> {
    let entries = json.get("entries").and_then(|e| e.as_array())?;
    let usable: Vec<&serde_json::Value> = entries.iter().filter(|e| ytdlp_entry_is_usable(e)).collect();
    if usable.is_empty() {
        None
    } else {
        Some(usable)
    }
}

fn playlist_preview_from_entry(entry: &serde_json::Value, max_height: Option<u32>) -> PlaylistItemPreview {
    let (audio_sz, video_sz) = dual_file_sizes_from_entry_json(entry, max_height, false);
    let legacy = video_file_size_from_ytdlp_json(entry);
    PlaylistItemPreview {
        title: entry
            .get("title")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Unknown")
            .to_string(),
        thumbnail: ytdlp_entry_thumbnail(entry),
        duration: ytdlp_duration_secs(entry).unwrap_or(0.0),
        id: entry
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        webpage_url: entry
            .get("webpage_url")
            .or_else(|| entry.get("url"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        file_size_bytes: legacy,
        file_size_bytes_audio: audio_sz,
        file_size_bytes_video: video_sz,
    }
}

fn playlist_aggregate_file_size(entries: &[&serde_json::Value]) -> Option<u64> {
    let mut sum = 0u64;
    let mut any = false;
    for e in entries {
        if let Some(n) = video_file_size_from_ytdlp_json(e) {
            sum = sum.saturating_add(n);
            any = true;
        }
    }
    any.then_some(sum).filter(|&s| s > 0)
}

fn video_info_from_ytdlp_single_json(json: serde_json::Value) -> VideoInfo {
    match ytdlp_usable_playlist_entries(&json) {
        Some(entries) => {
            let previews: Vec<PlaylistItemPreview> = entries
                .iter()
                .copied()
                .map(|e| playlist_preview_from_entry(e, None))
                .collect();
            let title = json
                .get("playlist_title")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    json.get("title")
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                })
                .unwrap_or("Playlist")
                .to_string();
            let thumbnail = json
                .get("playlist_thumbnail")
                .or_else(|| json.get("thumbnail"))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    entries
                        .iter()
                        .map(|e| ytdlp_entry_thumbnail(e))
                        .find(|s| !s.is_empty())
                })
                .unwrap_or_default();

            let duration: f64 = entries.iter().filter_map(|e| ytdlp_duration_secs(e)).sum();

            let (uploader, channel) = ytdlp_uploader_channel(&json);

            VideoInfo {
                title,
                thumbnail,
                duration,
                formats: vec![],
                file_size_bytes: playlist_aggregate_file_size(&entries),
                file_size_bytes_audio: None,
                file_size_bytes_video: None,
                is_playlist: true,
                playlist_items: Some(previews),
                uploader,
                channel,
            }
        }
        None => {
            let (uploader, channel) = ytdlp_uploader_channel(&json);
            VideoInfo {
                title: json
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                thumbnail: json["thumbnail"].as_str().unwrap_or("").to_string(),
                duration: ytdlp_duration_secs(&json).unwrap_or(0.0),
                formats: vec![],
                file_size_bytes: video_file_size_from_ytdlp_json(&json),
                file_size_bytes_audio: None,
                file_size_bytes_video: None,
                is_playlist: false,
                playlist_items: None,
                uploader,
                channel,
            }
        },
    }
}

fn ytdlp_simulate_format_eff(
    cookie_opts: Option<&DownloadOptions>,
    format: Option<&str>,
) -> Option<String> {
    if let Some(opts) = cookie_opts {
        if opts.audio_only {
            return Some("bestaudio/best".into());
        }
    }
    format
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            cookie_opts
                .map(|o| o.format.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        })
}

fn cookie_browser_label(browser: &str) -> &'static str {
    match browser {
        "ruforge" => "RuForge Internal browser (Explorer)",
        "firefox" => "Firefox",
        "edge" => "Microsoft Edge",
        "chrome" => "Google Chrome",
        "brave" => "Brave",
        "safari" => "Safari",
        _ => "browser",
    }
}

fn ytdlp_stderr_is_cookie_export_failure(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("cookie database")
        || lower.contains("export cookies")
        || lower.contains("failed to decrypt with dpapi")
        || lower.contains("could not copy chrome")
        || lower.contains("could not read cookies")
        || lower.contains("error reading cookies")
        || (lower.contains("permission denied") && lower.contains("cookie"))
}

fn ytdlp_browser_cookie_arg(app: &AppHandle, browser: &str) -> Result<String, String> {
    if browser == "ruforge" {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("explorer-data");
        let profile_dir = data_dir.join("EBWebView").join("Default");
        Ok(format!("chrome:{}", profile_dir.to_string_lossy()))
    } else {
        Ok(browser.to_string())
    }
}

fn ytdlp_push_cookie_cli_args(
    app: &AppHandle,
    args: &mut Vec<String>,
    cookie_file: Option<&str>,
    browser_cookies: Option<&str>,
) -> Result<(), String> {
    if let Some(file) = cookie_file.filter(|s| !s.is_empty()) {
        args.push("--cookies".into());
        args.push(file.to_string());
        return Ok(());
    }
    if let Some(browser) = browser_cookies.filter(|s| !s.is_empty() && *s != "chrome") {
        args.push("--cookies-from-browser".into());
        args.push(ytdlp_browser_cookie_arg(app, browser)?);
    }
    Ok(())
}

fn humanize_ytdlp_cookie_error(err: &str, browser: Option<&str>) -> String {
    let source = browser.map(cookie_browser_label).unwrap_or("browser");
    let raw = err.trim();
    if raw.is_empty() {
        format!(
            "Could not read cookies from {}. For signed-in content try Firefox, export a cookies.txt file, or restart RuForge before using Internal.",
            source
        )
    } else {
        format!(
            "Could not read cookies from {}.\n\nyt-dlp: {}\n\nFor signed-in content try Firefox, export a cookies.txt file, or restart RuForge before using Internal.",
            source, raw
        )
    }
}

fn ytdlp_has_configured_cookie_source(
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
) -> bool {
    cookie_file.filter(|s| !s.is_empty()).is_some()
        || browser_cookies
            .filter(|s| !s.is_empty() && *s != "chrome")
            .is_some()
}

fn download_options_without_cookies(options: &DownloadOptions) -> DownloadOptions {
    DownloadOptions {
        browser_cookies: None,
        cookie_file: None,
        ..options.clone()
    }
}

async fn ytdlp_download_options_with_ruforge_export(
    app: &AppHandle,
    fallback: &DownloadOptions,
) -> Result<(DownloadOptions, Option<RuforgeCookieExport>), String> {
    if fallback.browser_cookies.as_deref() != Some("ruforge") {
        return Ok((fallback.clone(), None));
    }
    let export = export_ruforge_cookies_for_ytdlp(app).await?;
    let path = export.path().display().to_string();
    Ok((
        DownloadOptions {
            browser_cookies: None,
            cookie_file: Some(path),
            ..fallback.clone()
        },
        Some(export),
    ))
}

async fn ytdlp_music_cookie_retry_args(
    app: &AppHandle,
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
) -> Result<(Option<String>, Option<String>, Option<RuforgeCookieExport>), String> {
    if browser_cookies != Some("ruforge") {
        return Ok((
            browser_cookies.map(str::to_string),
            cookie_file.map(str::to_string),
            None,
        ));
    }
    let export = export_ruforge_cookies_for_ytdlp(app).await?;
    let path = export.path().display().to_string();
    Ok((None, Some(path), Some(export)))
}

fn format_ytdlp_cookie_fallback_failure(
    without_err: &str,
    with_err: &str,
    browser: Option<&str>,
) -> String {
    if ytdlp_stderr_is_cookie_export_failure(with_err) {
        format!(
            "{}\nWithout cookies: {}",
            humanize_ytdlp_cookie_error(with_err, browser),
            get_video_info_simulate_failure_message(without_err)
        )
    } else {
        format!(
            "Metadata fetch failed (without cookies: {}; with cookies: {})",
            get_video_info_simulate_failure_message(without_err),
            get_video_info_simulate_failure_message(with_err)
        )
    }
}

fn format_music_ytdlp_cookie_fallback_failure(
    without_err: &str,
    with_err: &str,
    browser: Option<&str>,
) -> String {
    if ytdlp_stderr_is_cookie_export_failure(with_err) {
        format!(
            "{}\nWithout cookies: {}",
            humanize_ytdlp_cookie_error(with_err, browser),
            humanize_music_ytdlp_error(without_err)
        )
    } else {
        format!(
            "yt-dlp failed without cookies ({}); with cookies ({})",
            humanize_music_ytdlp_error(without_err),
            humanize_music_ytdlp_error(with_err)
        )
    }
}

fn format_download_job_failure(
    error_log: &str,
    code: Option<i32>,
    browser_cookies: Option<&str>,
) -> String {
    if ytdlp_stderr_is_cookie_export_failure(error_log) {
        let humanized = humanize_ytdlp_cookie_error(error_log, browser_cookies);
        let trimmed = error_log.trim();
        if trimmed.is_empty() || humanized.contains(trimmed) {
            return humanized;
        }
        return format!("{}\n\nFull yt-dlp log:\n{}", humanized, trimmed);
    }
    let trimmed = error_log.trim();
    if trimmed.is_empty() {
        format!("Download failed (exit code {:?})", code)
    } else {
        format!("Download failed (code {:?}): {}", code, trimmed)
    }
}

fn get_video_info_simulate_failure_message(err: &str) -> String {
    let trimmed = err.trim();
    if trimmed.is_empty() {
        "yt-dlp metadata simulate failed".to_string()
    } else {
        trimmed.to_string()
    }
}

async fn yt_dlp_single_json_simulate(
    app: &AppHandle,
    url: &str,
    cookie_opts: Option<&DownloadOptions>,
    format: Option<&str>,
) -> Result<serde_json::Value, String> {
    let mut args: Vec<String> = vec!["-J".into(), "-s".into()];
    if let Some(f) = ytdlp_simulate_format_eff(cookie_opts, format) {
        args.push("-f".into());
        args.push(f);
    }
    if let Some(opts) = cookie_opts {
        ytdlp_push_cookie_cli_args(
            app,
            &mut args,
            opts.cookie_file.as_deref(),
            opts.browser_cookies.as_deref(),
        )?;
    }
    args.push(url.to_string());
    ytdlp_push_politeness_args(&mut args);

    ytdlp_subprocess_rate_gate_wait().await?;
    let output = ytdlp_shell_command(app)?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp (-J simulate): {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        ytdlp_register_rate_limit_from_stderr(&err_msg).await;
        crate::rf_log!("download.ytdlp", log::Level::Error, "yt-dlp failed: {}", err_msg);
        return Err(err_msg);
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("Failed to parse yt-dlp JSON: {}", e))
}

/// Simulate metadata without cookies first; retry once with configured cookies on any failure.
async fn yt_dlp_single_json_simulate_with_cookie_fallback(
    app: &AppHandle,
    url: &str,
    cookie_fallback: Option<&DownloadOptions>,
    format: Option<&str>,
) -> Result<(serde_json::Value, bool), String> {
    match yt_dlp_single_json_simulate(app, url, None, format).await {
        Ok(json) => Ok((json, false)),
        Err(without_err) => {
            let Some(fallback) = cookie_fallback else {
                return Err(get_video_info_simulate_failure_message(&without_err));
            };
            if !ytdlp_has_configured_cookie_source(
                fallback.browser_cookies.as_deref(),
                fallback.cookie_file.as_deref(),
            ) {
                return Err(get_video_info_simulate_failure_message(&without_err));
            }
            let label = fallback
                .browser_cookies
                .as_deref()
                .map(cookie_browser_label)
                .unwrap_or("cookie file");
            crate::rf_log!(
                "download.ytdlp",
                log::Level::Warn,
                "yt-dlp metadata simulate failed without cookies; retrying with {}: {}",
                label,
                without_err.lines().next().unwrap_or(&without_err)
            );
            let (resolved, _cookie_guard) =
                match ytdlp_download_options_with_ruforge_export(app, fallback).await {
                    Ok(pair) => pair,
                    Err(export_err) => {
                        return Err(format!(
                            "{export_err}\n\nWithout cookies: {}",
                            get_video_info_simulate_failure_message(&without_err)
                        ));
                    }
                };
            match yt_dlp_single_json_simulate(app, url, Some(&resolved), format).await {
                Ok(json) => Ok((json, true)),
                Err(with_err) => Err(format_ytdlp_cookie_fallback_failure(
                    &without_err,
                    &with_err,
                    fallback.browser_cookies.as_deref(),
                )),
            }
        }
    }
}

#[derive(Default, Clone)]
struct PlaylistDownloadProgressExtras {
    current_index: Option<u32>,
    total_items: Option<u32>,
    current_item_title: Option<String>,
}

fn parse_ytdlp_playlist_download_line(line: &str) -> Option<(u32, u32, Option<String>)> {
    if !line.contains("[download]") {
        return None;
    }
    let after = line
        .find("Downloading ")
        .map(|k| line[k + "Downloading ".len()..].trim_start())?;
    let (head, tail_raw) = match after.split_once(" - ") {
        Some((h, t)) => (h.trim(), Some(t.trim())),
        None => (after.trim(), None),
    };

    let head = ["video ", "item ", "entries ", "videos "]
        .into_iter()
        .find_map(|p| head.strip_prefix(p))?;

    let sep = head.split_once(" of ")?;
    let current: u32 = sep.0.trim().parse().ok()?;
    let total: u32 = sep.1.split_whitespace().next()?.trim().parse().ok()?;
    if total == 0 || current == 0 || current > total {
        return None;
    }
    let idx0 = current - 1;
    let tail_title = tail_raw.filter(|t| !t.is_empty()).map(|t| t.to_string());
    Some((idx0, total, tail_title))
}

fn ytdlp_iec_unit_multiplier(unit: &str) -> Option<f64> {
    match unit.to_uppercase().as_str() {
        "" => Some(1.0),
        "B" => Some(1.0),
        "K" | "KB" | "KIB" => Some(1024.0),
        "M" | "MB" | "MIB" => Some((1024_i64 * 1024) as f64),
        "G" | "GB" | "GIB" => Some((1024_i64 * 1024 * 1024) as f64),
        "T" | "TB" | "TIB" => Some((1024_i64 * 1024 * 1024 * 1024) as f64),
        _ => None,
    }
}

/// Parse a yt-dlp aggregate size token like `93.54MiB` or `1.2GiB` into whole bytes.
fn parse_ytdlp_size_token_to_bytes(tok: &str) -> Option<u64> {
    let mut t = tok.trim().trim_start_matches('~');
    t = t.trim_end_matches(|c: char| c == ')' || c == ']' || c == ',');
    if t.is_empty() {
        return None;
    }
    let split_idx = t
        .char_indices()
        .find(|(_, c)| !c.is_ascii_digit() && *c != '.')
        .map(|(i, _)| i)
        .unwrap_or(t.len());
    let (num_raw, unit_raw) = t.split_at(split_idx);
    let num: f64 = num_raw.parse().ok()?;
    if !num.is_finite() || num < 0.0 {
        return None;
    }
    let unit_stripped = unit_raw.trim();
    let mult = ytdlp_iec_unit_multiplier(unit_stripped)?;
    let bytes_f = (num * mult).round();
    if bytes_f <= 0.0 || bytes_f > u64::MAX as f64 {
        return None;
    }
    Some(bytes_f as u64)
}

/// From a line like `[download]  45.6% of   93.54MiB at ...`
fn parse_ytdlp_percent_of_total_bytes(line: &str, percentage: f32) -> Option<(u64, u64)> {
    let needle = "% of ";
    let pos = line.find(needle)?;
    let rest = line[pos + needle.len()..].trim_start();
    let tok = rest.split_whitespace().next()?;
    let total = parse_ytdlp_size_token_to_bytes(tok)?;
    let pct = f64::from(percentage);
    if !pct.is_finite() {
        return None;
    }
    let clamped = pct.clamp(0.0, 100.0);
    let downloaded = ((clamped / 100.0) * total as f64).round();
    if downloaded < 0.0 || downloaded > u64::MAX as f64 {
        return None;
    }
    Some((downloaded as u64, total))
}

/// yt-dlp postprocessor lines on stdout after the final `[download] … 100%` (not stderr).
/// Verified with bundled yt-dlp 2026.03.17 on Windows (`Me at the zoo`, audio `-x` / HLS worst):
///   `[ExtractAudio] Destination: C:\...\Me at the zoo.m4a`
///   `[FixupM3u8] Fixing MPEG-TS in MP4 container of "C:\...\Me at the zoo.mp4"`
/// `[Merger]` / `[ffmpeg]` follow yt-dlp `PP_NAME` for mux paths (not observed on that probe).
fn ytdlp_line_is_post_process(line: &str) -> bool {
    const MARKERS: &[&str] = &[
        "[ExtractAudio]",
        "[Merger]",
        "[ffmpeg]",
        "[FixupM3u8]",
        "[FixupM4a]",
        "[FixupStretched]",
        "[FixupTimestamp]",
        "[FixupDuration]",
        "[FixupDuplicateMoov]",
        "[VideoConvertor]",
        "[VideoRemuxer]",
        "[EmbedSubtitle]",
        "[Metadata]",
        "[SubtitlesConvertor]",
        "[Concat]",
    ];
    MARKERS.iter().any(|m| line.contains(m))
}

fn default_audio_format() -> String {
    "m4a".to_string()
}

fn default_auto_scrub_previews() -> bool {
    true
}

/// Scrubber sprites are for video files only (not audio-only library entries).
fn is_video_scrub_ext(ext: &str) -> bool {
    matches!(ext, "mp4" | "mkv" | "webm")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub format: String,
    pub output_dir: String,
    pub filename_template: String,
    pub browser_cookies: Option<String>,
    pub cookie_file: Option<String>,
    /// yt-dlp `--sub-langs` (e.g. `en.*`). Empty skips subtitle download flags.
    #[serde(default)]
    pub sub_langs: String,
    /// When true, download audio only (`-x` / `--extract-audio`).
    #[serde(default)]
    pub audio_only: bool,
    /// yt-dlp `--audio-format` (e.g. m4a, mp3, opus).
    #[serde(default = "default_audio_format")]
    pub audio_format: String,
    /// When true, build ffmpeg scrubber sprite sheets after a successful video download.
    #[serde(default = "default_auto_scrub_previews")]
    pub auto_scrub_previews: bool,
    /// Sanitized subfolder under `output_dir` for per-video playlist batch jobs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist_output_folder: Option<String>,
    /// 1-based index in the playlist for filename ordering (`01 - title.ext`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist_index: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    job_id: String,
    percentage: f32,
    speed: String,
    eta: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_items: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_item_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    downloaded_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_bytes: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadJobFinishedPayload {
    job_id: String,
    url: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn effective_video_format_for_info_probe(format: Option<&str>) -> String {
    match format.filter(|s| !s.is_empty()) {
        Some(s) if !s.contains("bestaudio") => s.to_string(),
        _ => "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best".to_string(),
    }
}

fn video_info_cookie_probe(
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Option<DownloadOptions> {
    let browser = browser_cookies
        .filter(|s| !s.is_empty() && s != "chrome");
    let file = cookie_file.filter(|s| !s.is_empty());
    if browser.is_none() && file.is_none() {
        return None;
    }
    Some(DownloadOptions {
        format: String::new(),
        output_dir: String::new(),
        filename_template: String::new(),
        browser_cookies: browser,
        cookie_file: file,
        sub_langs: String::new(),
        audio_only: false,
        audio_format: default_audio_format(),
        auto_scrub_previews: true,
        playlist_output_folder: None,
        playlist_index: None,
    })
}

#[tauri::command]
pub async fn get_video_info(
    app: AppHandle,
    url: String,
    format: Option<String>,
    audio_only: Option<bool>,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<VideoInfo, String> {
    // Prefer m4a source to avoid transcoding; pure audio streams only (no /best video fallback).
    const AUDIO_SIMULATE_FMT: &str = "bestaudio[ext=m4a]/bestaudio";
    let audio_primary = audio_only.unwrap_or(false);
    let video_fmt = effective_video_format_for_info_probe(format.as_deref());
    let video_fmt_ref = video_fmt.as_str();
    let cookie_fallback = video_info_cookie_probe(browser_cookies, cookie_file);
    let cookie_ref = cookie_fallback.as_ref();

    // Run sequentially — parallel simulates double the request rate on the same cookies.
    let json_video_res =
        yt_dlp_single_json_simulate_with_cookie_fallback(&app, &url, cookie_ref, Some(video_fmt_ref))
            .await
            .map(|(json, _)| json);
    let json_audio_res =
        yt_dlp_single_json_simulate_with_cookie_fallback(
            &app,
            &url,
            cookie_ref,
            Some(AUDIO_SIMULATE_FMT),
        )
        .await
        .map(|(json, _)| json);

    let json_video = json_video_res.as_ref().ok();
    let json_audio = json_audio_res.as_ref().ok();

    if json_video.is_none() && json_audio.is_none() {
        return Err(match (&json_video_res, &json_audio_res) {
            (Err(v), Err(a)) => format!(
                "Metadata fetch failed (video: {}; audio: {})",
                get_video_info_simulate_failure_message(v),
                get_video_info_simulate_failure_message(a),
            ),
            (Err(e), Ok(_)) => get_video_info_simulate_failure_message(e),
            (Ok(_), Err(e)) => get_video_info_simulate_failure_message(e),
            (Ok(_), Ok(_)) => "Metadata fetch failed".to_string(),
        });
    }

    if let Err(e) = &json_video_res {
        if json_audio.is_some() {
            crate::rf_log!(
                "download.ytdlp",
                log::Level::Warn,
                "get_video_info video simulate failed (audio ok): {}",
                e
            );
        }
    }
    if let Err(e) = &json_audio_res {
        if json_video.is_some() {
            crate::rf_log!(
                "download.ytdlp",
                log::Level::Warn,
                "get_video_info audio simulate failed (video ok): {}",
                e
            );
        }
    }

    let base_json = json_video
        .or(json_audio)
        .expect("at least one simulate succeeded");
    let (_, file_size_bytes_video) = json_video
        .map(|j| dual_file_sizes_from_ytdlp_json(j, Some(video_fmt_ref), false))
        .unwrap_or((None, None));
    let (file_size_bytes_audio, _) = json_audio
        .map(|j| dual_file_sizes_from_ytdlp_json(j, None, true))
        .unwrap_or((None, None));

    let mut info = video_info_from_ytdlp_single_json(base_json.clone());
    info.file_size_bytes_audio = file_size_bytes_audio;
    info.file_size_bytes_video = file_size_bytes_video;
    info.file_size_bytes = if audio_primary {
        file_size_bytes_audio.or(file_size_bytes_video)
    } else {
        file_size_bytes_video.or(file_size_bytes_audio)
    }
    .or(info.file_size_bytes);
    Ok(info)
}

fn push_ytdlp_download_cookie_args(
    app: &AppHandle,
    args: &mut Vec<String>,
    options: &DownloadOptions,
) -> Result<(), String> {
    ytdlp_push_cookie_cli_args(
        app,
        args,
        options.cookie_file.as_deref(),
        options.browser_cookies.as_deref(),
    )
}

fn yt_dlp_effective_filename_template(
    metadata_probe: &serde_json::Value,
    user_template: &str,
    options: &DownloadOptions,
) -> String {
    // Derive the item stem (filename without extension) from the user template.
    // Handles the two canonical templates: "%(title)s.%(ext)s" and "%(title)s [%(id)s].%(ext)s".
    let stem = user_template
        .strip_suffix(".%(ext)s")
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("%(title)s");

    // Explicit playlist batch job (per-item, frontend-driven).
    if let Some(folder) = options
        .playlist_output_folder
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        let idx = options.playlist_index.unwrap_or(0);
        let item_name = if idx > 0 {
            format!("{:02} - {}", idx, stem)
        } else {
            stem.to_string()
        };
        // Playlists/{folder}/{NN - stem}/{NN - stem}.%(ext)s
        return format!("Playlists/{}/{}/{}.%(ext)s", folder, item_name, item_name);
    }

    // Auto-detected playlist URL.
    if ytdlp_usable_playlist_entries(metadata_probe).is_some() {
        let raw = metadata_probe
            .get("playlist_title")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| {
                metadata_probe
                    .get("title")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or("playlist");
        let folder = sanitize_playlist_folder_name(raw);
        // Playlists/{folder}/%(title)s/%(title)s.%(ext)s
        return format!("Playlists/{}/{}/{}.%(ext)s", folder, stem, stem);
    }

    // Single item: route to bucket based on audio_only flag.
    let bucket = if options.audio_only { "Music" } else { "Videos" };
    // {Bucket}/%(title)s/%(title)s.%(ext)s
    format!("{}/{}/{}.%(ext)s", bucket, stem, stem)
}

fn normalize_ytdlp_audio_format(raw: &str) -> String {
    match raw.trim().to_lowercase().as_str() {
        "mp3" => "mp3".into(),
        "opus" => "opus".into(),
        _ => "m4a".into(),
    }
}

fn build_ytdlp_download_args(
    app: &AppHandle,
    url: &str,
    options: &DownloadOptions,
    filename_template_eff: &str,
    resume: bool,
) -> Result<Vec<String>, String> {
    let mut args = vec![
        "-P".to_string(),
        options.output_dir.clone(),
        "-o".to_string(),
        filename_template_eff.to_string(),
        "--windows-filenames".to_string(),
        "--no-restrict-filenames".to_string(),
        "--trim-filenames".to_string(),
        "200".to_string(),
        "--newline".to_string(),
        "--write-info-json".to_string(),
        "--write-thumbnail".to_string(),
        "--convert-thumbnails".to_string(),
        "jpg".to_string(),
    ];

    if options.audio_only {
        let audio_fmt = normalize_ytdlp_audio_format(&options.audio_format);
        // Prefer m4a source so yt-dlp can copy without re-encoding; fall back to any
        // pure-audio stream. No /best fallback: that downloads the full video then extracts
        // audio, which up-encodes with --audio-quality 0 and produces a file matching the
        // video size. No --audio-quality 0 for the same reason.
        args.push("-f".to_string());
        args.push("bestaudio[ext=m4a]/bestaudio".to_string());
        args.push("-x".to_string());
        args.push("--audio-format".to_string());
        args.push(audio_fmt);
        args.push("--no-keep-video".to_string());
    } else {
        args.push("-f".to_string());
        args.push(options.format.clone());
    }

    if resume {
        args.push("--continue".to_string());
    }

    let sub_langs = options.sub_langs.trim();
    crate::rf_log!(
        "download.jobs",
        log::Level::Info,
        "download audio_only={} sub_langs={:?} resume={}",
        options.audio_only,
        sub_langs,
        resume
    );
    if !options.audio_only && !sub_langs.is_empty() {
        args.push("--write-subs".to_string());
        args.push("--write-auto-subs".to_string());
        args.push("--sub-langs".to_string());
        args.push(sub_langs.to_string());
        args.push("--convert-subs".to_string());
        args.push("vtt".to_string());
    }

    push_ytdlp_download_cookie_args(app, &mut args, options)?;
    args.push(url.to_string());
    Ok(args)
}

fn collect_recent_video_paths(root: &Path, since: SystemTime) -> Vec<PathBuf> {
    const SLACK_SECS: u64 = 15;
    let cutoff = since
        .checked_sub(std::time::Duration::from_secs(SLACK_SECS))
        .unwrap_or(since);

    let mut out: Vec<PathBuf> = Vec::new();

    fn walk(
        dir: &Path,
        depth: u32,
        max_depth: u32,
        cutoff: SystemTime,
        out: &mut Vec<PathBuf>,
    ) {
        if depth > max_depth {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for ent in rd.flatten() {
            let p = ent.path();
            if p.is_dir() {
                walk(&p, depth + 1, max_depth, cutoff, out);
                continue;
            }
            if !p.is_file() {
                continue;
            }
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !is_media_ext(&ext) || !is_video_scrub_ext(&ext) {
                continue;
            }
            let recent = std::fs::metadata(&p)
                .and_then(|m| m.modified())
                .map(|t| t >= cutoff)
                .unwrap_or(true);
            if recent {
                out.push(p);
            }
        }
    }

    if root.is_dir() {
        walk(root, 0, 8, cutoff, &mut out);
    }
    out.sort();
    out
}

fn spawn_scrub_previews_for_recent_videos(
    app: AppHandle,
    listing_root: PathBuf,
    since: SystemTime,
) {
    tokio::spawn(async move {
        let paths = tokio::task::spawn_blocking(move || {
            collect_recent_video_paths(&listing_root, since)
        })
        .await
        .unwrap_or_default();
        for path in paths {
            let path_str = path.to_string_lossy().to_string();
            let _ = extract_frames(app.clone(), path_str, Some(true)).await;
        }
    });
}

/// Cap stderr retained per job by dropping oldest lines from the front (UTF-8 safe).
const DOWNLOAD_JOB_YTDLP_STDERR_LOG_MAX_BYTES: usize = 256 * 1024;

fn ceil_utf8_char_boundary(s: &str, byte_idx: usize) -> usize {
    let mut i = byte_idx.min(s.len());
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

fn append_ytdlp_stderr_line_bounded(log: &mut String, line_bytes: &[u8], max_bytes: usize) {
    let mut line = String::from_utf8_lossy(line_bytes).into_owned();
    let mut additional = line.len().saturating_add(1);

    if additional > max_bytes {
        let keep = max_bytes.saturating_sub(1);
        if line.len() > keep {
            let drop = line.len() - keep;
            let cut = ceil_utf8_char_boundary(&line, drop);
            line.drain(..cut);
        }
        additional = line.len().saturating_add(1);
    }

    let target_prefix_len = max_bytes.saturating_sub(additional);
    if log.len() > target_prefix_len {
        let drop = log.len() - target_prefix_len;
        let cut = ceil_utf8_char_boundary(log, drop);
        log.drain(..cut);
    }

    log.push_str(&line);
    log.push('\n');
}

#[tauri::command]
pub async fn start_download_job(
    app: AppHandle,
    manager: State<'_, DownloadJobManager>,
    job_id: String,
    url: String,
    mut options: DownloadOptions,
    resume: bool,
) -> Result<(), String> {
    manager.try_claim_active_job(&job_id)?;

    let cookie_fallback = if ytdlp_has_configured_cookie_source(
        options.browser_cookies.as_deref(),
        options.cookie_file.as_deref(),
    ) {
        Some(options.clone())
    } else {
        None
    };

    let (probe, used_cookies) = match yt_dlp_single_json_simulate_with_cookie_fallback(
        &app,
        &url,
        cookie_fallback.as_ref(),
        None,
    )
    .await
    {
        Ok(pair) => pair,
        Err(e) => {
            manager.release_claim_if_pending(&job_id)?;
            return Err(e);
        }
    };
    let (download_options, cookie_export_guard) = if used_cookies {
        if options.browser_cookies.as_deref() == Some("ruforge") {
            match ytdlp_download_options_with_ruforge_export(&app, &options).await {
                Ok(pair) => pair,
                Err(e) => {
                    manager.release_claim_if_pending(&job_id)?;
                    return Err(e);
                }
            }
        } else {
            (options.clone(), None)
        }
    } else {
        (download_options_without_cookies(&options), None)
    };
    let filename_template_eff =
        yt_dlp_effective_filename_template(&probe, &options.filename_template, &download_options);

    let output_dir = options.output_dir.trim().to_string();
    if output_dir.is_empty() {
        manager.release_claim_if_pending(&job_id)?;
        return Err("Failed to create output directory: path is empty".into());
    }
    options.output_dir = output_dir.clone();
    if let Err(e) = std::fs::create_dir_all(&output_dir) {
        manager.release_claim_if_pending(&job_id)?;
        return Err(format!(
            "Failed to create output directory \"{}\": {}",
            output_dir, e
        ));
    }

    let args = match build_ytdlp_download_args(
        &app,
        &url,
        &download_options,
        &filename_template_eff,
        resume,
    ) {
        Ok(a) => a,
        Err(e) => {
            manager.release_claim_if_pending(&job_id)?;
            return Err(e);
        }
    };

    let shell = match ytdlp_shell_command(&app) {
        Ok(c) => c,
        Err(e) => {
            manager.release_claim_if_pending(&job_id)?;
            return Err(e);
        }
    };

    let (mut rx, child) = match shell.args(args).spawn() {
        Ok(pair) => pair,
        Err(e) => {
            manager.release_claim_if_pending(&job_id)?;
            return Err(format!("Failed to start yt-dlp download: {}", e));
        }
    };

    match manager.place_running_child(&job_id, child) {
        Ok(Ok(())) => {}
        Ok(Err(child)) => {
            kill_ytdlp_tree(child);
            return Err("Download job was cancelled before yt-dlp could start.".into());
        }
        Err(lock_err) => return Err(lock_err),
    }

    let manager_bg = manager.inner().clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        let _cookie_export_guard = cookie_export_guard;

        let download_started_at = SystemTime::now();
        let diag_root = post_download_diag_listing_root(
            Path::new(&options.output_dir),
            &filename_template_eff,
        );
        let auto_scrub = options.auto_scrub_previews && !options.audio_only;
        let browser_cookies_for_errors = options.browser_cookies.clone();
        let scrub_spawned = Arc::new(AtomicBool::new(false));
        let mut progress_extras = PlaylistDownloadProgressExtras::default();
        let mut error_log = String::new();
        let mut download_reached_full = false;
        let mut last_percentage: f32 = 0.0;
        let mut last_speed = String::new();
        let mut last_eta = String::new();
        let mut last_downloaded_bytes: Option<u64> = None;
        let mut last_total_bytes: Option<u64> = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    if line.contains("[download]") {
                        if let Some((idx, total, tit)) =
                            parse_ytdlp_playlist_download_line(&line)
                        {
                            progress_extras.current_index = Some(idx);
                            progress_extras.total_items = Some(total);
                            if tit.is_some() {
                                progress_extras.current_item_title = tit;
                            }
                        }
                    }

                    if line.contains("[download]") && line.contains('%') {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if parts.len() >= 2 {
                            let percent_str = parts[1].trim_end_matches('%');
                            if let Ok(percentage) = percent_str.parse::<f32>() {
                                let mut speed = "";
                                let mut eta = "";

                                for (i, part) in parts.iter().enumerate() {
                                    if part.contains("/s") || part.contains("B/s") {
                                        speed = part;
                                    }
                                    if part.contains(':') && i > 4 {
                                        eta = part;
                                    }
                                }

                                let sizes = parse_ytdlp_percent_of_total_bytes(&line, percentage);
                                let (downloaded_bytes, total_bytes) = match sizes {
                                    Some((d, t)) => (Some(d), Some(t)),
                                    None => (None, None),
                                };

                                // Latch: yt-dlp can emit another [download] % line below 100 after
                                // one stream hit 100% (HLS fragments, playlist items). Do not clear.
                                if percentage >= 100.0 {
                                    download_reached_full = true;
                                }
                                last_percentage = percentage;
                                last_speed = speed.to_string();
                                last_eta = eta.to_string();
                                last_downloaded_bytes = downloaded_bytes;
                                last_total_bytes = total_bytes;

                                let _ = app.emit(
                                    "download-progress",
                                    ProgressPayload {
                                        job_id: job_id.clone(),
                                        percentage,
                                        speed: last_speed.clone(),
                                        eta: last_eta.clone(),
                                        status: "downloading".to_string(),
                                        current_index: progress_extras.current_index,
                                        total_items: progress_extras.total_items,
                                        current_item_title: progress_extras
                                            .current_item_title
                                            .clone(),
                                        downloaded_bytes,
                                        total_bytes,
                                    },
                                );
                            }
                        }
                    } else if download_reached_full && ytdlp_line_is_post_process(&line) {
                        let pct = last_percentage.max(100.0);
                        let _ = app.emit(
                            "download-progress",
                            ProgressPayload {
                                job_id: job_id.clone(),
                                percentage: pct,
                                speed: last_speed.clone(),
                                eta: last_eta.clone(),
                                status: "processing".to_string(),
                                current_index: progress_extras.current_index,
                                total_items: progress_extras.total_items,
                                current_item_title: progress_extras.current_item_title.clone(),
                                downloaded_bytes: last_downloaded_bytes,
                                total_bytes: last_total_bytes,
                            },
                        );
                        if auto_scrub && !scrub_spawned.swap(true, Ordering::SeqCst) {
                            spawn_scrub_previews_for_recent_videos(
                                app.clone(),
                                diag_root.clone(),
                                download_started_at,
                            );
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    append_ytdlp_stderr_line_bounded(
                        &mut error_log,
                        &line_bytes,
                        DOWNLOAD_JOB_YTDLP_STDERR_LOG_MAX_BYTES,
                    );
                }
                CommandEvent::Terminated(payload) => {
                    if let Err(e) = manager_bg.remove_active(&job_id) {
                        crate::rf_log!("download.jobs", log::Level::Error, "job {} remove_active: {}", job_id, e);
                    }

                    let paused = match manager_bg.take_paused(&job_id) {
                        Ok(b) => b,
                        Err(e) => {
                            crate::rf_log!("download.jobs", log::Level::Error, "job {} take_paused: {}", job_id, e);
                            false
                        }
                    };
                    if paused {
                        let _ = app.emit("download-job-paused", job_id.clone());
                        return;
                    }

                    if payload.code == Some(0) {
                        let diag_root_log = diag_root.clone();
                        let started_log = download_started_at;
                        let cleanup_root = diag_root.clone();
                        let _ = tokio::task::spawn_blocking(move || {
                            log_post_download_files_written(&diag_root_log, started_log);
                            cleanup_orphan_downloads_under(&cleanup_root, started_log);
                        });
                        if auto_scrub {
                            spawn_scrub_previews_for_recent_videos(
                                app.clone(),
                                diag_root.clone(),
                                download_started_at,
                            );
                        }
                        if options.audio_only {
                            let enrich_root = diag_root.clone();
                            let enrich_since = download_started_at;
                            tauri::async_runtime::spawn(async move {
                                for audio_path in find_recent_audio_files(&enrich_root, enrich_since) {
                                    enrich_music_meta_path(&audio_path, false).await;
                                }
                            });
                        }
                        let _ = app.emit(
                            "download-job-finished",
                            DownloadJobFinishedPayload {
                                job_id: job_id.clone(),
                                url: url.clone(),
                                success: true,
                                error: None,
                            },
                        );
                        return;
                    }

                    let err = format_download_job_failure(
                        &error_log,
                        payload.code,
                        browser_cookies_for_errors.as_deref(),
                    );
                    crate::rf_log!("download.jobs", log::Level::Error, "job {} failed: {}", job_id, err);
                    let _ = app.emit(
                        "download-job-finished",
                        DownloadJobFinishedPayload {
                            job_id: job_id.clone(),
                            url: url.clone(),
                            success: false,
                            error: Some(err),
                        },
                    );
                    return;
                }
                _ => {}
            }
        }

        if let Err(e) = manager_bg.remove_active(&job_id) {
            crate::rf_log!("download.jobs", log::Level::Error, "job {} remove_active (channel end): {}", job_id, e);
        }
        let paused = match manager_bg.take_paused(&job_id) {
            Ok(b) => b,
            Err(e) => {
                crate::rf_log!("download.jobs", log::Level::Error, "job {} take_paused (channel end): {}", job_id, e);
                false
            }
        };
        if !paused {
            let err = "Download process ended unexpectedly".to_string();
            crate::rf_log!("download.jobs", log::Level::Error, "job {}: {}", job_id, err);
            let _ = app.emit(
                "download-job-finished",
                DownloadJobFinishedPayload {
                    job_id,
                    url,
                    success: false,
                    error: Some(err),
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn pause_download_job(
    manager: State<'_, DownloadJobManager>,
    job_id: String,
) -> Result<(), String> {
    manager.mark_paused(&job_id)?;
    if let Some(child) = manager.remove_active(&job_id)? {
        kill_ytdlp_tree(child);
        return Ok(());
    }
    Ok(())
}

/// After a webview reload the UI may show "paused" while yt-dlp still runs in-process.
#[tauri::command]
pub async fn stop_all_active_download_jobs(
    manager: State<'_, DownloadJobManager>,
) -> Result<u32, String> {
    manager.stop_all_active_downloads()
}

// ---------- Music browse API ----------

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPlaylistInfo {
    pub id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub track_count: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrowseResult {
    pub title: String,
    pub thumbnail: Option<String>,
    pub playlists: Vec<MusicPlaylistInfo>,
    /// When set to `channel_tabs_only`, yt-dlp only returned Videos/Shorts/Live-style tabs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub browse_kind: Option<String>,
}

/// Serialize concurrent music browse / playlist yt-dlp calls (panel + bottom bar).
fn music_ytdlp_mutex() -> &'static tokio::sync::Mutex<()> {
    static MUTEX: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    MUTEX.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicTrackInfo {
    pub id: String,
    pub title: String,
    pub url: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicPlaylistPage {
    pub items: Vec<MusicTrackInfo>,
    pub has_more: bool,
    pub total: Option<u32>,
    pub title: Option<String>,
}

fn best_thumbnail_url(entry: &serde_json::Value) -> Option<String> {
    if let Some(s) = entry.get("thumbnail").and_then(|v| v.as_str()) {
        if let Some(u) = normalize_thumbnail_url(s) {
            return Some(u);
        }
    }
    if let Some(arr) = entry.get("thumbnails").and_then(|v| v.as_array()) {
        if let Some(u) = thumbnail_from_thumbnails_array(arr) {
            return Some(u);
        }
    }
    if let Some(s) = entry.get("playlist_thumbnail").and_then(|v| v.as_str()) {
        if let Some(u) = normalize_thumbnail_url(s) {
            return Some(u);
        }
    }
    for key in ["channel_thumbnail", "uploader_thumbnail", "avatar"] {
        if let Some(s) = entry.get(key).and_then(|v| v.as_str()) {
            if let Some(u) = normalize_thumbnail_url(s) {
                return Some(u);
            }
        }
    }
    for key in ["channel_thumbnails", "avatar_thumbnails"] {
        if let Some(arr) = entry.get(key).and_then(|v| v.as_array()) {
            if let Some(u) = thumbnail_from_thumbnails_array(arr) {
                return Some(u);
            }
        }
    }
    None
}

fn is_youtube_channel_id(id: &str) -> bool {
    let id = id.trim();
    id.len() == 24 && id.starts_with("UC")
}

fn is_youtube_playlist_list_id(id: &str) -> bool {
    let id = id.trim();
    id.starts_with("PL")
        || id.starts_with("OL")
        || id.starts_with("VL")
        || id.starts_with("RD")
        || id.starts_with("UU")
        || id.starts_with("LL")
        || id.starts_with("FL")
        || id.starts_with("LP")
}

/// YouTube Music browse entity ids (albums, artists, shelves) — not valid as `watch?v=` ids.
fn is_youtube_music_browse_id(id: &str) -> bool {
    let id = id.trim();
    if id.len() < 8 {
        return false;
    }
    id.starts_with("MPAD")
        || id.starts_with("MPRE")
        || id.starts_with("MPLY")
        || id.starts_with("MPLA")
        || id.starts_with("MPED")
        || (id.starts_with("MP")
            && id.len() >= 10
            && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
}

fn is_music_album_browse_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    if !lower.contains("music.youtube.com/browse/") {
        return false;
    }
    lower
        .split("/browse/")
        .nth(1)
        .and_then(|rest| rest.split(&['?', '#'][..]).next())
        .map(is_youtube_music_browse_id)
        .unwrap_or(false)
}

fn is_channel_tab_title(title: &str) -> bool {
    let t = title.trim().to_ascii_lowercase();
    t == "videos"
        || t == "uploads"
        || t == "shorts"
        || t == "live"
        || t == "streams"
        || t == "popular videos"
        || t.ends_with(" - videos")
}

fn entry_url_looks_like_channel_tab(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    u.contains("/shorts")
        || u.contains("/streams")
        || (u.contains("/live") && !u.contains("music.youtube.com/browse/"))
}

fn humanize_music_ytdlp_error(stderr: &str) -> String {
    if ytdlp_stderr_is_rate_limited(stderr) {
        return "YouTube rate-limited this session. Wait a few minutes, turn off Auto-save in Explore, \
                lower concurrent downloads, and add a batch start delay in Settings."
            .to_string();
    }
    if stderr.contains("Failed to resolve album to playlist") {
        return "This album page could not be resolved to a track list. Open the album in Explore, \
                wait for it to finish loading, then try Pick tracks again — or update yt-dlp in Settings."
            .to_string();
    }
    if stderr.contains("timed out") || stderr.contains("Timeout") {
        return "yt-dlp timed out. Try again, or open the Albums/Browse tab before Pick tracks."
            .to_string();
    }
    format!("yt-dlp error: {}", stderr.trim())
}

/// Channel tab suffix when yt-dlp only provides a UC id (Videos / Shorts / Live / Streams).
fn channel_tab_path_from_title(title: &str) -> &'static str {
    let t = title.to_ascii_lowercase();
    if t.contains("short") {
        "shorts"
    } else if t.contains("live") {
        "live"
    } else if t.contains("stream") {
        "streams"
    } else {
        "videos"
    }
}

/// Never synthesize `playlist?list=UC…` — channel ids are not playlist list ids.
fn resolve_music_entry_url(entry: &serde_json::Value, id: &str) -> String {
    if let Some(u) = entry["url"]
        .as_str()
        .or_else(|| entry["webpage_url"].as_str())
    {
        let trimmed = u.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let id = id.trim();
    if is_youtube_playlist_list_id(id) {
        return format!("https://music.youtube.com/playlist?list={}", id);
    }
    if is_youtube_channel_id(id) {
        let title = entry["title"].as_str().unwrap_or("");
        let tab = channel_tab_path_from_title(title);
        return format!("https://www.youtube.com/channel/{}/{}", id, tab);
    }
    if is_youtube_music_browse_id(id) {
        return format!("https://music.youtube.com/browse/{}", id);
    }
    if !id.is_empty() && entry["duration"].is_number() {
        return format!("https://www.youtube.com/watch?v={}", id);
    }
    if !id.is_empty() && id.len() == 11 {
        return format!("https://www.youtube.com/watch?v={}", id);
    }
    if !id.is_empty() {
        return format!("https://music.youtube.com/browse/{}", id);
    }
    String::new()
}

fn should_include_music_browse_entry(entry: &serde_json::Value, entry_url: &str) -> bool {
    let raw_id = entry["id"].as_str().unwrap_or("").trim();
    let title = entry["title"].as_str().unwrap_or("").trim();

    if title.is_empty() && raw_id.is_empty() && entry_url.is_empty() {
        return false;
    }

    if is_channel_tab_title(title) {
        return false;
    }
    if raw_id.starts_with("UU") {
        return false;
    }
    if entry_url_looks_like_channel_tab(entry_url) {
        return false;
    }

    if let Some(count) = entry["playlist_count"].as_u64() {
        if count > 80
            && !is_youtube_music_browse_id(raw_id)
            && !(is_youtube_playlist_list_id(raw_id) && raw_id.starts_with("OLAK"))
        {
            return false;
        }
    }

    if is_youtube_music_browse_id(raw_id) {
        return true;
    }
    if is_youtube_playlist_list_id(raw_id) && !raw_id.starts_with("UU") {
        return true;
    }

    let entry_type = entry["_type"].as_str().unwrap_or("");
    if entry_type == "video" || entry_type == "url" {
        return false;
    }
    if entry_type == "channel" && is_youtube_channel_id(raw_id) {
        return false;
    }
    entry_type == "playlist" || entry_type == "url_transparent"
}

fn music_browse_entry_to_playlist(
    entry: &serde_json::Value,
    parent_thumb: &Option<String>,
) -> Option<MusicPlaylistInfo> {
    let raw_id = entry["id"].as_str().unwrap_or("").to_string();
    let playlist_title = entry["title"].as_str().unwrap_or("").to_string();
    let entry_url = resolve_music_entry_url(entry, &raw_id);
    if entry_url.is_empty() && playlist_title.is_empty() {
        return None;
    }
    if !should_include_music_browse_entry(entry, &entry_url) {
        return None;
    }
    let stable_id = stable_music_entry_id(entry, &raw_id, &entry_url);
    let track_count = entry["playlist_count"].as_u64().map(|n| n as u32);
    let thumb = best_thumbnail_url(entry).or_else(|| parent_thumb.clone());
    Some(MusicPlaylistInfo {
        id: stable_id,
        title: playlist_title,
        url: entry_url,
        thumbnail: thumb,
        track_count,
    })
}

fn push_music_browse_entry(
    entry: &serde_json::Value,
    parent_thumb: &Option<String>,
    seen: &mut HashSet<String>,
    playlists: &mut Vec<MusicPlaylistInfo>,
) {
    if let Some(pl) = music_browse_entry_to_playlist(entry, parent_thumb) {
        if seen.insert(pl.id.clone()) {
            playlists.push(pl);
        }
    }
}

fn walk_music_browse_entries(
    value: &serde_json::Value,
    depth: u32,
    parent_thumb: &Option<String>,
    seen: &mut HashSet<String>,
    playlists: &mut Vec<MusicPlaylistInfo>,
) {
    if depth > 6 {
        return;
    }
    if let Some(arr) = value.get("entries").and_then(|v| v.as_array()) {
        for entry in arr {
            push_music_browse_entry(entry, parent_thumb, seen, playlists);
            walk_music_browse_entries(entry, depth + 1, parent_thumb, seen, playlists);
        }
    }
}

fn collect_music_browse_playlists(
    root: &serde_json::Value,
    parent_thumb: &Option<String>,
) -> Vec<MusicPlaylistInfo> {
    let mut seen = HashSet::new();
    let mut playlists = Vec::new();

    if let Some(entries) = root["entries"].as_array() {
        for entry in entries {
            push_music_browse_entry(entry, parent_thumb, &mut seen, &mut playlists);
        }
    }

    if playlists.is_empty() {
        walk_music_browse_entries(root, 0, parent_thumb, &mut seen, &mut playlists);
    }

    playlists
}

fn entry_looks_like_track(entry: &serde_json::Value) -> bool {
    let entry_type = entry["_type"].as_str().unwrap_or("");
    entry_type == "video" || entry_type == "url" || entry["duration"].is_number()
}

fn push_album_track_entry(
    entry: &serde_json::Value,
    seen: &mut HashSet<String>,
    out: &mut Vec<serde_json::Value>,
) {
    if !entry_looks_like_track(entry) {
        return;
    }
    let raw_id = entry["id"].as_str().unwrap_or("");
    let url = resolve_music_entry_url(entry, raw_id);
    let key = if url.is_empty() {
        raw_id.to_string()
    } else {
        url
    };
    if key.is_empty() || !seen.insert(key) {
        return;
    }
    out.push(entry.clone());
}

fn walk_album_track_entries(
    value: &serde_json::Value,
    depth: u32,
    seen: &mut HashSet<String>,
    out: &mut Vec<serde_json::Value>,
) {
    if depth > 6 {
        return;
    }
    if let Some(arr) = value.get("entries").and_then(|v| v.as_array()) {
        for entry in arr {
            push_album_track_entry(entry, seen, out);
            walk_album_track_entries(entry, depth + 1, seen, out);
        }
    }
}

fn collect_album_track_entries(root: &serde_json::Value) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    if let Some(entries) = root["entries"].as_array() {
        for entry in entries {
            push_album_track_entry(entry, &mut seen, &mut out);
        }
    }
    if out.is_empty() {
        walk_album_track_entries(root, 0, &mut seen, &mut out);
    }
    out
}

/// Stable id for the UI: prefer unique url; channel ids repeat across artist tabs.
fn stable_music_entry_id(entry: &serde_json::Value, id: &str, entry_url: &str) -> String {
    let url = entry_url.trim();
    if !url.is_empty() {
        return url.to_string();
    }
    if !id.is_empty() && !is_youtube_channel_id(id) {
        return id.to_string();
    }
    let title = entry["title"].as_str().unwrap_or("").trim();
    if !title.is_empty() {
        return format!("{}::{}", id, title);
    }
    id.to_string()
}

/// Fetch artist/channel page and return child playlists/albums.
/// Uses `--flat-playlist -J` for speed; parent thumbnail fills missing shelf art.
#[tauri::command]
pub async fn get_music_browse_info(
    app: AppHandle,
    url: String,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<MusicBrowseResult, String> {
    let _guard = music_ytdlp_mutex()
        .lock()
        .await;

    let mut args: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
    ];
    ytdlp_push_politeness_args(&mut args);
    run_ytdlp_json_with_cookie_fallback(
        &app,
        args,
        url,
        browser_cookies.as_deref(),
        cookie_file.as_deref(),
        "browse",
    )
    .await
    .and_then(|root| {
        let title = root["title"].as_str().unwrap_or("").to_string();
        let thumbnail = best_thumbnail_url(&root);
        let playlists = collect_music_browse_playlists(&root, &thumbnail);

        let browse_kind = if playlists.is_empty() {
            let had_channel_tabs = root["entries"].as_array().is_some_and(|entries| {
                entries.iter().any(|entry| {
                    let raw_id = entry["id"].as_str().unwrap_or("");
                    let entry_title = entry["title"].as_str().unwrap_or("");
                    let entry_url = resolve_music_entry_url(entry, raw_id);
                    is_channel_tab_title(entry_title)
                        || raw_id.starts_with("UU")
                        || entry_url_looks_like_channel_tab(&entry_url)
                        || (entry["_type"].as_str() == Some("channel")
                            && is_youtube_channel_id(raw_id))
                })
            });
            if had_channel_tabs {
                Some("channel_tabs_only".to_string())
            } else {
                None
            }
        } else {
            None
        };

        Ok(MusicBrowseResult {
            title,
            thumbnail,
            playlists,
            browse_kind,
        })
    })
}

async fn run_ytdlp_json(
    app: &AppHandle,
    mut args: Vec<String>,
    timeout_label: &str,
) -> Result<serde_json::Value, String> {
    ytdlp_push_politeness_args(&mut args);
    ytdlp_subprocess_rate_gate_wait().await?;

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(90),
        ytdlp_shell_command(app)?.args(&args).output(),
    )
    .await
    .map_err(|_| format!("yt-dlp {} timed out after 90s", timeout_label))?
    .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        ytdlp_register_rate_limit_from_stderr(&err).await;
        return Err(humanize_music_ytdlp_error(&err));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse yt-dlp JSON: {}", e))
}

async fn run_ytdlp_json_with_cookie_fallback(
    app: &AppHandle,
    prefix_args: Vec<String>,
    url: String,
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
    timeout_label: &str,
) -> Result<serde_json::Value, String> {
    let mut args = prefix_args.clone();
    args.push(url.clone());
    match run_ytdlp_json(app, args, timeout_label).await {
        Ok(root) => Ok(root),
        Err(without_err) if ytdlp_has_configured_cookie_source(browser_cookies, cookie_file) => {
            let label = browser_cookies
                .map(cookie_browser_label)
                .unwrap_or("cookie file");
            crate::rf_log!(
                "download.ytdlp",
                log::Level::Warn,
                "yt-dlp {} failed without cookies; retrying with {}: {}",
                timeout_label,
                label,
                without_err.lines().next().unwrap_or(&without_err)
            );
            let (browser, file, _cookie_guard) =
                match ytdlp_music_cookie_retry_args(app, browser_cookies, cookie_file).await {
                    Ok(args) => args,
                    Err(export_err) => {
                        return Err(format!(
                            "{export_err}\n\nWithout cookies: {}",
                            humanize_music_ytdlp_error(&without_err)
                        ));
                    }
                };
            let mut retry_args = prefix_args;
            ytdlp_push_cookie_cli_args(
                app,
                &mut retry_args,
                file.as_deref(),
                browser.as_deref(),
            )?;
            retry_args.push(url);
            match run_ytdlp_json(app, retry_args, timeout_label).await {
                Ok(root) => Ok(root),
                Err(with_err) => Err(format_music_ytdlp_cookie_fallback_failure(
                    &without_err,
                    &with_err,
                    browser_cookies,
                )),
            }
        }
        Err(err) => Err(err),
    }
}

async fn fetch_album_tracks_page(
    app: &AppHandle,
    url: &str,
    offset: u32,
    limit: u32,
    browser_cookies: Option<&str>,
    cookie_file: Option<&str>,
) -> Result<MusicPlaylistPage, String> {
    let limit = limit.max(1).min(100);
    let start = offset + 1;
    let end = offset + limit;

    let flat_prefix: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
        "--playlist-start".into(),
        start.to_string(),
        "--playlist-end".into(),
        end.to_string(),
    ];

    match run_ytdlp_json_with_cookie_fallback(
        app,
        flat_prefix,
        url.to_string(),
        browser_cookies,
        cookie_file,
        "playlist page",
    )
    .await
    {
        Ok(root) => Ok(playlist_page_from_root(&root, offset, limit)),
        Err(flat_err)
            if flat_err.contains("Failed to resolve album to playlist")
                || flat_err.contains("resolve album") =>
        {
            let browse_prefix: Vec<String> = vec!["-J".into(), "--no-warnings".into()];
            let root = run_ytdlp_json_with_cookie_fallback(
                app,
                browse_prefix,
                url.to_string(),
                browser_cookies,
                cookie_file,
                "album browse",
            )
            .await?;
            let track_entries = collect_album_track_entries(&root);
            let total = track_entries.len() as u32;
            let slice: Vec<_> = track_entries
                .into_iter()
                .skip(offset as usize)
                .take(limit as usize)
                .collect();
            let playlist_thumb = best_thumbnail_url(&root);
            let mut items = Vec::new();
            for entry in slice {
                let raw_id = entry["id"].as_str().unwrap_or("").to_string();
                let item_title = entry["title"].as_str().unwrap_or("").to_string();
                let entry_url = resolve_music_entry_url(&entry, &raw_id);
                if entry_url.is_empty() {
                    continue;
                }
                let stable_id = stable_music_entry_id(&entry, &raw_id, &entry_url);
                items.push(MusicTrackInfo {
                    id: stable_id,
                    title: item_title,
                    url: entry_url,
                    duration: entry["duration"].as_f64(),
                    thumbnail: best_thumbnail_url(&entry).or_else(|| playlist_thumb.clone()),
                    artist: entry["artist"]
                        .as_str()
                        .or_else(|| entry["uploader"].as_str())
                        .map(String::from),
                    album: entry["album"].as_str().map(String::from),
                });
            }
            let fetched = offset + items.len() as u32;
            Ok(MusicPlaylistPage {
                items,
                has_more: fetched < total,
                total: Some(total),
                title: root["title"].as_str().map(String::from),
            })
        }
        Err(other) => Err(other),
    }
}

fn playlist_page_from_root(
    root: &serde_json::Value,
    offset: u32,
    limit: u32,
) -> MusicPlaylistPage {
    let total = root["playlist_count"].as_u64().map(|n| n as u32);
    let mut items = Vec::new();
    let entries = root["entries"].as_array().map(|v| v.as_slice()).unwrap_or_default();
    let playlist_thumb = best_thumbnail_url(root);
    for entry in entries {
        let raw_id = entry["id"].as_str().unwrap_or("").to_string();
        let item_title = entry["title"].as_str().unwrap_or("").to_string();
        let entry_url = resolve_music_entry_url(entry, &raw_id);
        if entry_url.is_empty() {
            continue;
        }
        let stable_id = stable_music_entry_id(entry, &raw_id, &entry_url);
        let duration = entry["duration"].as_f64();
        let thumb = best_thumbnail_url(entry).or_else(|| playlist_thumb.clone());
        let artist = entry["artist"]
            .as_str()
            .or_else(|| entry["uploader"].as_str())
            .map(String::from);
        let album = entry["album"].as_str().map(String::from);
        items.push(MusicTrackInfo {
            id: stable_id,
            title: item_title,
            url: entry_url,
            duration,
            thumbnail: thumb,
            artist,
            album,
        });
    }
    let has_more = match total {
        Some(t) => (offset + items.len() as u32) < t,
        None => items.len() as u32 == limit,
    };
    let title = root["title"].as_str().map(String::from);
    MusicPlaylistPage {
        items,
        has_more,
        total,
        title,
    }
}

/// Fetch a page of tracks from a playlist URL.
/// `offset` is 0-based; `limit` is the page size (default 10).
#[tauri::command]
pub async fn get_playlist_items_page(
    app: AppHandle,
    url: String,
    offset: u32,
    limit: u32,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<MusicPlaylistPage, String> {
    let _guard = music_ytdlp_mutex()
        .lock()
        .await;

    let cookie_file_ref = cookie_file.as_deref();
    let browser_ref = browser_cookies.as_deref();

    if is_music_album_browse_url(&url) {
        return fetch_album_tracks_page(
            &app,
            &url,
            offset,
            limit,
            browser_ref,
            cookie_file_ref,
        )
        .await;
    }

    let limit = limit.max(1).min(100);
    let start = offset + 1;
    let end = offset + limit;

    let prefix_args: Vec<String> = vec![
        "--flat-playlist".into(),
        "-J".into(),
        "--no-warnings".into(),
        "--playlist-start".into(),
        start.to_string(),
        "--playlist-end".into(),
        end.to_string(),
    ];
    let root = run_ytdlp_json_with_cookie_fallback(
        &app,
        prefix_args,
        url,
        browser_ref,
        cookie_file_ref,
        "playlist page",
    )
    .await?;
    Ok(playlist_page_from_root(&root, offset, limit))
}

#[cfg(test)]
mod music_browse_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalize_thumbnail_url_protocol_relative() {
        assert_eq!(
            normalize_thumbnail_url("//i.ytimg.com/vi/abc/hqdefault.jpg").as_deref(),
            Some("https://i.ytimg.com/vi/abc/hqdefault.jpg")
        );
    }

    #[test]
    fn best_thumbnail_url_uses_thumbnails_array_and_normalizes() {
        let entry = json!({
            "thumbnails": [{ "url": "//i.ytimg.com/vi/abc/hqdefault.jpg" }]
        });
        assert_eq!(
            best_thumbnail_url(&entry).as_deref(),
            Some("https://i.ytimg.com/vi/abc/hqdefault.jpg")
        );
    }

    #[test]
    fn resolve_music_entry_url_channel_tab_from_title() {
        let shorts = json!({ "title": "Shorts" });
        assert_eq!(
            resolve_music_entry_url(&shorts, "UCfM3zsQsOnfWNUppiycmBuw"),
            "https://www.youtube.com/channel/UCfM3zsQsOnfWNUppiycmBuw/shorts"
        );
        let live = json!({ "title": "Live" });
        assert_eq!(
            resolve_music_entry_url(&live, "UCfM3zsQsOnfWNUppiycmBuw"),
            "https://www.youtube.com/channel/UCfM3zsQsOnfWNUppiycmBuw/live"
        );
    }

    #[test]
    fn resolve_music_entry_url_uu_playlist() {
        let entry = json!({ "title": "Uploads" });
        assert_eq!(
            resolve_music_entry_url(&entry, "UUfM3zsQsOnfWNUppiycmBuw"),
            "https://music.youtube.com/playlist?list=UUfM3zsQsOnfWNUppiycmBuw"
        );
    }

    #[test]
    fn normalize_thumbnail_url_rejects_playlist_page_urls() {
        assert!(normalize_thumbnail_url(
            "https://www.youtube.com/playlist?list=UCfM3zsQsOnfWNUppiycmBuw"
        )
        .is_none());
        assert!(normalize_thumbnail_url("https://i.ytimg.com/vi/abc/hqdefault.jpg").is_some());
    }

    #[test]
    fn resolve_music_entry_url_mpad_browse() {
        let entry = json!({ "title": "The Eminem Show" });
        assert_eq!(
            resolve_music_entry_url(&entry, "MPADUCedvOgsKFzcK3hA5taf3KoQ"),
            "https://music.youtube.com/browse/MPADUCedvOgsKFzcK3hA5taf3KoQ"
        );
    }

    #[test]
    fn should_exclude_channel_tab_entries() {
        let videos = json!({
            "_type": "playlist",
            "id": "UUabc123",
            "title": "Videos",
            "playlist_count": 320
        });
        assert!(!should_include_music_browse_entry(
            &videos,
            "https://music.youtube.com/playlist?list=UUabc123"
        ));

        let shorts = json!({
            "_type": "playlist",
            "id": "UCabc123",
            "title": "Shorts",
            "playlist_count": 40
        });
        assert!(!should_include_music_browse_entry(
            &shorts,
            "https://www.youtube.com/channel/UCabc123/shorts"
        ));

        let album = json!({
            "_type": "url_transparent",
            "id": "MPADUCedvOgsKFzcK3hA5taf3KoQ",
            "title": "The Eminem Show",
            "playlist_count": 20
        });
        assert!(should_include_music_browse_entry(
            &album,
            "https://music.youtube.com/browse/MPADUCedvOgsKFzcK3hA5taf3KoQ"
        ));
    }

    #[test]
    fn is_music_album_browse_url_detects_mpad() {
        assert!(is_music_album_browse_url(
            "https://music.youtube.com/browse/MPADUCedvOgsKFzcK3hA5taf3KoQ"
        ));
        assert!(!is_music_album_browse_url(
            "https://music.youtube.com/@Eminem"
        ));
    }
}

#[cfg(test)]
mod cookie_error_tests {
    use super::*;

    #[test]
    fn detects_chrome_cookie_database_errors() {
        assert!(ytdlp_stderr_is_cookie_export_failure(
            "ERROR: Could not copy Chrome cookie database."
        ));
        assert!(ytdlp_stderr_is_cookie_export_failure(
            "ERROR: Failed to decrypt with DPAPI. See https://github.com/yt-dlp/yt-dlp/issues/10927"
        ));
        assert!(ytdlp_stderr_is_cookie_export_failure(
            "ERROR: Could not read cookies from chrome profile"
        ));
        assert!(!ytdlp_stderr_is_cookie_export_failure(
            "ERROR: Video unavailable"
        ));
    }

    #[test]
    fn humanizes_ruforge_cookie_source() {
        let msg = humanize_ytdlp_cookie_error("cookie database", Some("ruforge"));
        assert!(msg.contains("RuForge Internal browser"));
        assert!(msg.contains("Firefox"));
    }

    #[test]
    fn humanized_cookie_error_includes_raw_stderr() {
        let raw = "ERROR: Could not copy Chrome cookie database.";
        let msg = humanize_ytdlp_cookie_error(raw, Some("ruforge"));
        assert!(msg.contains(raw));
    }

    #[test]
    fn cookie_fallback_failure_preserves_with_err_stderr() {
        let without = "ERROR: Video unavailable";
        let with_err = "ERROR: Could not copy Chrome cookie database.";
        let msg = format_ytdlp_cookie_fallback_failure(without, with_err, Some("ruforge"));
        assert!(msg.contains(with_err));
    }
}
