//! Canonical in-memory library index. This is the single authority both the
//! desktop store projection and the companion server read from; neither one holds
//! its own copy of "what exists" beyond a request-scoped snapshot clone.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, Notify, RwLock};

use crate::commands::gallery::{self, GalleryEntry};
use crate::commands::media::normalize_media_key;

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

struct ReindexFlight {
    notify: Notify,
    desktop_done: AtomicBool,
    probe_done: AtomicBool,
    error: Mutex<Option<String>>,
}

impl ReindexFlight {
    fn new() -> Self {
        Self {
            notify: Notify::new(),
            desktop_done: AtomicBool::new(false),
            probe_done: AtomicBool::new(false),
            error: Mutex::new(None),
        }
    }
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
    /// Serializes the disk walk and desktop publish only.
    reindex_lock: Mutex<()>,
    /// Serializes Companion probe + companion publish + catalog persist.
    probe_lock: Mutex<()>,
    /// Bumped on each walk; stale probes skip publishing companion state.
    reindex_gen: AtomicU64,
    /// Coalesces concurrent snapshot waiters onto one in-flight reindex.
    reindex_flight: Mutex<Option<Arc<ReindexFlight>>>,
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
            reindex_lock: Mutex::new(()),
            probe_lock: Mutex::new(()),
            reindex_gen: AtomicU64::new(0),
            reindex_flight: Mutex::new(None),
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
        let entries = gallery::retain_existing_media_entries(self.desktop_entries.read().await.clone());
        (
            self.version.read().await.clone(),
            *self.desktop_ready.read().await,
            entries,
        )
    }

    /// Drop deleted media from the live index immediately so the next snapshot
    /// cannot resurrect a ghost row (trashed file, leftover metadata).
    pub async fn forget_media_paths(&self, app: &AppHandle, paths: &[String]) {
        if paths.is_empty() {
            return;
        }
        let keys: HashSet<String> = paths.iter().map(|p| normalize_media_key(p)).collect();

        {
            let mut entries = self.desktop_entries.write().await;
            *entries = gallery::remove_paths_from_gallery_entries(&entries, &keys);
            let version = scanner::desktop_version_hash(&entries);
            drop(entries);
            *self.version.write().await = version;
        }

        {
            let mut items = self.companion_items.write().await;
            items.retain(|_, item| {
                !keys.contains(&normalize_media_key(&item.source_path.to_string_lossy()))
            });
        }

        if let Ok(cache_dir) = app.path().app_cache_dir() {
            if let Err(e) = self.save_companion_catalog_cache(cache_dir).await {
                crate::rf_log!(
                    "library.cache",
                    log::Level::Warn,
                    "failed to save companion catalog cache after delete: {e}"
                );
            }
        }

        let _ = app.emit(LIBRARY_CHANGED_EVENT, ());
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

    async fn publish_desktop(&self, _app: &AppHandle, desktop_entries: Vec<GalleryEntry>) {
        let desktop_entries = gallery::retain_existing_media_entries(desktop_entries);
        let version = scanner::desktop_version_hash(&desktop_entries);
        *self.desktop_entries.write().await = desktop_entries;
        *self.version.write().await = version;
        *self.desktop_ready.write().await = true;
    }

    async fn publish_companion(
        &self,
        app: &AppHandle,
        desktop_len: usize,
        companion_items: HashMap<String, CompanionLibraryItem>,
    ) -> Result<(), String> {
        let version = {
            let mut ids: Vec<&String> = companion_items.keys().collect();
            ids.sort();
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            use std::hash::{Hash, Hasher};
            desktop_len.hash(&mut hasher);
            for id in ids {
                id.hash(&mut hasher);
                companion_items[id].mtime.hash(&mut hasher);
            }
            format!("{:016x}", hasher.finish())
        };
        let changed = *self.version.read().await != version;
        *self.companion_items.write().await = companion_items;
        *self.version.write().await = version;
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

    async fn wait_flight_desktop(flight: &ReindexFlight) -> Result<(), String> {
        loop {
            if flight.desktop_done.load(Ordering::SeqCst) {
                if let Some(e) = flight.error.lock().await.clone() {
                    return Err(e);
                }
                return Ok(());
            }
            if let Some(e) = flight.error.lock().await.clone() {
                return Err(e);
            }
            flight.notify.notified().await;
        }
    }

    async fn wait_flight_probe(flight: &ReindexFlight) -> Result<(), String> {
        loop {
            if flight.probe_done.load(Ordering::SeqCst) {
                if let Some(e) = flight.error.lock().await.clone() {
                    return Err(e);
                }
                return Ok(());
            }
            if let Some(e) = flight.error.lock().await.clone() {
                return Err(e);
            }
            flight.notify.notified().await;
        }
    }

    fn spawn_reindex(app: &AppHandle, flight: Arc<ReindexFlight>) {
        let app2 = app.clone();
        tauri::async_runtime::spawn(async move {
            let Some(lib) = app2.try_state::<LibraryState>() else {
                *flight.error.lock().await = Some("library state unavailable".into());
                flight.desktop_done.store(true, Ordering::SeqCst);
                flight.probe_done.store(true, Ordering::SeqCst);
                flight.notify.notify_waiters();
                return;
            };

            let result = lib
                .reindex_inner(&app2, || {
                    flight.desktop_done.store(true, Ordering::SeqCst);
                    flight.notify.notify_waiters();
                })
                .await;

            if let Err(e) = result {
                *flight.error.lock().await = Some(e);
                flight.desktop_done.store(true, Ordering::SeqCst);
            }
            flight.probe_done.store(true, Ordering::SeqCst);
            flight.notify.notify_waiters();

            let mut slot = lib.reindex_flight.lock().await;
            if slot
                .as_ref()
                .map(|current| Arc::ptr_eq(current, &flight))
                .unwrap_or(false)
            {
                *slot = None;
            }
        });
    }

    async fn begin_or_join_reindex(&self, app: &AppHandle, force: bool) -> Option<Arc<ReindexFlight>> {
        let mut slot = self.reindex_flight.lock().await;
        if !force {
            if *self.desktop_ready.read().await {
                return None;
            }
            if let Some(existing) = slot.as_ref() {
                return Some(existing.clone());
            }
        }
        let flight = Arc::new(ReindexFlight::new());
        *slot = Some(flight.clone());
        Self::spawn_reindex(app, flight.clone());
        Some(flight)
    }

    /// Return published desktop entries when possible. Otherwise join or start a
    /// reindex and wait only until the desktop projection is published.
    pub async fn ensure_desktop_snapshot(
        &self,
        app: &AppHandle,
        force: bool,
    ) -> Result<(), String> {
        if !force && *self.desktop_ready.read().await {
            return Ok(());
        }
        match self.begin_or_join_reindex(app, force).await {
            Some(flight) => Self::wait_flight_desktop(&flight).await,
            None => Ok(()),
        }
    }

    async fn reindex_inner<F>(&self, app: &AppHandle, on_desktop: F) -> Result<(), String>
    where
        F: FnOnce(),
    {
        let (desktop_entries, desktop_len, my_gen) = {
            let _guard = self.reindex_lock.lock().await;
            let my_gen = self.reindex_gen.fetch_add(1, Ordering::SeqCst) + 1;
            let roots = self.effective_roots().await;
            let desktop_entries = scanner::walk_desktop_entries(&roots).await?;
            let desktop_len = desktop_entries.len();
            *self.companion_ready.write().await = false;
            self.publish_desktop(app, desktop_entries.clone()).await;
            on_desktop();
            (desktop_entries, desktop_len, my_gen)
        };

        let remux_dir = self.remux_cache_dir.read().await.clone();
        let _probe_guard = self.probe_lock.lock().await;
        if self.reindex_gen.load(Ordering::SeqCst) != my_gen {
            return Ok(());
        }

        let mut cache = self.probe_cache.write().await;
        let companion_items =
            scanner::probe_companion_items(app, &desktop_entries, remux_dir.as_deref(), &mut cache)
                .await?;
        drop(cache);

        if self.reindex_gen.load(Ordering::SeqCst) != my_gen {
            return Ok(());
        }

        self.publish_companion(app, desktop_len, companion_items)
            .await?;
        Ok(())
    }

    /// Walk every configured root, probe new/changed video files, and publish the
    /// result. Awaits the companion probe phase as well as the desktop walk.
    pub async fn reindex(&self, app: &AppHandle) -> Result<(), String> {
        let flight = self
            .begin_or_join_reindex(app, true)
            .await
            .expect("force reindex always starts a flight");
        Self::wait_flight_desktop(&flight).await?;
        Self::wait_flight_probe(&flight).await
    }

    pub async fn set_config(&self, app: &AppHandle, next: LibraryConfig) -> Result<(), String> {
        config::persist(app, &next)?;
        *self.config.write().await = next;
        self.reindex(app).await
    }
}
