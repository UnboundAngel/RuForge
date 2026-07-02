//! Id-to-path resolution. This is the ONLY module the companion server depends on
//! for media access; it never sees `library_state`, `scanner`, or `config`
//! directly. Path-returning methods and metadata-returning methods are kept
//! separate so a companion route can never accidentally serialize a path: the
//! JSON-facing routes call `projection()` (paths cannot appear there by type),
//! and only the byte-serving routes call `stream_path()` / `thumb_path()`.

use std::path::PathBuf;

use tauri::AppHandle;

use super::library_state::LibraryState;
use super::remux;
use super::scanner;
use super::types::CompanionItemProjection;

/// Full catalog listing for `/library`. Metadata only, ids only, no paths.
pub async fn snapshot(state: &LibraryState) -> (String, bool, Vec<CompanionItemProjection>) {
    state.companion_projections().await
}

/// Metadata only. Used by `/library` and `/sidecar/:id`. Cannot leak a path: the
/// return type has no path field.
pub async fn resolve_projection(state: &LibraryState, id: &str) -> Option<CompanionItemProjection> {
    state.companion_item(id).await.map(|item| item.projection)
}

pub async fn is_known_id(state: &LibraryState, id: &str) -> bool {
    state.companion_item(id).await.is_some()
}

pub async fn is_playable(state: &LibraryState, id: &str) -> bool {
    state
        .companion_item(id)
        .await
        .map(|i| i.projection.playable)
        .unwrap_or(false)
}

pub async fn has_thumb(state: &LibraryState, id: &str) -> bool {
    state
        .companion_item(id)
        .await
        .map(|i| i.thumb_path.is_some())
        .unwrap_or(false)
}

/// Real, allowlist-checked path to stream. Only the `/stream/:id` byte-serving
/// route may call this. Remux (when needed) runs here on first playback, not
/// during library indexing, so companion startup stays fast.
pub async fn resolve_stream_path(
    app: &AppHandle,
    state: &LibraryState,
    id: &str,
) -> Option<PathBuf> {
    let item = state.companion_item(id).await?;
    let source = item.source_path.canonicalize().ok()?;
    if !state.is_root_allowed(&source).await {
        return None;
    }

    let p = &item.projection;
    if scanner::native_playable(&p.container, &p.video_codec, &p.audio_codec) {
        let path = item.serve_path.canonicalize().ok()?;
        if state.is_root_allowed(&path).await {
            return Some(path);
        }
    }

    if scanner::remux_eligible(&p.container, &p.video_codec, &p.audio_codec) {
        let cache = state.remux_cache_dir().await?;
        if let Some(remuxed) = remux::ensure_remuxed(app, &cache, id, &source).await {
            let path = remuxed.canonicalize().ok()?;
            if state.is_root_allowed(&path).await {
                return Some(path);
            }
        }
    }

    if item.projection.playable {
        let path = item.serve_path.canonicalize().ok()?;
        if state.is_root_allowed(&path).await {
            return Some(path);
        }
    }

    None
}

/// Real, allowlist-checked path to a thumbnail. Only the `/thumb/:id` byte-serving
/// route may call this.
pub async fn resolve_thumb_path(state: &LibraryState, id: &str) -> Option<PathBuf> {
    let item = state.companion_item(id).await?;
    let thumb = item.thumb_path?;
    let canonical = thumb.canonicalize().ok()?;
    if !state.is_root_allowed(&canonical).await {
        return None;
    }
    Some(canonical)
}
