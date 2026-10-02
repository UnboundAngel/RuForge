use std::collections::{HashMap, HashSet};
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
    /// Thumbnail or poster, read from its original path or its trashed copy.
    pub preview_path: Option<String>,
    pub size_bytes: Option<u64>,
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
    let key = TrashIndex::path_key(Path::new(media_path));
    manifest
        .entries
        .retain(|e| TrashIndex::path_key(Path::new(&e.media_path)) != key);
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

/// Maps an original path key to the trashed content and, where the platform keeps one, its info file.
#[derive(Default)]
struct TrashIndex {
    pairs: HashMap<String, (PathBuf, Option<PathBuf>)>,
}

impl TrashIndex {
    fn path_key(path: &Path) -> String {
        path.to_string_lossy().replace('/', "\\").to_ascii_lowercase()
    }

    fn contains(&self, path: &Path) -> bool {
        self.pairs.contains_key(&Self::path_key(path))
    }

    fn pair(&self, path: &Path) -> Option<(PathBuf, Option<PathBuf>)> {
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
        #[cfg(target_os = "macos")]
        for p in paths {
            index.scan_macos_trash_for(Path::new(p));
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let _ = paths;
            index.scan_freedesktop();
        }
        #[cfg(not(any(windows, unix)))]
        {
            let _ = paths;
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
                    self.pairs.insert(key, (r_path, Some(i_path)));
                }
            }
        }
    }

    /// Finder's Trash keeps no record of the original path, so the best match is a same-named
    /// item in `~/.Trash`. Finder renames on collisions, which this misses.
    #[cfg(target_os = "macos")]
    fn scan_macos_trash_for(&mut self, original: &Path) {
        let Some(name) = original.file_name() else {
            return;
        };
        let Some(home) = dirs::home_dir() else {
            return;
        };
        let content = home.join(".Trash").join(name);
        if content.exists() {
            self.pairs.insert(Self::path_key(original), (content, None));
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
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
            let stored = percent_decode_trash_path(path_line.trim_start_matches("Path=").trim());
            let Some(base) = info_path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let content = files_dir.join(base);
            if content.exists() {
                self.pairs
                    .insert(Self::path_key(Path::new(&stored)), (content, Some(info_path)));
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
    if let Some(i_path) = i_path {
        let _ = std::fs::remove_file(&i_path);
    }
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

/// The freedesktop spec stores `Path=` URL-escaped, so a file named `My Song.mp3` reads back as
/// `My%20Song.mp3`.
#[cfg(all(unix, not(target_os = "macos")))]
fn percent_decode_trash_path(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok());
            if let Some(v) = hex {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(all(unix, not(target_os = "macos")))]
fn trash_home() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .map(|p| p.join("Trash"))
        .or_else(|| {
            dirs::home_dir().map(|h| h.join(".local/share/Trash"))
        })
}

/// The original path while it still exists, otherwise the trashed copy (keeps its extension on Windows).
fn live_or_trashed(path: &Path, index: &TrashIndex) -> Option<PathBuf> {
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    if let Some((content, _)) = index.pair(path) {
        return content.is_file().then_some(content);
    }
    let parent = path.parent()?;
    let (dir, _) = index.pair(parent)?;
    let inner = dir.join(path.file_name()?);
    inner.is_file().then_some(inner)
}

fn preview_path(media_path: &str, index: &TrashIndex) -> Option<String> {
    let media = Path::new(media_path);
    let stem = media.file_stem()?.to_str()?;
    let parent = media.parent()?;
    [
        parent.join(format!("{stem}.jpg")),
        parent.join(format!("{stem}.webp")),
        crate::utils::thumb_dir_for_stem(parent, stem).join(crate::utils::POSTER_FILE),
    ]
    .iter()
    .find_map(|c| live_or_trashed(c, index))
    .map(|p| p.to_string_lossy().into_owned())
}

fn media_size_bytes(media_path: &str, index: &TrashIndex) -> Option<u64> {
    live_or_trashed(Path::new(media_path), index)
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
}

/// Keeps the newest entry per media path. The trash index holds one copy per original path,
/// so older entries for a re-downloaded and re-deleted file would all point at the same item.
fn dedupe_by_media_path(entries: &mut Vec<ManifestEntry>) -> bool {
    let before = entries.len();
    let mut seen = HashSet::new();
    entries.retain(|e| seen.insert(TrashIndex::path_key(Path::new(&e.media_path))));
    entries.len() != before
}

fn list_recently_deleted_sync(app: &AppHandle) -> Result<Vec<RecentlyDeletedEntry>, String> {
    let mut manifest = read_manifest(app)?;
    if dedupe_by_media_path(&mut manifest.entries) {
        let _ = write_manifest(app, &manifest);
    }
    let index = TrashIndex::for_paths(manifest.entries.iter().flat_map(|e| {
        std::iter::once(e.media_path.as_str()).chain(e.files.iter().map(String::as_str))
    }));
    Ok(manifest
        .entries
        .into_iter()
        .map(|e| {
            let recoverable = entry_recoverable(&e.media_path, &e.files, &index);
            let preview_path = preview_path(&e.media_path, &index);
            let size_bytes = media_size_bytes(&e.media_path, &index);
            RecentlyDeletedEntry {
                id: e.id,
                title: e.title,
                media_path: e.media_path,
                deleted_at: e.deleted_at,
                files: e.files,
                recoverable,
                preview_path,
                size_bytes,
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

#[cfg(all(test, unix, not(target_os = "macos")))]
mod tests {
    use super::percent_decode_trash_path;

    #[test]
    fn trashinfo_path_decodes_escapes() {
        assert_eq!(
            percent_decode_trash_path("/home/angel/Music/My%20Song%20%C3%A9.mp3"),
            "/home/angel/Music/My Song \u{e9}.mp3"
        );
        assert_eq!(percent_decode_trash_path("/tmp/100%"), "/tmp/100%");
    }
}
