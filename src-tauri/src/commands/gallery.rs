use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::media::scrub_sprites_complete_for_path;
use crate::commands::media::list_scrub_sprite_paths_for_video;
use crate::utils::{is_audio_only_ext, is_item_bucket, is_media_ext, is_playlist_bucket, primary_vtt_sidecar, thumb_dir_for_stem, vtt_sidecars_for_stem, POSTER_FILE, THUMB_DIR_NAME};

fn is_scrub_sprite_video_ext(ext: &str) -> bool {
    matches!(ext, "mp4" | "mkv" | "webm")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created: u64,
    pub duration: f64,
    pub thumbnail_path: Option<String>,
    pub ruforge_poster_path: Option<String>,
    pub subtitle_path: Option<String>,
    pub chapters: Option<Vec<Chapter>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_metadata_hint: Option<String>,
    pub source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist_index: Option<u32>,
    /// Artist tag (ID3 TPE1 / Vorbis ARTIST). Populated for audio-only files only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// Album name tag. Populated for audio-only files only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// Album artist tag (ID3 TPE2 / Vorbis ALBUMARTIST).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_artist: Option<String>,
    /// Track number from tags.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_no: Option<u32>,
    /// Path to extracted embedded cover art cached on disk.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub embedded_cover_path: Option<String>,
    /// Canonical artist resolved by musicmeta enrichment (tags > MB > YouTube > filename).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canonical_artist: Option<String>,
    /// Canonical album resolved by musicmeta enrichment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canonical_album: Option<String>,
    /// Canonical title resolved by musicmeta enrichment (YouTube noise stripped).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canonical_title: Option<String>,
    /// Release year from MusicBrainz when a confident match was found.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    /// MusicBrainz release MBID when match confidence >= 90.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_release_id: Option<String>,
    /// MusicBrainz match score (0-100). Present only when a lookup was attempted and matched.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub match_confidence: Option<u32>,
    /// True when ffmpeg scrubber sprite sheets cover the full video duration.
    #[serde(default)]
    pub scrub_sprites_complete: bool,
    /// Sprite sheet paths under `.ruforge/thumbs/` (read-only at scan time).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scrub_sprite_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistCollection {
    pub title: String,
    pub path: String,
    pub item_count: u32,
    pub combined_duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_thumbnail_path: Option<String>,
    pub items: Vec<MediaFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GalleryEntry {
    Media {
        #[serde(flatten)]
        file: MediaFile,
    },
    Playlist {
        #[serde(flatten)]
        playlist: PlaylistCollection,
    },
}

/// Strip yt-dlp merge temp (`.temp`) and per-stream (`.f399`) suffixes so sidecars and dedupe match muxed output.
fn strip_ytdlp_stream_suffix(stem: &str) -> &str {
    let stem = strip_ytdlp_temp_suffix(stem);
    let Some(dot_f) = stem.rfind(".f") else {
        return stem;
    };
    let tail = &stem[dot_f + 2..];
    if tail.is_empty() {
        return stem;
    }
    if tail
        .chars()
        .all(|c| c.is_ascii_digit() || c == '-' || c == '.')
    {
        return &stem[..dot_f];
    }
    stem
}

fn strip_ytdlp_temp_suffix(stem: &str) -> &str {
    const TEMP: &str = ".temp";
    if stem.ends_with(TEMP) && stem.len() > TEMP.len() {
        return &stem[..stem.len() - TEMP.len()];
    }
    stem
}

pub(crate) fn is_ytdlp_stream_intermediate_stem(stem: &str) -> bool {
    strip_ytdlp_stream_suffix(stem) != stem
}

fn is_ytdlp_temp_merge_stem(stem: &str) -> bool {
    strip_ytdlp_temp_suffix(stem) != stem
}

fn sibling_final_muxed_video_exists(parent: &std::path::Path, base_stem: &str) -> bool {
    for ext in ["mp4", "mkv", "webm"] {
        let candidate = parent.join(format!("{base_stem}.{ext}"));
        if candidate.is_file() {
            return true;
        }
    }
    false
}

fn should_hard_skip_stranded_ytdlp_temp(path: &std::path::Path) -> bool {
    let stem = match path.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s,
        None => return false,
    };
    if !is_ytdlp_temp_merge_stem(stem) {
        return false;
    }
    let parent = match path.parent() {
        Some(p) => p,
        None => return false,
    };
    let base = strip_ytdlp_stream_suffix(stem);
    sibling_final_muxed_video_exists(parent, base)
}

fn resolve_info_json_path(parent: &std::path::Path, stem: &str) -> Option<std::path::PathBuf> {
    for candidate in [stem, strip_ytdlp_stream_suffix(stem)] {
        let primary = parent.join(format!("{}.info.json", candidate));
        if primary.is_file() {
            return Some(primary);
        }
        let double_dot = parent.join(format!("{}..info.json", candidate));
        if double_dot.is_file() {
            return Some(double_dot);
        }
    }
    None
}

/// Canonical identity fields from a `{stem}.musicmeta.json` sidecar.
struct CanonicalMeta {
    artist: Option<String>,
    album: Option<String>,
    title: Option<String>,
    year: Option<u32>,
    mb_release_id: Option<String>,
    match_confidence: Option<u32>,
}

