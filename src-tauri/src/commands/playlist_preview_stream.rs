use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::commands::downloader::browser_cookie_arg_for_auth;
use crate::commands::explorer_cookies::{export_ruforge_cookies_for_ytdlp, RuforgeCookieExport};
use crate::media_engine_adapter::{auth_from_download_options, MediaEngineState};
use media_engine::{PlaylistStreamBatch, PlaylistStreamMeta};

const BATCH_EVENT: &str = "playlist-preview-batch";

fn cancel_flags() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static FLAGS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    FLAGS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchPayload {
    request_id: String,
    items: Vec<media_engine::PlaylistItemPreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    meta: Option<PlaylistStreamMeta>,
}

/// Lists a pasted playlist in pages: the first 5 rows, then 10 at a time as `playlist-preview-batch`
/// events to the main window. Resolves with the row count when the listing ends or is cancelled.
#[tauri::command]
pub async fn stream_playlist_preview(
    app: AppHandle,
    engine_state: State<'_, MediaEngineState>,
    url: String,
    request_id: String,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<usize, String> {
    let mut _export_guard: Option<RuforgeCookieExport> = None;
    let auth = if browser_cookies.as_deref() == Some("ruforge") {
        let export = export_ruforge_cookies_for_ytdlp(&app).await?;
        let path = export.path().display().to_string();
        _export_guard = Some(export);
        auth_from_download_options(None, Some(&path), None)?
    } else {
        let browser_arg =
            browser_cookie_arg_for_auth(&app, browser_cookies.as_deref(), cookie_file.as_deref())?;
        auth_from_download_options(browser_cookies.as_deref(), cookie_file.as_deref(), browser_arg)?
    };

    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut flags) = cancel_flags().lock() {
        flags.insert(request_id.clone(), cancel.clone());
    }
    let rid = request_id.clone();
    let emit_app = app.clone();
    let result = engine_state
        .engine
        .stream_flat_playlist(&url, auth.as_ref(), &cancel, move |batch: PlaylistStreamBatch| {
            let _ = emit_app.emit_to(
                "main",
                BATCH_EVENT,
                BatchPayload {
                    request_id: rid.clone(),
                    items: batch.items,
                    meta: batch.meta,
                },
            );
        })
        .await;
    if let Ok(mut flags) = cancel_flags().lock() {
        flags.remove(&request_id);
    }
    result.map_err(|e| e.message)
}

#[tauri::command]
pub fn cancel_playlist_preview(request_id: String) {
    if let Ok(flags) = cancel_flags().lock() {
        if let Some(flag) = flags.get(&request_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
}
