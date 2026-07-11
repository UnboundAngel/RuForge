use serde_json::Value;

use crate::types::{
    MediaChoiceSet, MediaInspection, PlaylistItemPreview,
};

pub const DEFAULT_VIDEO_FORMAT: &str =
    "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best";
pub const AUDIO_SIMULATE_FORMAT: &str = "bestaudio[ext=m4a]/bestaudio";
pub const DEFAULT_AUDIO_FORMAT: &str = "m4a";

pub fn effective_video_format_for_probe(format: Option<&str>) -> String {
    match format.filter(|s| !s.is_empty()) {
        Some(s) if !s.contains("bestaudio") => s.to_string(),
        _ => DEFAULT_VIDEO_FORMAT.to_string(),
    }
}

pub fn media_inspection_from_json(
    json: Value,
    video_format: &str,
    audio_primary: bool,
    file_size_bytes_audio: Option<u64>,
    file_size_bytes_video: Option<u64>,
) -> MediaInspection {
    let base = inspection_body_from_json(json);
    let file_size_bytes = if audio_primary {
        file_size_bytes_audio.or(file_size_bytes_video)
    } else {
        file_size_bytes_video.or(file_size_bytes_audio)
    }
    .or(base.file_size_bytes);

    MediaInspection {
        file_size_bytes,
        file_size_bytes_audio,
        file_size_bytes_video,
        choices: default_choice_set(video_format),
        ..base
    }
}

fn default_choice_set(video_format: &str) -> MediaChoiceSet {
    MediaChoiceSet {
        allowed_video_formats: vec![
            video_format.to_string(),
            DEFAULT_VIDEO_FORMAT.to_string(),
        ],
        allowed_audio_formats: vec![
            "m4a".into(),
            "mp3".into(),
            "opus".into(),
        ],
        default_video_format: video_format.to_string(),
        default_audio_format: DEFAULT_AUDIO_FORMAT.to_string(),
    }
}

fn inspection_body_from_json(json: Value) -> MediaInspection {
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
            MediaInspection {
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
                choices: default_choice_set(DEFAULT_VIDEO_FORMAT),
            }
        }
        None => {
            let entry = ytdlp_primary_entry(&json);
            let (uploader, channel) = ytdlp_uploader_channel(&json);
            MediaInspection {
                title: entry
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                thumbnail: entry["thumbnail"].as_str().unwrap_or("").to_string(),
                duration: ytdlp_duration_secs(entry).unwrap_or(0.0),
                formats: vec![],
                file_size_bytes: video_file_size_from_ytdlp_json(entry),
                file_size_bytes_audio: None,
                file_size_bytes_video: None,
                is_playlist: false,
                playlist_items: None,
                uploader,
                channel,
                choices: default_choice_set(DEFAULT_VIDEO_FORMAT),
            }
        }
    }
}

pub fn dual_file_sizes_from_ytdlp_json(
    json: &Value,
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
    dual_file_sizes_from_entry_json(ytdlp_primary_entry(json), max_height, audio_primary)
}

fn ytdlp_uploader_channel(json: &Value) -> (Option<String>, Option<String>) {
    let pick_str = |key: &str| {
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

pub fn max_clen_bytes_in_url(url: &str) -> Option<u64> {
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

fn tbr_kbps_from_json(json: &Value) -> Option<f64> {
    json.get("tbr")
        .and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|u| u as f64)))
        .filter(|&t| t > 0.0)
}

