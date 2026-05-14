use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::app_state::AppConfig;
use crate::commands::ffprobe::probe_ffprobe_cache_dir;
use crate::hardware_acceleration::HardwareAccelerationDisk;
use crate::utils::is_media_ext;

#[tauri::command]
pub fn get_hardware_acceleration_pref(app: AppHandle) -> Result<bool, String> {
    Ok(HardwareAccelerationDisk::load(&app.config().identifier).hardware_acceleration)
}

#[tauri::command]
pub fn set_hardware_acceleration_pref(app: AppHandle, hardware_acceleration: bool) -> Result<(), String> {
    HardwareAccelerationDisk { hardware_acceleration }.save_to_app_disk(&app)
}

#[tauri::command]
pub fn get_hardware_acceleration_browser_args(app: AppHandle) -> Option<String> {
    HardwareAccelerationDisk::load(&app.config().identifier).webview_additional_browser_args()
}

#[tauri::command]
pub fn update_tray_config(state: State<'_, AppConfig>, minimize: bool) {
    let mut minimize_to_tray = state.minimize_to_tray.lock().unwrap();
    *minimize_to_tray = minimize;
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageStats {
    pub total_bytes: u64,
    pub file_count: u32,
}

#[tauri::command]
pub async fn get_storage_stats(dir: String) -> Result<StorageStats, String> {
    let mut total_bytes = 0;
    let mut file_count = 0;

    let path = std::path::Path::new(&dir);
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                    if is_media_ext(ext) {
                        if let Ok(metadata) = std::fs::metadata(path) {
                            total_bytes += metadata.len();
                            file_count += 1;
                        }
                    }
                }
            }
        }
    }

    Ok(StorageStats {
        total_bytes,
        file_count,
    })
}

#[tauri::command]
pub async fn clear_ruforge_cache(app: AppHandle) -> Result<u32, String> {
    let dir = probe_ffprobe_cache_dir(&app)?;
    let mut removed: u32 = 0;
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            removed = removed.saturating_add(1);
        }
    }
    Ok(removed)
}

#[tauri::command]
pub async fn authorize_cleanup(dir: String, target_free_bytes: u64) -> Result<u64, String> {
    let mut files = vec![];
    let paths = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for path in paths {
        let path = path.map_err(|e| e.to_string())?.path();
        if path.is_file() {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_media_ext(ext) {
                let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
                let created = metadata.created().unwrap_or(std::time::SystemTime::now());
                files.push((path, metadata.len(), created));
            }
        }
    }

    files.sort_by(|a, b| a.2.cmp(&b.2));

    let mut deleted_bytes = 0;
    for (path, size, _) in files {
        if deleted_bytes >= target_free_bytes {
            break;
        }
        if std::fs::remove_file(path).is_ok() {
            deleted_bytes += size;
        }
    }

    Ok(deleted_bytes)
}

#[tauri::command]
pub fn open_windows_sound_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("explorer.exe");
        cmd.arg("ms-settings:sound");
        let _ = cmd.spawn().map_err(|e| format!("{}", e))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows Sound settings shortcut is only available on Windows.".to_string())
    }
}
