use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::commands::gallery::GalleryEntry;

/// Desktop-owned scan-root configuration. Rust is the sole authority: the frontend
/// only edits this through `library_set_config` and reads it through `library_get_config`.
/// Persisted via `tauri_plugin_store` (see `library::config`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfig {
    /// RuForge-managed vault directory. Always scanned; never removable by the user.
    pub internal_vault: String,
    /// Where new downloads land when `save_to_internal` is false.
    pub output_dir: String,
    /// When true, new downloads go to `internal_vault` instead of `output_dir`.
    pub save_to_internal: bool,
    /// Additional user-added library roots, scanned alongside the vault.
    pub extra_scan_dirs: Vec<String>,
    /// One-shot legacy localStorage import has run. Prevents re-importing stale
    /// browser-side values over deliberate later edits made through Rust.
    #[serde(default)]
    pub legacy_import_done: bool,
}

/// Partial update accepted by `library_set_config`. `None` fields are left unchanged.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfigPatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub save_to_internal: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_scan_dirs: Option<Vec<String>>,
    /// Set once by the frontend's one-shot legacy import; ignored after `legacy_import_done`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mark_legacy_import_done: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaType {
    Video,
    Audio,
}

/// Companion/browser-facing item projection. This type can never carry a filesystem
/// path; it is a physically separate struct from any desktop projection so a stray
/// field addition cannot leak a path to an untrusted LAN client.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionItemProjection {
    pub id: String,
    pub title: String,
    pub media_type: MediaType,
    pub duration_secs: u32,
    pub container: String,
    pub video_codec: String,
    pub audio_codec: String,
    pub playable: bool,
    pub has_thumb: bool,
    pub size_bytes: u64,
}

/// Internal-only record backing one companion item. Holds real paths; `resolver`
/// is the only module permitted to read `source_path` / `serve_path` / `thumb_path`
/// out of this struct. Never serialize this type directly to an HTTP response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionLibraryItem {
    pub id: String,
    pub source_path: PathBuf,
    pub serve_path: PathBuf,
    pub thumb_path: Option<PathBuf>,
    pub mtime: i64,
    pub size_bytes: u64,
    pub projection: CompanionItemProjection,
}

/// Desktop-facing snapshot. Wire-identical to the old multi-root `scan_gallery` result
/// so existing UI consumers (`MediaFile` / `GalleryEntry` parsing) need no changes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub version: String,
    /// False while an initial or forced reindex is still running; consumers should
    /// keep showing the previous snapshot rather than treat an empty list as "no media."
    pub ready: bool,
    pub entries: Vec<GalleryEntry>,
}

/// Companion-facing snapshot: ids and precomputed metadata only, never paths.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSnapshot {
    pub version: String,
    pub ready: bool,
    pub items: Vec<CompanionItemProjection>,
}
