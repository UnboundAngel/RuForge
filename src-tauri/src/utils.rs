use std::path::{Path, PathBuf};

pub const THUMB_DIR_NAME: &str = ".ruforge_thumbs";
pub const POSTER_FILE: &str = "poster.jpg";
pub const MEDIA_EXTS: &[&str] = &["mp4", "mkv", "webm", "mp3", "m4a", "flac", "opus", "ogg", "wav"];
pub const AUDIO_ONLY_EXTS: &[&str] = &["mp3", "m4a", "flac", "opus", "ogg", "wav"];

/// Top-level bucket dirs that contain per-item subfolders (one media item per subfolder).
pub const ITEM_BUCKET_NAMES: &[&str] = &["Videos", "Music", "Movies", "Shows"];
/// Top-level bucket dir that contains per-playlist subfolders.
pub const PLAYLIST_BUCKET_NAME: &str = "Playlists";
/// All recognized top-level library bucket directory names.
pub const ALL_BUCKET_NAMES: &[&str] = &["Videos", "Music", "Movies", "Shows", "Playlists", "Unsorted"];

pub fn is_item_bucket(name: &str) -> bool {
    ITEM_BUCKET_NAMES.iter().any(|&b| b.eq_ignore_ascii_case(name))
}

pub fn is_playlist_bucket(name: &str) -> bool {
    name.eq_ignore_ascii_case(PLAYLIST_BUCKET_NAME)
}

pub fn is_any_bucket(name: &str) -> bool {
    ALL_BUCKET_NAMES.iter().any(|&b| b.eq_ignore_ascii_case(name))
}

/// Shared sanitizer for item and playlist folder names.
/// Replaces forbidden filesystem chars with space, collapses whitespace,
/// strips trailing dots, caps at 150 chars. Falls back to "media".
pub fn item_folder_name(raw: &str) -> String {
    let s: String = raw
        .trim()
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if (c as u32) < 32 => ' ',
            c => c,
        })
        .collect();
    let mut s: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    while s.ends_with('.') {
        s.pop();
        let trimmed = s.trim_end().to_string();
        s = trimmed;
    }
    let s = s.trim().to_string();
    if s.is_empty() {
        return "media".to_string();
    }
    if s.len() > 150 {
        let mut end = 150;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        let truncated = s[..end].trim().to_string();
        if truncated.is_empty() { "media".to_string() } else { truncated }
    } else {
        s
    }
}

/// yt-dlp may write `{stem}.info.json` or the legacy `{stem}..info.json` double-dot sidecar.
pub fn resolve_info_json_path(parent: &Path, stem: &str) -> Option<PathBuf> {
    let primary = parent.join(format!("{}.info.json", stem));
    if primary.is_file() {
        return Some(primary);
    }
    let double_dot = parent.join(format!("{}..info.json", stem));
    if double_dot.is_file() {
        return Some(double_dot);
    }
    None
}

pub fn duration_from_ytdlp_info_json(video_path: &Path) -> f64 {
    let parent = match video_path.parent() {
        Some(p) => p,
        None => return 0.0,
    };
    let stem = match video_path.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s,
        None => return 0.0,
    };
    let info_path = match resolve_info_json_path(parent, stem) {
        Some(p) => p,
        None => return 0.0,
    };
    let Ok(txt) = std::fs::read_to_string(&info_path) else {
        return 0.0;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&txt) else {
        return 0.0;
    };
    json["duration"]
        .as_f64()
        .or_else(|| json["duration"].as_u64().map(|u| u as f64))
        .or_else(|| json["duration"].as_i64().map(|i| i as f64))
        .filter(|d| d.is_finite() && *d > 0.0)
        .unwrap_or(0.0)
}

#[inline]
pub fn is_media_ext(ext: &str) -> bool {
    MEDIA_EXTS.contains(&ext)
}

#[inline]
pub fn is_audio_only_ext(ext: &str) -> bool {
    AUDIO_ONLY_EXTS.contains(&ext.to_ascii_lowercase().as_str())
}

/// Sidecar WebVTT next to a media file: `{stem}.vtt` (lang `und`) or `{stem}.{lang}.vtt`.
pub fn vtt_sidecars_for_stem(parent: &Path, stem: &str) -> std::io::Result<Vec<(PathBuf, String)>> {
    let prefix = format!("{stem}.");
    let mut out = Vec::new();
    let read_dir = match std::fs::read_dir(parent) {
        Ok(rd) => rd,
        Err(e) => return Err(e),
    };
    for entry in read_dir {
        let entry = entry?;
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        if p.extension().and_then(|e| e.to_str()) != Some("vtt") {
            continue;
        }
        let fname = match p.file_name().and_then(|n| n.to_str()) {
            Some(f) => f.to_string(),
            None => continue,
        };
        if fname == format!("{stem}.vtt") {
            out.push((p, "und".to_string()));
            continue;
        }
        if !fname.starts_with(&prefix) || !fname.ends_with(".vtt") {
            continue;
        }
        let lang_part = &fname[prefix.len()..fname.len() - 4];
        if lang_part.is_empty() {
            continue;
        }
        out.push((p, lang_part.to_ascii_lowercase()));
    }
    Ok(out)
}

/// Same ordering as subtitle track pickers: `und` first, then language tag.
pub fn sort_vtt_sidecars_lang_first(pairs: &mut Vec<(PathBuf, String)>) {
    pairs.sort_by(|a, b| {
        let rank = |l: &str| -> u8 {
            if l == "und" {
                0
            } else {
                1
            }
        };
        rank(a.1.as_str())
            .cmp(&rank(b.1.as_str()))
            .then_with(|| a.1.cmp(&b.1))
    });
}

/// One representative path for gallery metadata (matches first track order from [`vtt_sidecars_for_stem`]).
pub fn primary_vtt_sidecar(parent: &Path, stem: &str) -> Option<PathBuf> {
    let mut pairs = vtt_sidecars_for_stem(parent, stem).ok()?;
    if pairs.is_empty() {
        return None;
    }
    sort_vtt_sidecars_lang_first(&mut pairs);
    pairs.into_iter().next().map(|(p, _)| p)
}
