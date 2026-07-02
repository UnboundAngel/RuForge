use std::collections::HashSet;

use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use super::types::{LibraryConfig, LibraryConfigPatch};

const STORE_FILE: &str = "library-config.json";
const KEY_CONFIG: &str = "config";

const WINDOWS_DEFAULT_OUTPUT: &str = "C:\\Downloads";
const WINDOWS_DEFAULT_INTERNAL: &str = "C:\\RuForge\\Media";

/// Same normalization the old frontend `normalizeScanDirKey` used: case-insensitive,
/// slash-normalized, no trailing slash. Kept identical so migrated dedupe behavior
/// does not change for existing installs.
pub fn normalize_key(dir: &str) -> String {
    dir.trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

fn dedupe_extra_dirs(internal_vault: &str, dirs: Vec<String>) -> Vec<String> {
    let internal_key = normalize_key(internal_vault);
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for raw in dirs {
        let trimmed = raw.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        let key = normalize_key(&trimmed);
        if key == internal_key {
            continue;
        }
        if !seen.insert(key) {
            continue;
        }
        out.push(trimmed);
    }
    out
}

/// Resolve platform default paths. Windows keeps the historical hardcoded factory
/// defaults; other platforms defer to the OS download/home dirs via Tauri's path
/// resolver (this is a first-run *default suggestion* for where downloads go, not
/// filesystem discovery of what already exists, so it does not violate the
/// "scanner.rs is the only ingestion layer" rule).
fn default_config(app: &AppHandle) -> LibraryConfig {
    if cfg!(windows) {
        return LibraryConfig {
            internal_vault: WINDOWS_DEFAULT_INTERNAL.to_string(),
            output_dir: WINDOWS_DEFAULT_OUTPUT.to_string(),
            save_to_internal: true,
            extra_scan_dirs: Vec::new(),
            legacy_import_done: false,
        };
    }

    let output_dir = app
        .path()
        .download_dir()
        .ok()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| WINDOWS_DEFAULT_OUTPUT.to_string());
    let internal_vault = app
        .path()
        .home_dir()
        .ok()
        .map(|p| p.join("RuForge").join("Media").to_string_lossy().to_string())
        .unwrap_or_else(|| WINDOWS_DEFAULT_INTERNAL.to_string());

    LibraryConfig {
        internal_vault,
        output_dir,
        save_to_internal: true,
        extra_scan_dirs: Vec::new(),
        legacy_import_done: false,
    }
}

/// Load persisted config, seeding platform defaults on first run. Rust is the sole
/// authority for this value; nothing outside `library::config` may write the
/// backing store file.
pub fn load_or_init(app: &AppHandle) -> Result<LibraryConfig, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    if let Some(existing) = store.get(KEY_CONFIG) {
        if let Ok(cfg) = serde_json::from_value::<LibraryConfig>(existing) {
            return Ok(cfg);
        }
    }
    let cfg = default_config(app);
    persist(app, &cfg)?;
    Ok(cfg)
}

pub fn persist(app: &AppHandle, cfg: &LibraryConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(cfg).map_err(|e| e.to_string())?;
    store.set(KEY_CONFIG, value);
    store.save().map_err(|e| e.to_string())
}

/// Apply a partial update. `extra_scan_dirs` is validated/deduped against the
/// (fixed) internal vault; the vault itself is never user-editable through this
/// path.
pub fn apply_patch(current: &LibraryConfig, patch: LibraryConfigPatch) -> LibraryConfig {
    let mut next = current.clone();
    if let Some(dir) = patch.output_dir {
        let trimmed = dir.trim().to_string();
        if !trimmed.is_empty() {
            next.output_dir = trimmed;
        }
    }
    if let Some(save_internal) = patch.save_to_internal {
        next.save_to_internal = save_internal;
    }
    if let Some(dirs) = patch.extra_scan_dirs {
        next.extra_scan_dirs = dedupe_extra_dirs(&next.internal_vault, dirs);
    }
    if let Some(true) = patch.mark_legacy_import_done {
        next.legacy_import_done = true;
    }
    next
}

/// Internal vault plus deduped extra scan roots, vault always first. Mirrors the
/// old frontend `galleryScanRoots(libraryScanDirs)` ordering exactly.
pub fn effective_roots(cfg: &LibraryConfig) -> Vec<String> {
    let mut roots = vec![cfg.internal_vault.clone()];
    roots.extend(dedupe_extra_dirs(&cfg.internal_vault, cfg.extra_scan_dirs.clone()));
    roots
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedupe_extra_dirs_drops_vault_and_case_insensitive_duplicates() {
        let out = dedupe_extra_dirs(
            r"C:\RuForge\Media",
            vec![
                r"C:\RuForge\Media".to_string(),
                r"C:\Downloads".to_string(),
                r"c:\downloads\".to_string(),
                "  ".to_string(),
            ],
        );
        assert_eq!(out, vec![r"C:\Downloads".to_string()]);
    }
}