pub fn video_file_size_from_ytdlp_json(json: &Value) -> Option<u64> {
    fn u64_from_field(v: &Value) -> Option<u64> {
        v.as_u64()
            .or_else(|| v.as_i64().filter(|&i| i >= 0).map(|i| i as u64))
    }

    fn size_from_format_entry(fmt: &Value) -> Option<u64> {
        fmt.get("filesize")
            .and_then(u64_from_field)
            .filter(|&n| n > 0)
            .or_else(|| {
                fmt.get("filesize_approx")
                    .and_then(u64_from_field)
                    .filter(|&n| n > 0)
            })
            .or_else(|| fmt.get("url").and_then(|v| v.as_str()).and_then(max_clen_bytes_in_url))
            .or_else(|| {
                fmt.get("manifest_url")
                    .and_then(|v| v.as_str())
                    .and_then(max_clen_bytes_in_url)
            })
    }

    fn sum_sizes_from_format_array(arr: &[Value]) -> Option<u64> {
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
    if let Some(n) = json
        .get("filesize_approx")
        .and_then(u64_from_field)
        .filter(|&n| n > 0)
    {
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

fn format_stream_score_kbps(fmt: &Value) -> Option<f64> {
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

fn ytdlp_json_has_simulated_selection(json: &Value) -> bool {
    json.get("requested_formats").is_some() || json.get("requested_downloads").is_some()
}

fn max_audio_bitrate_ceiling_bytes(formats: &[Value], duration_secs: f64) -> Option<u64> {
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

fn pick_best_audio_size_from_formats(formats: &[Value], duration_secs: f64) -> Option<u64> {
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
    formats: &[Value],
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
            Some((prev_h, prev_score, _)) => height > prev_h || (height == prev_h && score > prev_score),
        };
        if replace {
            best = Some((height, score, size));
        }
    }
    best.map(|(_, _, n)| n).filter(|&n| n > 0)
}

fn size_from_format_entry_for_dual(fmt: &Value, duration_secs: f64) -> Option<u64> {
    fn u64_from_field(v: &Value) -> Option<u64> {
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
        .or_else(|| fmt.get("url").and_then(|v| v.as_str()).and_then(max_clen_bytes_in_url))
        .or_else(|| {
            tbr_kbps_from_json(fmt).and_then(|tbr| estimate_bytes_from_bitrate(duration_secs, tbr))
        })
}

fn height_from_format_entry(fmt: &Value) -> Option<u32> {
    fmt.get("height")
        .and_then(|v| {
            v.as_u64()
                .or_else(|| v.as_i64().filter(|&i| i >= 0).map(|i| i as u64))
        })
        .map(|h| h as u32)
        .filter(|&h| h > 0)
}

fn dual_file_sizes_from_entry_json(
    json: &Value,
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

pub fn ytdlp_duration_secs(v: &Value) -> Option<f64> {
    v.get("duration")
        .and_then(|d| {
            d.as_f64()
                .or_else(|| d.as_u64().map(|u| u as f64))
                .or_else(|| d.as_i64().map(|i| i as f64))
        })
        .filter(|x| x.is_finite() && *x >= 0.0)
}

pub fn ytdlp_entry_is_usable(entry: &Value) -> bool {
    !(entry.is_null() || entry.as_object().is_some_and(|m| m.is_empty()))
}

pub fn ytdlp_primary_entry(json: &Value) -> &Value {
    if let Some(entries) = json.get("entries").and_then(|e| e.as_array()) {
        if entries.len() == 1 {
            if let Some(entry) = entries.first().filter(|e| ytdlp_entry_is_usable(e)) {
                return entry;
            }
        }
    }
    json
}

pub fn ytdlp_usable_playlist_entries(json: &Value) -> Option<Vec<&Value>> {
    let entries = json.get("entries").and_then(|e| e.as_array())?;
    let usable: Vec<&Value> = entries.iter().filter(|e| ytdlp_entry_is_usable(e)).collect();
    if usable.len() >= 2 {
        Some(usable)
    } else {
        None
    }
}

fn playlist_preview_from_entry(entry: &Value, max_height: Option<u32>) -> PlaylistItemPreview {
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

fn playlist_aggregate_file_size(entries: &[&Value]) -> Option<u64> {
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

fn ytdlp_entry_thumbnail(entry: &Value) -> String {
    best_thumbnail_url(entry).unwrap_or_default()
}

fn best_thumbnail_url(entry: &Value) -> Option<String> {
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

fn thumbnail_area(t: &Value) -> u64 {
    let w = t.get("width").and_then(|v| v.as_u64()).unwrap_or(0);
    let h = t.get("height").and_then(|v| v.as_u64()).unwrap_or(0);
    w.saturating_mul(h)
}

fn thumbnail_from_thumbnails_array(arr: &[Value]) -> Option<String> {
    let mut best_signed: Option<(u64, String)> = None;
    let mut best_any: Option<(u64, String)> = None;
    for t in arr {
        let Some(raw) = t.get("url").and_then(|u| u.as_str()) else {
            continue;
        };
        let Some(norm) = normalize_thumbnail_url(raw) else {
            continue;
        };
        let area = thumbnail_area(t);
        if raw.contains('?') {
            if best_signed.as_ref().is_none_or(|(best, _)| area >= *best) {
                best_signed = Some((area, norm.clone()));
            }
        }
        if best_any.as_ref().is_none_or(|(best, _)| area >= *best) {
            best_any = Some((area, norm));
        }
    }
    best_signed.or(best_any).map(|(_, u)| u)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_height_parses_cap() {
        assert_eq!(
            max_height_from_ytdlp_format("bestvideo[height<=720]+bestaudio"),
            Some(720)
        );
    }

    #[test]
    fn clen_extracts_largest() {
        let url = "https://x.test/videoplayback?clen=100&foo=clen=999";
        assert_eq!(max_clen_bytes_in_url(url), Some(999));
    }
}
