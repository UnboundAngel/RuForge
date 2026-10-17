use serde::{Deserialize, Serialize};

use crate::commands::watchlist::feed::FeedEntry;

pub const MAX_PLAYLISTS: usize = 200;
const MAX_KNOWN: usize = 2000;
/// A friend rarely adds more than a handful at once; a larger batch is a feed glitch or a mass import.
pub const MAX_VIDEOS_PER_RECORD: usize = 25;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PlaylistWatchFile {
    #[serde(default)]
    pub playlists: Vec<WatchedPlaylist>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchedPlaylist {
    pub list_id: String,
    pub list_url: String,
    pub title: String,
    pub output_dir: String,
    pub folder_name: String,
    #[serde(default)]
    pub known_ids: Vec<String>,
    #[serde(default)]
    pub seeded: bool,
    #[serde(default)]
    pub last_checked_at: Option<i64>,
    #[serde(default)]
    pub fail_count: u32,
    #[serde(default)]
    pub next_check_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct NewPlaylistVideo {
    pub id: String,
    pub title: String,
}

/// Pulled by the main webview through the private mailbox; never travels in an event payload.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistNewRecord {
    pub list_id: String,
    pub list_url: String,
    pub title: String,
    pub output_dir: String,
    pub folder_name: String,
    pub videos: Vec<NewPlaylistVideo>,
    pub at: i64,
}

/// YouTube Mix (`RD`), Liked (`LL`) and Watch later (`WL`) have no stable public feed, so only
/// user playlists (`PL`) and album playlists (`OL`) are watched.
pub fn is_watchable_list_id(id: &str) -> bool {
    (id.starts_with("PL") || id.starts_with("OL"))
        && id.len() >= 12
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn new_watched(list_id: &str, list_url: &str, title: &str, output_dir: &str, folder: &str, ids: Vec<String>, now: i64) -> WatchedPlaylist {
    WatchedPlaylist {
        list_id: list_id.to_string(),
        list_url: list_url.to_string(),
        title: title.to_string(),
        output_dir: output_dir.to_string(),
        folder_name: folder.to_string(),
        known_ids: ids,
        seeded: false,
        last_checked_at: None,
        fail_count: 0,
        next_check_at: now,
    }
}

pub fn remember(pl: &mut WatchedPlaylist, ids: impl IntoIterator<Item = String>) {
    for id in ids {
        if !pl.known_ids.contains(&id) {
            pl.known_ids.push(id);
        }
    }
    if pl.known_ids.len() > MAX_KNOWN {
        let drop = pl.known_ids.len() - MAX_KNOWN;
        pl.known_ids.drain(..drop);
    }
}

/// The first successful fetch is the baseline: everything in it counts as already known, so a
/// freshly watched playlist never announces its existing videos. Shorts are remembered but never
/// reported.
pub fn merge_entries(pl: &mut WatchedPlaylist, entries: &[FeedEntry]) -> Vec<NewPlaylistVideo> {
    let mut fresh: Vec<&FeedEntry> = Vec::new();
    if pl.seeded {
        for e in entries {
            let dup = fresh.iter().any(|f| f.video_id == e.video_id);
            if !e.short && !dup && !pl.known_ids.contains(&e.video_id) {
                fresh.push(e);
            }
        }
    }
    pl.seeded = true;
    remember(pl, entries.iter().map(|e| e.video_id.clone()));
    fresh
        .into_iter()
        .take(MAX_VIDEOS_PER_RECORD)
        .map(|e| NewPlaylistVideo { id: e.video_id.clone(), title: e.title.clone() })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, short: bool) -> FeedEntry {
        FeedEntry {
            video_id: id.to_string(),
            channel_id: String::new(),
            channel_title: String::new(),
            title: format!("t-{id}"),
            published_at: 0,
            short,
        }
    }

    fn watched(known: &[&str]) -> WatchedPlaylist {
        new_watched("PLabcdefghijk", "https://www.youtube.com/playlist?list=PLabcdefghijk", "Mix", "D:/out", "Mix", known.iter().map(|s| s.to_string()).collect(), 0)
    }

    #[test]
    fn playlist_watch_first_fetch_is_baseline() {
        let mut pl = watched(&["aaaaaaaaaaa"]);
        let out = merge_entries(&mut pl, &[entry("aaaaaaaaaaa", false), entry("bbbbbbbbbbb", false)]);
        assert!(out.is_empty());
        assert!(pl.seeded);
        assert!(pl.known_ids.contains(&"bbbbbbbbbbb".to_string()));
    }

    #[test]
    fn playlist_watch_reports_new_and_skips_shorts() {
        let mut pl = watched(&["aaaaaaaaaaa"]);
        merge_entries(&mut pl, &[entry("aaaaaaaaaaa", false)]);
        let out = merge_entries(
            &mut pl,
            &[entry("aaaaaaaaaaa", false), entry("ccccccccccc", false), entry("ddddddddddd", true), entry("ccccccccccc", false)],
        );
        assert_eq!(out, vec![NewPlaylistVideo { id: "ccccccccccc".into(), title: "t-ccccccccccc".into() }]);
        assert!(merge_entries(&mut pl, &[entry("ccccccccccc", false), entry("ddddddddddd", true)]).is_empty());
    }

    #[test]
    fn playlist_watch_known_ids_are_capped() {
        let mut pl = watched(&[]);
        merge_entries(&mut pl, &[]);
        let many: Vec<FeedEntry> = (0..MAX_KNOWN + 50).map(|i| entry(&format!("{i:011}"), false)).collect();
        merge_entries(&mut pl, &many);
        assert_eq!(pl.known_ids.len(), MAX_KNOWN);
    }

    #[test]
    fn playlist_watch_list_id_filter() {
        assert!(is_watchable_list_id("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"));
        assert!(is_watchable_list_id("OLAK5uy_abcdefghijk"));
        assert!(!is_watchable_list_id("RDabcdefghijkl"));
        assert!(!is_watchable_list_id("LL"));
        assert!(!is_watchable_list_id("PL bad/../"));
    }
}