fn read_canonical_meta(parent: &std::path::Path, stem: &str) -> CanonicalMeta {
    let empty = CanonicalMeta {
        artist: None,
        album: None,
        title: None,
        year: None,
        mb_release_id: None,
        match_confidence: None,
    };
    let sidecar = parent.join(format!("{stem}.musicmeta.json"));
    if !sidecar.is_file() {
        return empty;
    }
    let Ok(content) = std::fs::read_to_string(&sidecar) else { return empty; };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else { return empty; };

    CanonicalMeta {
        artist: json["canonicalArtist"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
        album: json["canonicalAlbum"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
        title: json["canonicalTitle"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
        year: json["year"].as_u64().map(|y| y as u32),
        mb_release_id: json["mbReleaseId"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
        match_confidence: json["matchConfidence"].as_u64().map(|c| c as u32),
    }
}

fn normalize_group_title(raw: &str) -> String {
    raw.trim().to_lowercase()
}

fn media_title_for_grouping(file: &MediaFile, path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let base = strip_ytdlp_stream_suffix(stem);
    let name = file.name.trim();
    if !name.is_empty() && !name.eq_ignore_ascii_case(stem) && !name.eq_ignore_ascii_case(base) {
        return normalize_group_title(name);
    }
    normalize_group_title(base)
}

fn source_id_from_ytdlp_info(json: &serde_json::Value) -> Option<String> {
    json["id"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// Sort, fix end times, drop invalid rows. Returns None if fewer than two chapters.
fn normalize_ytdlp_chapters(raw: Vec<Chapter>, duration: f64) -> Option<Vec<Chapter>> {
    let mut out: Vec<Chapter> = raw
        .into_iter()
        .filter(|c| c.start_time.is_finite() && c.start_time >= 0.0)
        .collect();
    if out.is_empty() {
        return None;
    }
    out.sort_by(|a, b| {
        a.start_time
            .partial_cmp(&b.start_time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let dur = if duration.is_finite() && duration > 0.0 {
        duration
    } else {
        0.0
    };
    let n = out.len();
    for i in 0..n {
        let next_start = if i + 1 < n {
            out[i + 1].start_time
        } else {
            dur
        };
        let end = out[i].end_time;
        if !end.is_finite() || end <= out[i].start_time {
            out[i].end_time = if next_start > out[i].start_time {
                next_start
            } else if dur > out[i].start_time {
                dur
            } else {
                out[i].start_time + 1.0
            };
        } else if dur > 0.0 && out[i].end_time > dur {
            out[i].end_time = dur;
        }
        if out[i].title.trim().is_empty() {
            out[i].title = "Chapter".to_string();
        }
    }
    if out.len() < 2 {
        return None;
    }
    Some(out)
}

fn ytdlp_sidecar_metadata(
    info_json_path: &std::path::Path,
) -> (
    f64,
    Option<Vec<Chapter>>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<u32>,
) {
    std::fs::read_to_string(info_json_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .map(|json| {
            let duration = json["duration"]
                .as_f64()
                .or_else(|| json["duration"].as_u64().map(|u| u as f64))
                .or_else(|| json["duration"].as_i64().map(|i| i as f64))
                .filter(|d| d.is_finite() && *d >= 0.0)
                .unwrap_or(0.0);
            let raw_chapters: Vec<Chapter> = json["chapters"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|c| {
                            let start = c["start_time"]
                                .as_f64()
                                .or_else(|| c["start_time"].as_u64().map(|u| u as f64))
                                .or_else(|| c["start_time"].as_i64().map(|i| i as f64))?;
                            if !start.is_finite() || start < 0.0 {
                                return None;
                            }
                            let end = c["end_time"]
                                .as_f64()
                                .or_else(|| c["end_time"].as_u64().map(|u| u as f64))
                                .or_else(|| c["end_time"].as_i64().map(|i| i as f64))
                                .unwrap_or(0.0);
                            Some(Chapter {
                                title: c["title"]
                                    .as_str()
                                    .unwrap_or("Chapter")
                                    .to_string(),
                                start_time: start,
                                end_time: end,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            let chapters = normalize_ytdlp_chapters(raw_chapters, duration);
            let metadata_title = json["title"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from);
            let download_metadata_hint = download_metadata_hint_from_ytdlp_info(&json);
            let source_url = json["webpage_url"].as_str().map(String::from);
            let source_id = source_id_from_ytdlp_info(&json);
            let playlist_index = json["playlist_index"]
                .as_u64()
                .or_else(|| json["playlist_index"].as_i64().map(|i| i as u64))
                .map(|u| u as u32)
                .filter(|&n| n > 0);
            (
                duration,
                chapters,
                metadata_title,
                download_metadata_hint,
                source_url,
                source_id,
                playlist_index,
            )
        })
        .unwrap_or((0.0, None, None, None, None, None, None))
}

/// Music metadata container extracted from embedded tags + fallbacks.
struct MusicMeta {
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    track_no: Option<u32>,
    embedded_cover_path: Option<String>,
}

/// Extract music metadata for audio-only files.
/// Resolution order: embedded tags (lofty) -> yt-dlp .info.json -> filename heuristic.
fn extract_music_meta(
    file_path: &std::path::Path,
    info_json_value: Option<&serde_json::Value>,
    thumb_dir: &std::path::Path,
    stem: &str,
) -> MusicMeta {
    use lofty::prelude::*;
    use lofty::probe::Probe;

    let mut artist: Option<String> = None;
    let mut album: Option<String> = None;
    let mut album_artist: Option<String> = None;
    let mut track_no: Option<u32> = None;
    let mut embedded_cover_path: Option<String> = None;

    // Try reading embedded tags via lofty.
    if let Ok(tagged) = Probe::open(file_path).and_then(|p| p.read()) {
        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            use lofty::tag::Accessor;
            if let Some(v) = tag.artist().map(|s| s.to_string()).filter(|s| !s.is_empty()) {
                artist = Some(v);
            }
            if let Some(v) = tag.album().map(|s| s.to_string()).filter(|s| !s.is_empty()) {
                album = Some(v);
            }
            if let Some(v) = tag.get_string(&lofty::tag::ItemKey::AlbumArtist).map(String::from).filter(|s| !s.is_empty()) {
                album_artist = Some(v);
            }
            if let Some(n) = tag.track() {
                track_no = Some(n);
            }

            // Extract embedded cover art: write to .ruforge_thumbs/{stem}/music_cover.jpg once.
            if let Some(picture) = tag.pictures().first() {
                let cover_path = thumb_dir.join(stem).join("music_cover.jpg");
                if !cover_path.is_file() {
                    if let Some(parent) = cover_path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    let _ = std::fs::write(&cover_path, picture.data());
                }
                if cover_path.is_file() {
                    embedded_cover_path = Some(cover_path.to_string_lossy().to_string());
                }
            }
        }
    }

    // Fill gaps from .info.json (uploader -> artist, channel -> album_artist).
    if let Some(json) = info_json_value {
        if artist.is_none() {
            artist = json["artist"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
                .or_else(|| json["uploader"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from))
                .or_else(|| json["creator"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from));
        }
        if album.is_none() {
            album = json["album"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
        }
        if album_artist.is_none() {
            album_artist = json["album_artist"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
                .or_else(|| json["channel"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from));
        }
    }

    // Filename heuristic: "Artist - Title.ext" -> artist from stem prefix.
    if artist.is_none() {
        let stem_str = stem;
        if let Some(dash_pos) = stem_str.find(" - ") {
            let candidate = stem_str[..dash_pos].trim();
            if !candidate.is_empty() {
                artist = Some(candidate.to_string());
            }
        }
    }

    MusicMeta { artist, album, album_artist, track_no, embedded_cover_path }
}

fn leading_index_from_media_stem(stem: &str) -> Option<u32> {
    let trimmed = stem.trim();
    let digits: String = trimmed.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u32>().ok().filter(|&n| n > 0)
}

fn compare_media_playlist_order(a: &MediaFile, b: &MediaFile) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    match (a.playlist_index, b.playlist_index) {
        (Some(ia), Some(ib)) => ia.cmp(&ib),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => {
            let pa = Path::new(&a.path);
            let pb = Path::new(&b.path);
            let sa = pa
                .file_stem()
                .and_then(|s| s.to_str())
                .and_then(leading_index_from_media_stem);
            let sb = pb
                .file_stem()
                .and_then(|s| s.to_str())
                .and_then(leading_index_from_media_stem);
            match (sa, sb) {
                (Some(ia), Some(ib)) => ia.cmp(&ib),
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        }
    }
}

fn scan_media_recursive(dir_path: &std::path::Path, depth: u8) -> Vec<MediaFile> {
    if depth > 5 {
        return vec![];
    }

    let read_dir = match std::fs::read_dir(dir_path) {
        Ok(rd) => rd,
        Err(_) => return vec![],
    };

    let mut files = vec![];
    let mut entries: Vec<std::path::PathBuf> = read_dir.filter_map(|e| e.ok().map(|e| e.path())).collect();

    entries.sort_by(|a, b| {
        a.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(
                &b.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
            )
    });

    for path in entries {
        if path.is_dir() {
            let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !gallery_skip_subdirectory(fname) {
                files.extend(scan_media_recursive(&path, depth + 1));
            }
            continue;
        }

        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if !is_media_ext(ext) {
            continue;
        }
        if should_hard_skip_stranded_ytdlp_temp(&path) {
            continue;
        }

        let metadata = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let parent = path.parent().unwrap_or(std::path::Path::new(""));

        let thumbnail_path = ["jpg", "webp"].iter().find_map(|&e| {
            let p = parent.join(format!("{}.{}", stem, e));
            if p.is_file() {
                Some(p.to_string_lossy().to_string())
            } else {
                None
            }
        });

        let ruforge_poster_path = {
            let p = thumb_dir_for_stem(parent, stem).join(POSTER_FILE);
            if p.is_file() {
                Some(p.to_string_lossy().to_string())
            } else {
                None
            }
        };

        let subtitle_path = primary_vtt_sidecar(parent, stem).map(|p| p.to_string_lossy().to_string());

        let sidecar = resolve_info_json_path(parent, stem);
        let sidecar_json: Option<serde_json::Value> = sidecar.as_deref().and_then(|p| {
            std::fs::read_to_string(p).ok().and_then(|s| serde_json::from_str(&s).ok())
        });
        let (
            duration,
            chapters,
            metadata_title,
            download_metadata_hint,
            source_url,
            source_id,
            playlist_index,
        ) = sidecar
            .as_deref()
            .map(ytdlp_sidecar_metadata)
            .unwrap_or((0.0, None, None, None, None, None, None));

        let display_name = metadata_title.unwrap_or_else(|| stem.to_string());

        let created = match metadata.created() {
            Ok(time) => time
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            Err(_) => 0,
        };

        // Populate music metadata for audio-only files only (keeps video scan cost unchanged).
        let (artist, album, album_artist, track_no, embedded_cover_path) =
            if is_audio_only_ext(ext) {
                let thumb_dir = parent.join(THUMB_DIR_NAME);
                let mm = extract_music_meta(&path, sidecar_json.as_ref(), &thumb_dir, stem);
                (mm.artist, mm.album, mm.album_artist, mm.track_no, mm.embedded_cover_path)
            } else {
                (None, None, None, None, None)
            };

        let canonical = if is_audio_only_ext(ext) {
            read_canonical_meta(&parent, stem)
        } else {
            CanonicalMeta { artist: None, album: None, title: None, year: None, mb_release_id: None, match_confidence: None }
        };

        let scrub_sprites_complete = if is_audio_only_ext(ext) || !is_scrub_sprite_video_ext(ext) {
            true
        } else {
            scrub_sprites_complete_for_path(&path, duration)
        };

        let scrub_sprite_paths = if is_audio_only_ext(ext) || !is_scrub_sprite_video_ext(ext) {
            Vec::new()
        } else {
            list_scrub_sprite_paths_for_video(&path)
        };

        files.push(MediaFile {
            name: display_name,
            path: path.to_string_lossy().to_string(),
            size: metadata.len(),
            created,
            duration,
            thumbnail_path,
            ruforge_poster_path,
            subtitle_path,
            chapters,
            download_metadata_hint,
            source_url,
            source_id,
            playlist_index,
            artist,
            album,
            album_artist,
            track_no,
            embedded_cover_path,
            canonical_artist: canonical.artist,
            canonical_album: canonical.album,
            canonical_title: canonical.title,
            year: canonical.year,
            mb_release_id: canonical.mb_release_id,
            match_confidence: canonical.match_confidence,
            scrub_sprites_complete,
            scrub_sprite_paths,
        });
    }
    if files.len() >= 2 {
        files.sort_by(compare_media_playlist_order);
    }
    dedupe_media_files(files)
}

fn download_metadata_hint_from_ytdlp_info(json: &serde_json::Value) -> Option<String> {
    let v_part = yt_dlp_codec_token(json.get("vcodec"));
    let a_part = yt_dlp_codec_token(json.get("acodec"));
    let codec = match (&v_part, &a_part) {
        (Some(v), Some(a)) => format!("{} + {}", v, a),
        (Some(v), None) => v.clone(),
        (None, Some(a)) => a.clone(),
        (None, None) => String::new(),
    };

    let bit = bitrate_hint_from_ytdlp_root(json).map(|kb| format!("~{} kb/s", kb));

    match (!codec.is_empty(), bit) {
        (true, Some(b)) => Some(format!("{} · {}", codec, b)),
        (true, None) => Some(codec),
        (false, Some(b)) => Some(b),
        _ => None,
    }
}

fn bitrate_hint_from_ytdlp_root(json: &serde_json::Value) -> Option<u32> {
    for key in ["tbr", "abr", "vbr"] {
        if let Some(b) = bitrate_kbps_from_ytdlp_value(json.get(key)) {
            return Some(b);
        }
    }
    None
}

fn bitrate_kbps_from_ytdlp_value(v: Option<&serde_json::Value>) -> Option<u32> {
    let json = v?;
    let n = json
        .as_f64()
        .or_else(|| json.as_u64().map(|u| u as f64))
        .or_else(|| json.as_i64().map(|i| i as f64))?;
    if !n.is_finite() || n <= 0.0 {
        return None;
    }
    let kb = n.round().clamp(1.0, 999_999.0) as u32;
    Some(kb)
}

fn yt_dlp_codec_token(raw: Option<&serde_json::Value>) -> Option<String> {
    let s = raw?.as_str()?.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("none") {
        return None;
    }
    let s = if s.len() > 48 {
        format!("{}…", &s[..47])
    } else {
        s.to_string()
    };
    Some(s)
}

fn gallery_skip_subdirectory(folder_name: &str) -> bool {
    folder_name.starts_with('.') || folder_name == THUMB_DIR_NAME
}

/// Stable key for collapsing multiple on-disk outputs of the same YouTube item.
pub(crate) fn media_library_dedupe_key(file: &MediaFile) -> Option<String> {
    if let Some(id) = file
        .source_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Some(format!("id:{id}"));
    }
    if let Some(url) = file
        .source_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Some(format!("url:{url}"));
    }
    None
}

/// Group key for dedupe and orphan cleanup (id/url when known, else same-folder title).
pub(crate) fn media_library_group_key(path: &Path, file: &MediaFile) -> String {
    if let Some(k) = media_library_dedupe_key(file) {
        return k;
    }
    if let (Some(parent), Some(stem)) = (
        path.parent(),
        path.file_stem().and_then(|s| s.to_str()),
    ) {
        if let Some(sidecar) = resolve_info_json_path(parent, stem) {
            let (_, _, _, _, _, source_id, _) = ytdlp_sidecar_metadata(sidecar.as_path());
            if let Some(id) = source_id
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                return format!("id:{id}");
            }
            let (_, _, _, _, source_url, _, _) = ytdlp_sidecar_metadata(sidecar.as_path());
            if let Some(url) = source_url
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                return format!("url:{url}");
            }
        }
    }
    let parent = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let title = media_title_for_grouping(file, path);
    format!("stem:{parent}|{title}")
}

/// Higher score wins when two library files share a group key (prefer muxed, not `.fNNN` intermediates).
pub(crate) fn media_library_keep_score(path: &Path, file: &MediaFile) -> u64 {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut score: u64 = 0;
    if matches!(ext.as_str(), "mp4" | "mkv" | "webm") {
        score = score.saturating_add(2_000_000_000);
    } else if is_media_ext(&ext) {
        score = score.saturating_add(500_000_000);
    }
    if file.duration.is_finite() && file.duration > 0.0 {
        score = score.saturating_add((file.duration as u64).min(50_000_000));
    }
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        if is_ytdlp_stream_intermediate_stem(stem) {
            score = score.saturating_sub(1_500_000_000);
        }
    }
    score.saturating_add(file.size.min(1_000_000_000))
}

pub(crate) fn dedupe_media_files(files: Vec<MediaFile>) -> Vec<MediaFile> {
    let mut best_by_key: HashMap<String, MediaFile> = HashMap::new();
    let mut key_order: Vec<String> = Vec::new();

    for file in files {
        let path = Path::new(&file.path);
        let key = media_library_group_key(path, &file);
        let score = media_library_keep_score(path, &file);
        match best_by_key.get(&key) {
            Some(prev) => {
                let prev_score = media_library_keep_score(Path::new(&prev.path), prev);
                if score > prev_score {
                    best_by_key.insert(key, file);
                }
            }
            None => {
                key_order.push(key.clone());
                best_by_key.insert(key, file);
            }
        }
    }

    let mut out = Vec::new();
    for key in key_order {
        if let Some(file) = best_by_key.remove(&key) {
            out.push(file);
        }
    }
    out
}

pub(crate) fn dedupe_gallery_entries(entries: Vec<GalleryEntry>) -> Vec<GalleryEntry> {
    let mut best_idx_by_key: HashMap<String, usize> = HashMap::new();
    let mut remove_indices: HashSet<usize> = HashSet::new();

    for (i, entry) in entries.iter().enumerate() {
        let GalleryEntry::Media { file } = entry else {
            continue;
        };
        let path = Path::new(&file.path);
        let key = media_library_group_key(path, file);
        let score = media_library_keep_score(path, file);
        if let Some(&prev_i) = best_idx_by_key.get(&key) {
            let GalleryEntry::Media { file: prev_file } = &entries[prev_i] else {
                continue;
            };
            let prev_score = media_library_keep_score(Path::new(&prev_file.path), prev_file);
            if score > prev_score {
                remove_indices.insert(prev_i);
                best_idx_by_key.insert(key, i);
            } else {
                remove_indices.insert(i);
            }
        } else {
            best_idx_by_key.insert(key, i);
        }
    }

    entries
        .into_iter()
        .enumerate()
        .filter_map(|(i, entry)| {
            if remove_indices.contains(&i) {
                return None;
            }
            match entry {
                GalleryEntry::Playlist { mut playlist } => {
                    playlist.items = dedupe_media_files(playlist.items);
                    playlist.item_count = playlist.items.len() as u32;
                    Some(GalleryEntry::Playlist { playlist })
                }
                other => Some(other),
            }
        })
        .collect()
}

fn gallery_path_key(path: &str) -> String {
    crate::commands::media::normalize_media_key(path)
}

fn playlist_with_items(mut playlist: PlaylistCollection, items: Vec<MediaFile>) -> PlaylistCollection {
    let combined_duration = items.iter().map(|item| item.duration).sum();
    let stack_ok = playlist.stack_thumbnail_path.as_ref().is_some_and(|thumb| {
        items.iter().any(|item| {
            item.thumbnail_path.as_ref() == Some(thumb)
                || item.ruforge_poster_path.as_ref() == Some(thumb)
        })
    });
    if !stack_ok {
        playlist.stack_thumbnail_path = items
            .first()
            .and_then(|item| item.ruforge_poster_path.clone().or_else(|| item.thumbnail_path.clone()));
    }
    playlist.item_count = items.len() as u32;
    playlist.combined_duration = combined_duration;
    playlist.items = items;
    playlist
}

pub(crate) fn remove_paths_from_gallery_entries(
    entries: &[GalleryEntry],
    keys: &HashSet<String>,
) -> Vec<GalleryEntry> {
    if keys.is_empty() {
        return entries.to_vec();
    }
    entries
        .iter()
        .filter_map(|entry| match entry {
            GalleryEntry::Media { file } => {
                if keys.contains(&gallery_path_key(&file.path)) {
                    None
                } else {
                    Some(entry.clone())
                }
            }
            GalleryEntry::Playlist { playlist } => {
                let items: Vec<MediaFile> = playlist
                    .items
                    .iter()
                    .filter(|item| !keys.contains(&gallery_path_key(&item.path)))
                    .cloned()
                    .collect();
                if items.is_empty() {
                    None
                } else if items.len() == playlist.items.len() {
                    Some(entry.clone())
                } else {
                    Some(GalleryEntry::Playlist {
                        playlist: playlist_with_items(playlist.clone(), items),
                    })
                }
            }
        })
        .collect()
}

pub(crate) fn retain_existing_media_entries(entries: Vec<GalleryEntry>) -> Vec<GalleryEntry> {
    entries
        .into_iter()
        .filter_map(|entry| match entry {
            GalleryEntry::Media { file } => {
                if Path::new(&file.path).is_file() {
                    Some(GalleryEntry::Media { file })
                } else {
                    None
                }
            }
            GalleryEntry::Playlist { mut playlist } => {
                let items: Vec<MediaFile> = std::mem::take(&mut playlist.items)
                    .into_iter()
                    .filter(|item| Path::new(&item.path).is_file())
                    .collect();
                if items.is_empty() {
                    None
                } else {
                    Some(GalleryEntry::Playlist {
                        playlist: playlist_with_items(playlist, items),
                    })
                }
            }
        })
        .collect()
}

/// Sidecars and RuForge thumb dir for a media path (not the primary video file).
pub(crate) fn remove_media_sidecar_artifacts(media_path: &Path) -> Vec<String> {
    let mut warnings = Vec::new();
    for path in crate::media_bundle::collect_deletion_paths(media_path) {
        if path == media_path {
            continue;
        }
        if !path.exists() {
            continue;
        }
        if path.is_dir() {
            if let Err(e) = std::fs::remove_dir_all(&path) {
                warnings.push(format!("{}: {e}", path.display()));
            }
        } else if let Err(e) = std::fs::remove_file(&path) {
            warnings.push(format!("{}: {e}", path.display()));
        }
    }
    crate::media_bundle::prune_empty_dirs_after_media_delete(media_path);
    warnings
}

/// Remove a stray media file from a finished download (video + sidecars + thumb dir).
pub(crate) fn remove_media_download_artifacts(media_path: &Path) {
    if media_path.is_file() {
        let _ = std::fs::remove_file(media_path);
    }
    let _ = remove_media_sidecar_artifacts(media_path);
    crate::media_bundle::prune_empty_dirs_after_media_delete(media_path);
}

fn collect_recent_media_paths(root: &Path, since: std::time::SystemTime) -> Vec<std::path::PathBuf> {
    const SLACK_SECS: u64 = 15;
    let cutoff = since
        .checked_sub(std::time::Duration::from_secs(SLACK_SECS))
        .unwrap_or(since);
    let mut out: Vec<std::path::PathBuf> = Vec::new();

    fn walk(
        dir: &Path,
        depth: u32,
        max_depth: u32,
        cutoff: std::time::SystemTime,
        out: &mut Vec<std::path::PathBuf>,
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
                let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if !gallery_skip_subdirectory(fname) {
                    walk(&p, depth + 1, max_depth, cutoff, out);
                }
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
            if !is_media_ext(&ext) {
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

fn media_file_from_path_for_cleanup(path: &Path) -> Option<MediaFile> {
    let metadata = std::fs::metadata(path).ok()?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let parent = path.parent().unwrap_or(Path::new(""));
    let sidecar = resolve_info_json_path(parent, stem);
    let (
        duration,
        chapters,
        metadata_title,
        download_metadata_hint,
        source_url,
        source_id,
        playlist_index,
    ) = sidecar
        .as_deref()
        .map(ytdlp_sidecar_metadata)
        .unwrap_or((0.0, None, None, None, None, None, None));
    Some(MediaFile {
        name: metadata_title.unwrap_or_else(|| stem.to_string()),
        path: path.to_string_lossy().to_string(),
        size: metadata.len(),
        created: 0,
        duration,
        thumbnail_path: None,
        ruforge_poster_path: None,
        subtitle_path: None,
        chapters,
        download_metadata_hint,
        source_url,
        source_id,
        playlist_index,
        artist: None,
        album: None,
        album_artist: None,
        track_no: None,
        embedded_cover_path: None,
        canonical_artist: None,
        canonical_album: None,
        canonical_title: None,
        year: None,
        mb_release_id: None,
        match_confidence: None,
        scrub_sprites_complete: true,
        scrub_sprite_paths: Vec::new(),
    })
}

/// Collapse duplicate outputs in one folder (muxed file vs `.fNNN` video-only leftover).
fn sweep_parent_dir_for_duplicate_outputs(parent: &Path) {
    let Ok(rd) = std::fs::read_dir(parent) else {
        return;
    };
    let mut groups: HashMap<String, Vec<(std::path::PathBuf, u64)>> = HashMap::new();

    for ent in rd.flatten() {
        let path = ent.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !is_media_ext(&ext) {
            continue;
        }
        let file = match media_file_from_path_for_cleanup(&path) {
            Some(f) => f,
            None => continue,
        };
        let key = media_library_group_key(&path, &file);
        let score = media_library_keep_score(&path, &file);
        groups.entry(key).or_default().push((path, score));
    }

    for (key, mut group) in groups {
        if group.len() < 2 {
            continue;
        }
        group.sort_by(|a, b| b.1.cmp(&a.1));
        let keeper_path = group.first().expect("len >= 2").0.clone();
        for (path, _) in group.into_iter().skip(1) {
            crate::rf_log!(
                "library.dedup",
                log::Level::Info,
                "removing duplicate download output {:?} (kept {:?}, key {})",
                path,
                keeper_path,
                key
            );
            remove_media_download_artifacts(&path);
        }
    }
}

/// After a successful muxed download, drop stray intermediates in the same folder as new outputs.
pub(crate) fn cleanup_orphan_downloads_under(root: &Path, since: std::time::SystemTime) {
    let recent = collect_recent_media_paths(root, since);
    if recent.is_empty() {
        return;
    }

    let mut parents: HashSet<std::path::PathBuf> = HashSet::new();
    for path in recent {
        if let Some(parent) = path.parent() {
            parents.insert(parent.to_path_buf());
        }
    }
    for parent in parents {
        sweep_parent_dir_for_duplicate_outputs(&parent);
        sweep_stranded_ytdlp_temp_files(&parent);
    }
}

fn sweep_stranded_ytdlp_temp_files(parent: &Path) {
    let Ok(rd) = std::fs::read_dir(parent) else {
        return;
    };
    for ent in rd.flatten() {
        let path = ent.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext != "mp4" {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        if !is_ytdlp_temp_merge_stem(stem) {
            continue;
        }
        let base = strip_ytdlp_stream_suffix(stem);
        let final_mp4 = parent.join(format!("{base}.mp4"));
        if !final_mp4.is_file() {
            continue;
        }
        crate::rf_log!(
            "library.dedup",
            log::Level::Info,
            "removing stranded yt-dlp merge temp {:?} (kept {:?})",
            path,
            final_mp4
        );
        remove_media_download_artifacts(&path);
    }
}

fn collect_media_parent_dirs(dir: &Path, depth: u32, max_depth: u32, out: &mut HashSet<std::path::PathBuf>) {
    if depth > max_depth {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    let mut saw_media = false;
    for ent in rd.flatten() {
        let p = ent.path();
        if p.is_dir() {
            let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !gallery_skip_subdirectory(fname) {
                collect_media_parent_dirs(&p, depth + 1, max_depth, out);
            }
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
        if is_media_ext(&ext) {
            saw_media = true;
        }
    }
    if saw_media {
        out.insert(dir.to_path_buf());
    }
}

fn sweep_download_tree_for_duplicates(root: &Path) {
    let mut parents = HashSet::new();
    collect_media_parent_dirs(root, 0, 8, &mut parents);
    for parent in parents {
        sweep_parent_dir_for_duplicate_outputs(&parent);
        sweep_stranded_ytdlp_temp_files(&parent);
    }
}

#[tauri::command]
pub async fn sweep_library_download_duplicates(dir: String) -> Result<(), String> {
    let dir_path = std::path::Path::new(&dir);
    if !dir_path.exists() {
        return Ok(());
    }
    let root = dir_path.to_path_buf();
    tokio::task::spawn_blocking(move || sweep_download_tree_for_duplicates(&root))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Scan one root directory. Internal ingestion primitive: the only callers are
/// `library::scanner` (canonical multi-root index) and the single-folder neighbor
/// lookup used by player auto-advance. Not a `#[tauri::command]`; nothing outside
/// Rust may trigger an ad hoc filesystem scan directly.
pub fn scan_gallery_dir(dir: &str) -> Result<Vec<GalleryEntry>, String> {
    let dir_path = std::path::Path::new(dir);
    if !dir_path.exists() {
        return Ok(vec![]);
    }

    let mut out: Vec<GalleryEntry> = Vec::new();
    let read_dir = match std::fs::read_dir(dir_path) {
        Ok(rd) => rd,
        Err(e) => return Err(e.to_string()),
    };

    let mut entries: Vec<std::path::PathBuf> = read_dir.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort_by(|a, b| {
        a.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(&b.file_name().unwrap_or_default().to_string_lossy().to_lowercase())
    });

    for path in entries {
        let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if gallery_skip_subdirectory(fname) {
            continue;
        }

        if path.is_file() {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_media_ext(ext) && !should_hard_skip_stranded_ytdlp_temp(&path) {
                let media = scan_media_file_direct(&path)?;
                out.push(GalleryEntry::Media { file: media });
            }
        } else if path.is_dir() {
            if is_item_bucket(fname) {
                // Videos / Music / Movies / Shows: each child dir = one item container.
                out.extend(scan_item_bucket_dir(&path)?);
            } else if is_playlist_bucket(fname) {
                // Playlists: each child dir = one playlist entry.
                out.extend(scan_playlist_bucket_dir(&path)?);
            } else {
                // Legacy flat layout: subdir with media becomes a playlist stack.
                let items = scan_media_recursive(&path, 0);
                if items.is_empty() {
                    continue;
                }
                let combined_duration: f64 = items.iter().map(|m| m.duration).sum();
                let folder_jpg = path.join("folder.jpg");
                let stack_thumb = folder_jpg
                    .is_file()
                    .then(|| folder_jpg.to_string_lossy().to_string())
                    .or_else(|| {
                        items.iter().find_map(|it| {
                            it.ruforge_poster_path.clone().or_else(|| it.thumbnail_path.clone())
                        })
                    });
                out.push(GalleryEntry::Playlist {
                    playlist: PlaylistCollection {
                        title: fname.to_string(),
                        path: path.to_string_lossy().to_string(),
                        item_count: items.len() as u32,
                        combined_duration,
                        stack_thumbnail_path: stack_thumb,
                        items,
                    },
                });
            }
        }
    }

    Ok(dedupe_gallery_entries(out))
}

/// Canonical multi-root ingestion: scans every root, drops exact-path duplicates
/// (overlapping roots), then collapses same-item duplicates across roots (e.g. a
/// video that exists in both the internal vault and a user-added scan dir). This
/// is the sole entry point `library::scanner` uses to build the desktop snapshot;
/// no other layer walks these directories independently.
pub fn build_gallery_entries_for_roots(roots: &[String]) -> Result<Vec<GalleryEntry>, String> {
    let mut combined: Vec<GalleryEntry> = Vec::new();
    for root in roots {
        combined.extend(scan_gallery_dir(root)?);
    }

    let mut seen_paths: HashSet<String> = HashSet::new();
    let deduped_by_path: Vec<GalleryEntry> = combined
        .into_iter()
        .filter(|entry| {
            let path = match entry {
                GalleryEntry::Media { file } => file.path.clone(),
                GalleryEntry::Playlist { playlist } => playlist.path.clone(),
            };
            seen_paths.insert(path)
        })
        .collect();

    Ok(dedupe_gallery_entries(deduped_by_path))
}

/// Single-folder scan for player auto-advance neighbor lookup (e.g. "what else is
/// in this bucket folder"). Not the library index: a narrow, ad hoc directory read
/// that still goes through the one shared ingestion primitive (`scan_gallery_dir`)
/// rather than a second independent walk.
#[tauri::command]
pub fn scan_dir_for_neighbors(dir: String) -> Result<Vec<GalleryEntry>, String> {
    scan_gallery_dir(&dir)
}

fn sorted_dir_entries(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut entries: Vec<std::path::PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort_by(|a, b| {
        a.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .cmp(&b.file_name().unwrap_or_default().to_string_lossy().to_lowercase())
    });
    entries
}

fn build_playlist_entry(dir: &std::path::Path, name: &str) -> Option<GalleryEntry> {
    let items = scan_media_recursive(dir, 0);
    if items.is_empty() {
        return None;
    }
    let combined_duration: f64 = items.iter().map(|m| m.duration).sum();
    let folder_jpg = dir.join("folder.jpg");
    let stack_thumb = folder_jpg
        .is_file()
        .then(|| folder_jpg.to_string_lossy().to_string())
        .or_else(|| {
            items.iter().find_map(|it| {
                it.ruforge_poster_path.clone().or_else(|| it.thumbnail_path.clone())
            })
        });
    Some(GalleryEntry::Playlist {
        playlist: PlaylistCollection {
            title: name.to_string(),
            path: dir.to_string_lossy().to_string(),
            item_count: items.len() as u32,
            combined_duration,
            stack_thumbnail_path: stack_thumb,
            items,
        },
    })
}

/// Scan a Videos/Music/Movies/Shows bucket: each child dir = one item.
/// Loose files at bucket root are emitted as flat Media entries.
fn scan_item_bucket_dir(bucket_path: &std::path::Path) -> Result<Vec<GalleryEntry>, String> {
    let mut out = Vec::new();
    for entry in sorted_dir_entries(bucket_path) {
        let fname = entry.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if gallery_skip_subdirectory(fname) {
            continue;
        }
        if entry.is_file() {
            let ext = entry.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_media_ext(ext) && !should_hard_skip_stranded_ytdlp_temp(&entry) {
                let media = scan_media_file_direct(&entry)?;
                out.push(GalleryEntry::Media { file: media });
            }
        } else if entry.is_dir() {
            let items = scan_media_recursive(&entry, 0);
            if items.is_empty() {
                continue;
            }
            if items.len() == 1 {
                out.push(GalleryEntry::Media { file: items.into_iter().next().unwrap() });
            } else {
                // Multiple files in one item folder: degrade gracefully to a small playlist.
                if let Some(playlist) = build_playlist_entry(&entry, fname) {
                    out.push(playlist);
                }
            }
        }
    }
    Ok(out)
}

/// Scan a Playlists bucket: each child dir = one playlist entry.
fn scan_playlist_bucket_dir(bucket_path: &std::path::Path) -> Result<Vec<GalleryEntry>, String> {
    let mut out = Vec::new();
    for playlist_path in sorted_dir_entries(bucket_path) {
        let playlist_name = playlist_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if gallery_skip_subdirectory(playlist_name) || !playlist_path.is_dir() {
            continue;
        }
        if let Some(entry) = build_playlist_entry(&playlist_path, playlist_name) {
            out.push(entry);
        }
    }
    Ok(out)
}

fn scan_media_file_direct(path: &std::path::Path) -> Result<MediaFile, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let parent = path.parent().unwrap_or(std::path::Path::new(""));

    let thumbnail_path = ["jpg", "webp"].iter().find_map(|&e| {
        let p = parent.join(format!("{}.{}", stem, e));
        if p.is_file() {
            Some(p.to_string_lossy().to_string())
        } else {
            None
        }
    });

    let ruforge_poster_path = {
        let p = thumb_dir_for_stem(parent, stem).join(POSTER_FILE);
        if p.is_file() {
            Some(p.to_string_lossy().to_string())
        } else {
            None
        }
    };

    let subtitle_path = primary_vtt_sidecar(parent, stem).map(|p| p.to_string_lossy().to_string());

    let sidecar = resolve_info_json_path(parent, stem);
    let (
        duration,
        chapters,
        metadata_title,
        download_metadata_hint,
        source_url,
        source_id,
        playlist_index,
    ) = sidecar
        .as_deref()
        .map(ytdlp_sidecar_metadata)
        .unwrap_or((0.0, None, None, None, None, None, None));

    let display_name = metadata_title.unwrap_or_else(|| stem.to_string());
    let created = metadata
        .created()
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        })
        .unwrap_or_default();

    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    let sidecar_json = sidecar
        .as_deref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    let (artist, album, album_artist, track_no, embedded_cover_path) = if is_audio_only_ext(ext) {
        let thumb_dir = parent.join(THUMB_DIR_NAME);
        let mm = extract_music_meta(path, sidecar_json.as_ref(), &thumb_dir, stem);
        (mm.artist, mm.album, mm.album_artist, mm.track_no, mm.embedded_cover_path)
    } else {
        (None, None, None, None, None)
    };

    let canonical = if is_audio_only_ext(ext) {
        read_canonical_meta(parent, stem)
    } else {
        CanonicalMeta { artist: None, album: None, title: None, year: None, mb_release_id: None, match_confidence: None }
    };

    let scrub_sprites_complete = if is_audio_only_ext(ext) || !is_scrub_sprite_video_ext(ext) {
        true
    } else {
        scrub_sprites_complete_for_path(path, duration)
    };

    let scrub_sprite_paths = if is_audio_only_ext(ext) || !is_scrub_sprite_video_ext(ext) {
        Vec::new()
    } else {
        list_scrub_sprite_paths_for_video(path)
    };

    Ok(MediaFile {
        name: display_name,
        path: path.to_string_lossy().to_string(),
        size: metadata.len(),
        created,
        duration,
        thumbnail_path,
        ruforge_poster_path,
        subtitle_path,
        chapters,
        download_metadata_hint,
        source_url,
        source_id,
        playlist_index,
        artist,
        album,
        album_artist,
        track_no,
        embedded_cover_path,
        canonical_artist: canonical.artist,
        canonical_album: canonical.album,
        canonical_title: canonical.title,
        year: canonical.year,
        mb_release_id: canonical.mb_release_id,
        match_confidence: canonical.match_confidence,
        scrub_sprites_complete,
        scrub_sprite_paths,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegroupPlaylistItem {
    pub index: u32,
    pub source_id: Option<String>,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegroupPlaylistResult {
    pub moved: u32,
    pub skipped: u32,
    pub not_found: u32,
    pub folder_path: String,
}

fn sanitize_playlist_folder_name_regroup(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return "playlist".to_string();
    }
    for ch in ['<', '>', ':', '"', '/', '\\', '|', '?', '*'] {
        s = s.replace(ch, "_");
    }
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.is_empty() {
        return "playlist".to_string();
    }
    if s.len() > 120 {
        s.truncate(120);
        s = s.trim().to_string();
    }
    s
}

fn sidecar_video_id_matches(sidecar_path: Option<&std::path::Path>, source_id: &str) -> bool {
    let Some(path) = sidecar_path else {
        return false;
    };
    let (_, _, _, _, source_url, sid, _) = ytdlp_sidecar_metadata(path);
    if sid.as_deref() == Some(source_id) {
        return true;
    }
    if let Some(url) = source_url.as_deref() {
        if let Some(id) = url
            .split("v=")
            .nth(1)
            .and_then(|rest| rest.split('&').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            if id == source_id {
                return true;
            }
        }
    }
    false
}

fn find_root_media_by_source_id(root: &Path, source_id: &str) -> Option<PathBuf> {
    let Ok(rd) = std::fs::read_dir(root) else {
        return None;
    };
    for ent in rd.flatten() {
        let p = ent.path();
        if !p.is_file() {
            continue;
        }
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !is_media_ext(ext) {
            continue;
        }
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let parent = p.parent().unwrap_or(root);
        let sidecar = resolve_info_json_path(parent, stem);
        if sidecar_video_id_matches(sidecar.as_deref(), source_id) {
            return Some(p);
        }
    }
    None
}

fn move_media_bundle(from_media: &Path, dest_media: &Path) -> Result<(), String> {
    if dest_media.exists() {
        return Err(format!(
            "Destination already exists: {}",
            dest_media.display()
        ));
    }
    let parent = from_media.parent().unwrap_or(Path::new("."));
    let src_stem = from_media.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let dest_parent = dest_media.parent().unwrap_or(Path::new("."));
    let dest_stem = dest_media.file_stem().and_then(|s| s.to_str()).unwrap_or("file");

    std::fs::rename(from_media, dest_media).map_err(|e| e.to_string())?;

    // Move flat sidecars: all known extensions across both stem variants.
    for candidate in [src_stem, strip_ytdlp_stream_suffix(src_stem)] {
        for ext in [
            "info.json",
            "..info.json",
            "jpg",
            "webp",
            "sponsorblock.json",
            "musicmeta.json",
            "lyrics.json",
            "comments.json",
        ] {
            let name = if ext == "..info.json" {
                format!("{}..info.json", candidate)
            } else {
                format!("{}.{ext}", candidate)
            };
            let side = parent.join(&name);
            if side.is_file() {
                let dest_name = if ext == "..info.json" {
                    format!("{}..info.json", dest_stem)
                } else {
                    format!("{}.{ext}", dest_stem)
                };
                let dest_side = dest_parent.join(dest_name);
                if !dest_side.exists() {
                    let _ = std::fs::rename(&side, &dest_side);
                }
            }
        }

        // Move all VTT sidecars (all language variants).
        if let Ok(vtts) = vtt_sidecars_for_stem(parent, candidate) {
            for (vtt_path, lang) in vtts {
                let dest_vtt_name = if lang == "und" {
                    format!("{dest_stem}.vtt")
                } else {
                    format!("{dest_stem}.{lang}.vtt")
                };
                let dest_vtt = dest_parent.join(dest_vtt_name);
                if !dest_vtt.exists() {
                    let _ = std::fs::rename(&vtt_path, &dest_vtt);
                }
            }
        }

        // Move .ruforge_thumbs/{stem}/ directory.
        let thumb_dir = parent.join(THUMB_DIR_NAME).join(candidate);
        if thumb_dir.is_dir() {
            let dest_thumb = dest_parent.join(THUMB_DIR_NAME).join(dest_stem);
            let _ = std::fs::create_dir_all(dest_thumb.parent().unwrap_or(Path::new(".")));
            if !dest_thumb.exists() {
                let _ = std::fs::rename(&thumb_dir, &dest_thumb);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn regroup_playlist_downloads(
    search_roots: Vec<String>,
    folder_title: String,
    items: Vec<RegroupPlaylistItem>,
) -> Result<RegroupPlaylistResult, String> {
    let roots: Vec<PathBuf> = search_roots
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect();
    if roots.is_empty() {
        return Err("No download folders to search.".into());
    }
    let primary = roots
        .first()
        .cloned()
        .ok_or_else(|| "No download folder.".to_string())?;
    if !primary.is_dir() {
        return Err("Download directory does not exist.".into());
    }
    let folder_name = sanitize_playlist_folder_name_regroup(&folder_title);
    let dest_dir = primary.join(&folder_name);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let mut moved = 0u32;
    let mut skipped = 0u32;
    let mut not_found = 0u32;

    for item in items {
        let Some(source_id) = item
            .source_id
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        else {
            not_found += 1;
            continue;
        };
        let mut src: Option<PathBuf> = None;
        for root in &roots {
            if let Some(p) = find_root_media_by_source_id(root, source_id) {
                src = Some(p);
                break;
            }
        }
        let Some(src) = src else {
            not_found += 1;
            continue;
        };
        if src.parent().map(|p| p == dest_dir).unwrap_or(false) {
            skipped += 1;
            continue;
        }
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp4");
        let safe_title = sanitize_playlist_folder_name_regroup(&item.title);
        let dest_name = format!("{:02} - {}.{}", item.index.max(1), safe_title, ext);
        let dest_path = dest_dir.join(&dest_name);
        match move_media_bundle(&src, &dest_path) {
            Ok(()) => moved += 1,
            Err(_) => skipped += 1,
        }
    }

    Ok(RegroupPlaylistResult {
        moved,
        skipped,
        not_found,
        folder_path: dest_dir.to_string_lossy().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_ytdlp_stream_suffix_removes_format_tail() {
        assert_eq!(
            strip_ytdlp_stream_suffix("My Video.f399"),
            "My Video"
        );
        assert_eq!(strip_ytdlp_stream_suffix("My Video"), "My Video");
    }

    #[test]
    fn strip_ytdlp_stream_suffix_removes_temp_merge_tail() {
        assert_eq!(
            strip_ytdlp_stream_suffix("My Video.temp"),
            "My Video"
        );
    }

    #[test]
    fn hard_skip_stranded_temp_when_final_mp4_exists() {
        let tmp = std::env::temp_dir().join(format!(
            "ruforge_gallery_temp_skip_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let _ = std::fs::create_dir_all(&tmp);
        let final_mp4 = tmp.join("My Video.mp4");
        let temp_mp4 = tmp.join("My Video.temp.mp4");
        let _ = std::fs::write(&final_mp4, b"x");
        let _ = std::fs::write(&temp_mp4, b"y");
        assert!(should_hard_skip_stranded_ytdlp_temp(&temp_mp4));
        assert!(!should_hard_skip_stranded_ytdlp_temp(&final_mp4));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn group_key_inherits_id_from_temp_stem_sidecar() {
        let tmp = std::env::temp_dir().join(format!(
            "ruforge_gallery_temp_key_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let _ = std::fs::create_dir_all(&tmp);
        let info = tmp.join("My Video.info.json");
        std::fs::write(
            &info,
            r#"{"id":"abc123","title":"My Video","webpage_url":"https://www.youtube.com/watch?v=abc123"}"#,
        )
        .expect("write info json");
        let temp_path = tmp.join("My Video.temp.mp4");
        let _ = std::fs::write(&temp_path, b"x").expect("write mp4");

        let file = media_file_from_path_for_cleanup(&temp_path).expect("media file");
        assert_eq!(file.source_id.as_deref(), Some("abc123"));
        assert_eq!(
            media_library_group_key(&temp_path, &file),
            "id:abc123"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn group_key_falls_back_to_title_when_no_sidecar_id() {
        let path = Path::new(r"C:\dl\My Video.f399.mp4");
        let file = MediaFile {
            name: "My Video".into(),
            path: path.display().to_string(),
            size: 72,
            created: 0,
            duration: 0.0,
            thumbnail_path: None,
            ruforge_poster_path: None,
            subtitle_path: None,
            chapters: None,
            download_metadata_hint: None,
            source_url: None,
            source_id: None,
            playlist_index: None,
            artist: None,
            album: None,
            album_artist: None,
            track_no: None,
            embedded_cover_path: None,
            canonical_artist: None,
            canonical_album: None,
            canonical_title: None,
            year: None,
            mb_release_id: None,
            match_confidence: None,
            scrub_sprites_complete: true,
            scrub_sprite_paths: Vec::new(),
        };
        let key = media_library_group_key(path, &file);
        assert!(key.starts_with("stem:"));
        assert!(key.contains("my video"));
    }

    #[test]
    fn keep_score_prefers_muxed_over_intermediate() {
        let parent = Path::new(r"C:\dl");
        let muxed = MediaFile {
            name: "My Video".into(),
            path: parent.join("My Video.mp4").display().to_string(),
            size: 84_000_000,
            created: 0,
            duration: 924.0,
            thumbnail_path: None,
            ruforge_poster_path: None,
            subtitle_path: None,
            chapters: None,
            download_metadata_hint: None,
            source_url: None,
            source_id: Some("abc123".into()),
            playlist_index: None,
            artist: None,
            album: None,
            album_artist: None,
            track_no: None,
            embedded_cover_path: None,
            canonical_artist: None,
            canonical_album: None,
            canonical_title: None,
            year: None,
            mb_release_id: None,
            match_confidence: None,
            scrub_sprites_complete: true,
            scrub_sprite_paths: Vec::new(),
        };
        let intermediate = MediaFile {
            name: "My Video".into(),
            path: parent.join("My Video.f399.mp4").display().to_string(),
            size: 72_000_000,
            created: 0,
            duration: 0.0,
            thumbnail_path: None,
            ruforge_poster_path: None,
            subtitle_path: None,
            chapters: None,
            download_metadata_hint: None,
            source_url: None,
            source_id: None,
            playlist_index: None,
            artist: None,
            album: None,
            album_artist: None,
            track_no: None,
            embedded_cover_path: None,
            canonical_artist: None,
            canonical_album: None,
            canonical_title: None,
            year: None,
            mb_release_id: None,
            match_confidence: None,
            scrub_sprites_complete: true,
            scrub_sprite_paths: Vec::new(),
        };
        let muxed_path = Path::new(&muxed.path);
        let inter_path = Path::new(&intermediate.path);
        assert!(
            media_library_keep_score(muxed_path, &muxed)
                > media_library_keep_score(inter_path, &intermediate)
        );
        assert_eq!(
            media_library_group_key(muxed_path, &muxed),
            "id:abc123"
        );
        let inter_key = media_library_group_key(inter_path, &intermediate);
        assert!(inter_key.starts_with("stem:"));
    }

    #[test]
    fn group_key_inherits_id_from_muxed_sidecar_stem() {
        let tmp = std::env::temp_dir().join(format!(
            "ruforge_gallery_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let _ = std::fs::create_dir_all(&tmp);
        let info = tmp.join("My Video.info.json");
        std::fs::write(
            &info,
            r#"{"id":"abc123","title":"My Video","webpage_url":"https://www.youtube.com/watch?v=abc123"}"#,
        )
        .expect("write info json");
        let inter_path = tmp.join("My Video.f399.mp4");
        let _ = std::fs::write(&inter_path, b"x").expect("write mp4");

        let file = media_file_from_path_for_cleanup(&inter_path).expect("media file");
        assert_eq!(file.source_id.as_deref(), Some("abc123"));
        assert_eq!(
            media_library_group_key(&inter_path, &file),
            "id:abc123"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }

    fn test_media(path: &str) -> MediaFile {
        MediaFile {
            name: path.into(),
            path: path.into(),
            size: 1,
            created: 1,
            duration: 10.0,
            thumbnail_path: None,
            ruforge_poster_path: None,
            subtitle_path: None,
            chapters: None,
            download_metadata_hint: None,
            source_url: None,
            source_id: None,
            playlist_index: None,
            artist: None,
            album: None,
            album_artist: None,
            track_no: None,
            embedded_cover_path: None,
            canonical_artist: None,
            canonical_album: None,
            canonical_title: None,
            year: None,
            mb_release_id: None,
            match_confidence: None,
            scrub_sprites_complete: false,
            scrub_sprite_paths: Vec::new(),
        }
    }

    #[test]
    fn remove_paths_drops_flat_media_case_insensitively() {
        let entries = vec![
            GalleryEntry::Media {
                file: test_media(r"C:\Videos\A.mp4"),
            },
            GalleryEntry::Media {
                file: test_media(r"C:\Videos\B.mp4"),
            },
        ];
        let mut keys = HashSet::new();
        keys.insert(gallery_path_key(r"c:/videos/a.mp4"));
        let next = remove_paths_from_gallery_entries(&entries, &keys);
        assert_eq!(next.len(), 1);
        match &next[0] {
            GalleryEntry::Media { file } => assert!(file.path.ends_with("B.mp4")),
            _ => panic!("expected media"),
        }
    }

    #[test]
    fn remove_paths_drops_empty_playlist() {
        let entries = vec![GalleryEntry::Playlist {
            playlist: PlaylistCollection {
                title: "P".into(),
                path: "P".into(),
                item_count: 1,
                combined_duration: 10.0,
                stack_thumbnail_path: None,
                items: vec![test_media("a.mp3")],
            },
        }];
        let mut keys = HashSet::new();
        keys.insert(gallery_path_key("a.mp3"));
        let next = remove_paths_from_gallery_entries(&entries, &keys);
        assert!(next.is_empty());
    }

    #[test]
    fn retain_existing_drops_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        let alive = dir.path().join("alive.mp4");
        std::fs::write(&alive, b"x").unwrap();
        let entries = vec![
            GalleryEntry::Media {
                file: test_media(&alive.to_string_lossy()),
            },
            GalleryEntry::Media {
                file: test_media(&dir.path().join("gone.mp4").to_string_lossy()),
            },
        ];
        let next = retain_existing_media_entries(entries);
        assert_eq!(next.len(), 1);
        match &next[0] {
            GalleryEntry::Media { file } => assert_eq!(Path::new(&file.path), alive.as_path()),
            _ => panic!("expected media"),
        }
    }
}
