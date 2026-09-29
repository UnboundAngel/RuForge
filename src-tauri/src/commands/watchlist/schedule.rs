use std::collections::HashMap;

use super::feed::{FeedEntry, FeedError};
use super::model::{
    merge_entries, remember_known, seed_channel, FeedMerge, LiveStatus, WatchedChannel, WatchlistUpload,
    LIVE_RECHECK_SECS,
};

/// After sleep or a manual refresh every channel is due at once; the cap spreads them over ticks.
pub const CHANNELS_PER_TICK: usize = 5;
pub const REPROBES_PER_TICK: usize = 10;
pub const MAX_BACKOFF_SECS: i64 = 6 * 3600;
/// Streams and imminent premieres flip state within minutes; far-off premieres wait a full interval.
pub const NEAR_REPROBE_SECS: i64 = 10 * 60;

pub fn interval_secs(interval_min: u32) -> i64 {
    i64::from(interval_min) * 60
}

pub fn jitter_max(interval_min: u32) -> i64 {
    interval_secs(interval_min) / 5
}

pub fn backoff_secs(interval_min: u32, fail_count: u32) -> i64 {
    let factor = 1i64.checked_shl(fail_count.min(32)).unwrap_or(i64::MAX);
    interval_secs(interval_min)
        .saturating_mul(factor)
        .min(MAX_BACKOFF_SECS)
}

/// Unseeded channels first so a fresh follow gets its baseline quickly, then the most overdue.
pub fn due_channels(channels: &[WatchedChannel], now: i64, limit: usize) -> Vec<String> {
    let mut due: Vec<&WatchedChannel> = channels.iter().filter(|c| c.next_check_at <= now).collect();
    due.sort_by_key(|c| (c.seeded, c.next_check_at));
    due.into_iter().take(limit).map(|c| c.channel_id.clone()).collect()
}

/// `jitter` must come from `0..=jitter_max(interval_min)`; it is a parameter to keep this pure.
/// With no candidates the unknown ids are remembered here; otherwise the caller remembers them together
/// with the probed uploads.
pub fn apply_feed_success(
    ch: &mut WatchedChannel,
    entries: &[FeedEntry],
    stored: &[WatchlistUpload],
    now: i64,
    interval_min: u32,
    jitter: i64,
) -> FeedMerge {
    let mut merged = if ch.seeded {
        merge_entries(ch, entries, stored)
    } else {
        seed_channel(ch, entries);
        FeedMerge::default()
    };
    if merged.candidates.is_empty() {
        remember_known(ch, &std::mem::take(&mut merged.unknown_ids));
    }
    ch.last_checked_at = Some(now);
    ch.last_error = None;
    ch.fail_count = 0;
    ch.next_check_at = now + interval_secs(interval_min) + jitter.clamp(0, jitter_max(interval_min));
    merged
}

pub fn apply_feed_failure(ch: &mut WatchedChannel, err: &FeedError, now: i64, interval_min: u32) {
    ch.fail_count = ch.fail_count.saturating_add(1);
    ch.last_error = Some(
        match err {
            FeedError::NotFound => "Channel feed not found",
            FeedError::Transient(_) => "Could not reach YouTube",
        }
        .to_string(),
    );
    ch.next_check_at = now + backoff_secs(interval_min, ch.fail_count);
}

pub fn is_held(u: &WatchlistUpload, now: i64) -> bool {
    u.live_status != LiveStatus::None && u.discovered_at > now - LIVE_RECHECK_SECS
}

/// `next_probe` is poller memory only; an id missing from it is due now.
pub fn reprobe_candidates(
    uploads: &[WatchlistUpload],
    next_probe: &HashMap<String, i64>,
    now: i64,
    limit: usize,
) -> Vec<String> {
    let mut due: Vec<&WatchlistUpload> = uploads
        .iter()
        .filter(|u| is_held(u, now))
        .filter(|u| next_probe.get(&u.video_id).map_or(true, |t| *t <= now))
        .collect();
    due.sort_by_key(|u| u.scheduled_at.unwrap_or(i64::MAX));
    due.into_iter().take(limit).map(|u| u.video_id.clone()).collect()
}

