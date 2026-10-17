//! Scheduled features: code that ships dark in the signed build and stays off public until its
//! date. Feature source lives in private folders (see `docs/agents/SCHEDULED.md`); build.rs
//! generates the manifest and the dispatcher, so this module never names a feature.

mod remote;
mod unlock;

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};
pub use unlock::ScheduledFeature;

mod features {
    use super::ScheduledFeature;
    include!(concat!(env!("OUT_DIR"), "/scheduled_gen.rs"));
}
use features::MANIFEST;

pub use remote::spawn_refresh;

pub fn is_unlocked(id: &str) -> bool {
    let Some(feature) = MANIFEST.iter().find(|f| f.id == id) else {
        return false;
    };
    if cfg!(debug_assertions) {
        return std::env::var("RUFORGE_SCHEDULED_LOCKED").as_deref() != Ok("1");
    }
    unlock::is_unlocked(feature, remote::server_override(id).as_ref(), remote::today())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledStatus {
    id: &'static str,
    unlocked: bool,
}

fn require_main(webview: &WebviewWindow) -> Result<(), String> {
    match webview.label() {
        "main" => Ok(()),
        other => Err(format!("scheduled features refused webview label: {other}")),
    }
}

#[tauri::command]
pub fn scheduled_status(webview: WebviewWindow) -> Result<Vec<ScheduledStatus>, String> {
    require_main(&webview)?;
    Ok(MANIFEST
        .iter()
        .map(|f| ScheduledStatus { id: f.id, unlocked: is_unlocked(f.id) })
        .collect())
}

/// One entry point for every scheduled feature's Rust side, so features add no names to the
/// public invoke handler. Refuses before unlock, not just hidden in the UI.
#[tauri::command]
pub async fn scheduled_invoke(
    app: AppHandle,
    webview: WebviewWindow,
    id: String,
    method: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    require_main(&webview)?;
    if !is_unlocked(&id) {
        return Err(format!("{id} is locked"));
    }
    features::dispatch(&app, &id, &method, args).await
}
