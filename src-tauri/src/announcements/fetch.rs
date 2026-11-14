use super::apply;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const URL: &str = "https://ruforge.app/announcements.json";
const CACHE_FILE: &str = "announcements.json";
const REFRESH_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const MAX_BYTES: usize = 256 * 1024;

fn cache_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(CACHE_FILE))
}

/// Loads the verified cache, then (release builds only) fetches on launch and every 6 h.
pub fn spawn_refresh(app: &AppHandle) {
    if let Some(text) = cache_path(app).and_then(|p| std::fs::read_to_string(p).ok()) {
        // The cache is re-verified: a file edited on disk gets no more trust than one off the wire.
        if let Err(e) = apply(app, &text) {
            log::warn!("announcements cache rejected: {e}");
        }
    }
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = refresh(&app).await {
                log::warn!("announcements fetch failed: {e}");
            }
            tokio::time::sleep(REFRESH_EVERY).await;
        }
    });
}

async fn refresh(app: &AppHandle) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(URL).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if text.len() > MAX_BYTES {
        return Err("announcements file too large".into());
    }
    apply(app, &text)?;
    if let Some(path) = cache_path(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(path, text);
    }
    Ok(())
}
