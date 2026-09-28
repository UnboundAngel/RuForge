use std::collections::HashMap;
use std::time::Duration;

use rand::Rng;
use tauri::{AppHandle, Manager};

use super::feed::{fetch_channel_feed, FeedEntry};
use super::model::{apply_reprobe, probe_from_player, upload_from_entry, WatchlistFile, WatchlistUpload};
use super::schedule::{
    apply_feed_failure, apply_feed_success, due_channels, is_held, jitter_max, reprobe_candidates,
    reprobe_gap_secs, CHANNELS_PER_TICK, REPROBES_PER_TICK,
};
use super::{emit_updated, emit_uploads, now_secs, WatchlistState};
use crate::commands::youtube_feed::fetch_player_response;

const FIRST_TICK_DELAY: Duration = Duration::from_secs(20);
const TICK_EVERY: Duration = Duration::from_secs(60);
const FEED_GAP: Duration = Duration::from_millis(1500);
const PROBE_GAP: Duration = Duration::from_millis(750);

#[derive(Default)]
struct TickResult {
    changed: bool,
    surfaced: Vec<WatchlistUpload>,
    released: Vec<WatchlistUpload>,
}

pub fn spawn_watchlist_poller(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<WatchlistState>();
        // Re-probe pacing is memory only: after a restart every held upload is probed once, capped per tick.
        let mut next_probe: HashMap<String, i64> = HashMap::new();
        tokio::select! {
            _ = tokio::time::sleep(FIRST_TICK_DELAY) => {}
            _ = state.poke.notified() => {}
        }
        loop {
            tick(&app, &state, &mut next_probe).await;
            tokio::select! {
                _ = tokio::time::sleep(TICK_EVERY) => {}
                _ = state.poke.notified() => {}
            }
        }
    });
}

/// Never holds the std mutex across an await: each lock is a short synchronous block.
fn with_file<R>(state: &WatchlistState, f: impl FnOnce(&mut WatchlistFile) -> R) -> Option<R> {
    state.file.lock().ok().map(|mut file| f(&mut file))
}

async fn tick(app: &AppHandle, state: &WatchlistState, next_probe: &mut HashMap<String, i64>) {
    let now = now_secs();
    let Some((due, interval_min)) = with_file(state, |file| {
        (
            due_channels(&file.channels, now, CHANNELS_PER_TICK),
            file.prefs.check_interval_min,
        )
    }) else {
        return;
    };
    let mut result = TickResult::default();

    for (i, channel_id) in due.iter().enumerate() {
        if i > 0 {
            tokio::time::sleep(FEED_GAP).await;
        }
        check_channel(state, channel_id, interval_min, &mut result).await;
    }

    reprobe_held(state, interval_min, next_probe, &mut result).await;

    if !result.changed {
        return;
    }
    let saved = with_file(state, |file| {
        file.trim_uploads(now_secs());
        if let Err(e) = state.save(file) {
            crate::rf_log!("youtube.watchlist", log::Level::Warn, "save failed: {e}");
        }
    });
    if saved.is_some() {
        emit_updated(app);
    }
    emit_uploads(app, result.surfaced, result.released);
}

async fn check_channel(
    state: &WatchlistState,
    channel_id: &str,
    interval_min: u32,
    result: &mut TickResult,
) {
    let fetched = fetch_channel_feed(&state.client, channel_id).await;
    let now = now_secs();
    let jitter = rand::thread_rng().gen_range(0..=jitter_max(interval_min));
    let applied = with_file(state, |file| {
        let ch = file.channel_mut(channel_id)?;
        let candidates = match &fetched {
            Ok((entries, _)) => apply_feed_success(ch, entries, now, interval_min, jitter),
            Err(e) => {
                crate::rf_log!("youtube.watchlist", log::Level::Info, "{channel_id}: feed failed: {e:?}");
                apply_feed_failure(ch, e, now, interval_min);
                Vec::new()
            }
        };
        Some((candidates, ch.title.clone()))
    })
    .flatten();
    let Some((candidates, channel_title)) = applied else {
        return;
    };
    result.changed = true;
    if candidates.is_empty() {
        return;
    }
    crate::rf_log!(
        "youtube.watchlist",
        log::Level::Info,
        "{channel_id}: {} new upload(s)",
        candidates.len()
    );
    let uploads = probe_candidates(state, &candidates, &channel_title, now).await;
    with_file(state, |file| {
        // Unfollowed while probing: drop the uploads instead of orphaning them.
        if !file.channels.iter().any(|c| c.channel_id == channel_id) {
            return;
        }
        for upload in uploads {
            if file.uploads.iter().any(|u| u.video_id == upload.video_id) {
                continue;
            }
            file.uploads.push(upload.clone());
            result.surfaced.push(upload);
        }
    });
}

async fn probe_candidates(
    state: &WatchlistState,
    candidates: &[FeedEntry],
    channel_title: &str,
    now: i64,
) -> Vec<WatchlistUpload> {
    let mut uploads = Vec::with_capacity(candidates.len());
    for (i, entry) in candidates.iter().enumerate() {
        if i > 0 {
            tokio::time::sleep(PROBE_GAP).await;
        }
        let probe = fetch_player_response(&state.client, &entry.video_id)
            .await
            .map(|p| probe_from_player(&p));
        uploads.push(upload_from_entry(entry, channel_title, probe, now));
    }
    uploads
}

async fn reprobe_held(
    state: &WatchlistState,
    interval_min: u32,
    next_probe: &mut HashMap<String, i64>,
    result: &mut TickResult,
) {
    let now = now_secs();
    let Some(ids) = with_file(state, |file| {
        next_probe.retain(|id, _| file.uploads.iter().any(|u| u.video_id == *id && is_held(u, now)));
        reprobe_candidates(&file.uploads, next_probe, now, REPROBES_PER_TICK)
    }) else {
        return;
    };
    for (i, video_id) in ids.iter().enumerate() {
        if i > 0 {
            tokio::time::sleep(PROBE_GAP).await;
        }
        let probe = fetch_player_response(&state.client, video_id)
            .await
            .map(|p| probe_from_player(&p));
        let now = now_secs();
        with_file(state, |file| {
            let current = file.uploads.iter().find(|u| u.video_id == *video_id);
            let (status, scheduled) = match (probe, current) {
                (Some(p), _) => (p.live_status, p.scheduled_at),
                (None, Some(u)) => (u.live_status, u.scheduled_at),
                (None, None) => return,
            };
            next_probe.insert(video_id.clone(), now + reprobe_gap_secs(status, scheduled, now, interval_min));
            let Some(probe) = probe else {
                return;
            };
            let outcome = apply_reprobe(file, video_id, probe);
            result.changed |= outcome.changed;
            if let Some(upload) = outcome.released {
                result.released.push(upload);
            }
        });
    }
}
