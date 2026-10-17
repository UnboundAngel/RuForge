use std::sync::atomic::Ordering;
use std::time::Duration;

use rand::Rng;
use tauri::{AppHandle, Manager};

use super::feed::fetch_playlist_feed;
use super::model::{merge_entries, PlaylistNewRecord, PlaylistWatchFile};
use super::{emit_new, now_secs, PlaylistWatchState};
use crate::commands::private_mailbox::PrivateMailbox;
use crate::commands::watchlist::schedule::{backoff_secs, interval_secs, jitter_max};
use crate::commands::watchlist::WatchlistState;

/// Starts after the channel poller's first tick so the two never fetch in the same burst.
const FIRST_TICK_DELAY: Duration = Duration::from_secs(45);
const TICK_EVERY: Duration = Duration::from_secs(60);
const FEED_GAP: Duration = Duration::from_millis(1500);
const PLAYLISTS_PER_TICK: usize = 3;
pub const MAILBOX_KEY: &str = "playlist-watch-new";

pub fn spawn_playlist_poller(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<PlaylistWatchState>();
        tokio::select! {
            _ = tokio::time::sleep(FIRST_TICK_DELAY) => {}
            _ = state.poke.notified() => {}
        }
        loop {
            tick(&app, &state).await;
            tokio::select! {
                _ = tokio::time::sleep(TICK_EVERY) => {}
                _ = state.poke.notified() => {}
            }
        }
    });
}

/// Never holds the std mutex across an await: each lock is a short synchronous block.
fn with_file<R>(state: &PlaylistWatchState, f: impl FnOnce(&mut PlaylistWatchFile) -> R) -> Option<R> {
    state.file.lock().ok().map(|mut file| f(&mut file))
}

fn due_lists(file: &PlaylistWatchFile, now: i64, limit: usize) -> Vec<String> {
    let mut due: Vec<_> = file.playlists.iter().filter(|p| p.next_check_at <= now).collect();
    due.sort_by_key(|p| (p.seeded, p.next_check_at));
    due.into_iter().take(limit).map(|p| p.list_id.clone()).collect()
}

async fn tick(app: &AppHandle, state: &PlaylistWatchState) {
    if !state.enabled.load(Ordering::Relaxed) {
        return;
    }
    let interval_min = app.state::<WatchlistState>().check_interval_min();
    let now = now_secs();
    let Some(due) = with_file(state, |file| due_lists(file, now, PLAYLISTS_PER_TICK)) else {
        return;
    };
    let mut records = Vec::new();
    for (i, list_id) in due.iter().enumerate() {
        if i > 0 {
            tokio::time::sleep(FEED_GAP).await;
        }
        if let Some(record) = check_playlist(state, list_id, interval_min).await {
            records.push(record);
        }
    }
    if due.is_empty() {
        return;
    }
    with_file(state, |file| {
        if let Err(e) = state.save(file) {
            crate::rf_log!("youtube.playlist_watch", log::Level::Warn, "save failed: {e}");
        }
    });
    if records.is_empty() {
        return;
    }
    let mailbox = app.state::<PrivateMailbox>();
    for record in records {
        match serde_json::to_value(&record) {
            Ok(value) => {
                let _ = mailbox.push(MAILBOX_KEY, value);
            }
            Err(e) => crate::rf_log!("youtube.playlist_watch", log::Level::Warn, "record encode failed: {e}"),
        }
    }
    emit_new(app);
}

async fn check_playlist(state: &PlaylistWatchState, list_id: &str, interval_min: u32) -> Option<PlaylistNewRecord> {
    let fetched = fetch_playlist_feed(&state.client, list_id).await;
    let now = now_secs();
    let jitter = rand::thread_rng().gen_range(0..=jitter_max(interval_min));
    with_file(state, |file| {
        let pl = file.playlists.iter_mut().find(|p| p.list_id == list_id)?;
        match &fetched {
            Ok(entries) => {
                let videos = merge_entries(pl, entries);
                pl.last_checked_at = Some(now);
                pl.fail_count = 0;
                pl.next_check_at = now + interval_secs(interval_min) + jitter;
                if videos.is_empty() {
                    return None;
                }
                crate::rf_log!("youtube.playlist_watch", log::Level::Info, "{list_id}: {} new video(s)", videos.len());
                Some(PlaylistNewRecord {
                    list_id: pl.list_id.clone(),
                    list_url: pl.list_url.clone(),
                    title: pl.title.clone(),
                    output_dir: pl.output_dir.clone(),
                    folder_name: pl.folder_name.clone(),
                    videos,
                    at: now,
                })
            }
            Err(e) => {
                crate::rf_log!("youtube.playlist_watch", log::Level::Info, "{list_id}: feed failed: {e:?}");
                pl.fail_count = pl.fail_count.saturating_add(1);
                pl.next_check_at = now + backoff_secs(interval_min, pl.fail_count);
                None
            }
        }
    })
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::super::model::new_watched;
    use super::*;

    #[test]
    fn playlist_watch_due_prefers_unseeded_then_overdue() {
        let mut a = new_watched("PLaaaaaaaaaaa", "u", "a", "o", "a", vec![], 0);
        a.seeded = true;
        a.next_check_at = 10;
        let mut b = new_watched("PLbbbbbbbbbbb", "u", "b", "o", "b", vec![], 0);
        b.next_check_at = 50;
        let mut c = new_watched("PLccccccccccc", "u", "c", "o", "c", vec![], 0);
        c.next_check_at = 999;
        let file = PlaylistWatchFile { playlists: vec![a, b, c] };
        assert_eq!(due_lists(&file, 100, 5), vec!["PLbbbbbbbbbbb", "PLaaaaaaaaaaa"]);
        assert_eq!(due_lists(&file, 100, 1), vec!["PLbbbbbbbbbbb"]);
    }
}
