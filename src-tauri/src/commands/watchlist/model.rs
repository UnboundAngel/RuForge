use serde::{Deserialize, Serialize};

use super::feed::FeedEntry;

pub const WATCHLIST_FILE_VERSION: u32 = 1;
pub const MAX_CHANNELS: usize = 300;
pub const KNOWN_IDS_CAP: usize = 60;
pub const UNSEEN_CAP: usize = 100;
pub const SEEN_KEEP: usize = 100;
pub const SEEN_KEEP_SECS: i64 = 14 * 86_400;
pub const LIVE_RECHECK_SECS: i64 = 7 * 86_400;
pub const DEFAULT_INTERVAL_MIN: u32 = 30;
pub const MIN_INTERVAL_MIN: u32 = 15;
pub const MAX_INTERVAL_MIN: u32 = 360;
/// Grace before `followed_at` so a video posted just before the follow still counts as new.
const NEW_UPLOAD_GRACE_SECS: i64 = 3600;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistFile {
    pub version: u32,
    #[serde(default)]
    pub prefs: WatchlistPrefs,
    #[serde(default)]
    pub channels: Vec<WatchedChannel>,
    #[serde(default)]
    pub uploads: Vec<WatchlistUpload>,
}

impl Default for WatchlistFile {
    fn default() -> Self {
        Self {
            version: WATCHLIST_FILE_VERSION,
            prefs: WatchlistPrefs::default(),
            channels: Vec::new(),
            uploads: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistPrefs {
    pub check_interval_min: u32,
}

impl Default for WatchlistPrefs {
    fn default() -> Self {
        Self {
            check_interval_min: DEFAULT_INTERVAL_MIN,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchedChannel {
    pub channel_id: String,
    pub title: String,
    pub handle: Option<String>,
    pub followed_at: i64,
    pub auto_download: bool,
    pub seeded: bool,
    pub known_ids: Vec<String>,
    pub last_checked_at: Option<i64>,
    pub last_error: Option<String>,
    pub fail_count: u32,
    pub next_check_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LiveStatus {
    #[default]
    None,
    Upcoming,
    Live,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistUpload {
    pub video_id: String,
    pub channel_id: String,
    pub channel_title: String,
    pub title: String,
    pub url: String,
    pub thumbnail: String,
    pub published_at: i64,
    pub discovered_at: i64,
    pub duration_sec: Option<u32>,
    pub live_status: LiveStatus,
    pub scheduled_at: Option<i64>,
    pub seen: bool,
    pub auto_queued: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistSnapshot {
    pub channels: Vec<WatchedChannelView>,
    pub uploads: Vec<WatchlistUpload>,
    pub unseen_count: u32,
    pub check_interval_min: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchedChannelView {
    pub channel_id: String,
    pub title: String,
    pub handle: Option<String>,
    pub followed_at: i64,
    pub auto_download: bool,
    pub last_checked_at: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UploadsPayload {
    pub uploads: Vec<WatchlistUpload>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedChannel {
    pub channel_id: String,
    pub title: String,
    pub handle: Option<String>,
}

pub fn is_channel_id(id: &str) -> bool {
    id.len() == 24
        && id.starts_with("UC")
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// `mqdefault` is 16:9; the RSS `hqdefault` is 4:3 with letterbox bars.
pub fn thumbnail_for(video_id: &str) -> String {
    format!("https://i.ytimg.com/vi/{video_id}/mqdefault.jpg")
}

pub fn watch_url(video_id: &str) -> String {
    format!("https://www.youtube.com/watch?v={video_id}")
}

impl WatchedChannel {
    pub fn view(&self) -> WatchedChannelView {
        WatchedChannelView {
            channel_id: self.channel_id.clone(),
            title: self.title.clone(),
            handle: self.handle.clone(),
            followed_at: self.followed_at,
            auto_download: self.auto_download,
            last_checked_at: self.last_checked_at,
            last_error: self.last_error.clone(),
        }
    }
}

impl WatchlistFile {
    pub fn snapshot(&self) -> WatchlistSnapshot {
        let mut uploads = self.uploads.clone();
        uploads.sort_by(|a, b| b.published_at.cmp(&a.published_at));
        WatchlistSnapshot {
            channels: self.channels.iter().map(WatchedChannel::view).collect(),
            unseen_count: uploads.iter().filter(|u| !u.seen).count() as u32,
            uploads,
            check_interval_min: self.prefs.check_interval_min,
        }
    }

    pub fn trim_uploads(&mut self, now: i64) {
        self.uploads
            .sort_by(|a, b| b.published_at.cmp(&a.published_at));
        let mut unseen = 0usize;
        let mut seen = 0usize;
        self.uploads.retain(|u| {
            if u.seen {
                seen += 1;
                seen <= SEEN_KEEP && u.discovered_at >= now - SEEN_KEEP_SECS
            } else {
                unseen += 1;
                unseen <= UNSEEN_CAP
            }
        });
    }

    pub fn channel_mut(&mut self, id: &str) -> Option<&mut WatchedChannel> {
        self.channels.iter_mut().find(|c| c.channel_id == id)
    }
}

/// Feed order is newest first, so new ids go to the front in that order.
fn remember_ids<'a>(ch: &mut WatchedChannel, ids: impl Iterator<Item = &'a str>) {
    let mut fresh: Vec<String> = Vec::new();
    for id in ids {
        if !ch.known_ids.iter().any(|k| k == id) && !fresh.iter().any(|f| f == id) {
            fresh.push(id.to_string());
        }
    }
    if fresh.is_empty() {
        return;
    }
    fresh.append(&mut ch.known_ids);
    fresh.truncate(KNOWN_IDS_CAP);
    ch.known_ids = fresh;
}

pub fn seed_channel(ch: &mut WatchedChannel, entries: &[FeedEntry]) {
    remember_ids(ch, entries.iter().map(|e| e.video_id.as_str()));
    ch.seeded = true;
}

/// Shorts are recorded as known so they never resurface, but never returned.
pub fn merge_entries(ch: &mut WatchedChannel, entries: &[FeedEntry]) -> Vec<FeedEntry> {
    if !ch.seeded {
        return Vec::new();
    }
    let cutoff = ch.followed_at - NEW_UPLOAD_GRACE_SECS;
    let unknown: Vec<&FeedEntry> = entries
        .iter()
        .filter(|e| !ch.known_ids.iter().any(|k| *k == e.video_id))
        .collect();
    let candidates = unknown
        .iter()
        .filter(|e| !e.short && e.published_at >= cutoff)
        .map(|e| (*e).clone())
        .collect();
    remember_ids(ch, unknown.iter().map(|e| e.video_id.as_str()));
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::watchlist::feed::{parse_channel_feed, tests::FIXTURE};

    fn channel(followed_at: i64) -> WatchedChannel {
        WatchedChannel {
            channel_id: "UCY-PrcA-mjq3OhgsAH9C52A".into(),
            title: "Tom".into(),
            handle: None,
            followed_at,
            auto_download: false,
            seeded: false,
            known_ids: Vec::new(),
            last_checked_at: None,
            last_error: None,
            fail_count: 0,
            next_check_at: 0,
        }
    }

    fn upload(id: &str, published_at: i64, seen: bool) -> WatchlistUpload {
        WatchlistUpload {
            video_id: id.into(),
            channel_id: "UCY-PrcA-mjq3OhgsAH9C52A".into(),
            channel_title: "Tom".into(),
            title: id.into(),
            url: watch_url(id),
            thumbnail: thumbnail_for(id),
            published_at,
            discovered_at: published_at,
            duration_sec: None,
            live_status: LiveStatus::None,
            scheduled_at: None,
            seen,
            auto_queued: false,
        }
    }

    #[test]
    fn watchlist_merge_needs_seed() {
        let entries = parse_channel_feed(FIXTURE).unwrap();
        let mut ch = channel(0);
        assert!(merge_entries(&mut ch, &entries).is_empty());
        assert!(ch.known_ids.is_empty());
    }

    #[test]
    fn watchlist_seed_records_every_id() {
        let entries = parse_channel_feed(FIXTURE).unwrap();
        let mut ch = channel(0);
        seed_channel(&mut ch, &entries);
        assert!(ch.seeded);
        assert_eq!(ch.known_ids, vec!["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);
        assert!(merge_entries(&mut ch, &entries).is_empty());
    }

    #[test]
    fn watchlist_merge_drops_shorts_and_old_videos() {
        let entries = parse_channel_feed(FIXTURE).unwrap();
        let mut ch = channel(1_789_000_000);
        ch.seeded = true;
        let found = merge_entries(&mut ch, &entries);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].video_id, "aaaaaaaaaaa");
        assert_eq!(ch.known_ids, vec!["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);
    }

    #[test]
    fn watchlist_merge_keeps_posts_within_grace() {
        let entries = parse_channel_feed(FIXTURE).unwrap();
        let mut ch = channel(1_789_905_600 + 3600);
        ch.seeded = true;
        let found = merge_entries(&mut ch, &entries);
        assert_eq!(found.len(), 1);
        let mut late = channel(1_789_905_600 + 3601);
        late.seeded = true;
        assert!(merge_entries(&mut late, &entries).is_empty());
    }

    #[test]
    fn watchlist_known_ids_cap() {
        let mut ch = channel(0);
        let ids: Vec<String> = (0..KNOWN_IDS_CAP + 10).map(|i| format!("old{i:08}")).collect();
        remember_ids(&mut ch, ids.iter().map(String::as_str));
        assert_eq!(ch.known_ids.len(), KNOWN_IDS_CAP);
        remember_ids(&mut ch, std::iter::once("newest00000"));
        assert_eq!(ch.known_ids.len(), KNOWN_IDS_CAP);
        assert_eq!(ch.known_ids[0], "newest00000");
        assert_eq!(ch.known_ids[1], "old00000000");
    }

    #[test]
    fn watchlist_snapshot_counts_unseen() {
        let mut file = WatchlistFile::default();
        file.channels.push(channel(0));
        file.uploads = vec![upload("a", 10, false), upload("b", 30, true), upload("c", 20, false)];
        let snap = file.snapshot();
        assert_eq!(snap.unseen_count, 2);
        assert_eq!(snap.check_interval_min, DEFAULT_INTERVAL_MIN);
        let order: Vec<&str> = snap.uploads.iter().map(|u| u.video_id.as_str()).collect();
        assert_eq!(order, vec!["b", "c", "a"]);
        assert_eq!(snap.channels.len(), 1);
    }

    #[test]
    fn watchlist_trim_drops_stale_seen() {
        let now = 100 * 86_400;
        let mut file = WatchlistFile::default();
        let mut stale = upload("stale", now - SEEN_KEEP_SECS - 1, true);
        stale.discovered_at = now - SEEN_KEEP_SECS - 1;
        file.uploads = vec![stale, upload("fresh", now, true), upload("unseen", 0, false)];
        file.trim_uploads(now);
        let ids: Vec<&str> = file.uploads.iter().map(|u| u.video_id.as_str()).collect();
        assert_eq!(ids, vec!["fresh", "unseen"]);
    }

    #[test]
    fn watchlist_channel_ids() {
        assert!(is_channel_id("UCY-PrcA-mjq3OhgsAH9C52A"));
        assert!(!is_channel_id("@dandingles"));
        assert!(!is_channel_id("UC/../../etc"));
        assert_eq!(thumbnail_for("x"), "https://i.ytimg.com/vi/x/mqdefault.jpg");
        assert_eq!(watch_url("x"), "https://www.youtube.com/watch?v=x");
    }
}
