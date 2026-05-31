use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MANIFEST_FILENAME: &str = "recently-deleted.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentlyDeletedEntry {
    pub id: String,
    pub title: String,
    pub media_path: String,
    pub deleted_at: String,
    pub files: Vec<String>,
    pub recoverable: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Manifest {
    entries: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    id: String,
    title: String,
    media_path: String,
    deleted_at: String,
    files: Vec<String>,
}

fn manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join(MANIFEST_FILENAME))
}

fn read_manifest(app: &AppHandle) -> Result<Manifest, String> {
    let path = manifest_path(app)?;
    if !path.is_file() {
        return Ok(Manifest::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid recently-deleted manifest: {e}"))
}

fn write_manifest(app: &AppHandle, manifest: &Manifest) -> Result<(), String> {
    let path = manifest_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

pub fn append_manifest_entry(
    app: &AppHandle,
    title: &str,
    media_path: &str,
    files: Vec<String>,
) -> Result<String, String> {
    let mut manifest = read_manifest(app)?;
    let id = format!(
        "{}-{:x}",
        Utc::now().timestamp_millis(),
        media_path.len() as u64 ^ files.len() as u64
    );
    manifest.entries.insert(
        0,
        ManifestEntry {
            id: id.clone(),
            title: title.to_string(),
            media_path: media_path.to_string(),
            deleted_at: Utc::now().to_rfc3339(),
            files,
        },
    );
    if manifest.entries.len() > 200 {
        manifest.entries.truncate(200);
    }
    write_manifest(app, &manifest)?;
    Ok(id)
}

fn entry_recoverable(media_path: &str, files: &[String]) -> bool {
    let media = Path::new(media_path);
    if media.is_file() {
        return true;
    }
    if path_recoverable_from_trash(media) {
        return true;
    }
    files
        .iter()
        .any(|f| path_recoverable_from_trash(Path::new(f)))
}

#[cfg(windows)]
fn path_recoverable_from_trash(original: &Path) -> bool {
    find_recycle_pair(original).is_some()
}

#[cfg(not(windows))]
fn path_recoverable_from_trash(original: &Path) -> bool {
    find_freedesktop_trash_pair(original).is_some()
}

#[cfg(windows)]
fn restore_path_from_trash(original: &Path) -> Result<(), String> {
    let (r_path, i_path) = find_recycle_pair(original)
        .ok_or_else(|| format!("Not in Recycle Bin: {}", original.display()))?;
    if let Some(parent) = original.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if original.exists() {
        return Err(format!("Restore blocked, path exists: {}", original.display()));
    }
    std::fs::rename(&r_path, original).or_else(|_| {
        std::fs::copy(&r_path, original).map_err(|e| e.to_string())?;
        std::fs::remove_file(&r_path).map_err(|e| e.to_string())
    })?;
    let _ = std::fs::remove_file(&i_path);
    Ok(())
}

#[cfg(not(windows))]
fn restore_path_from_trash(original: &Path) -> Result<(), String> {
    let (content, info) = find_freedesktop_trash_pair(original)
        .ok_or_else(|| format!("Not in trash: {}", original.display()))?;
    if let Some(parent) = original.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if original.exists() {
        return Err(format!("Restore blocked, path exists: {}", original.display()));
    }
    std::fs::rename(&content, original).or_else(|_| {
        std::fs::copy(&content, original).map_err(|e| e.to_string())?;
        std::fs::remove_file(&content).map_err(|e| e.to_string())
    })?;
    let _ = std::fs::remove_file(&info);
    Ok(())
}

#[cfg(windows)]
fn find_recycle_pair(original: &Path) -> Option<(PathBuf, PathBuf)> {
    let canonical = original.to_string_lossy();
    let drive = original
        .components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy().to_string())?;
    let recycle_root = PathBuf::from(format!("{drive}\\$Recycle.Bin"));
    if !recycle_root.is_dir() {
        return None;
    }
    let target = canonical.replace('/', "\\");
    let target_lower = target.to_ascii_lowercase();

    let Ok(sid_dirs) = std::fs::read_dir(&recycle_root) else {
        return None;
    };
    for sid_entry in sid_dirs.flatten() {
        let sid_path = sid_entry.path();
        if !sid_path.is_dir() {
            continue;
        }
        let Ok(info_files) = std::fs::read_dir(&sid_path) else {
            continue;
        };
        for info_entry in info_files.flatten() {
            let i_path = info_entry.path();
            let Some(name) = i_path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !name.starts_with("$I") {
                continue;
            }
            let Some(parsed) = parse_recycle_info_path(&i_path) else {
                continue;
            };
            if parsed.replace('/', "\\").to_ascii_lowercase() != target_lower {
                continue;
            }
            let r_name = format!("$R{}", &name[2..]);
            let r_path = sid_path.join(r_name);
            if r_path.is_file() {
                return Some((r_path, i_path));
            }
        }
    }
    None
}

#[cfg(windows)]
fn parse_recycle_info_path(i_path: &Path) -> Option<String> {
    let data = std::fs::read(i_path).ok()?;
    if data.len() < 32 {
        return None;
    }
    let name_len = u32::from_le_bytes(data[24..28].try_into().ok()?) as usize;
    let path_start = 28usize;
    let byte_len = name_len.saturating_mul(2);
    if path_start.saturating_add(byte_len) > data.len() {
        return None;
    }
    let utf16: Vec<u16> = data[path_start..path_start + byte_len]
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let s = String::from_utf16_lossy(&utf16);
    let trimmed = s.trim_end_matches('\0').trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[cfg(not(windows))]
fn trash_home() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .map(|p| p.join("Trash"))
        .or_else(|| {
            dirs::home_dir().map(|h| h.join(".local/share/Trash"))
        })
}

#[cfg(not(windows))]
fn find_freedesktop_trash_pair(original: &Path) -> Option<(PathBuf, PathBuf)> {
    let trash = trash_home()?;
    let info_dir = trash.join("info");
    let files_dir = trash.join("files");
    let target = original.to_string_lossy().to_string();
    let Ok(entries) = std::fs::read_dir(&info_dir) else {
        return None;
    };
    for entry in entries.flatten() {
        let info_path = entry.path();
        if !info_path.extension().is_some_and(|e| e == "trashinfo") {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&info_path) else {
            continue;
        };
        let Some(path_line) = raw.lines().find(|l| l.starts_with("Path=")) else {
            continue;
        };
        let stored = path_line.trim_start_matches("Path=").trim();
        if stored != target {
            continue;
        }
        let base = info_path.file_stem()?.to_str()?;
        let content = files_dir.join(base);
        if content.exists() {
            return Some((content, info_path));
        }
    }
    None
}

#[tauri::command]
pub fn list_recently_deleted(app: AppHandle) -> Result<Vec<RecentlyDeletedEntry>, String> {
    let manifest = read_manifest(&app)?;
    Ok(manifest
        .entries
        .into_iter()
        .map(|e| {
            let recoverable = entry_recoverable(&e.media_path, &e.files);
            RecentlyDeletedEntry {
                id: e.id,
                title: e.title,
                media_path: e.media_path,
                deleted_at: e.deleted_at,
                files: e.files,
                recoverable,
            }
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRecentlyDeletedResult {
    pub restored: bool,
    pub recoverable: bool,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub async fn restore_recently_deleted(
    app: AppHandle,
    entry_id: String,
) -> Result<RestoreRecentlyDeletedResult, String> {
    let mut manifest = read_manifest(&app)?;
    let idx = manifest
        .entries
        .iter()
        .position(|e| e.id == entry_id)
        .ok_or_else(|| "Recently deleted entry not found".to_string())?;
    let entry = manifest.entries[idx].clone();

    if !entry_recoverable(&entry.media_path, &entry.files) {
        return Ok(RestoreRecentlyDeletedResult {
            restored: false,
            recoverable: false,
            warnings: vec!["Files are no longer in the system trash.".into()],
        });
    }

    let mut warnings = Vec::new();
    let mut restored_count = 0u32;
    for file in &entry.files {
        let path = Path::new(file);
        if path.is_file() {
            restored_count += 1;
            continue;
        }
        match restore_path_from_trash(path) {
            Ok(()) => restored_count += 1,
            Err(e) => warnings.push(e),
        }
    }

    let media = Path::new(&entry.media_path);
    if !media.is_file() {
        return Ok(RestoreRecentlyDeletedResult {
            restored: false,
            recoverable: entry_recoverable(&entry.media_path, &entry.files),
            warnings,
        });
    }

    if restored_count == 0 && !warnings.is_empty() {
        return Ok(RestoreRecentlyDeletedResult {
            restored: false,
            recoverable: entry_recoverable(&entry.media_path, &entry.files),
            warnings,
        });
    }

    manifest.entries.remove(idx);
    write_manifest(&app, &manifest)?;

    Ok(RestoreRecentlyDeletedResult {
        restored: true,
        recoverable: true,
        warnings,
    })
}

#[tauri::command]
pub fn remove_recently_deleted_entry(app: AppHandle, entry_id: String) -> Result<(), String> {
    let mut manifest = read_manifest(&app)?;
    let len_before = manifest.entries.len();
    manifest.entries.retain(|e| e.id != entry_id);
    if manifest.entries.len() == len_before {
        return Err("Recently deleted entry not found".into());
    }
    write_manifest(&app, &manifest)
}
