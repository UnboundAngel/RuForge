use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use super::music_playlists::write_atomic;

const EVENTS_FILENAME: &str = "music-listen-events.jsonl";
const ACTIVE_FILENAME: &str = "music-listen-active.json";
const SNAPSHOT_FILENAME: &str = "music-listen-snapshot.json";
const ROLLUP_FILENAME: &str = "music-listen-rollup.json";
const INTEGRITY_FILENAME: &str = "music-listen-integrity.json";
const LEGACY_FILENAME: &str = "music-listen-legacy.json";
/// A closing session's event is the newest line, so a re-close only has to check the tail.
const DUPLICATE_SCAN_TAIL_BYTES: u64 = 64 * 1024;

const SCHEMA_V: i32 = 1;
const EVENT_SCHEMA_V_LEGACY: i32 = 1;
const EVENT_SCHEMA_V: i32 = 2;
const INTEGRITY_SCHEMA_V: i32 = 1;
const SNAPSHOT_STATS_CAP: usize = 500;
const SNAPSHOT_HISTORY_CAP: usize = 50;
const RAW_RETENTION_MS: i64 = 24 * 30 * 24 * 60 * 60 * 1000; // ~24 months
const RAW_RETENTION_MAX: usize = 100_000;

static LOG_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
/// Retention is measured in months, so pruning hourly during playback loses nothing and
/// spares a full parse of the event log on every track start and end.
const PLAYBACK_PRUNE_INTERVAL_MS: i64 = 60 * 60 * 1000;
static LAST_PRUNE_MS: AtomicI64 = AtomicI64::new(0);

fn log_mutex() -> &'static Mutex<()> {
    LOG_MUTEX.get_or_init(|| Mutex::new(()))
}

fn with_log_lock<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    let _guard = log_mutex().lock().map_err(|e| e.to_string())?;
    f()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EndReason {
    Completed,
    Skipped,
    WallEndlessPick,
    ManualSwitch,
    AbandonedPaused,
}

impl EndReason {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "completed" => Some(Self::Completed),
            "skipped" => Some(Self::Skipped),
            "wall_endless_pick" => Some(Self::WallEndlessPick),
            "manual_switch" => Some(Self::ManualSwitch),
            "abandoned_paused" => Some(Self::AbandonedPaused),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Skipped => "skipped",
            Self::WallEndlessPick => "wall_endless_pick",
            Self::ManualSwitch => "manual_switch",
            Self::AbandonedPaused => "abandoned_paused",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Surface {
    Main,
    MusicMini,
}

impl Surface {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "main" => Some(Self::Main),
            "music_mini" => Some(Self::MusicMini),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::MusicMini => "music_mini",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaySource {
    Folder,
    Library,
    Album,
    Liked,
    Explore,
    Unknown,
}

impl PlaySource {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "folder" => Some(Self::Folder),
            "library" => Some(Self::Library),
            "album" => Some(Self::Album),
            "liked" => Some(Self::Liked),
            "explore" => Some(Self::Explore),
            "unknown" => Some(Self::Unknown),
            _ => None,
        }
    }

