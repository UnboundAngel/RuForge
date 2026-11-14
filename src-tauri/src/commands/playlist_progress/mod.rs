use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::commands::music_playlists::write_atomic;

const PROGRESS_FILENAME: &str = "playlist-progress.json";

fn progress_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join(PROGRESS_FILENAME))
}

/// Returns `None` when no progress was saved. Async so a slow disk never stalls the UI thread.
#[tauri::command]
pub async fn read_playlist_progress_file(app: AppHandle) -> Result<Option<String>, String> {
    let path = progress_path(&app)?;
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
pub async fn write_playlist_progress_file(app: AppHandle, contents: String) -> Result<(), String> {
    let path = progress_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        serde_json::from_str::<serde_json::Value>(&contents)
            .map_err(|e| format!("Refusing to write invalid playlist progress JSON: {e}"))?;
        write_atomic(&path, &contents)
    })
    .await
    .map_err(|e| e.to_string())?
}
