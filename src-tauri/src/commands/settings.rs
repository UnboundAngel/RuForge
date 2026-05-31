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

fn collect_media_stats_recursive(dir: &std::path::Path) -> (u64, u32) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return (0, 0);
    };
    let mut total_bytes = 0u64;
    let mut file_count = 0u32;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !fname.starts_with('.') {
                let (b, c) = collect_media_stats_recursive(&path);
                total_bytes = total_bytes.saturating_add(b);
                file_count = file_count.saturating_add(c);
            }
        } else if path.is_file() {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_media_ext(ext) {
                if let Ok(metadata) = std::fs::metadata(&path) {
                    total_bytes = total_bytes.saturating_add(metadata.len());
                    file_count += 1;
                }
            }
        }
    }
    (total_bytes, file_count)
}

#[tauri::command]
pub async fn get_storage_stats(dir: String) -> Result<StorageStats, String> {
    let path = std::path::Path::new(&dir);
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }
    let (total_bytes, file_count) = collect_media_stats_recursive(path);
    Ok(StorageStats { total_bytes, file_count })
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

fn collect_media_files_for_cleanup(
    dir: &std::path::Path,
    out: &mut Vec<(std::path::PathBuf, u64, std::time::SystemTime)>,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !fname.starts_with('.') {
                collect_media_files_for_cleanup(&path, out);
            }
        } else if path.is_file() {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_media_ext(ext) {
                if let Ok(metadata) = std::fs::metadata(&path) {
                    let created = metadata.created().unwrap_or(std::time::SystemTime::now());
                    out.push((path, metadata.len(), created));
                }
            }
        }
    }
}

#[tauri::command]
pub async fn authorize_cleanup(dir: String, target_free_bytes: u64) -> Result<u64, String> {
    let mut files = vec![];
    collect_media_files_for_cleanup(std::path::Path::new(&dir), &mut files);
    files.sort_by(|a, b| a.2.cmp(&b.2));

    let mut deleted_bytes = 0u64;
    for (path, size, _) in files {
        if deleted_bytes >= target_free_bytes {
            break;
        }
        if std::fs::remove_file(path).is_ok() {
            deleted_bytes = deleted_bytes.saturating_add(size);
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
