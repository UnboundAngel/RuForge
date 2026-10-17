use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::commands::music_playlists::write_atomic;

const SETTINGS_FILENAME: &str = "settings.json";
const BACKUP_DIR: &str = "settings-backups";
const KEEP_BACKUPS: usize = 7;

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Returns `None` when the file does not exist yet.
#[tauri::command]
pub async fn read_settings_file(app: AppHandle) -> Result<Option<String>, String> {
    // Async so the boot read does not hold the main thread, which also serves window drag IPC.
    let path = data_dir(&app)?.join(SETTINGS_FILENAME);
    tauri::async_runtime::spawn_blocking(move || {
        if !path.is_file() {
            return Ok(None);
        }
        std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn write_settings_file(app: AppHandle, contents: String) -> Result<(), String> {
    write_with_backups(&data_dir(&app)?, &contents)
}

fn write_with_backups(dir: &Path, contents: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(contents)
        .map_err(|e| format!("Refusing to write invalid settings JSON: {e}"))?;
    let path = dir.join(SETTINGS_FILENAME);
    // Copy the old file aside before the first write of each day so one bad write can never be the only copy.
    if path.is_file() {
        let day = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() / 86_400)
            .unwrap_or(0);
        let backups = dir.join(BACKUP_DIR);
        let daily = backups.join(format!("settings-day-{day}.json"));
        if !daily.exists() {
            if std::fs::create_dir_all(&backups).is_ok() && std::fs::copy(&path, &daily).is_ok() {
                prune_backups(&backups);
            }
        }
    }
    write_atomic(&path, contents)
}

fn prune_backups(dir: &Path) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<PathBuf> = read
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("settings-day-") && n.ends_with(".json"))
        })
        .collect();
    // Day numbers are zero-padded by width in practice (5 digits), so name order is age order.
    files.sort();
    while files.len() > KEEP_BACKUPS {
        let _ = std::fs::remove_file(files.remove(0));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rf-settings-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn refuses_invalid_json_and_keeps_old_file() {
        let dir = temp_dir("invalid");
        write_with_backups(&dir, r#"{"a":1}"#).unwrap();
        assert!(write_with_backups(&dir, "not json").is_err());
        assert_eq!(std::fs::read_to_string(dir.join(SETTINGS_FILENAME)).unwrap(), r#"{"a":1}"#);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn backs_up_previous_file_once_per_day() {
        let dir = temp_dir("backup");
        write_with_backups(&dir, r#"{"v":1}"#).unwrap();
        write_with_backups(&dir, r#"{"v":2}"#).unwrap();
        write_with_backups(&dir, r#"{"v":3}"#).unwrap();
        let backups: Vec<_> = std::fs::read_dir(dir.join(BACKUP_DIR)).unwrap().collect();
        assert_eq!(backups.len(), 1);
        let kept = std::fs::read_to_string(backups[0].as_ref().unwrap().path()).unwrap();
        assert_eq!(kept, r#"{"v":1}"#);
        assert_eq!(std::fs::read_to_string(dir.join(SETTINGS_FILENAME)).unwrap(), r#"{"v":3}"#);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prunes_to_the_newest_backups() {
        let dir = temp_dir("prune");
        for day in 20000..20010 {
            std::fs::write(dir.join(format!("settings-day-{day}.json")), "{}").unwrap();
        }
        prune_backups(&dir);
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(left.len(), KEEP_BACKUPS);
        assert_eq!(left[0], "settings-day-20003.json");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
