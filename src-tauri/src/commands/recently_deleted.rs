use std::collections::HashMap;
#[cfg(windows)]
use std::collections::HashSet;
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

fn entry_recoverable(media_path: &str, files: &[String], index: &TrashIndex) -> bool {
    let media = Path::new(media_path);
    if media.is_file() {
        return true;
    }
    if index.contains(media) {
        return true;
    }
    files.iter().any(|f| index.contains(Path::new(f)))
}

#[derive(Default)]
struct TrashIndex {
    pairs: HashMap<String, (PathBuf, PathBuf)>,
}

impl TrashIndex {
    fn path_key(path: &Path) -> String {
        path.to_string_lossy().replace('/', "\\").to_ascii_lowercase()
    }

    fn contains(&self, path: &Path) -> bool {
        self.pairs.contains_key(&Self::path_key(path))
    }

    fn pair(&self, path: &Path) -> Option<(PathBuf, PathBuf)> {
        self.pairs.get(&Self::path_key(path)).cloned()
    }

    fn for_paths<'a>(paths: impl IntoIterator<Item = &'a str>) -> Self {
        let mut index = Self::default();
        #[cfg(windows)]
        {
            let mut drives = HashSet::new();
            for p in paths {
                if let Some(drive) = Path::new(p).components().next() {
                    drives.insert(drive.as_os_str().to_string_lossy().into_owned());
                }
            }
            for drive in drives {
                index.scan_windows_drive(&drive);
            }
        }
        #[cfg(not(windows))]
        {
            let _ = paths;
            index.scan_freedesktop();
        }
        index
    }

    #[cfg(windows)]
    fn scan_windows_drive(&mut self, drive: &str) {
        let recycle_root = PathBuf::from(format!("{drive}\\$Recycle.Bin"));
        if !recycle_root.is_dir() {
            return;
        }
        let Ok(sid_dirs) = std::fs::read_dir(&recycle_root) else {
            return;
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
                let r_name = format!("$R{}", &name[2..]);
                let r_path = sid_path.join(r_name);
                if r_path.is_file() {
                    let key = parsed.replace('/', "\\").to_ascii_lowercase();
                    self.pairs.insert(key, (r_path, i_path));
                }
            }
        }
    }

    #[cfg(not(windows))]
    fn scan_freedesktop(&mut self) {
        let Some(trash) = trash_home() else {
            return;
        };
        let info_dir = trash.join("info");
        let files_dir = trash.join("files");
        let Ok(entries) = std::fs::read_dir(&info_dir) else {
            return;
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
            let Some(base) = info_path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let content = files_dir.join(base);
            if content.exists() {
                self.pairs
                    .insert(Self::path_key(Path::new(stored)), (content, info_path));
            }
        }
    }
}

fn restore_path_from_trash(original: &Path, index: &TrashIndex) -> Result<(), String> {
    let (r_path, i_path) = index
        .pair(original)
        .ok_or_else(|| format!("Not in system trash: {}", original.display()))?;
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

fn list_recently_deleted_sync(app: &AppHandle) -> Result<Vec<RecentlyDeletedEntry>, String> {
    let manifest = read_manifest(app)?;
    let index = TrashIndex::for_paths(manifest.entries.iter().flat_map(|e| {
        std::iter::once(e.media_path.as_str()).chain(e.files.iter().map(String::as_str))
    }));
    Ok(manifest
        .entries
        .into_iter()
        .map(|e| {
            let recoverable = entry_recoverable(&e.media_path, &e.files, &index);
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

#[tauri::command]
pub async fn list_recently_deleted(app: AppHandle) -> Result<Vec<RecentlyDeletedEntry>, String> {
    tokio::task::spawn_blocking(move || list_recently_deleted_sync(&app))
        .await
        .map_err(|e| e.to_string())?
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
    let index = TrashIndex::for_paths(
        std::iter::once(entry.media_path.as_str()).chain(entry.files.iter().map(String::as_str)),
    );

    if !entry_recoverable(&entry.media_path, &entry.files, &index) {
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
        match restore_path_from_trash(path, &index) {
            Ok(()) => restored_count += 1,
            Err(e) => warnings.push(e),
        }
    }

    let media = Path::new(&entry.media_path);
    if !media.is_file() {
        return Ok(RestoreRecentlyDeletedResult {
            restored: false,
            recoverable: entry_recoverable(&entry.media_path, &entry.files, &index),
            warnings,
        });
    }

    if restored_count == 0 && !warnings.is_empty() {
        return Ok(RestoreRecentlyDeletedResult {
            restored: false,
            recoverable: entry_recoverable(&entry.media_path, &entry.files, &index),
            warnings,
        });
    }

    manifest.entries.remove(idx);
    write_manifest(&app, &manifest)?;

    if let Some(lib) = app.try_state::<crate::library::LibraryState>() {
        let _ = lib.reindex(&app).await;
    }

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
