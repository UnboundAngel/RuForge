//! Runtime debug log gates. Category IDs must match `src/debug/debugCategories.ts`.

use log::LevelFilter;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

static ENABLED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn enabled_set() -> &'static Mutex<HashSet<String>> {
    ENABLED.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn replace_enabled_categories(ids: Vec<String>) {
    let mut set = enabled_set().lock().expect("debug_log enabled lock");
    set.clear();
    for id in ids {
        let t = id.trim();
        if !t.is_empty() {
            set.insert(t.to_string());
        }
    }
}

pub fn is_category_enabled(category: &str) -> bool {
    let set = enabled_set().lock().expect("debug_log enabled lock");
    if set.contains(category) {
        return true;
    }
    let mut prefix = category;
    while let Some(idx) = prefix.rfind('.') {
        prefix = &prefix[..idx];
        if set.contains(prefix) {
            return true;
        }
    }
    false
}

/// Category id for a `log` crate target string (third-party crates and ruforge::*).
pub fn category_for_log_target(target: &str) -> Option<&'static str> {
    if target.starts_with("lofty") {
        return Some("library.metadata.lofty");
    }
    None
}

pub fn log_filter(metadata: &log::Metadata<'_>) -> bool {
    let level = metadata.level();
    let target = metadata.target();

    if let Some(rest) = target.strip_prefix("ruforge::") {
        if is_category_enabled(rest) {
            return true;
        }
        return level <= log::Level::Error;
    }

    if let Some(cat) = category_for_log_target(target) {
        if is_category_enabled(cat) {
            return true;
        }
        return level <= log::Level::Error;
    }

    level <= log::Level::Warn
}

pub fn plugin_max_level() -> LevelFilter {
    LevelFilter::Trace
}

#[macro_export]
macro_rules! rf_log {
    ($cat:expr, $level:expr, $($arg:tt)*) => {
        if $crate::debug_log::is_category_enabled($cat) {
            log::log!(target: concat!("ruforge::", $cat), $level, $($arg)*);
        }
    };
}

#[tauri::command]
pub fn sync_debug_log_categories(enabled: Vec<String>) -> Result<(), String> {
    replace_enabled_categories(enabled);
    Ok(())
}
