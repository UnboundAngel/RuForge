//! The only ingestion layer. Every other module (desktop store projection, companion
//! server) reads results out of `library::library_state`; nothing else walks the
//! media filesystem or runs ffprobe. This module owns:
//! - the multi-root directory walk (delegated to the shared primitive in
//!   `commands::gallery`, so there is exactly one directory-walking implementation)
//! - codec/container probing and the browser-`playable` decision
//! - the remux-on-demand decision for companion streaming

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::commands::gallery::{self, GalleryEntry, MediaFile, PlaylistCollection};
use crate::utils::is_audio_only_ext;

use super::remux;
use super::types::{CompanionItemProjection, CompanionLibraryItem, MediaType};

const PLAYABLE_CONTAINERS: [&str; 2] = ["mp4", "webm"];
const PLAYABLE_VIDEO_CODECS: [&str; 4] = ["h264", "vp8", "vp9", "av1"];
const PLAYABLE_AUDIO_CODECS: [&str; 5] = ["aac", "opus", "vorbis", "mp3", "flac"];
// `aac` (raw ADTS) and `oga` come from the file extension; ffprobe names neither mp4 nor matroska.
const PLAYABLE_AUDIO_CONTAINERS: [&str; 9] = [
    "mp3", "m4a", "ogg", "oga", "opus", "wav", "flac", "mp4", "aac",
];

/// Cached ffprobe + remux result for one path, keyed by (path, mtime, size) so a
/// reindex only re-probes files that actually changed. This is what makes
/// "precompute at ingestion, never at request time" affordable on every desktop
/// gallery refresh instead of only on a rare manual rebuild.
#[derive(Debug, Clone)]
pub struct ProbeCacheEntry {
    mtime: i64,
    size_bytes: u64,
    container: String,
    video_codec: String,
    audio_codec: String,
    duration_secs: u32,
    playable: bool,
    serve_path: PathBuf,
}

pub type ProbeCache = HashMap<PathBuf, ProbeCacheEntry>;

pub struct ReindexOutput {
    pub desktop_entries: Vec<GalleryEntry>,
    pub companion_items: HashMap<String, CompanionLibraryItem>,
    pub version: String,
}

/// Stable item identity. Prefers the yt-dlp `source_id` (survives rename/re-encode);
/// falls back to a path hash for user-provided files with no sidecar identity.
fn stable_id(file: &MediaFile, canonical: &Path) -> String {
    if let Some(src_id) = file.source_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let mut hasher = Sha256::new();
        hasher.update(b"src:");
        hasher.update(src_id.as_bytes());
        let digest = hasher.finalize();
        return digest.iter().take(8).map(|b| format!("{:02x}", b)).collect();
    }
    let mut hasher = Sha256::new();
    hasher.update(canonical.to_string_lossy().as_bytes());
    let digest = hasher.finalize();
    digest.iter().take(8).map(|b| format!("{:02x}", b)).collect()
}

fn normalize_container(format_name: &str, path: &Path) -> String {
    if format_name.contains("mp4") || format_name.contains("mov") {
        "mp4".to_string()
    } else if format_name.contains("webm") {
        "webm".to_string()
    } else if format_name.contains("matroska") {
        "mkv".to_string()
    } else {
        path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase()
    }
}

fn is_video_playable(container: &str, video_codec: &str, audio_codec: &str) -> bool {
    PLAYABLE_CONTAINERS.contains(&container)
        && PLAYABLE_VIDEO_CODECS.contains(&video_codec)
        && (audio_codec.is_empty() || PLAYABLE_AUDIO_CODECS.contains(&audio_codec))
}

fn is_audio_playable(container: &str, audio_codec: &str) -> bool {
    if PLAYABLE_AUDIO_CONTAINERS.contains(&container) {
        return audio_codec.is_empty()
            || PLAYABLE_AUDIO_CODECS.contains(&audio_codec)
            || audio_codec.starts_with("pcm");
    }
    // Audio has no remux path, and Safari cannot open Matroska, so other containers stay unplayable.
    container == "webm" && (audio_codec == "opus" || audio_codec.is_empty())
}

pub(crate) fn native_playable(
    media_type: MediaType,
    container: &str,
    video_codec: &str,
    audio_codec: &str,
) -> bool {
    match media_type {
        MediaType::Audio => is_audio_playable(container, audio_codec),
        MediaType::Video => is_video_playable(container, video_codec, audio_codec),
    }
}

