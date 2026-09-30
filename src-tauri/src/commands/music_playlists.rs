use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

const PLAYLISTS_FILENAME: &str = "music-playlists.json";
/// A playlist file is text; anything this large is not one and would stall the webview.
const PLAYLIST_TEXT_MAX_BYTES: u64 = 8 * 1024 * 1024;

fn playlists_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join(PLAYLISTS_FILENAME))
}

/// Temp file then rename, so a crash mid-write never leaves a truncated file behind.
pub(crate) fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?;
    let tmp = path.with_file_name(format!("{file_name}.tmp"));
    std::fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

fn is_playlist_text_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("m3u8") || e.eq_ignore_ascii_case("m3u"))
        .unwrap_or(false)
}

/// Returns `None` when the file does not exist yet (first run, before migration).
#[tauri::command]
pub fn read_music_playlists_file(app: AppHandle) -> Result<Option<String>, String> {
    let path = playlists_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_music_playlists_file(app: AppHandle, contents: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("Refusing to write invalid playlists JSON: {e}"))?;
    write_atomic(&playlists_path(&app)?, &contents)
}

/// Reads a user-picked `.m3u8` / `.m3u` for import. Extension-gated so it cannot read arbitrary files.
#[tauri::command]
pub fn read_playlist_text_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !is_playlist_text_path(&p) {
        return Err("Only .m3u8 and .m3u files can be imported.".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > PLAYLIST_TEXT_MAX_BYTES {
        return Err("That playlist file is too large.".into());
    }
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Writes a user-picked `.m3u8` / `.m3u` for export.
#[tauri::command]
pub fn write_playlist_text_file(path: String, contents: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !is_playlist_text_path(&p) {
        return Err("Playlists can only be exported as .m3u8 or .m3u.".into());
    }
    write_atomic(&p, &contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playlist_extension_gate() {
        assert!(is_playlist_text_path(Path::new("C:/a/b.m3u8")));
        assert!(is_playlist_text_path(Path::new("/a/b.M3U")));
        assert!(!is_playlist_text_path(Path::new("/a/b.json")));
        assert!(!is_playlist_text_path(Path::new("/a/m3u8")));
    }

    #[test]
    fn atomic_write_replaces_existing() {
        let dir = std::env::temp_dir().join(format!("rf-mpl-{}", std::process::id()));
        let file = dir.join("x.json");
        write_atomic(&file, "{\"a\":1}").unwrap();
        write_atomic(&file, "{\"a\":2}").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "{\"a\":2}");
        assert!(!dir.join("x.json.tmp").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
