#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    if url.starts_with("http://") || url.starts_with("https://") {
        return tauri_plugin_opener::open_path(&url, None::<&str>).map_err(|e| e.to_string());
    }

    let path = std::path::Path::new(&url);
    if path.exists() {
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let path_str = canonical.to_string_lossy();
        let target = format!("file:///{}", path_str.replace("\\", "/").trim_start_matches("/"));
        tauri_plugin_opener::open_path(target, None::<&str>).map_err(|e| e.to_string())
    } else {
        tauri_plugin_opener::open_path(url, None::<&str>).map_err(|e| e.to_string())
    }
}