/// Codecs are browser-safe but the container needs a stream-copy remux (e.g. MKV).
pub(crate) fn remux_eligible(container: &str, video_codec: &str, audio_codec: &str) -> bool {
    if video_codec.is_empty() {
        return false;
    }
    !is_video_playable(container, video_codec, audio_codec)
        && !container.is_empty()
        && PLAYABLE_VIDEO_CODECS.contains(&video_codec)
        && (audio_codec.is_empty() || PLAYABLE_AUDIO_CODECS.contains(&audio_codec))
}

/// Companion `playable` flag: native container or remux-eligible (remux runs on first stream).
pub(crate) fn companion_playable(
    media_type: MediaType,
    container: &str,
    video_codec: &str,
    audio_codec: &str,
) -> bool {
    match media_type {
        MediaType::Audio => is_audio_playable(container, audio_codec),
        MediaType::Video => {
            is_video_playable(container, video_codec, audio_codec)
                || remux_eligible(container, video_codec, audio_codec)
        }
    }
}

struct ProbeResult {
    container: String,
    video_codec: String,
    audio_codec: String,
    duration_secs: u32,
}

async fn probe_media(app: &AppHandle, path: &Path) -> Option<ProbeResult> {
    let output = crate::child_job::output(app.shell().sidecar("ffprobe").ok()?.args([
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        &path.to_string_lossy(),
    ]))
    .await
    .ok()?;
    if !output.status.success() {
        return None;
    }
    let val: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let streams = val["streams"].as_array().cloned().unwrap_or_default();
    let mut video_codec = String::new();
    let mut audio_codec = String::new();
    for s in &streams {
        let kind = s["codec_type"].as_str().unwrap_or("");
        let codec = s["codec_name"].as_str().unwrap_or("").to_lowercase();
        if kind == "video" && video_codec.is_empty() {
            video_codec = codec;
        } else if kind == "audio" && audio_codec.is_empty() {
            audio_codec = codec;
        }
    }
    let format_name_raw = val["format"]["format_name"].as_str().unwrap_or("").to_lowercase();
    let container = normalize_container(&format_name_raw, path);
    let duration_secs = val["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0) as u32;
    Some(ProbeResult {
        container,
        video_codec,
        audio_codec,
        duration_secs,
    })
}

/// Probe (or reuse a cached probe of) one library file, deciding remux if the
/// container is not directly playable but the codecs are.
async fn probe_and_cache(
    app: &AppHandle,
    remux_dir: Option<&Path>,
    id: &str,
    canonical: &Path,
    mtime: i64,
    size_bytes: u64,
    cache: &mut ProbeCache,
    allow_remux: bool,
    media_type: MediaType,
) -> ProbeCacheEntry {
    if let Some(existing) = cache.get(canonical) {
        if existing.mtime == mtime && existing.size_bytes == size_bytes {
            let mut entry = existing.clone();
            entry.playable =
                companion_playable(media_type, &entry.container, &entry.video_codec, &entry.audio_codec);
            return entry;
        }
    }

    let probe = probe_media(app, canonical).await;
    let (mut container, video_codec, audio_codec, duration_secs) = match probe {
        Some(p) => (p.container, p.video_codec, p.audio_codec, p.duration_secs),
        None => (String::new(), String::new(), String::new(), 0),
    };

    let mut serve_path = canonical.to_path_buf();
    let mut playable = companion_playable(media_type, &container, &video_codec, &audio_codec);

    if allow_remux
        && media_type == MediaType::Video
        && remux_eligible(&container, &video_codec, &audio_codec)
    {
        if let Some(dir) = remux_dir {
            if let Some(remuxed) = remux::ensure_remuxed(app, dir, id, canonical).await {
                serve_path = remuxed;
                container = "mp4".to_string();
                playable = true;
            }
        }
    }

    let entry = ProbeCacheEntry {
        mtime,
        size_bytes,
        container,
        video_codec,
        audio_codec,
        duration_secs,
        playable,
        serve_path,
    };
    cache.insert(canonical.to_path_buf(), entry.clone());
    entry
}

fn find_sibling_thumb(path: &Path) -> Option<PathBuf> {
    let stem = path.file_stem()?.to_str()?;
    let dir = path.parent()?;
    for ext in ["jpg", "jpeg", "webp", "png"] {
        let candidate = dir.join(format!("{stem}.{ext}"));
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn thumb_path_for(file: &MediaFile, canonical: &Path) -> Option<PathBuf> {
    if let Some(p) = file.ruforge_poster_path.as_deref().or(file.thumbnail_path.as_deref()) {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    find_sibling_thumb(canonical)
}

fn thumb_version(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn artist_from_stem(stem: &str) -> Option<String> {
    let (artist, _) = stem.split_once(" - ")?;
    let artist = artist.trim();
    (!artist.is_empty()).then(|| artist.to_string())
}

/// "Jiffy Lube Live, Bristow, VA, USA": a comma followed by a two-letter state code.
fn is_live_venue_album(s: &str) -> bool {
    s.match_indices(',').any(|(i, _)| {
        let rest: Vec<char> = s[i + 1..].trim_start().chars().take(3).collect();
        rest.len() >= 3
            && rest[0].is_ascii_uppercase()
            && rest[1].is_ascii_uppercase()
            && (rest[2] == ',' || rest[2].is_whitespace())
    })
}

fn display_album(tag: Option<String>, canonical: &Path) -> Option<String> {
    let cleaned = tag.map(|raw| {
        let t = raw.trim();
        let dated = t.len() >= 10
            && t.as_bytes()[..10]
                .iter()
                .enumerate()
                .all(|(i, b)| if i == 4 || i == 7 { *b == b'-' } else { b.is_ascii_digit() });
        if dated {
            t[10..].trim_start_matches(|c: char| c == ':' || c.is_whitespace()).trim().to_string()
        } else {
            t.to_string()
        }
    });
    match cleaned {
        Some(a) if !a.is_empty() && !is_live_venue_album(&a) => Some(a),
        other => canonical
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .map(str::trim)
            .filter(|n| {
                !n.is_empty()
                    && !matches!(
                        n.to_ascii_lowercase().as_str(),
                        "music" | "downloads" | "playlists" | "videos" | "audio"
                    )
            })
            .map(str::to_string)
            .or(other.filter(|a| !a.is_empty())),
    }
}

fn media_files_from_entries(entries: &[GalleryEntry]) -> Vec<MediaFile> {
    entries
        .iter()
        .flat_map(|e| match e {
            GalleryEntry::Media { file } => vec![file.clone()],
            GalleryEntry::Playlist { playlist } => playlist.items.clone(),
        })
        .collect()
}

fn version_hash(items: &HashMap<String, CompanionLibraryItem>, desktop_len: usize) -> String {
    let mut ids: Vec<&String> = items.keys().collect();
    ids.sort();
    let mut hasher = DefaultHasher::new();
    desktop_len.hash(&mut hasher);
    for id in ids {
        id.hash(&mut hasher);
        items[id].mtime.hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

pub async fn walk_desktop_entries(roots: &[String]) -> Result<Vec<GalleryEntry>, String> {
    let roots_owned = roots.to_vec();
    tokio::task::spawn_blocking(move || gallery::build_gallery_entries_for_roots(&roots_owned))
        .await
        .map_err(|e| e.to_string())?
}

pub fn desktop_version_hash(entries: &[GalleryEntry]) -> String {
    let mut hasher = DefaultHasher::new();
    entries.len().hash(&mut hasher);
    for entry in entries {
        match entry {
            GalleryEntry::Media { file } => {
                file.path.hash(&mut hasher);
                file.created.hash(&mut hasher);
                file.size.hash(&mut hasher);
            }
            GalleryEntry::Playlist { playlist } => {
                playlist.path.hash(&mut hasher);
                for item in &playlist.items {
                    item.path.hash(&mut hasher);
                    item.created.hash(&mut hasher);
                    item.size.hash(&mut hasher);
                }
            }
        }
    }
    format!("{:016x}", hasher.finish())
}

pub async fn probe_companion_items(
    app: &AppHandle,
    desktop_entries: &[GalleryEntry],
    remux_cache_dir: Option<&Path>,
    probe_cache: &mut ProbeCache,
) -> Result<HashMap<String, CompanionLibraryItem>, String> {
    let media_files = media_files_from_entries(desktop_entries);
    let mut companion_items: HashMap<String, CompanionLibraryItem> = HashMap::new();

    for file in &media_files {
        let path = Path::new(&file.path);
        let Ok(canonical) = path.canonicalize() else {
            continue;
        };
        let Ok(metadata) = std::fs::metadata(&canonical) else {
            continue;
        };
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let size_bytes = metadata.len();
        let id = stable_id(file, &canonical);
        let ext = canonical
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let media_type = if is_audio_only_ext(&ext) {
            MediaType::Audio
        } else {
            MediaType::Video
        };

        let probe = probe_and_cache(
            app,
            remux_cache_dir,
            &id,
            &canonical,
            mtime,
            size_bytes,
            probe_cache,
            false,
            media_type,
        )
        .await;

        let thumb_path = thumb_path_for(file, &canonical);
        let duration_secs = if probe.duration_secs > 0 {
            probe.duration_secs
        } else {
            file.duration.max(0.0) as u32
        };
        let container = if probe.container.is_empty() && media_type == MediaType::Audio {
            ext.clone()
        } else {
            probe.container.clone()
        };

        let non_empty = |s: &Option<String>| s.as_deref().map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
        let title = match media_type {
            MediaType::Audio => non_empty(&file.canonical_title).unwrap_or_else(|| file.name.clone()),
            MediaType::Video => file.name.clone(),
        };
        // Same resolution order as the desktop Music views (`rawArtistFromFile`,
        // `resolveDisplayAlbum`) so artist and album pages group identically.
        let artist = match media_type {
            MediaType::Audio => non_empty(&file.canonical_artist)
                .or_else(|| non_empty(&file.album_artist))
                .or_else(|| non_empty(&file.artist))
                .or_else(|| artist_from_stem(&file.name))
                .or_else(|| canonical.file_stem().and_then(|s| s.to_str()).and_then(artist_from_stem)),
            MediaType::Video => file
                .youtube
                .as_ref()
                .and_then(|y| non_empty(&y.channel))
                .or_else(|| non_empty(&file.artist)),
        };
        let album = match media_type {
            MediaType::Audio => display_album(
                non_empty(&file.canonical_album).or_else(|| non_empty(&file.album)),
                &canonical,
            ),
            MediaType::Video => None,
        };

        let projection = CompanionItemProjection {
            id: id.clone(),
            title,
            media_type,
            duration_secs,
            container: container.clone(),
            video_codec: probe.video_codec.clone(),
            audio_codec: probe.audio_codec.clone(),
            playable: companion_playable(
                media_type,
                &container,
                &probe.video_codec,
                &probe.audio_codec,
            ),
            has_thumb: thumb_path.is_some(),
            thumb_v: thumb_path.as_deref().map(thumb_version).unwrap_or(0),
            size_bytes,
            artist,
            album,
            year: file.year,
            track_no: file.track_no,
            added_at: file.created,
        };

        companion_items.insert(
            id.clone(),
            CompanionLibraryItem {
                id,
                source_path: canonical,
                serve_path: probe.serve_path,
                thumb_path,
                mtime,
                size_bytes,
                projection,
            },
        );
    }

    Ok(companion_items)
}

/// Full reindex: walk every configured root, probe (or reuse a cached probe of)
/// each library file, and produce both the desktop projection (path-bearing,
/// wire-identical to the old `scan_gallery` output) and the companion projection
/// (id-only, precomputed `playable`).
pub async fn reindex(
    app: &AppHandle,
    roots: &[String],
    remux_cache_dir: Option<&Path>,
    probe_cache: &mut ProbeCache,
) -> Result<ReindexOutput, String> {
    let desktop_entries = walk_desktop_entries(roots).await?;
    let companion_items =
        probe_companion_items(app, &desktop_entries, remux_cache_dir, probe_cache).await?;
    let version = version_hash(&companion_items, desktop_entries.len());
    Ok(ReindexOutput {
        desktop_entries,
        companion_items,
        version,
    })
}

#[allow(dead_code)]
pub fn playlist_items(playlist: &PlaylistCollection) -> &[MediaFile] {
    &playlist.items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_playable_covers_common_music_formats() {
        assert!(is_audio_playable("mp3", "mp3"));
        assert!(is_audio_playable("m4a", "aac"));
        assert!(is_audio_playable("mp4", "aac"));
        assert!(is_audio_playable("ogg", "vorbis"));
        assert!(is_audio_playable("opus", "opus"));
        assert!(is_audio_playable("flac", "flac"));
        assert!(is_audio_playable("wav", "pcm_s16le"));
    }

    #[test]
    fn audio_playable_rejects_unknown_container_and_codec() {
        assert!(!is_audio_playable("mkv", "aac"));
        assert!(!is_audio_playable("", ""));
    }

    #[test]
    fn video_playable_still_requires_video_codec() {
        assert!(is_video_playable("mp4", "h264", "aac"));
        assert!(!is_video_playable("mp4", "", "aac"));
    }

    #[test]
    fn remux_eligible_is_video_only() {
        assert!(!remux_eligible("mkv", "", "aac"));
        assert!(remux_eligible("mkv", "h264", "aac"));
    }

    #[test]
    fn companion_playable_respects_media_type() {
        assert!(companion_playable(MediaType::Audio, "mp3", "", "mp3"));
        assert!(!companion_playable(
            MediaType::Video,
            "mp3",
            "",
            "mp3"
        ));
    }
}
