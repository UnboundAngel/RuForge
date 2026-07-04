//! Canonical in-memory library index. This is the single authority both the
//! desktop store projection and the companion server read from; neither one holds
//! its own copy of "what exists" beyond a request-scoped snapshot clone.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;

use crate::commands::gallery::GalleryEntry;

use super::config::{self};
use super::scanner::{self, ProbeCache};
use super::types::{CompanionLibraryItem, LibraryConfig};

/// Event name the desktop store subscribes to for push-driven refresh instead of
/// polling. Fired after every successful reindex whose version changed.
pub const LIBRARY_CHANGED_EVENT: &str = "library-changed";
const COMPANION_CATALOG_CACHE: &str = "companion-catalog.json";

#[derive(Debug, Serialize, Deserialize)]
struct CompanionCatalogCache {
    roots: Vec<String>,
    version: String,
    items: HashMap<String, CompanionLibraryItem>,
}

pub struct LibraryState {
    pub config: RwLock<LibraryConfig>,
    desktop_entries: RwLock<Vec<GalleryEntry>>,
    companion_items: RwLock<HashMap<String, CompanionLibraryItem>>,
    version: RwLock<String>,
    desktop_ready: RwLock<bool>,
    companion_ready: RwLock<bool>,
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
            desktop_ready: RwLock::new(false),
            companion_ready: RwLock::new(false),
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
            *self.desktop_ready.read().await,
            self.desktop_entries.read().await.clone(),
        )
    }

    pub async fn companion_item(&self, id: &str) -> Option<CompanionLibraryItem> {
        self.companion_items.read().await.get(id).cloned()
    }

    pub async fn companion_projections(
        &self,
    ) -> (
        String,
        bool,
        bool,
        Vec<super::types::CompanionItemProjection>,
    ) {
        let items = self.companion_items.read().await;
        let projections = items.values().map(|i| i.projection.clone()).collect();
        let companion_ready = *self.companion_ready.read().await;
        let desktop_ready = *self.desktop_ready.read().await;
        (
            self.version.read().await.clone(),
            companion_ready,
            companion_ready && !desktop_ready,
            projections,
        )
    }

    pub async fn load_companion_catalog_cache(&self, cache_dir: PathBuf) -> Result<bool, String> {
        let path = cache_dir.join(COMPANION_CATALOG_CACHE);
        let data = match std::fs::read(&path) {
            Ok(data) => data,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(e.to_string()),
        };
        let cache: CompanionCatalogCache =
            serde_json::from_slice(&data).map_err(|e| e.to_string())?;
        if cache.roots != self.effective_roots().await {
            return Ok(false);
        }
        if cache.items.is_empty() {
            return Ok(false);
        }

        *self.companion_items.write().await = cache.items;
        *self.version.write().await = cache.version;
        *self.companion_ready.write().await = true;
        Ok(true)
    }

    async fn save_companion_catalog_cache(&self, cache_dir: PathBuf) -> Result<(), String> {
        let path = cache_dir.join(COMPANION_CATALOG_CACHE);
        let cache = CompanionCatalogCache {
            roots: self.effective_roots().await,
            version: self.version.read().await.clone(),
            items: self.companion_items.read().await.clone(),
        };
        let data = serde_json::to_vec(&cache).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        std::fs::write(path, data).map_err(|e| e.to_string())
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
        *self.desktop_ready.write().await = true;
        *self.companion_ready.write().await = true;

        if let Ok(cache_dir) = app.path().app_cache_dir() {
            if let Err(e) = self.save_companion_catalog_cache(cache_dir).await {
                crate::rf_log!(
                    "library.cache",
                    log::Level::Warn,
                    "failed to save companion catalog cache: {e}"
                );
            }
        }

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