    #[allow(dead_code)]
    fn as_str(self) -> &'static str {
        match self {
            Self::Folder => "folder",
            Self::Library => "library",
            Self::Album => "album",
            Self::Liked => "liked",
            Self::Explore => "explore",
            Self::Unknown => "unknown",
        }
    }

    fn validate_opt(s: &Option<String>) -> Result<(), String> {
        if let Some(ref v) = s {
            Self::parse(v).ok_or_else(|| format!("Invalid source: {v}"))?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenTrackMeta {
    pub identity_key: String,
    pub path: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrackPlayedEvent {
    v: i32,
    id: String,
    #[serde(rename = "type")]
    event_type: String,
    identity_key: String,
    started_at: i64,
    ended_at: i64,
    end_reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    listened_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    surface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    was_liked: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveSession {
    id: String,
    identity_key: String,
    started_at: i64,
    listened_sec: f64,
    last_tick_at: i64,
    surface: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    was_liked: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenStatRow {
    pub identity_key: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub play_count: u32,
    pub listen_time_sec: f64,
    pub last_played: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayHistoryRow {
    pub path: String,
    pub identity_key: String,
    pub title: String,
    pub artist: String,
    pub played_at: i64,
    pub play_count: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenSnapshot {
    pub v: i32,
    pub stats: Vec<ListenStatRow>,
    pub history: Vec<PlayHistoryRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RollupBucket {
    date: String,
    identity_key: String,
    listen_sec: f64,
    play_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventOrder {
    started_at: i64,
    id: String,
}

impl EventOrder {
    fn of(event: &TrackPlayedEvent) -> Self {
        Self {
            started_at: event.started_at,
            id: event.id.clone(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct RollupFile {
    v: i32,
    buckets: Vec<RollupBucket>,
    /// Every event ordered at or before this is already counted in `buckets`, even if a crash
    /// left it in the events file.
    #[serde(default, rename = "rolledThrough", skip_serializing_if = "Option::is_none")]
    rolled_through: Option<EventOrder>,
}

impl RollupFile {
    fn already_rolled(&self, event: &TrackPlayedEvent) -> bool {
        self.rolled_through
            .as_ref()
            .is_some_and(|w| EventOrder::of(event) <= *w)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyStatImport {
    pub identity_key: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub play_count: u32,
    pub listen_time_sec: f64,
    pub last_played: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyHistoryImport {
    pub path: String,
    pub identity_key: String,
    pub title: String,
    pub artist: String,
    pub played_at: i64,
    pub play_count: u32,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

fn events_path(dir: &Path) -> PathBuf {
    dir.join(EVENTS_FILENAME)
}

fn active_path(dir: &Path) -> PathBuf {
    dir.join(ACTIVE_FILENAME)
}

fn snapshot_path(dir: &Path) -> PathBuf {
    dir.join(SNAPSHOT_FILENAME)
}

fn rollup_path(dir: &Path) -> PathBuf {
    dir.join(ROLLUP_FILENAME)
}

fn integrity_path(dir: &Path) -> PathBuf {
    dir.join(INTEGRITY_FILENAME)
}

fn legacy_path(dir: &Path) -> PathBuf {
    dir.join(LEGACY_FILENAME)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenIntegrity {
    pub v: i32,
    pub stats_trustworthy_after_ms: i64,
}

fn read_integrity(dir: &Path) -> Result<ListenIntegrity, String> {
    let path = integrity_path(dir);
    if !path.is_file() {
        return Err("Listen integrity file missing".to_string());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid listen integrity: {e}"))
}

fn write_integrity(dir: &Path, integrity: &ListenIntegrity) -> Result<(), String> {
    ensure_data_dir(dir)?;
    let raw = serde_json::to_string(integrity).map_err(|e| e.to_string())?;
    write_atomic(&integrity_path(dir), &raw)
}

/// Set once on first post-fix startup. Never overwritten; survives clear/rebuild.
fn ensure_integrity_cutover(dir: &Path) -> Result<ListenIntegrity, String> {
    if integrity_path(dir).is_file() {
        return read_integrity(dir);
    }
    let integrity = ListenIntegrity {
        v: INTEGRITY_SCHEMA_V,
        stats_trustworthy_after_ms: Utc::now().timestamp_millis(),
    };
    write_integrity(dir, &integrity)?;
    Ok(integrity)
}

fn ensure_data_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())
}

fn read_active(dir: &Path) -> Result<Option<ActiveSession>, String> {
    let path = active_path(dir);
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&raw) {
        Ok(session) => Ok(Some(session)),
        Err(e) => {
            log::warn!("listen log: discarded unreadable active session: {e}");
            let _ = fs::remove_file(&path);
            Ok(None)
        }
    }
}

fn write_active(dir: &Path, session: &ActiveSession) -> Result<(), String> {
    ensure_data_dir(dir)?;
    let raw = serde_json::to_string(session).map_err(|e| e.to_string())?;
    write_atomic(&active_path(dir), &raw)
}

fn clear_active(dir: &Path) -> Result<(), String> {
    let path = active_path(dir);
    if path.is_file() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn append_event_line(dir: &Path, event: &TrackPlayedEvent) -> Result<(), String> {
    ensure_data_dir(dir)?;
    let mut out = String::new();
    let mut file = OpenOptions::new()
        .create(true)
        .read(true)
        .append(true)
        .open(events_path(dir))
        .map_err(|e| e.to_string())?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    if len > 0 {
        let mut last = [0u8; 1];
        file.seek(SeekFrom::Start(len - 1))
            .and_then(|_| file.read_exact(&mut last))
            .map_err(|e| e.to_string())?;
        if last[0] != b'\n' {
            out.push('\n');
        }
    }
    out.push_str(&serde_json::to_string(event).map_err(|e| e.to_string())?);
    out.push('\n');
    file.write_all(out.as_bytes()).map_err(|e| e.to_string())
}

fn event_already_logged(dir: &Path, id: &str) -> Result<bool, String> {
    let path = events_path(dir);
    if !path.is_file() {
        return Ok(false);
    }
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let start = len.saturating_sub(DUPLICATE_SCAN_TAIL_BYTES);
    let mut tail = Vec::new();
    file.seek(SeekFrom::Start(start))
        .and_then(|_| file.read_to_end(&mut tail))
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&tail).lines().any(|line| {
        serde_json::from_str::<TrackPlayedEvent>(line.trim()).is_ok_and(|ev| ev.id == id)
    }))
}

/// `Ok(None)` when the snapshot is missing or unreadable and must be rebuilt from the log.
fn read_snapshot_file_opt(dir: &Path) -> Result<Option<ListenSnapshot>, String> {
    let path = snapshot_path(dir);
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&raw) {
        Ok(snapshot) => Ok(Some(snapshot)),
        Err(e) => {
            log::warn!("listen log: unreadable snapshot, rebuilding: {e}");
            Ok(None)
        }
    }
}

fn read_snapshot_file(dir: &Path) -> Result<ListenSnapshot, String> {
    match read_snapshot_file_opt(dir)? {
        Some(snapshot) => Ok(snapshot),
        None => rebuild_snapshot_from_sources(dir),
    }
}

fn write_snapshot_file(dir: &Path, snapshot: &ListenSnapshot) -> Result<(), String> {
    ensure_data_dir(dir)?;
    let raw = serde_json::to_string(snapshot).map_err(|e| e.to_string())?;
    write_atomic(&snapshot_path(dir), &raw)
}

fn read_rollup(dir: &Path) -> Result<RollupFile, String> {
    let path = rollup_path(dir);
    if !path.is_file() {
        return Ok(RollupFile {
            v: SCHEMA_V,
            ..Default::default()
        });
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid rollup: {e}"))
}

fn write_rollup(dir: &Path, rollup: &RollupFile) -> Result<(), String> {
    ensure_data_dir(dir)?;
    let raw = serde_json::to_string(rollup).map_err(|e| e.to_string())?;
    write_atomic(&rollup_path(dir), &raw)
}

fn read_legacy_stats(dir: &Path) -> Vec<ListenStatRow> {
    let path = legacy_path(dir);
    let Ok(raw) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_else(|e| {
        log::warn!("listen log: unreadable legacy stats: {e}");
        Vec::new()
    })
}

fn validate_closed_event(event: &TrackPlayedEvent) -> bool {
    if event.v != EVENT_SCHEMA_V_LEGACY && event.v != EVENT_SCHEMA_V {
        return false;
    }
    if event.event_type != "track_played" {
        return false;
    }
    if event.id.is_empty() || event.identity_key.is_empty() {
        return false;
    }
    if event.started_at <= 0 || event.ended_at <= 0 {
        return false;
    }
    EndReason::parse(&event.end_reason).is_some()
}

fn build_event_from_active(active: &ActiveSession, end_reason: EndReason, ended_at: i64) -> TrackPlayedEvent {
    TrackPlayedEvent {
        v: EVENT_SCHEMA_V,
        id: active.id.clone(),
        event_type: "track_played".to_string(),
        identity_key: active.identity_key.clone(),
        started_at: active.started_at,
        ended_at,
        end_reason: end_reason.as_str().to_string(),
        path: active.path.clone(),
        title: active.title.clone(),
        artist: active.artist.clone(),
        listened_sec: Some(active.listened_sec.max(0.0)),
        surface: Some(active.surface.clone()),
        source: active.source.clone(),
        was_liked: active.was_liked,
    }
}

fn close_active_session(
    dir: &Path,
    active: ActiveSession,
    end_reason: EndReason,
    ended_at: i64,
) -> Result<TrackPlayedEvent, String> {
    let mut session = active;
    session.last_tick_at = ended_at;
    let event = build_event_from_active(&session, end_reason, ended_at);
    if !validate_closed_event(&event) {
        return Err("Refusing to write malformed listen event".to_string());
    }
    let relogged = event_already_logged(dir, &event.id)?;
    if !relogged {
        append_event_line(dir, &event)?;
    }
    clear_active(dir)?;
    let snapshot_result = if relogged {
        rebuild_snapshot_from_sources(dir).map(|_| ())
    } else {
        apply_event_to_snapshot(dir, &event)
    };
    if let Err(e) = snapshot_result {
        // The log already holds the event; a missing snapshot is rebuilt on the next read.
        log::warn!("listen log: snapshot update failed, will rebuild: {e}");
        let _ = fs::remove_file(snapshot_path(dir));
    }
    Ok(event)
}

/// Expects `event` to be in the log already, so a rebuild must not apply it a second time.
fn apply_event_to_snapshot(dir: &Path, event: &TrackPlayedEvent) -> Result<(), String> {
    let Some(mut snapshot) = read_snapshot_file_opt(dir)? else {
        return rebuild_snapshot_from_sources(dir).map(|_| ());
    };
    snapshot.v = SCHEMA_V;

    let path = event.path.clone().unwrap_or_default();
    let title = event.title.clone().unwrap_or_default();
    let artist = event.artist.clone().unwrap_or_default();
    let listened = event.listened_sec.unwrap_or(0.0).max(0.0);

    if let Some(row) = snapshot
        .stats
        .iter_mut()
        .find(|r| r.identity_key == event.identity_key)
    {
        row.play_count = row.play_count.saturating_add(1);
        row.listen_time_sec += listened;
        row.last_played = event.ended_at.max(row.last_played);
        if !path.is_empty() {
            row.path = path.clone();
        }
        if !title.is_empty() {
            row.title = title.clone();
        }
        if !artist.is_empty() {
            row.artist = artist.clone();
        }
    } else {
        snapshot.stats.push(ListenStatRow {
            identity_key: event.identity_key.clone(),
            path,
            title,
            artist,
            play_count: 1,
            listen_time_sec: listened,
            last_played: event.ended_at,
        });
    }

    snapshot.stats.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    if snapshot.stats.len() > SNAPSHOT_STATS_CAP {
        snapshot.stats.truncate(SNAPSHOT_STATS_CAP);
    }

    rebuild_history_from_stats(&mut snapshot);
    write_snapshot_file(dir, &snapshot)
}

fn rebuild_history_from_stats(snapshot: &mut ListenSnapshot) {
    let mut history: Vec<PlayHistoryRow> = snapshot
        .stats
        .iter()
        .map(|s| PlayHistoryRow {
            path: s.path.clone(),
            identity_key: s.identity_key.clone(),
            title: s.title.clone(),
            artist: s.artist.clone(),
            played_at: s.last_played,
            play_count: s.play_count,
        })
        .collect();
    history.sort_by(|a, b| b.played_at.cmp(&a.played_at));
    if history.len() > SNAPSHOT_HISTORY_CAP {
        history.truncate(SNAPSHOT_HISTORY_CAP);
    }
    snapshot.history = history;
}

fn parse_events_jsonl(dir: &Path) -> Result<Vec<TrackPlayedEvent>, String> {
    let path = events_path(dir);
    if !path.is_file() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (i, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<TrackPlayedEvent>(trimmed) {
            Ok(ev) if validate_closed_event(&ev) => {
                if seen.insert(ev.id.clone()) {
                    out.push(ev);
                } else {
                    log::warn!("listen log: dropped duplicate event at line {}", i + 1);
                }
            }
            Ok(_) => {
                log::warn!("listen log: dropped malformed event at line {}", i + 1);
            }
            Err(e) => {
                log::warn!("listen log: skipped unparseable line {}: {e}", i + 1);
            }
        }
    }
    Ok(out)
}

fn merge_rollup_into_stats(stats: &mut Vec<ListenStatRow>, rollup: &RollupFile) {
    for bucket in &rollup.buckets {
        if let Some(row) = stats
            .iter_mut()
            .find(|r| r.identity_key == bucket.identity_key)
        {
            row.play_count = row.play_count.saturating_add(bucket.play_count);
            row.listen_time_sec += bucket.listen_sec.max(0.0);
        } else {
            stats.push(ListenStatRow {
                identity_key: bucket.identity_key.clone(),
                path: String::new(),
                title: String::new(),
                artist: String::new(),
                play_count: bucket.play_count,
                listen_time_sec: bucket.listen_sec.max(0.0),
                last_played: 0,
            });
        }
    }
}

fn rebuild_snapshot_from_sources(dir: &Path) -> Result<ListenSnapshot, String> {
    let events = parse_events_jsonl(dir)?;
    let rollup = read_rollup(dir).unwrap_or_else(|e| {
        log::warn!("listen log: rebuilding without rollup: {e}");
        RollupFile::default()
    });

    let mut by_key: std::collections::HashMap<String, ListenStatRow> = read_legacy_stats(dir)
        .into_iter()
        .map(|row| (row.identity_key.clone(), row))
        .collect();

    for event in events {
        if rollup.already_rolled(&event) {
            continue;
        }
        let path = event.path.unwrap_or_default();
        let title = event.title.unwrap_or_default();
        let artist = event.artist.unwrap_or_default();
        let listened = event.listened_sec.unwrap_or(0.0).max(0.0);

        by_key
            .entry(event.identity_key.clone())
            .and_modify(|row| {
                row.play_count = row.play_count.saturating_add(1);
                row.listen_time_sec += listened;
                row.last_played = row.last_played.max(event.ended_at);
                if !path.is_empty() {
                    row.path = path.clone();
                }
                if !title.is_empty() {
                    row.title = title.clone();
                }
                if !artist.is_empty() {
                    row.artist = artist.clone();
                }
            })
            .or_insert(ListenStatRow {
                identity_key: event.identity_key,
                path,
                title,
                artist,
                play_count: 1,
                listen_time_sec: listened,
                last_played: event.ended_at,
            });
    }

    let mut stats: Vec<ListenStatRow> = by_key.into_values().collect();
    merge_rollup_into_stats(&mut stats, &rollup);

    stats.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    if stats.len() > SNAPSHOT_STATS_CAP {
        stats.truncate(SNAPSHOT_STATS_CAP);
    }

    let mut snapshot = ListenSnapshot {
        v: SCHEMA_V,
        stats,
        history: vec![],
    };
    rebuild_history_from_stats(&mut snapshot);
    write_snapshot_file(dir, &snapshot)?;
    Ok(snapshot)
}

fn close_orphan_active_if_any(dir: &Path) -> Result<(), String> {
    if let Some(active) = read_active(dir)? {
        let never_accumulated =
            active.listened_sec <= 0.0 && active.last_tick_at <= active.started_at;
        if never_accumulated {
            return clear_active(dir);
        }
        let ended_at = active.last_tick_at.max(active.started_at);
        let _ = close_active_session(dir, active, EndReason::AbandonedPaused, ended_at)?;
    }
    Ok(())
}

fn count_event_lines(dir: &Path) -> Result<usize, String> {
    let path = events_path(dir);
    if !path.is_file() {
        return Ok(0);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(raw.lines().filter(|l| !l.trim().is_empty()).count())
}

fn prune_old_events(dir: &Path) -> Result<(), String> {
    let events = parse_events_jsonl(dir)?;
    if events.is_empty() {
        return Ok(());
    }

    let now = Utc::now().timestamp_millis();
    let cutoff = now - RAW_RETENTION_MS;
    let mut rollup = read_rollup(dir)?;

    // Rolled events are always the oldest by (started_at, id), so one watermark marks them all.
    let (_, mut live): (Vec<TrackPlayedEvent>, Vec<TrackPlayedEvent>) =
        events.into_iter().partition(|e| rollup.already_rolled(e));
    live.sort_by_key(EventOrder::of);
    let mut split = live.partition_point(|e| e.started_at < cutoff);
    split = split.max(live.len().saturating_sub(RAW_RETENTION_MAX));
    let keep = live.split_off(split);
    let to_roll = live;

    if let Some(last) = to_roll.last() {
        rollup.v = SCHEMA_V;
        rollup.rolled_through = Some(EventOrder::of(last));
        for event in to_roll {
            let date = chrono::DateTime::from_timestamp_millis(event.started_at)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let listened = event.listened_sec.unwrap_or(0.0).max(0.0);
            if let Some(bucket) = rollup
                .buckets
                .iter_mut()
                .find(|b| b.date == date && b.identity_key == event.identity_key)
            {
                bucket.listen_sec += listened;
                bucket.play_count = bucket.play_count.saturating_add(1);
            } else {
                rollup.buckets.push(RollupBucket {
                    date,
                    identity_key: event.identity_key,
                    listen_sec: listened,
                    play_count: 1,
                });
            }
        }
        write_rollup(dir, &rollup)?;
    }

    if keep.len() != count_event_lines(dir)? {
        ensure_data_dir(dir)?;
        let mut rebuilt = String::new();
        for event in &keep {
            let line = serde_json::to_string(event).map_err(|e| e.to_string())?;
            rebuilt.push_str(&line);
            rebuilt.push('\n');
        }
        write_atomic(&events_path(dir), &rebuilt)?;
        rebuild_snapshot_from_sources(dir)?;
    }

    Ok(())
}

fn prune_now(dir: &Path) -> Result<(), String> {
    prune_old_events(dir)?;
    LAST_PRUNE_MS.store(Utc::now().timestamp_millis(), Ordering::Relaxed);
    Ok(())
}

/// Never fails the caller: a damaged rollup must not stop new listens from being logged.
fn prune_if_needed(dir: &Path) {
    let now = Utc::now().timestamp_millis();
    if now - LAST_PRUNE_MS.load(Ordering::Relaxed) < PLAYBACK_PRUNE_INTERVAL_MS {
        return;
    }
    if let Err(e) = prune_now(dir) {
        LAST_PRUNE_MS.store(now, Ordering::Relaxed);
        log::warn!("listen log: prune skipped: {e}");
    }
}

/// Crash recovery only: call once per process start, not during playback.
pub fn music_listen_startup_housekeeping(app: &AppHandle) -> Result<(), String> {
    with_log_lock(|| {
        let dir = data_dir(app)?;
        ensure_integrity_cutover(&dir)?;
        close_orphan_active_if_any(&dir)?;
        if let Err(e) = prune_now(&dir) {
            log::warn!("listen log: startup prune skipped: {e}");
        }
        Ok(())
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenBeginResult {
    pub event_id: String,
}

#[tauri::command]
pub fn music_listen_begin(
    app: AppHandle,
    meta: ListenTrackMeta,
    surface: String,
    source: Option<String>,
    was_liked: Option<bool>,
    started_at: Option<i64>,
) -> Result<ListenBeginResult, String> {
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        prune_if_needed(&dir);

        if meta.identity_key.trim().is_empty() {
            return Err("identityKey is required".to_string());
        }
        let surface_parsed = Surface::parse(&surface).ok_or_else(|| format!("Invalid surface: {surface}"))?;
        PlaySource::validate_opt(&source)?;

        if let Some(active) = read_active(&dir)? {
            if active.identity_key != meta.identity_key {
                let ended_at = active.last_tick_at.max(active.started_at);
                close_active_session(&dir, active, EndReason::ManualSwitch, ended_at)?;
            } else {
                return Ok(ListenBeginResult {
                    event_id: active.id,
                });
            }
        }

        let now = started_at.unwrap_or_else(|| Utc::now().timestamp_millis());
        let session = ActiveSession {
            id: Uuid::new_v4().to_string(),
            identity_key: meta.identity_key,
            started_at: now,
            listened_sec: 0.0,
            last_tick_at: now,
            surface: surface_parsed.as_str().to_string(),
            path: meta.path,
            title: meta.title,
            artist: meta.artist,
            source,
            was_liked,
        };
        write_active(&dir, &session)?;
        Ok(ListenBeginResult {
            event_id: session.id,
        })
    })
}

#[tauri::command]
pub fn music_listen_transfer(app: AppHandle, surface: String) -> Result<(), String> {
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let surface_parsed = Surface::parse(&surface).ok_or_else(|| format!("Invalid surface: {surface}"))?;
        let mut active = read_active(&dir)?.ok_or_else(|| "No active listen session".to_string())?;
        active.surface = surface_parsed.as_str().to_string();
        active.last_tick_at = Utc::now().timestamp_millis();
        write_active(&dir, &active)
    })
}

#[tauri::command]
pub fn music_listen_accumulate(
    app: AppHandle,
    event_id: String,
    listened_sec: f64,
    last_tick_at: i64,
) -> Result<(), String> {
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let mut active = read_active(&dir)?.ok_or_else(|| "No active listen session".to_string())?;
        if active.id != event_id {
            return Err("Active session id mismatch".to_string());
        }
        let delta = listened_sec.max(0.0);
        if delta <= 0.0 {
            return Ok(());
        }
        active.listened_sec += delta;
        active.last_tick_at = last_tick_at.max(active.started_at);
        write_active(&dir, &active)
    })
}

#[tauri::command]
pub fn music_listen_end(
    app: AppHandle,
    event_id: String,
    end_reason: String,
    listened_sec: Option<f64>,
    ended_at: Option<i64>,
) -> Result<(), String> {
    let _ = listened_sec;
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let reason = EndReason::parse(&end_reason).ok_or_else(|| format!("Invalid endReason: {end_reason}"))?;
        let active = read_active(&dir)?.ok_or_else(|| "No active listen session".to_string())?;
        if active.id != event_id {
            return Err("Active session id mismatch".to_string());
        }
        let ended = ended_at.unwrap_or_else(|| Utc::now().timestamp_millis());
        close_active_session(&dir, active, reason, ended)?;
        prune_if_needed(&dir);
        Ok(())
    })
}

#[tauri::command]
pub fn music_listen_get_integrity(app: AppHandle) -> Result<ListenIntegrity, String> {
    with_log_lock(|| ensure_integrity_cutover(&data_dir(&app)?))
}

#[tauri::command]
pub fn music_listen_get_snapshot(app: AppHandle) -> Result<ListenSnapshot, String> {
    with_log_lock(|| read_snapshot_file(&data_dir(&app)?))
}

#[tauri::command]
pub fn music_listen_rebuild_snapshot(app: AppHandle) -> Result<ListenSnapshot, String> {
    with_log_lock(|| rebuild_snapshot_from_sources(&data_dir(&app)?))
}

#[tauri::command]
pub fn music_listen_import_legacy(
    app: AppHandle,
    stats: Vec<LegacyStatImport>,
    history: Vec<LegacyHistoryImport>,
) -> Result<ListenSnapshot, String> {
    // History is derived from stats on every rebuild.
    let _ = history;
    with_log_lock(|| import_legacy_stats(&data_dir(&app)?, stats))
}

/// Legacy stats get their own file so every rebuild from the log keeps them.
fn import_legacy_stats(dir: &Path, stats: Vec<LegacyStatImport>) -> Result<ListenSnapshot, String> {
    ensure_data_dir(dir)?;
    let rows: Vec<ListenStatRow> = stats
        .into_iter()
        .map(|s| ListenStatRow {
            identity_key: s.identity_key,
            path: s.path,
            title: s.title,
            artist: s.artist,
            play_count: s.play_count,
            listen_time_sec: s.listen_time_sec.max(0.0),
            last_played: s.last_played,
        })
        .collect();
    let raw = serde_json::to_string(&rows).map_err(|e| e.to_string())?;
    write_atomic(&legacy_path(dir), &raw)?;
    rebuild_snapshot_from_sources(dir)
}

#[tauri::command]
pub fn music_listen_clear(app: AppHandle) -> Result<(), String> {
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        for name in [
            EVENTS_FILENAME,
            ACTIVE_FILENAME,
            SNAPSHOT_FILENAME,
            ROLLUP_FILENAME,
            LEGACY_FILENAME,
        ] {
            let path = dir.join(name);
            if path.is_file() {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_meta(key: &str) -> ListenTrackMeta {
        ListenTrackMeta {
            identity_key: key.to_string(),
            path: Some(format!("/music/{key}.mp3")),
            title: Some("Track".to_string()),
            artist: Some("Artist".to_string()),
        }
    }

    fn open_session(
        dir: &Path,
        event_id: &str,
        meta: &ListenTrackMeta,
        surface: Surface,
        started_at: i64,
    ) -> Result<(), String> {
        let session = ActiveSession {
            id: event_id.to_string(),
            identity_key: meta.identity_key.clone(),
            started_at,
            listened_sec: 0.0,
            last_tick_at: started_at,
            surface: surface.as_str().to_string(),
            path: meta.path.clone(),
            title: meta.title.clone(),
            artist: meta.artist.clone(),
            source: Some(PlaySource::Library.as_str().to_string()),
            was_liked: Some(false),
        };
        write_active(dir, &session)
    }

    fn transfer_surface(dir: &Path, surface: Surface) -> Result<(), String> {
        let mut active = read_active(dir)?.ok_or_else(|| "No active session".to_string())?;
        active.surface = surface.as_str().to_string();
        active.last_tick_at = active.last_tick_at.saturating_add(1000);
        write_active(dir, &active)
    }

    fn accumulate_session(dir: &Path, delta: f64, last_tick_at: i64) -> Result<(), String> {
        let mut active = read_active(dir)?.ok_or_else(|| "No active session".to_string())?;
        let delta = delta.max(0.0);
        if delta <= 0.0 {
            return Ok(());
        }
        active.listened_sec += delta;
        active.last_tick_at = last_tick_at.max(active.started_at);
        write_active(dir, &active)
    }

    fn end_session(
        dir: &Path,
        reason: EndReason,
        listened_sec: f64,
        ended_at: i64,
    ) -> Result<TrackPlayedEvent, String> {
        let active = read_active(dir)?.ok_or_else(|| "No active session".to_string())?;
        let mut session = active;
        session.listened_sec = listened_sec;
        close_active_session(dir, session, reason, ended_at)
    }

    fn end_session_as_client(dir: &Path, reason: EndReason, ended_at: i64) -> Result<TrackPlayedEvent, String> {
        let active = read_active(dir)?.ok_or_else(|| "No active session".to_string())?;
        close_active_session(dir, active, reason, ended_at)
    }

    fn read_events(dir: &Path) -> Vec<TrackPlayedEvent> {
        parse_events_jsonl(dir).unwrap_or_default()
    }

    #[test]
    fn append_and_rebuild_snapshot() {
        let dir = tempdir().unwrap();
        let path = dir.path();

        let event = TrackPlayedEvent {
            v: EVENT_SCHEMA_V_LEGACY,
            id: "test-id".to_string(),
            event_type: "track_played".to_string(),
            identity_key: "id:abc".to_string(),
            started_at: 1_700_000_000_000,
            ended_at: 1_700_000_120_000,
            end_reason: "completed".to_string(),
            path: Some("/music/a.mp3".to_string()),
            title: Some("A".to_string()),
            artist: Some("Artist".to_string()),
            listened_sec: Some(120.0),
            surface: Some("main".to_string()),
            source: None,
            was_liked: None,
        };
        assert!(validate_closed_event(&event));
        append_event_line(path, &event).unwrap();
        let snap = rebuild_snapshot_from_sources(path).unwrap();
        assert_eq!(snap.stats.len(), 1);
        assert_eq!(snap.stats[0].play_count, 1);
        assert_eq!(snap.stats[0].listen_time_sec, 120.0);
        assert_eq!(snap.stats[0].last_played, 1_700_000_120_000);
    }

    #[test]
    fn verify_main_play_writes_jsonl() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let meta = sample_meta("id:main-track");
        open_session(path, "evt-main", &meta, Surface::Main, 1_700_000_000_000).unwrap();
        end_session(path, EndReason::Completed, 95.0, 1_700_000_095_000).unwrap();

        let events = read_events(path);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].end_reason, "completed");
        assert_eq!(events[0].surface.as_deref(), Some("main"));
        assert!(events_path(path).is_file());
        assert!(snapshot_path(path).is_file());
    }

    #[test]
    fn verify_mini_session_writes_jsonl() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let meta = sample_meta("id:mini-track");
        open_session(path, "evt-mini", &meta, Surface::MusicMini, 1_700_000_100_000).unwrap();
        end_session(path, EndReason::Completed, 42.0, 1_700_000_142_000).unwrap();

        let events = read_events(path);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].surface.as_deref(), Some("music_mini"));
    }

    #[test]
    fn verify_handoff_single_event_no_double_count() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let meta = sample_meta("id:handoff-track");
        open_session(path, "evt-handoff", &meta, Surface::Main, 1_700_000_200_000).unwrap();
        transfer_surface(path, Surface::MusicMini).unwrap();
        transfer_surface(path, Surface::Main).unwrap();
        end_session(path, EndReason::Completed, 180.0, 1_700_000_380_000).unwrap();

        let events = read_events(path);
        assert_eq!(events.len(), 1, "handoff must produce one JSONL line");
        let snap = read_snapshot_file(path).unwrap();
        assert_eq!(snap.stats.len(), 1);
        assert_eq!(snap.stats[0].play_count, 1);
    }

    #[test]
    fn verify_skip_and_wall_end_reasons() {
        let dir = tempdir().unwrap();
        let path = dir.path();

        open_session(path, "evt-skip", &sample_meta("id:skip"), Surface::Main, 1_700_000_300_000)
            .unwrap();
        end_session(path, EndReason::Skipped, 8.0, 1_700_000_308_000).unwrap();

        open_session(path, "evt-wall", &sample_meta("id:wall"), Surface::Main, 1_700_000_400_000)
            .unwrap();
        end_session(
            path,
            EndReason::WallEndlessPick,
            210.0,
            1_700_000_610_000,
        )
        .unwrap();

        let events = read_events(path);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].end_reason, "skipped");
        assert_eq!(events[1].end_reason, "wall_endless_pick");
    }

    #[test]
    fn verify_orphan_zero_progress_discarded_not_logged() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        open_session(path, "evt-orphan", &sample_meta("id:orphan"), Surface::Main, 1_700_000_500_000)
            .unwrap();
        close_orphan_active_if_any(path).unwrap();

        assert_eq!(read_events(path).len(), 0);
        assert!(!active_path(path).exists());
    }

    #[test]
    fn verify_orphan_with_listen_time_logged_abandoned_paused() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        open_session(
            path,
            "evt-orphan-heard",
            &sample_meta("id:orphan-heard"),
            Surface::Main,
            1_700_000_550_000,
        )
        .unwrap();
        let mut active = read_active(path).unwrap().unwrap();
        active.listened_sec = 22.0;
        active.last_tick_at = active.started_at + 22_000;
        write_active(path, &active).unwrap();
        close_orphan_active_if_any(path).unwrap();

        let events = read_events(path);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].end_reason, "abandoned_paused");
        assert_eq!(events[0].listened_sec, Some(22.0));
    }

    #[test]
    fn verify_rebuild_snapshot_recovery() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        open_session(path, "evt-rebuild", &sample_meta("id:rebuild"), Surface::Main, 1_700_000_600_000)
            .unwrap();
        end_session(path, EndReason::Completed, 60.0, 1_700_000_660_000).unwrap();
        fs::remove_file(snapshot_path(path)).unwrap();

        let snap = rebuild_snapshot_from_sources(path).unwrap();
        assert_eq!(snap.stats.len(), 1);
        assert_eq!(snap.stats[0].play_count, 1);
        assert!(snapshot_path(path).is_file());
    }

    #[test]
    fn verify_concurrent_handoff_stress() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        open_session(
            path,
            "evt-stress",
            &sample_meta("id:stress"),
            Surface::Main,
            1_700_000_700_000,
        )
        .unwrap();
        for i in 0..20 {
            let surface = if i % 2 == 0 {
                Surface::MusicMini
            } else {
                Surface::Main
            };
            transfer_surface(path, surface).unwrap();
        }
        end_session(path, EndReason::Completed, 30.0, 1_700_000_730_000).unwrap();
        assert_eq!(read_events(path).len(), 1);
    }

    #[test]
    fn verify_multi_flush_accumulates_total() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let started = 1_700_001_000_000_i64;
        open_session(path, "evt-multi", &sample_meta("id:multi"), Surface::Main, started).unwrap();
        accumulate_session(path, 15.0, started + 15_000).unwrap();
        accumulate_session(path, 15.0, started + 30_000).unwrap();
        accumulate_session(path, 12.0, started + 42_000).unwrap();
        let event = end_session_as_client(path, EndReason::Completed, started + 42_000).unwrap();

        assert_eq!(event.v, EVENT_SCHEMA_V);
        assert_eq!(event.listened_sec, Some(42.0));
        let snap = read_snapshot_file(path).unwrap();
        assert_eq!(snap.stats[0].listen_time_sec, 42.0);
    }

    #[test]
    fn verify_end_after_flush_preserves_total() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let started = 1_700_001_100_000_i64;
        open_session(path, "evt-flush-end", &sample_meta("id:flush-end"), Surface::Main, started)
            .unwrap();
        accumulate_session(path, 30.0, started + 30_000).unwrap();
        accumulate_session(path, 0.0, started + 30_001).unwrap();
        let event = end_session_as_client(path, EndReason::Completed, started + 30_000).unwrap();

        assert_eq!(event.listened_sec, Some(30.0));
    }

    #[test]
    fn verify_integrity_cutover_survives_clear_and_rebuild() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let integrity = ensure_integrity_cutover(path).unwrap();
        open_session(path, "evt-int", &sample_meta("id:int"), Surface::Main, 1_700_001_200_000)
            .unwrap();
        end_session(path, EndReason::Completed, 5.0, 1_700_001_205_000).unwrap();
        rebuild_snapshot_from_sources(path).unwrap();

        for name in [EVENTS_FILENAME, ACTIVE_FILENAME, SNAPSHOT_FILENAME, ROLLUP_FILENAME] {
            let p = path.join(name);
            if p.is_file() {
                fs::remove_file(p).unwrap();
            }
        }
        assert!(integrity_path(path).is_file());
        let after = read_integrity(path).unwrap();
        assert_eq!(
            after.stats_trustworthy_after_ms,
            integrity.stats_trustworthy_after_ms
        );
        ensure_integrity_cutover(path).unwrap();
        let again = read_integrity(path).unwrap();
        assert_eq!(
            again.stats_trustworthy_after_ms,
            integrity.stats_trustworthy_after_ms
        );
    }

    fn event(id: &str, key: &str, started_at: i64) -> TrackPlayedEvent {
        TrackPlayedEvent {
            v: EVENT_SCHEMA_V,
            id: id.to_string(),
            event_type: "track_played".to_string(),
            identity_key: key.to_string(),
            started_at,
            ended_at: started_at + 10_000,
            end_reason: "completed".to_string(),
            path: Some(format!("/music/{key}.mp3")),
            title: Some("T".to_string()),
            artist: Some("A".to_string()),
            listened_sec: Some(10.0),
            surface: Some("main".to_string()),
            source: None,
            was_liked: None,
        }
    }

    fn play(dir: &Path, id: &str, key: &str, started_at: i64) {
        open_session(dir, id, &sample_meta(key), Surface::Main, started_at).unwrap();
        end_session(dir, EndReason::Completed, 10.0, started_at + 10_000).unwrap();
    }

    fn plays_of(snapshot: &ListenSnapshot, key: &str) -> u32 {
        snapshot
            .stats
            .iter()
            .find(|r| r.identity_key == key)
            .map_or(0, |r| r.play_count)
    }

    #[test]
    fn corrupt_snapshot_neither_blocks_tracking_nor_duplicates_events() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        fs::write(snapshot_path(path), "{").unwrap();
        play(path, "e1", "id:a", 1_700_000_000_000);
        play(path, "e2", "id:b", 1_700_000_100_000);
        play(path, "e3", "id:a", 1_700_000_200_000);

        assert_eq!(read_events(path).len(), 3);
        assert!(!active_path(path).exists());
        let snap = read_snapshot_file(path).unwrap();
        assert_eq!(plays_of(&snap, "id:a"), 2);
        assert_eq!(plays_of(&snap, "id:b"), 1);
    }

    #[test]
    fn failed_snapshot_write_still_closes_the_session() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        fs::create_dir_all(snapshot_path(path)).unwrap();
        play(path, "e1", "id:a", 1_700_000_000_000);
        assert!(!active_path(path).exists(), "session must be closed");
        assert_eq!(read_events(path).len(), 1);

        fs::remove_dir_all(snapshot_path(path)).unwrap();
        play(path, "e2", "id:a", 1_700_000_100_000);
        assert_eq!(read_events(path).len(), 2);
        assert_eq!(plays_of(&read_snapshot_file(path).unwrap(), "id:a"), 2);
    }

    #[test]
    fn reclosing_after_a_crash_before_clear_does_not_duplicate() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        open_session(path, "e1", &sample_meta("id:a"), Surface::Main, 1_700_000_000_000).unwrap();
        let mut active = read_active(path).unwrap().unwrap();
        active.listened_sec = 20.0;
        active.last_tick_at = active.started_at + 20_000;
        write_active(path, &active).unwrap();
        append_event_line(path, &build_event_from_active(&active, EndReason::Completed, active.last_tick_at))
            .unwrap();

        close_orphan_active_if_any(path).unwrap();
        assert_eq!(read_events(path).len(), 1);
        assert!(!active_path(path).exists());
        assert_eq!(plays_of(&read_snapshot_file(path).unwrap(), "id:a"), 1);
    }

    #[test]
    fn corrupt_active_session_does_not_disable_tracking() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        fs::write(active_path(path), "{\"id\":").unwrap();
        close_orphan_active_if_any(path).unwrap();
        play(path, "e1", "id:a", 1_700_000_000_000);
        assert_eq!(read_events(path).len(), 1);
    }

    #[test]
    fn missing_newline_is_repaired_before_appending() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let first = serde_json::to_string(&event("e1", "id:a", 1_700_000_000_000)).unwrap();
        fs::write(events_path(path), first).unwrap();
        append_event_line(path, &event("e2", "id:b", 1_700_000_100_000)).unwrap();
        assert_eq!(read_events(path).len(), 2);

        let raw = fs::read_to_string(events_path(path)).unwrap();
        fs::write(events_path(path), format!("{raw}{{\"v\":2,\"id\":\"torn")).unwrap();
        append_event_line(path, &event("e3", "id:c", 1_700_000_200_000)).unwrap();
        let ids: Vec<String> = read_events(path).into_iter().map(|e| e.id).collect();
        assert_eq!(ids, vec!["e1", "e2", "e3"]);
    }

    #[test]
    fn duplicate_lines_in_the_log_count_once() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let line = serde_json::to_string(&event("e1", "id:a", 1_700_000_000_000)).unwrap();
        fs::write(events_path(path), format!("{line}\n{line}\ngarbage\n")).unwrap();
        let snap = rebuild_snapshot_from_sources(path).unwrap();
        assert_eq!(plays_of(&snap, "id:a"), 1);
    }

    #[test]
    fn rebuild_after_a_corrupt_line_keeps_imported_legacy_stats() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        import_legacy_stats(
            path,
            vec![LegacyStatImport {
                identity_key: "id:old".to_string(),
                path: "/music/old.mp3".to_string(),
                title: "Old".to_string(),
                artist: "A".to_string(),
                play_count: 7,
                listen_time_sec: 700.0,
                last_played: 1_600_000_000_000,
            }],
        )
        .unwrap();
        let now = Utc::now().timestamp_millis();
        play(path, "e1", "id:old", now - 60_000);
        assert_eq!(plays_of(&read_snapshot_file(path).unwrap(), "id:old"), 8);

        let mut f = OpenOptions::new().append(true).open(events_path(path)).unwrap();
        f.write_all(b"garbage\n").unwrap();
        drop(f);
        prune_old_events(path).unwrap();
        assert_eq!(count_event_lines(path).unwrap(), 1, "garbage line pruned");
        assert_eq!(plays_of(&read_snapshot_file(path).unwrap(), "id:old"), 8);
        assert_eq!(plays_of(&rebuild_snapshot_from_sources(path).unwrap(), "id:old"), 8);
    }

    #[test]
    fn prune_crash_between_rollup_and_events_write_does_not_double_count() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let now = Utc::now().timestamp_millis();
        for (i, started) in [1_000_000_i64, 2_000_000, 3_000_000].into_iter().enumerate() {
            append_event_line(path, &event(&format!("old{i}"), "id:a", started)).unwrap();
        }
        append_event_line(path, &event("new", "id:a", now - 60_000)).unwrap();
        let before_prune = fs::read_to_string(events_path(path)).unwrap();

        prune_old_events(path).unwrap();
        let expected = plays_of(&rebuild_snapshot_from_sources(path).unwrap(), "id:a");
        assert_eq!(expected, 4);
        let pruned_events = fs::read_to_string(events_path(path)).unwrap();

        fs::write(events_path(path), &before_prune).unwrap();
        assert_eq!(plays_of(&rebuild_snapshot_from_sources(path).unwrap(), "id:a"), 4);

        prune_old_events(path).unwrap();
        assert_eq!(fs::read_to_string(events_path(path)).unwrap(), pruned_events);
        let rolled: u32 = read_rollup(path).unwrap().buckets.iter().map(|b| b.play_count).sum();
        assert_eq!(rolled, 3);
        assert_eq!(plays_of(&read_snapshot_file(path).unwrap(), "id:a"), 4);
    }
}