pub fn reprobe_gap_secs(live_status: LiveStatus, scheduled_at: Option<i64>, now: i64, interval_min: u32) -> i64 {
    let interval = interval_secs(interval_min);
    match (live_status, scheduled_at) {
        (LiveStatus::Upcoming, Some(at)) if at > now + interval => interval,
        (LiveStatus::Upcoming, None) => interval,
        _ => NEAR_REPROBE_SECS,
    }
}

pub fn apply_interval_change(channels: &mut [WatchedChannel], now: i64, interval_min: u32) {
    let limit = now + interval_secs(interval_min);
    for ch in channels {
        ch.next_check_at = ch.next_check_at.min(limit);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::watchlist::feed::{parse_channel_feed, tests::FIXTURE};
    use crate::commands::watchlist::model::{thumbnail_for, watch_url};

    fn channel(id: &str, seeded: bool, next_check_at: i64) -> WatchedChannel {
        WatchedChannel {
            channel_id: id.into(),
            title: id.into(),
            handle: None,
            followed_at: 0,
            auto_download: false,
            seeded,
            known_ids: Vec::new(),
            last_checked_at: None,
            last_error: None,
            fail_count: 0,
            next_check_at,
        }
    }

    fn held(id: &str, status: LiveStatus, scheduled_at: Option<i64>, discovered_at: i64) -> WatchlistUpload {
        WatchlistUpload {
            video_id: id.into(),
            channel_id: "c".into(),
            channel_title: "c".into(),
            title: id.into(),
            url: watch_url(id),
            thumbnail: thumbnail_for(id),
            published_at: discovered_at,
            discovered_at,
            duration_sec: None,
            live_status: status,
            scheduled_at,
            seen: false,
            auto_queued: false,
        }
    }

    #[test]
    fn watchlist_backoff_doubles_and_caps() {
        assert_eq!(backoff_secs(30, 1), 3600);
        assert_eq!(backoff_secs(30, 2), 7200);
        assert_eq!(backoff_secs(30, 3), 14_400);
        assert_eq!(backoff_secs(30, 4), MAX_BACKOFF_SECS);
        assert_eq!(backoff_secs(15, 40), MAX_BACKOFF_SECS);
        assert_eq!(backoff_secs(360, 1), MAX_BACKOFF_SECS);
        assert_eq!(backoff_secs(15, u32::MAX), MAX_BACKOFF_SECS);
    }

    #[test]
    fn watchlist_failure_sets_error_and_backoff() {
        let mut ch = channel("a", true, 0);
        apply_feed_failure(&mut ch, &FeedError::NotFound, 1000, 30);
        assert_eq!(ch.fail_count, 1);
        assert_eq!(ch.last_error.as_deref(), Some("Channel feed not found"));
        assert_eq!(ch.next_check_at, 1000 + 3600);
        apply_feed_failure(&mut ch, &FeedError::Transient("x".into()), 2000, 30);
        assert_eq!(ch.fail_count, 2);
        assert_eq!(ch.last_error.as_deref(), Some("Could not reach YouTube"));
        assert_eq!(ch.next_check_at, 2000 + 7200);
        assert!(ch.seeded);
    }

    #[test]
    fn watchlist_success_resets_and_jitters_within_bounds() {
        let entries = parse_channel_feed(FIXTURE).unwrap();
        let mut ch = channel("a", false, 0);
        ch.fail_count = 3;
        ch.last_error = Some("x".into());
        assert!(apply_feed_success(&mut ch, &entries, &[], 1000, 30, 0).candidates.is_empty());
        assert!(ch.seeded);
        assert_eq!(ch.fail_count, 0);
        assert_eq!(ch.last_error, None);
        assert_eq!(ch.last_checked_at, Some(1000));
        assert_eq!(ch.next_check_at, 1000 + 1800);
        assert_eq!(jitter_max(30), 360);
        apply_feed_success(&mut ch, &entries, &[], 1000, 30, 360);
        assert_eq!(ch.next_check_at, 1000 + 1800 + 360);
        apply_feed_success(&mut ch, &entries, &[], 1000, 30, 99_999);
        assert_eq!(ch.next_check_at, 1000 + 1800 + 360);
        apply_feed_success(&mut ch, &entries, &[], 1000, 30, -5);
        assert_eq!(ch.next_check_at, 1000 + 1800);
    }

    #[test]
    fn watchlist_success_on_seeded_surfaces_new() {
        let entries = parse_channel_feed(FIXTURE).unwrap();
        let mut ch = channel("a", true, 0);
        ch.followed_at = 1_789_000_000;
        let merged = apply_feed_success(&mut ch, &entries, &[], 1_789_999_999, 30, 0);
        assert_eq!(merged.candidates.len(), 1);
        assert_eq!(merged.candidates[0].video_id, "aaaaaaaaaaa");
        assert_eq!(merged.unknown_ids.len(), 3);
        assert!(ch.known_ids.is_empty());
    }

    #[test]
    fn watchlist_success_without_candidates_remembers_ids() {
        let entries = parse_channel_feed(FIXTURE).unwrap();
        let mut ch = channel("a", true, 0);
        ch.followed_at = 1_789_999_000;
        let merged = apply_feed_success(&mut ch, &entries, &[], 1_789_999_999, 30, 0);
        assert!(merged.candidates.is_empty());
        assert!(merged.unknown_ids.is_empty());
        assert_eq!(ch.known_ids, vec!["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);
    }

    #[test]
    fn watchlist_due_channels_order_and_cap() {
        let channels = vec![
            channel("late", true, 50),
            channel("future", true, 5000),
            channel("fresh", false, 90),
            channel("oldest", true, 10),
            channel("b", true, 60),
            channel("c", true, 70),
            channel("d", true, 80),
        ];
        let due = due_channels(&channels, 100, CHANNELS_PER_TICK);
        assert_eq!(due, vec!["fresh", "oldest", "late", "b", "c"]);
        assert!(due_channels(&channels, 0, 5).is_empty());
    }

    #[test]
    fn watchlist_reprobe_candidates_filter_and_pace() {
        let now = 10 * 86_400;
        let uploads = vec![
            held("vod", LiveStatus::None, None, now),
            held("stale", LiveStatus::Upcoming, Some(now), now - LIVE_RECHECK_SECS),
            held("later", LiveStatus::Upcoming, Some(now + 9000), now),
            held("soon", LiveStatus::Upcoming, Some(now + 60), now),
            held("live", LiveStatus::Live, None, now),
            held("waiting", LiveStatus::Live, None, now),
        ];
        let mut next = HashMap::new();
        next.insert("waiting".to_string(), now + 1);
        next.insert("soon".to_string(), now);
        let ids = reprobe_candidates(&uploads, &next, now, REPROBES_PER_TICK);
        assert_eq!(ids, vec!["soon", "later", "live"]);
        assert_eq!(reprobe_candidates(&uploads, &next, now, 1), vec!["soon"]);
    }

    #[test]
    fn watchlist_reprobe_gap() {
        let now = 1000;
        assert_eq!(reprobe_gap_secs(LiveStatus::Upcoming, Some(now + 86_400), now, 30), 1800);
        assert_eq!(reprobe_gap_secs(LiveStatus::Upcoming, None, now, 30), 1800);
        assert_eq!(reprobe_gap_secs(LiveStatus::Upcoming, Some(now + 600), now, 30), NEAR_REPROBE_SECS);
        assert_eq!(reprobe_gap_secs(LiveStatus::Upcoming, Some(now - 600), now, 30), NEAR_REPROBE_SECS);
        assert_eq!(reprobe_gap_secs(LiveStatus::Live, None, now, 180), NEAR_REPROBE_SECS);
    }

    #[test]
    fn watchlist_interval_change_only_pulls_in() {
        let mut channels = vec![channel("a", true, 100), channel("b", true, 99_999)];
        apply_interval_change(&mut channels, 1000, 15);
        assert_eq!(channels[0].next_check_at, 100);
        assert_eq!(channels[1].next_check_at, 1000 + 900);
    }
}
