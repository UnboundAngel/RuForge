use std::path::{Path, PathBuf};

fn resolve_existing_path(input: &str) -> Result<PathBuf, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Path is empty.".into());
    }
    let path = PathBuf::from(trimmed);
    if !path.exists() {
        return Err(format!("Path not found: {trimmed}"));
    }
    path.canonicalize().map_err(|e| format!("Invalid path {trimmed}: {e}"))
}

/// Opens a URL in the default browser, or a local path in the system file manager.
#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return tauri_plugin_opener::open_url(trimmed, None::<&str>)
            .map_err(|e| e.to_string());
    }
    open_in_file_manager(trimmed.to_string()).await
}

/// Opens a folder in the file manager, or reveals a file inside its parent folder.
#[tauri::command]
pub async fn open_in_file_manager(path: String) -> Result<(), String> {
    let canonical = resolve_existing_path(&path)?;
    open_local_in_file_manager(&canonical)
}

fn open_local_in_file_manager(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
    } else if path.is_file() {
        tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
    } else {
        Err(format!("Not a file or folder: {}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_existing_path_rejects_empty() {
        assert!(resolve_existing_path("").is_err());
    }
}
