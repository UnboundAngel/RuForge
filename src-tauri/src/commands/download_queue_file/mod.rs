use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::commands::music_playlists::write_atomic;

const QUEUE_FILENAME: &str = "download-queue.json";

fn queue_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join(QUEUE_FILENAME))
}

/// Returns `None` when no queue was saved. Async so a slow disk never stalls the UI thread.
#[tauri::command]
pub async fn read_download_queue_file(app: AppHandle) -> Result<Option<String>, String> {
    let path = queue_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        if !path.is_file() {
            return Ok(None);
        }
        std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `None` deletes the file (empty queue).
#[tauri::command]
pub async fn write_download_queue_file(
    app: AppHandle,
    contents: Option<String>,
) -> Result<(), String> {
    let path = queue_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || match contents {
        Some(text) => {
            serde_json::from_str::<serde_json::Value>(&text)
                .map_err(|e| format!("Refusing to write invalid queue JSON: {e}"))?;
            write_atomic(&path, &text)
        }
        None => match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    })
    .await
    .map_err(|e| e.to_string())?
}
