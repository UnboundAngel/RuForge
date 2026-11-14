//! In-app poll voting against `https://ruforge.app/api/poll`. Only poll ids that survived signature
//! verification are ever sent, and the voter value is a random per-install id, not a fingerprint.

use super::state;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Manager, Webview};

const ENDPOINT: &str = "https://ruforge.app/api/poll";
const ID_FILE: &str = "poll-voter-id";

#[derive(Serialize)]
pub struct Tally {
    pub counts: HashMap<String, u64>,
    pub total: u64,
    /// The option this install already voted for, when the server knows it.
    pub voted: Option<String>,
}

#[derive(Deserialize)]
struct WireOption {
    id: String,
    count: u64,
}

#[derive(Deserialize)]
struct WireResults {
    options: Vec<WireOption>,
    #[serde(default)]
    voted: Option<String>,
}

/// 32 lowercase hex chars, which is what the endpoint accepts. Created once, kept in app data.
fn voter_id(app: &AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join(ID_FILE);
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let existing = existing.trim();
        if existing.len() == 32 && existing.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) {
            return Ok(existing.to_string());
        }
    }
    let fresh = uuid::Uuid::new_v4().simple().to_string();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(&path, &fresh).map_err(|e| e.to_string())?;
    Ok(fresh)
}

/// Option ids of a verified poll, or `None` when the id is not a poll in the verified cache.
fn poll_options(poll_id: &str) -> Option<Vec<String>> {
    let items = state().lock().ok()?;
    let item = items.iter().find(|i| i.id == poll_id && i.kind == "poll")?;
    Some(item.options.as_ref()?.iter().map(|o| o.id.clone()).collect())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(Duration::from_secs(10)).build().map_err(|e| e.to_string())
}

async fn read_tally(resp: reqwest::Response) -> Result<Tally, String> {
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let wire: WireResults = resp.json().await.map_err(|e| e.to_string())?;
    let counts: HashMap<String, u64> = wire.options.into_iter().map(|o| (o.id, o.count)).collect();
    let total = counts.values().sum();
    Ok(Tally { counts, total, voted: wire.voted })
}

async fn fetch_tally(app: &AppHandle, poll_id: &str) -> Result<Tally, String> {
    let voter = voter_id(app)?;
    let resp = client()?.get(ENDPOINT).query(&[("id", poll_id), ("voter", voter.as_str())]).send().await.map_err(|e| e.to_string())?;
    read_tally(resp).await
}

async fn send_vote(app: &AppHandle, poll_id: &str, option_id: &str) -> Result<Tally, String> {
    let voter = voter_id(app)?;
    let body = serde_json::json!({ "id": poll_id, "option": option_id, "voter": voter });
    let resp = client()?.post(ENDPOINT).json(&body).send().await.map_err(|e| e.to_string())?;
    read_tally(resp).await
}

/// Debug builds only, so the card can be checked while the endpoint is down. Stable per poll and option.
#[cfg(debug_assertions)]
const MOCK_IDS: [&str; 6] = ["a", "b", "c", "d", "e", "f"];

#[cfg(debug_assertions)]
fn mock_tally(options: &[String], voted: Option<&str>) -> Tally {
    let counts: HashMap<String, u64> = options
        .iter()
        .map(|o| {
            let h = o.bytes().fold(2166136261u64, |h, b| (h ^ u64::from(b)).wrapping_mul(16777619));
            (o.clone(), 3 + h % 41)
        })
        .collect();
    let total = counts.values().sum();
    Tally { counts, total, voted: voted.map(str::to_string) }
}

#[tauri::command]
pub async fn announcements_poll_tally(app: AppHandle, webview: Webview, poll_id: String) -> Result<Tally, String> {
    super::require_main(&webview)?;
    let options = poll_options(&poll_id);
    if options.is_none() {
        // Debug-only items (dev:zz-test-*) are not in the signed cache and must never reach the network.
        #[cfg(debug_assertions)]
        return Ok(mock_tally(&MOCK_IDS.map(String::from), None));
        #[cfg(not(debug_assertions))]
        return Err("unknown poll".into());
    }
    match fetch_tally(&app, &poll_id).await {
        Ok(t) => Ok(t),
        #[cfg(debug_assertions)]
        Err(e) => {
            log::warn!("poll tally failed, using mock: {e}");
            Ok(mock_tally(&options.unwrap_or_default(), None))
        }
        #[cfg(not(debug_assertions))]
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn announcements_poll_vote(
    app: AppHandle,
    webview: Webview,
    poll_id: String,
    option_id: String,
) -> Result<Tally, String> {
    super::require_main(&webview)?;
    let options = poll_options(&poll_id);
    if !options.as_ref().is_some_and(|o| o.contains(&option_id)) {
        #[cfg(debug_assertions)]
        return Ok(mock_tally(&MOCK_IDS.map(String::from), Some(&option_id)));
        #[cfg(not(debug_assertions))]
        return Err("unknown poll or option".into());
    }
    match send_vote(&app, &poll_id, &option_id).await {
        Ok(t) => Ok(t),
        #[cfg(debug_assertions)]
        Err(e) => {
            log::warn!("poll vote failed, using mock: {e}");
            Ok(mock_tally(&options.unwrap_or_default(), Some(&option_id)))
        }
        #[cfg(not(debug_assertions))]
        Err(e) => Err(e),
    }
}
