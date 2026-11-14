//! "From the dev" announcements. `https://ruforge.app/announcements.json` is ed25519 signed with a
//! key that never leaves the maintainer's machine; only the public half is compiled in
//! (`pubkey.rs`). Anything that fails verification is dropped and the last good copy stays.
//! Delivery is a ping to the main webview plus a pull through a command only `main` may call.

mod fetch;
mod pubkey;
mod verify;
pub mod vote;

use chrono::{Duration, Local};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Webview};
use verify::{parse_date, Item};

pub use fetch::spawn_refresh;

const EVENT: &str = "dev-announcements";
/// Items stop showing this long after they were published.
const MAX_AGE_DAYS: i64 = 60;

fn state() -> &'static Mutex<Vec<Item>> {
    static STATE: OnceLock<Mutex<Vec<Item>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(Vec::new()))
}

fn require_main(webview: &Webview) -> Result<(), String> {
    match webview.label() {
        "main" => Ok(()),
        other => Err(format!("announcements refused webview label: {other}")),
    }
}

/// Verifies `body`, swaps it in as the current set and pings the main webview. Returns the item
/// count so callers can tell an empty file from a rejected one.
fn apply(app: &AppHandle, body: &str) -> Result<usize, String> {
    let items = verify::verify_and_parse(body)?;
    let count = items.len();
    if let Ok(mut s) = state().lock() {
        *s = items;
    }
    let _ = app.emit_to("main", EVENT, ());
    Ok(count)
}

#[tauri::command]
pub fn announcements_get(webview: Webview) -> Result<Vec<Item>, String> {
    require_main(&webview)?;
    let oldest = Local::now().date_naive() - Duration::days(MAX_AGE_DAYS);
    let items = state().lock().map_err(|e| e.to_string())?;
    Ok(items
        .iter()
        .filter(|i| parse_date(&i.published).is_some_and(|d| d >= oldest))
        .cloned()
        .collect())
}

/// Same verify and deliver path as the network fetch, fed from devtools. Release builds refuse.
#[tauri::command]
pub fn announcements_ingest_debug(app: AppHandle, webview: Webview, body: String) -> Result<usize, String> {
    require_main(&webview)?;
    #[cfg(debug_assertions)]
    {
        apply(&app, &body)
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (app, body);
        Err("debug builds only".into())
    }
}
