use super::unlock::{parse_overrides, Override};
use super::MANIFEST;
use chrono::{DateTime, Local, NaiveDate};
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const UNLOCKS_URL: &str = "https://ruforge.app/unlocks.json";
const CACHE_FILE: &str = "scheduled-unlocks.json";

#[derive(Default)]
struct GateState {
    overrides: HashMap<String, Override>,
    /// Server clock minus local clock, from the last successful fetch. Moving the PC clock
    /// forward does not unlock anything while the app can reach the server.
    clock_offset_ms: Option<i64>,
}

fn state() -> &'static RwLock<GateState> {
    static STATE: OnceLock<RwLock<GateState>> = OnceLock::new();
    STATE.get_or_init(|| RwLock::new(GateState::default()))
}

pub fn server_override(id: &str) -> Option<Override> {
    state().read().ok()?.overrides.get(id).cloned()
}

pub fn today() -> NaiveDate {
    let offset = state().read().ok().and_then(|s| s.clock_offset_ms).unwrap_or(0);
    (Local::now() + chrono::Duration::milliseconds(offset)).date_naive()
}

fn cache_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(CACHE_FILE))
}

/// Loads the last server answer, then fetches once per launch. Skipped entirely when this
/// build has nothing locked, so most launches make no request; never runs in dev builds.
pub fn spawn_refresh(app: &AppHandle) {
    if let Some(text) = cache_path(app).and_then(|p| std::fs::read_to_string(p).ok()) {
        if let Ok(mut s) = state().write() {
            s.overrides = parse_overrides(&text);
        }
    }
    if cfg!(debug_assertions) || MANIFEST.iter().all(|f| f.released) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = refresh(&app).await {
            log::warn!("scheduled unlocks fetch failed: {e}");
        }
    });
}

async fn refresh(app: &AppHandle) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(UNLOCKS_URL).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let server_now = resp
        .headers()
        .get(reqwest::header::DATE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| DateTime::parse_from_rfc2822(v).ok());
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let overrides = parse_overrides(&text);
    if let Ok(mut s) = state().write() {
        s.overrides = overrides;
        if let Some(server_now) = server_now {
            s.clock_offset_ms = Some(server_now.timestamp_millis() - Local::now().timestamp_millis());
        }
    }
    if let Some(path) = cache_path(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(path, text);
    }
    Ok(())
}
