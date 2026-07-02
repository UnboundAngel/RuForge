//! Canonical in-memory library index. This is the single authority both the
//! desktop store projection and the companion server read from; neither one holds
//! its own copy of "what exists" beyond a request-scoped snapshot clone.

use std::collections::HashMap;
use std::path::PathBuf;

use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

use crate::commands::gallery::GalleryEntry;

use super::config::{self};
use super::scanner::{self, ProbeCache};
use super::types::{CompanionLibraryItem, LibraryConfig};

/// Event name the desktop store subscribes to for push-driven refresh instead of
/// polling. Fired after every successful reindex whose version changed.
pub const LIBRARY_CHANGED_EVENT: &str = "library-changed";

pub struct LibraryState {
    pub config: RwLock<LibraryConfig>,
    desktop_entries: RwLock<Vec<GalleryEntry>>,
    companion_items: RwLock<HashMap<String, CompanionLibraryItem>>,
    version: RwLock<String>,
    ready: RwLock<bool>,
    probe_cache: RwLock<ProbeCache>,
    remux_cache_dir: RwLock<Option<PathBuf>>,
    /// Serializes reindex runs; a reindex triggered by a UI refresh and one
    /// triggered by a finished download must not race each other.
    reindex_lock: tokio::sync::Mutex<()>,
}

impl LibraryState {
    pub fn new(config: LibraryConfig) -> Self {
        Self {
            config: RwLock::new(config),
            desktop_entries: RwLock::new(Vec::new()),
            companion_items: RwLock::new(HashMap::new()),
            version: RwLock::new(String::from("empty")),
            ready: RwLock::new(false),
            probe_cache: RwLock::new(HashMap::new()),
            remux_cache_dir: RwLock::new(None),
            reindex_lock: tokio::sync::Mutex::new(()),
        }
    }

    pub async fn set_remux_cache_dir(&self, dir: PathBuf) {
        *self.remux_cache_dir.write().await = Some(dir);
    }

    pub async fn effective_roots(&self) -> Vec<String> {
        config::effective_roots(&*self.config.read().await)
    }

    pub async fn is_root_allowed(&self, canonical: &std::path::Path) -> bool {
        let roots = self.effective_roots().await;
        if roots.iter().any(|r| {
            std::path::Path::new(r)
                .canonicalize()
                .map(|c| canonical.starts_with(c))
                .unwrap_or(false)
        }) {
            return true;
        }
        if let Some(cache) = self.remux_cache_dir.read().await.as_ref() {
            if canonical.starts_with(cache) {
                return true;
            }
        }
        false
    }

    pub async fn remux_cache_dir(&self) -> Option<PathBuf> {
        self.remux_cache_dir.read().await.clone()
    }

    pub async fn desktop_snapshot(&self) -> (String, bool, Vec<GalleryEntry>) {
        (
            self.version.read().await.clone(),
            *self.ready.read().await,
            self.desktop_entries.read().await.clone(),
        )
    }

    pub async fn companion_item(&self, id: &str) -> Option<CompanionLibraryItem> {
        self.companion_items.read().await.get(id).cloned()
    }

    pub async fn companion_projections(&self) -> (String, bool, Vec<super::types::CompanionItemProjection>) {
        let items = self.companion_items.read().await;
        let projections = items.values().map(|i| i.projection.clone()).collect();
        (self.version.read().await.clone(), *self.ready.read().await, projections)
    }

    /// Walk every configured root, probe new/changed video files, and publish the
    /// result atomically. Cheap on repeat calls: unchanged files reuse the cached
    /// probe instead of re-running ffprobe, so this is safe to call on every
    /// desktop gallery refresh as well as after a download completes.
    pub async fn reindex(&self, app: &AppHandle) -> Result<(), String> {
        let _guard = self.reindex_lock.lock().await;
        let roots = self.effective_roots().await;
        let remux_dir = self.remux_cache_dir.read().await.clone();
        let mut cache = self.probe_cache.write().await;
        let output = scanner::reindex(app, &roots, remux_dir.as_deref(), &mut cache).await?;
        drop(cache);

        let changed = *self.version.read().await != output.version;
        *self.desktop_entries.write().await = output.desktop_entries;
        *self.companion_items.write().await = output.companion_items;
        *self.version.write().await = output.version;
        *self.ready.write().await = true;

        if changed {
            let _ = app.emit(LIBRARY_CHANGED_EVENT, ());
        }
        Ok(())
    }

    pub async fn set_config(&self, app: &AppHandle, next: LibraryConfig) -> Result<(), String> {
        config::persist(app, &next)?;
        *self.config.write().await = next;
        self.reindex(app).await
    }
}
