use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

use crate::companion::remux;
use crate::companion::CompanionInner;

const MEDIA_EXTENSIONS: [&str; 6] = ["mp4", "webm", "mkv", "mov", "avi", "m4v"];
const PLAYABLE_CONTAINERS: [&str; 2] = ["mp4", "webm"];
const PLAYABLE_VIDEO_CODECS: [&str; 4] = ["h264", "vp8", "vp9", "av1"];
const PLAYABLE_AUDIO_CODECS: [&str; 4] = ["aac", "opus", "vorbis", "mp3"];

#[derive(Debug, Clone)]
pub struct CatalogEntry {
    pub id: String,
    pub path: PathBuf,
    pub serve_path: PathBuf,
    pub title: String,
    pub duration_secs: u32,
    pub container: String,
    pub video_codec: String,
    pub audio_codec: String,
    pub playable: bool,
    pub thumb_path: Option<PathBuf>,
    pub size_bytes: u64,
    pub mtime: i64,
}

fn stable_id(canonical: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(canonical.to_string_lossy().as_bytes());
    let digest = hasher.finalize();
    digest
        .iter()
        .take(8)
        .map(|b| format!("{:02x}", b))
        .collect()
}

fn walk_media_files(root: &Path, out: &mut Vec<PathBuf>) {
    let Ok(read_dir) = std::fs::read_dir(root) else {
        return;
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_media_files(&path, out);
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if MEDIA_EXTENSIONS.contains(&ext.as_str()) {
            out.push(path);
        }
    }
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

fn is_playable(container: &str, video_codec: &str, audio_codec: &str) -> bool {
    PLAYABLE_CONTAINERS.contains(&container)
        && PLAYABLE_VIDEO_CODECS.contains(&video_codec)
        && (audio_codec.is_empty() || PLAYABLE_AUDIO_CODECS.contains(&audio_codec))
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

struct ProbeResult {
    container: String,
    video_codec: String,
    audio_codec: String,
    duration_secs: u32,
}

async fn probe_media(app: &AppHandle, path: &Path) -> Option<ProbeResult> {
    let output = app
        .shell()
        .sidecar("ffprobe")
        .ok()?
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &path.to_string_lossy(),
        ])
        .output()
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

fn catalog_version_hash(entries: &HashMap<String, CatalogEntry>) -> String {
    let mut ids: Vec<&String> = entries.keys().collect();
    ids.sort();
    let mut hasher = DefaultHasher::new();
    for id in ids {
        id.hash(&mut hasher);
        entries[id].mtime.hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

pub async fn rebuild(app: &AppHandle, state: &CompanionInner) {
    let remux_dir = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|d| d.join("companion-remux"));
    if let Some(dir) = &remux_dir {
        let _ = std::fs::create_dir_all(dir);
    }

    let roots = &state.media_roots;
    let mut files = Vec::new();
    for root in roots {
        walk_media_files(root, &mut files);
    }

    let mut entries: HashMap<String, CatalogEntry> = HashMap::new();
    for path in files {
        let Ok(canonical) = path.canonicalize() else {
            continue;
        };
        let id = stable_id(&canonical);
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
        let title = canonical
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let probe = probe_media(app, &canonical).await;
        let (mut container, video_codec, audio_codec, duration_secs) = match probe {
            Some(p) => (p.container, p.video_codec, p.audio_codec, p.duration_secs),
            None => (String::new(), String::new(), String::new(), 0),
        };

        let mut serve_path = canonical.clone();
        let mut playable = is_playable(&container, &video_codec, &audio_codec);

        if !playable
            && !container.is_empty()
            && PLAYABLE_VIDEO_CODECS.contains(&video_codec.as_str())
            && (audio_codec.is_empty() || PLAYABLE_AUDIO_CODECS.contains(&audio_codec.as_str()))
        {
            if let Some(dir) = &remux_dir {
                if let Some(remuxed) = remux::ensure_remuxed(app, dir, &id, &canonical).await {
                    serve_path = remuxed;
                    container = "mp4".to_string();
                    playable = true;
                }
            }
        }

        let thumb_path = find_sibling_thumb(&canonical);

        entries.insert(
            id.clone(),
            CatalogEntry {
                id,
                path: canonical,
                serve_path,
                title,
                duration_secs,
                container,
                video_codec,
                audio_codec,
                playable,
                thumb_path,
                size_bytes,
                mtime,
            },
        );
    }

    let version = catalog_version_hash(&entries);
    *state.catalog.write().await = entries;
    *state.catalog_version.write().await = version;
}
