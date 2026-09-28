pub mod feed;
pub mod model;
pub mod resolve;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, EventTarget, Manager, State};

use model::{
    is_channel_id, seed_channel, ResolvedChannel, WatchedChannel, WatchlistFile,
    WatchlistSnapshot, MAX_CHANNELS, MAX_INTERVAL_MIN, MIN_INTERVAL_MIN,
};

const WATCHLIST_FILENAME: &str = "watchlist.json";
pub const WATCHLIST_UPDATED_EVENT: &str = "watchlist-updated";
const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

pub struct WatchlistState {
    file: Mutex<WatchlistFile>,
    path: PathBuf,
    client: reqwest::Client,
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn read_file(path: &PathBuf) -> WatchlistFile {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(_) => return WatchlistFile::default(),
    };
    match serde_json::from_str::<WatchlistFile>(&text) {
        Ok(mut file) => {
            file.prefs.check_interval_min = file
                .prefs
                .check_interval_min
                .clamp(MIN_INTERVAL_MIN, MAX_INTERVAL_MIN);
            file
        }
        Err(e) => {
            // Keep the broken file for recovery instead of overwriting it on the next save.
            let _ = std::fs::rename(path, path.with_file_name(format!("{WATCHLIST_FILENAME}.bad")));
            crate::rf_log!(
                "core.startup",
                log::Level::Warn,
                "watchlist.json was unreadable and was moved aside: {e}"
            );
            WatchlistFile::default()
        }
    }
}

impl WatchlistState {
    pub fn load(app: &AppHandle) -> WatchlistState {
        let path = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("ruforge"))
            .join(WATCHLIST_FILENAME);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(BROWSER_UA)
            .build()
            .unwrap_or_default();
        WatchlistState {
            file: Mutex::new(read_file(&path)),
            path,
            client,
        }
    }

    fn save(&self, file: &WatchlistFile) -> Result<(), String> {
        let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
        crate::commands::music_playlists::write_atomic(&self.path, &text)
    }

    fn commit(
        &self,
        app: &AppHandle,
        mutate: impl FnOnce(&mut WatchlistFile),
    ) -> Result<WatchlistSnapshot, String> {
        let snapshot = {
            let mut file = self.file.lock().map_err(|e| e.to_string())?;
            mutate(&mut file);
            file.trim_uploads(now_secs());
            self.save(&file)?;
            file.snapshot()
        };
        emit_updated(app, &snapshot);
        Ok(snapshot)
    }

    fn snapshot(&self) -> Result<WatchlistSnapshot, String> {
        Ok(self.file.lock().map_err(|e| e.to_string())?.snapshot())
    }
}

/// Main only: the Explorer child webview has event permission and must not see follows.
fn emit_updated(app: &AppHandle, snapshot: &WatchlistSnapshot) {
    let _ = app.emit_to(
        EventTarget::webview_window("main"),
        WATCHLIST_UPDATED_EVENT,
        snapshot,
    );
}

#[tauri::command]
pub fn get_watchlist(state: State<'_, WatchlistState>) -> Result<WatchlistSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub async fn follow_channel(
    app: AppHandle,
    state: State<'_, WatchlistState>,
    channel_id: String,
    title: String,
    handle: Option<String>,
) -> Result<WatchlistSnapshot, String> {
    if !is_channel_id(&channel_id) {
        return Err("That is not a YouTube channel id.".into());
    }
    {
        let file = state.file.lock().map_err(|e| e.to_string())?;
        if file.channels.iter().any(|c| c.channel_id == channel_id) {
            return Ok(file.snapshot());
        }
        if file.channels.len() >= MAX_CHANNELS {
            return Err("You can follow up to 300 channels.".into());
        }
    }
    let fetched = feed::fetch_channel_feed(&state.client, &channel_id).await.ok();

    let mut over_cap = false;
    let snapshot = state.commit(&app, |file| {
        if file.channels.iter().any(|c| c.channel_id == channel_id) {
            return;
        }
        if file.channels.len() >= MAX_CHANNELS {
            over_cap = true;
            return;
        }
        let now = now_secs();
        let feed_title = fetched.as_ref().and_then(|(_, t)| t.clone());
        let title = Some(title.trim().to_string())
            .filter(|t| !t.is_empty())
            .or(feed_title)
            .unwrap_or_else(|| channel_id.clone());
        let mut ch = WatchedChannel {
            channel_id: channel_id.clone(),
            title,
            handle: handle.map(|h| h.trim().to_string()).filter(|h| !h.is_empty()),
            followed_at: now,
            auto_download: false,
            seeded: false,
            known_ids: Vec::new(),
            last_checked_at: None,
            last_error: None,
            fail_count: 0,
            next_check_at: now + i64::from(file.prefs.check_interval_min) * 60,
        };
        if let Some((entries, _)) = &fetched {
            seed_channel(&mut ch, entries);
            ch.last_checked_at = Some(now);
        }
        file.channels.push(ch);
    })?;
    if over_cap {
        return Err("You can follow up to 300 channels.".into());
    }
    Ok(snapshot)
}

#[tauri::command]
pub async fn resolve_watchlist_channel(
    app: AppHandle,
    state: State<'_, WatchlistState>,
    input: String,
) -> Result<ResolvedChannel, String> {
    resolve::resolve(&app, &state.client, &input).await
}

#[tauri::command]
pub fn unfollow_channel(
    app: AppHandle,
    state: State<'_, WatchlistState>,
    channel_id: String,
) -> Result<WatchlistSnapshot, String> {
    state.commit(&app, |file| {
        file.channels.retain(|c| c.channel_id != channel_id);
        file.uploads.retain(|u| u.channel_id != channel_id);
    })
}

#[tauri::command]
pub fn set_channel_auto_download(
    app: AppHandle,
    state: State<'_, WatchlistState>,
    channel_id: String,
    enabled: bool,
) -> Result<WatchlistSnapshot, String> {
    state.commit(&app, |file| {
        if let Some(ch) = file.channel_mut(&channel_id) {
            ch.auto_download = enabled;
        }
    })
}

#[tauri::command]
pub fn mark_watchlist_seen(
    app: AppHandle,
    state: State<'_, WatchlistState>,
    video_ids: Vec<String>,
) -> Result<WatchlistSnapshot, String> {
    state.commit(&app, |file| {
        for u in file.uploads.iter_mut().filter(|u| video_ids.contains(&u.video_id)) {
            u.seen = true;
        }
    })
}

#[tauri::command]
pub fn mark_all_watchlist_seen(
    app: AppHandle,
    state: State<'_, WatchlistState>,
) -> Result<WatchlistSnapshot, String> {
    state.commit(&app, |file| {
        for u in file.uploads.iter_mut() {
            u.seen = true;
        }
    })
}

#[tauri::command]
pub fn mark_watchlist_auto_queued(
    app: AppHandle,
    state: State<'_, WatchlistState>,
    video_ids: Vec<String>,
) -> Result<WatchlistSnapshot, String> {
    state.commit(&app, |file| {
        for u in file.uploads.iter_mut().filter(|u| video_ids.contains(&u.video_id)) {
            u.auto_queued = true;
        }
    })
}
