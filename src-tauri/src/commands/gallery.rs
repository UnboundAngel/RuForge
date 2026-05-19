use serde::{Deserialize, Serialize};

use crate::utils::{is_media_ext, primary_vtt_sidecar, POSTER_FILE, THUMB_DIR_NAME};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Debug, Serialize, Deserialize)]
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
}

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize)]
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

fn resolve_info_json_path(parent: &std::path::Path, stem: &str) -> Option<std::path::PathBuf> {
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

fn source_id_from_ytdlp_info(json: &serde_json::Value) -> Option<String> {
    json["id"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
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
) {
    std::fs::read_to_string(info_json_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .map(|json| {
            let duration = json["duration"]
                .as_f64()
                .or_else(|| json["duration"].as_u64().map(|u| u as f64))
                .or_else(|| json["duration"].as_i64().map(|i| i as f64))
                .unwrap_or(0.0);
            let chapters = json["chapters"].as_array().map(|arr| {
                arr.iter()
                    .filter_map(|c| {
                        Some(Chapter {
                            title: c["title"].as_str().unwrap_or("Chapter").to_string(),
                            start_time: c["start_time"].as_f64().unwrap_or(0.0),
                            end_time: c["end_time"].as_f64().unwrap_or(0.0),
                        })
                    })
                    .collect::<Vec<Chapter>>()
            });
            let metadata_title = json["title"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from);
            let download_metadata_hint = download_metadata_hint_from_ytdlp_info(&json);
            let source_url = json["webpage_url"].as_str().map(String::from);
            let source_id = source_id_from_ytdlp_info(&json);
            (
                duration,
                chapters,
                metadata_title,
                download_metadata_hint,
                source_url,
                source_id,
            )
        })
        .unwrap_or((0.0, None, None, None, None, None))
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
            let p = parent.join(THUMB_DIR_NAME).join(stem).join(POSTER_FILE);
            if p.is_file() {
                Some(p.to_string_lossy().to_string())
            } else {
                None
            }
        };

        let subtitle_path = primary_vtt_sidecar(parent, stem).map(|p| p.to_string_lossy().to_string());

        let sidecar = resolve_info_json_path(parent, stem);
        let (duration, chapters, metadata_title, download_metadata_hint, source_url, source_id) =
            sidecar
                .as_deref()
                .map(ytdlp_sidecar_metadata)
                .unwrap_or((0.0, None, None, None, None, None));

        let display_name = metadata_title.unwrap_or_else(|| stem.to_string());

        let created = match metadata.created() {
            Ok(time) => time
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            Err(_) => 0,
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
        });
    }
    files
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

#[tauri::command]
pub async fn scan_gallery(dir: String) -> Result<Vec<GalleryEntry>, String> {
    let dir_path = std::path::Path::new(&dir);
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
            .cmp(
                &b.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
            )
    });

    for path in entries {
        let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if gallery_skip_subdirectory(fname) {
            continue;
        }

        if path.is_file() {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_media_ext(ext) {
                let media = scan_media_file_direct(&path)?;
                out.push(GalleryEntry::Media { file: media });
            }
        } else if path.is_dir() {
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
                    items
                        .iter()
                        .find_map(|it| it.ruforge_poster_path.clone().or_else(|| it.thumbnail_path.clone()))
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
        let p = parent.join(THUMB_DIR_NAME).join(stem).join(POSTER_FILE);
        if p.is_file() {
            Some(p.to_string_lossy().to_string())
        } else {
            None
        }
    };

    let subtitle_path = {
        let p = parent.join(format!("{}.vtt", stem));
        if p.is_file() {
            Some(p.to_string_lossy().to_string())
        } else {
            None
        }
    };

    let sidecar = resolve_info_json_path(parent, stem);
    let (duration, chapters, metadata_title, download_metadata_hint, source_url, source_id) = sidecar
        .as_deref()
        .map(ytdlp_sidecar_metadata)
        .unwrap_or((0.0, None, None, None, None, None));

    let display_name = metadata_title.unwrap_or_else(|| stem.to_string());
    let created = metadata
        .created()
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        })
        .unwrap_or_default();

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
    })
}
