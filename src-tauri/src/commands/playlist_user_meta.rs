//! View settings for playlists that live on disk: custom order, name, description, start video and
//! videos linked in from elsewhere in the library (they stay where they are on disk).
//! Kept in their own dotfile instead of `.ruforge-playlist.json` because the downloader rewrites
//! that sidecar on every re-download, and folders from pasted lists have no sidecar at all.
//! Files are matched by name, so moving the folder keeps the order.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::music_playlists::write_atomic;

const USER_META_FILENAME: &str = ".ruforge-playlist-user.json";
const SEEN_FILENAME: &str = "playlist-seen.json";
const PENDING_JOINS_FILENAME: &str = "playlist-pending-joins.json";
const TITLE_MAX: usize = 100;
const DESCRIPTION_MAX: usize = 300;
const ORDER_MAX: usize = 20_000;
const FILE_MAX_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiskPlaylistUserMeta {
    /// File names (not paths) in the order the user chose; files not listed sort after these.
    pub order: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// File name of the video Start over begins at.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_file: Option<String>,
    /// Full paths of library videos saved to this playlist without moving them into the folder.
    pub added: Vec<String>,
}

fn is_plain_file_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\', '\0'])
}

fn clean_text(value: Option<String>, max: usize) -> Option<String> {
    value
        .map(|s| s.trim().chars().take(max).collect::<String>())
        .filter(|s| !s.is_empty())
}

fn sanitize(meta: DiskPlaylistUserMeta) -> DiskPlaylistUserMeta {
    DiskPlaylistUserMeta {
        order: meta
            .order
            .into_iter()
            .filter(|n| is_plain_file_name(n))
            .take(ORDER_MAX)
            .collect(),
        title: clean_text(meta.title, TITLE_MAX),
        description: clean_text(meta.description, DESCRIPTION_MAX),
        start_file: meta.start_file.filter(|n| is_plain_file_name(n)),
        added: meta
            .added
            .into_iter()
            .filter(|p| !p.trim().is_empty() && !p.contains('\0') && Path::new(p).is_absolute())
            .take(ORDER_MAX)
            .collect(),
    }
}

fn read_meta(folder: &Path) -> Option<DiskPlaylistUserMeta> {
    let path = folder.join(USER_META_FILENAME);
    let len = std::fs::metadata(&path).ok()?.len();
    if len > FILE_MAX_BYTES {
        return None;
    }
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

/// Folders without a settings file are left out of the answer.
#[tauri::command]
pub fn read_disk_playlist_user_meta(
    app: AppHandle,
    folders: Vec<String>,
) -> Result<HashMap<String, DiskPlaylistUserMeta>, String> {
    let mut out = HashMap::new();
    for raw in folders {
        let Ok(folder) = crate::library::path_access::allow_path(&app, &raw) else {
            continue;
        };
        if let Some(meta) = read_meta(&folder) {
            out.insert(raw, meta);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn write_disk_playlist_user_meta(
    app: AppHandle,
    folder: String,
    meta: DiskPlaylistUserMeta,
) -> Result<(), String> {
    let dir = crate::library::path_access::allow_library_path(&app, &folder)?;
    if !dir.is_dir() {
        return Err("Playlist folder not found.".into());
    }
    let meta = sanitize(meta);
    let path = dir.join(USER_META_FILENAME);
    let empty = meta.order.is_empty()
        && meta.title.is_none()
        && meta.description.is_none()
        && meta.start_file.is_none()
        && meta.added.is_empty();
    if empty {
        if path.is_file() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    write_atomic(&path, &json)
}

fn seen_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join(SEEN_FILENAME))
}

/// When each playlist was last opened, for the "New" badge. `None` before the first write.
#[tauri::command]
pub fn read_playlist_seen_file(app: AppHandle) -> Result<Option<String>, String> {
    let path = seen_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

fn pending_joins_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join(PENDING_JOINS_FILENAME))
}

/// Dropped videos still downloading and the playlist each should join. `None` before the first write.
#[tauri::command]
pub fn read_playlist_pending_joins(app: AppHandle) -> Result<Option<String>, String> {
    let path = pending_joins_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_playlist_pending_joins(app: AppHandle, contents: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("Refusing to write invalid pending joins JSON: {e}"))?;
    write_atomic(&pending_joins_path(&app)?, &contents)
}

#[tauri::command]
pub fn write_playlist_seen_file(app: AppHandle, contents: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("Refusing to write invalid playlist seen JSON: {e}"))?;
    write_atomic(&seen_path(&app)?, &contents)
}
