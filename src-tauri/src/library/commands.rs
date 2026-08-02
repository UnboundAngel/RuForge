use tauri::{AppHandle, State};

use super::config;
use super::library_state::LibraryState;
use super::types::{LibraryConfig, LibraryConfigPatch, LibrarySnapshot};

/// Desktop projection: identical wire shape to the old multi-root `scan_gallery`
/// result. Serves the published snapshot when ready unless `force` requests a
/// fresh reindex. Concurrent callers join one in-flight desktop publish.
#[tauri::command]
pub async fn get_library_snapshot(
    app: AppHandle,
    state: State<'_, LibraryState>,
    force: Option<bool>,
) -> Result<LibrarySnapshot, String> {
    state
        .ensure_desktop_snapshot(&app, force.unwrap_or(false))
        .await?;
    let (version, ready, entries) = state.desktop_snapshot().await;
    Ok(LibrarySnapshot {
        version,
        ready,
        entries,
    })
}

/// Force a full reindex without waiting for the next `get_library_snapshot` call.
/// Used after a download job finishes and after a config change so browsers and
/// the desktop UI see new media promptly.
#[tauri::command]
pub async fn library_reindex(app: AppHandle, state: State<'_, LibraryState>) -> Result<(), String> {
    state.reindex(&app).await
}

#[tauri::command]
pub async fn library_get_config(state: State<'_, LibraryState>) -> Result<LibraryConfig, String> {
    Ok(state.config.read().await.clone())
}

/// The only way the frontend may change scan roots / output dir / vault
/// preference. Rust validates, persists, and reindexes; the frontend receives the
/// authoritative config back and must treat it as truth (no local echo-write).
#[tauri::command]
pub async fn library_set_config(
    app: AppHandle,
    state: State<'_, LibraryState>,
    patch: LibraryConfigPatch,
) -> Result<LibraryConfig, String> {
    let current = state.config.read().await.clone();
    let next = config::apply_patch(&current, patch);
    state.set_config(&app, next.clone()).await?;
    Ok(next)
}
