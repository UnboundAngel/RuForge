//! Activity log event types (shared by the log and watch session modules).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    Video,
    Audio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadEntryPoint {
    Paste,
    Explorer,
    PlaylistImport,
    Channel,
    Cli,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WatchSurface {
    Main,
    Mini,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WatchEndReason {
    Completed,
    Switched,
    Closed,
    Abandoned,
}

/// Kind-specific fields. Unknown kinds and unknown fields are rejected.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ActivityBody {
    AppSessionStart {},
    AppSessionEnd {
        #[serde(rename = "activeMinutes")]
        active_minutes: u32,
    },
    DownloadQueued {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "entryPoint")]
        entry_point: Option<DownloadEntryPoint>,
    },
    DownloadFinished {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "itemId")]
        item_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "jobId")]
        job_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "videoId")]
        video_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "channelId")]
        channel_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "channelName")]
        channel_name: Option<String>,
        /// Named `mediaKind` so it does not collide with the serde tag `kind`.
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "mediaKind")]
        media_kind: Option<MediaKind>,
        /// Readable label: `2160p` / `1440p` / `1080p` / `720p` / `480p` / `360p` / `audio`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        quality: Option<String>,
        /// Raw yt-dlp `-f` string when recorded.
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "formatSpec")]
        format_spec: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        container: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        bytes: Option<u64>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "mediaDurationSec")]
        media_duration_sec: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "elapsedMs")]
        elapsed_ms: Option<u64>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "avgBps")]
        avg_bps: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "peakBps")]
        peak_bps: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "entryPoint")]
        entry_point: Option<DownloadEntryPoint>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        resumed: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "resumedBytes")]
        resumed_bytes: Option<u64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        retries: Option<u32>,
    },
    DownloadFailed {
        #[serde(rename = "errorClass")]
        error_class: String,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "entryPoint")]
        entry_point: Option<DownloadEntryPoint>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        retries: Option<u32>,
    },
    DownloadCanceled {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "entryPoint")]
        entry_point: Option<DownloadEntryPoint>,
    },
    PlaylistImported {
        #[serde(rename = "trackCount")]
        track_count: u32,
        source: String,
    },
    PlaylistDownloaded {
        #[serde(rename = "itemCount")]
        item_count: u32,
    },
    WatchSession {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "itemId")]
        item_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "channelName")]
        channel_name: Option<String>,
        #[serde(rename = "startedAt")]
        started_at: i64,
        /// Wall seconds spent watching (playing only). On schema v1 this field held media time.
        #[serde(rename = "secondsWatched")]
        seconds_watched: f64,
        /// Media seconds covered while playing. Absent on schema v1 rows.
        #[serde(default, rename = "mediaSecondsWatched")]
        media_seconds_watched: f64,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "mediaDurationSec")]
        media_duration_sec: Option<f64>,
        completed: bool,
        #[serde(rename = "effectiveSpeed")]
        effective_speed: f64,
        surface: WatchSurface,
        #[serde(rename = "endReason")]
        end_reason: WatchEndReason,
        #[serde(rename = "sponsorSkips")]
        sponsor_skips: u32,
        #[serde(rename = "sponsorSecondsSkipped")]
        sponsor_seconds_skipped: f64,
    },
    MusicLiked {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "identityKey")]
        identity_key: Option<String>,
    },
    MusicUnliked {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "identityKey")]
        identity_key: Option<String>,
    },
    MusicPlaylistCreated {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "playlistId")]
        playlist_id: Option<String>,
    },
    MusicPlaylistDeleted {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "playlistId")]
        playlist_id: Option<String>,
    },
    MusicTracksAdded {
        count: u32,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "playlistId")]
        playlist_id: Option<String>,
    },
    ItemDeleted {
        bytes: u64,
        #[serde(rename = "mediaKind")]
        media_kind: MediaKind,
    },
    CleanupRun {
        items: u32,
        bytes: u64,
    },
    TagCreated {
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "tagId")]
        tag_id: Option<String>,
    },
    LibrarySnapshot {
        items: u32,
        bytes: u64,
        hours: f64,
        #[serde(rename = "videoCount")]
        video_count: u32,
        #[serde(rename = "audioCount")]
        audio_count: u32,
    },
    GameSession {
        #[serde(rename = "gameId")]
        game_id: String,
        #[serde(rename = "gameName")]
        game_name: String,
        #[serde(rename = "startedAt")]
        started_at: i64,
        #[serde(rename = "durationSec")]
        duration_sec: f64,
        /// A checkpoint chunk of a session already counted, so it adds time but not a session.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        continued: bool,
    },
    GuideOpened {
        #[serde(rename = "gameId")]
        game_id: String,
        #[serde(rename = "guideId")]
        guide_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    pub v: i32,
    pub id: String,
    pub ts: i64,
    pub tz: i32,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub backfill: bool,
    #[serde(flatten)]
    pub body: ActivityBody,
}

/// Frontend may send body-only rows; Rust fills envelope fields when missing.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRecordInput {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub ts: Option<i64>,
    #[serde(default)]
    pub tz: Option<i32>,
    #[serde(default)]
    pub backfill: bool,
    #[serde(flatten)]
    pub body: ActivityBody,
}

