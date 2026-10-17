//! App-wide activity log for stats (batch 1). Append-only monthly JSONL under `activity/`.
//! Local only. Unknown kinds and fields are rejected. Remote webviews cannot record.

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};

use chrono::{FixedOffset, Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};
use uuid::Uuid;

mod types;
mod watch;

pub use types::*;
pub use watch::{
    activity_watch_accumulate, activity_watch_begin, activity_watch_end,
    activity_watch_sponsor_skip, activity_watch_transfer, watch_wall_and_media,
    WatchBeginInput, WatchBeginResult,
};
pub(crate) use watch::{close_orphan_watch_if_any, WATCH_ACTIVE_FILENAME};

use super::music_playlists::write_atomic;

/// Current write version. Readers accept `SCHEMA_V_MIN..=SCHEMA_V`.
pub(crate) const SCHEMA_V: i32 = 2;
const SCHEMA_V_MIN: i32 = 1;
const ACTIVITY_DIR: &str = "activity";
const COUNTERS_FILENAME: &str = "counters.json";
const BACKFILL_MARKER: &str = "backfill-v1.json";
const COUNTER_FLUSH_INTERVAL_MS: i64 = 30_000;

/// IPC may only come from the app chrome, never Explorer / Glance / other remotes.
const ALLOWED_IPC_LABELS: &[&str] = &["main", "mini", "music-mini"];

static LOG_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
static COUNTERS: OnceLock<Mutex<CounterState>> = OnceLock::new();
static LAST_COUNTER_FLUSH_MS: AtomicI64 = AtomicI64::new(0);

fn log_mutex() -> &'static Mutex<()> {
    LOG_MUTEX.get_or_init(|| Mutex::new(()))
}

pub(crate) fn with_log_lock<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    let _guard = log_mutex().lock().map_err(|e| e.to_string())?;
    f()
}

fn counters_mutex() -> &'static Mutex<CounterState> {
    COUNTERS.get_or_init(|| Mutex::new(CounterState::default()))
}

#[derive(Debug, Clone, Default)]
struct CounterState {
    /// local date -> counter id -> count
    by_date: BTreeMap<String, BTreeMap<String, u64>>,
    dirty: bool,
    loaded: bool,
}

pub fn is_allowed_activity_label(label: &str) -> bool {
    ALLOWED_IPC_LABELS.contains(&label)
}

pub(crate) fn reject_if_remote(webview: &WebviewWindow) -> Result<(), String> {
    let label = webview.label();
    if is_allowed_activity_label(label) {
        Ok(())
    } else {
        Err(format!("activity log refused webview label: {label}"))
    }
}

pub(crate) fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join(ACTIVITY_DIR))
}

pub(crate) fn ensure_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())
}

pub(crate) fn local_now_parts() -> (i64, i32, String, String) {
    let local = Local::now();
    let ts = local.timestamp_millis();
    let tz = local.offset().local_minus_utc() / 60;
    let month = local.format("%Y-%m").to_string();
    let date = local.format("%Y-%m-%d").to_string();
    (ts, tz, month, date)
}

fn month_file(dir: &Path, month: &str) -> PathBuf {
    dir.join(format!("{month}.jsonl"))
}

fn counters_path(dir: &Path) -> PathBuf {
    dir.join(COUNTERS_FILENAME)
}


fn backfill_marker_path(dir: &Path) -> PathBuf {
    dir.join(BACKFILL_MARKER)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CountersFile {
    v: i32,
    /// local date -> counter id -> count
    #[serde(default)]
    days: BTreeMap<String, BTreeMap<String, u64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillMarker {
    pub v: i32,
    pub finished_at: i64,
    pub download_finished: u32,
    pub library_snapshot: bool,
}

pub(crate) fn kind_name(body: &ActivityBody) -> &'static str {
    match body {
        ActivityBody::AppSessionStart { .. } => "app_session_start",
        ActivityBody::AppSessionEnd { .. } => "app_session_end",
        ActivityBody::DownloadQueued { .. } => "download_queued",
        ActivityBody::DownloadFinished { .. } => "download_finished",
        ActivityBody::DownloadFailed { .. } => "download_failed",
        ActivityBody::DownloadCanceled { .. } => "download_canceled",
        ActivityBody::PlaylistImported { .. } => "playlist_imported",
        ActivityBody::PlaylistDownloaded { .. } => "playlist_downloaded",
        ActivityBody::WatchSession { .. } => "watch_session",
        ActivityBody::MusicLiked { .. } => "music_liked",
        ActivityBody::MusicUnliked { .. } => "music_unliked",
        ActivityBody::MusicPlaylistCreated { .. } => "music_playlist_created",
        ActivityBody::MusicPlaylistDeleted { .. } => "music_playlist_deleted",
        ActivityBody::MusicTracksAdded { .. } => "music_tracks_added",
        ActivityBody::ItemDeleted { .. } => "item_deleted",
        ActivityBody::CleanupRun { .. } => "cleanup_run",
        ActivityBody::TagCreated { .. } => "tag_created",
        ActivityBody::LibrarySnapshot { .. } => "library_snapshot",
        ActivityBody::GameSession { .. } => "game_session",
        ActivityBody::GuideOpened { .. } => "guide_opened",
    }
}

fn parse_event_line(line: &str) -> Option<ActivityEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    match serde_json::from_str::<ActivityEvent>(trimmed) {
        Ok(ev)
            if (SCHEMA_V_MIN..=SCHEMA_V).contains(&ev.v) && !ev.id.is_empty() && ev.ts > 0 =>
        {
            Some(ev)
        }
        Ok(_) => {
            log::warn!("activity log: dropped malformed event");
            None
        }
        Err(e) => {
            log::warn!("activity log: skipped unparseable line: {e}");
            None
        }
    }
}

fn append_event_line(dir: &Path, event: &ActivityEvent) -> Result<(), String> {
    ensure_dir(dir)?;
    let (ts, tz, month, _) = if event.ts > 0 {
        let tz = event.tz;
        let offset = FixedOffset::east_opt(tz * 60).unwrap_or(FixedOffset::east_opt(0).unwrap());
        let dt = offset
            .timestamp_millis_opt(event.ts)
            .single()
            .unwrap_or_else(|| offset.timestamp_opt(0, 0).single().unwrap());
        (
            event.ts,
            tz,
            dt.format("%Y-%m").to_string(),
            dt.format("%Y-%m-%d").to_string(),
        )
    } else {
        local_now_parts()
    };
    let _ = (ts, tz);
    let path = month_file(dir, &month);
    let mut out = String::new();
    let mut file = OpenOptions::new()
        .create(true)
        .read(true)
        .append(true)
        .open(&path)
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

fn input_to_event(input: ActivityRecordInput) -> ActivityEvent {
    let (now_ts, now_tz, _, _) = local_now_parts();
    ActivityEvent {
        v: SCHEMA_V,
        id: input.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        ts: input.ts.unwrap_or(now_ts),
        tz: input.tz.unwrap_or(now_tz),
        backfill: input.backfill,
        body: input.body,
    }
}

/// Internal producer API. Never fails the caller: log and swallow.
pub fn record(app: &AppHandle, body: ActivityBody) {
    let (ts, tz, _, _) = local_now_parts();
    let event = ActivityEvent {
        v: SCHEMA_V,
        id: Uuid::new_v4().to_string(),
        ts,
        tz,
        backfill: false,
        body,
    };
    if let Err(e) = with_log_lock(|| {
        let dir = data_dir(app)?;
        append_event_line(&dir, &event)
    }) {
        log::warn!("activity log: record failed: {e}");
    }
}

/// Same as [`record`] but marks `backfill: true`.
pub fn record_backfill(app: &AppHandle, body: ActivityBody, ts: i64, tz: i32) {
    let event = ActivityEvent {
        v: SCHEMA_V,
        id: Uuid::new_v4().to_string(),
        ts,
        tz,
        backfill: true,
        body,
    };
    if let Err(e) = with_log_lock(|| {
        let dir = data_dir(app)?;
        append_event_line(&dir, &event)
    }) {
        log::warn!("activity log: backfill record failed: {e}");
    }
}

pub(crate) fn record_event_locked(dir: &Path, event: &ActivityEvent) -> Result<(), String> {
    append_event_line(dir, event)
}

pub(crate) fn list_month_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("jsonl")
                && p.file_stem()
                    .and_then(|s| s.to_str())
                    .is_some_and(|s| s.len() == 7 && s.as_bytes().get(4) == Some(&b'-'))
        })
        .collect();
    files.sort();
    files
}

pub(crate) fn parse_month_file(path: &Path) -> Vec<ActivityEvent> {
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    raw.lines().filter_map(parse_event_line).collect()
}

pub(crate) fn query_events(dir: &Path, from: i64, to: i64, kinds: Option<&[String]>) -> Vec<ActivityEvent> {
    let mut out = Vec::new();
    for path in list_month_files(dir) {
        for ev in parse_month_file(&path) {
            if ev.ts < from || ev.ts > to {
                continue;
            }
            if let Some(filter) = kinds {
                if !filter.is_empty() && !filter.iter().any(|k| k == kind_name(&ev.body)) {
                    continue;
                }
            }
            out.push(ev);
        }
    }
    out.sort_by_key(|e| e.ts);
    out
}

fn load_counters_into(dir: &Path, state: &mut CounterState) -> Result<(), String> {
    if state.loaded {
        return Ok(());
    }
    let path = counters_path(dir);
    if path.is_file() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        match serde_json::from_str::<CountersFile>(&raw) {
            Ok(file) => {
                state.by_date = file.days;
            }
            Err(e) => {
                log::warn!("activity log: unreadable counters, starting fresh: {e}");
            }
        }
    }
    state.loaded = true;
    Ok(())
}

fn flush_counters_locked(dir: &Path, state: &mut CounterState) -> Result<(), String> {
    if !state.dirty {
        return Ok(());
    }
    ensure_dir(dir)?;
    let file = CountersFile {
        v: SCHEMA_V,
        days: state.by_date.clone(),
    };
    let raw = serde_json::to_string(&file).map_err(|e| e.to_string())?;
    write_atomic(&counters_path(dir), &raw)?;
    state.dirty = false;
    LAST_COUNTER_FLUSH_MS.store(Utc::now().timestamp_millis(), Ordering::Relaxed);
    Ok(())
}

fn bump_counter_inner(app: &AppHandle, id: &str, by: u64) -> Result<(), String> {
    if id.trim().is_empty() || by == 0 {
        return Ok(());
    }
    let dir = data_dir(app)?;
    let (_, _, _, date) = local_now_parts();
    let mut state = counters_mutex().lock().map_err(|e| e.to_string())?;
    load_counters_into(&dir, &mut state)?;
    *state
        .by_date
        .entry(date)
        .or_default()
        .entry(id.to_string())
        .or_insert(0) += by;
    state.dirty = true;
    let now = Utc::now().timestamp_millis();
    let last = LAST_COUNTER_FLUSH_MS.load(Ordering::Relaxed);
    if last == 0 || now - last >= COUNTER_FLUSH_INTERVAL_MS {
        flush_counters_locked(&dir, &mut state)?;
    }
    Ok(())
}

/// Internal counter bump. Failures are logged and swallowed.
pub fn bump_counter(app: &AppHandle, id: &str) {
    if let Err(e) = bump_counter_inner(app, id, 1) {
        log::warn!("activity log: bump_counter failed: {e}");
    }
}

pub fn flush_counters(app: &AppHandle) {
    let Ok(dir) = data_dir(app) else {
        return;
    };
    let Ok(mut state) = counters_mutex().lock() else {
        return;
    };
    if let Err(e) = flush_counters_locked(&dir, &mut state) {
        log::warn!("activity log: counter flush failed: {e}");
    }
}

fn export_json(events: &[ActivityEvent]) -> Result<String, String> {
    serde_json::to_string_pretty(events).map_err(|e| e.to_string())
}

fn export_csv(events: &[ActivityEvent]) -> Result<String, String> {
    let mut out = String::from("id,ts,tz,backfill,kind,payload\n");
    for ev in events {
        let kind = kind_name(&ev.body);
        let payload = serde_json::to_string(&ev.body).map_err(|e| e.to_string())?;
        let escaped = payload.replace('"', "\"\"");
        out.push_str(&format!(
            "{},{},{},{},{},\"{}\"\n",
            ev.id, ev.ts, ev.tz, ev.backfill, kind, escaped
        ));
    }
    Ok(out)
}

fn clear_all(dir: &Path) -> Result<(), String> {
    if dir.is_dir() {
        for path in list_month_files(dir) {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        for name in [COUNTERS_FILENAME, WATCH_ACTIVE_FILENAME] {
            let p = dir.join(name);
            if p.is_file() {
                fs::remove_file(p).map_err(|e| e.to_string())?;
            }
        }
        super::activity_stats::clear_rollups_and_milestones(dir)?;
    }
    if let Ok(mut state) = counters_mutex().lock() {
        state.by_date.clear();
        state.dirty = false;
        state.loaded = true;
    }
    Ok(())
}

/// Backfill helpers used by startup and tests.
pub fn media_kind_from_path(path: &str) -> MediaKind {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "mp3" | "m4a" | "flac" | "opus" | "ogg" | "wav" => MediaKind::Audio,
        _ => MediaKind::Video,
    }
}

pub fn library_snapshot_from_files(
    files: impl IntoIterator<Item = (u64, f64, MediaKind)>,
) -> ActivityBody {
    let mut items = 0u32;
    let mut bytes = 0u64;
    let mut seconds = 0.0f64;
    let mut video_count = 0u32;
    let mut audio_count = 0u32;
    for (size, duration, kind) in files {
        items = items.saturating_add(1);
        bytes = bytes.saturating_add(size);
        seconds += duration.max(0.0);
        match kind {
            MediaKind::Video => video_count = video_count.saturating_add(1),
            MediaKind::Audio => audio_count = audio_count.saturating_add(1),
        }
    }
    ActivityBody::LibrarySnapshot {
        items,
        bytes,
        hours: seconds / 3600.0,
        video_count,
        audio_count,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillReport {
    pub download_finished: u32,
    pub library_snapshot: bool,
    pub skipped_reason: Option<String>,
}

/// One-time backfill from library media. Safe to call repeatedly; no-ops after marker.
pub fn run_library_backfill(
    app: &AppHandle,
    files: &[(
        String, // path
        u64,    // size
        f64,    // duration
        u64,    // created (unix sec)
        Option<String>, // title
        Option<String>, // video id
        Option<String>, // channel id
        Option<String>, // channel name
    )],
) -> BackfillReport {
    let Ok(dir) = data_dir(app) else {
        return BackfillReport {
            download_finished: 0,
            library_snapshot: false,
            skipped_reason: Some("no app data dir".into()),
        };
    };
    if backfill_marker_path(&dir).is_file() {
        return BackfillReport {
            download_finished: 0,
            library_snapshot: false,
            skipped_reason: Some("already done".into()),
        };
    }

    let (_, tz, _, _) = local_now_parts();
    let mut finished = 0u32;
    let mut snap_files = Vec::new();

    for (path, size, duration, created, title, video_id, channel_id, channel_name) in files {
        let kind = media_kind_from_path(path);
        snap_files.push((*size, *duration, kind));
        let ts = (*created as i64).saturating_mul(1000);
        let container = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase());
        record_backfill(
            app,
            ActivityBody::DownloadFinished {
                item_id: None,
                job_id: None,
                video_id: video_id.clone(),
                title: title.clone(),
                channel_id: channel_id.clone(),
                channel_name: channel_name.clone(),
                media_kind: Some(kind),
                quality: None,
                format_spec: None,
                container,
                bytes: Some(*size),
                media_duration_sec: if *duration > 0.0 {
                    Some(*duration)
                } else {
                    None
                },
                elapsed_ms: None,
                avg_bps: None,
                peak_bps: None,
                entry_point: None,
                resumed: None,
                resumed_bytes: None,
                retries: None,
            },
            if ts > 0 { ts } else { local_now_parts().0 },
            tz,
        );
        finished = finished.saturating_add(1);
    }

    let snap = library_snapshot_from_files(snap_files);
    record_backfill(app, snap, local_now_parts().0, tz);

    let marker = BackfillMarker {
        v: SCHEMA_V,
        finished_at: Utc::now().timestamp_millis(),
        download_finished: finished,
        library_snapshot: true,
    };
    if let Ok(raw) = serde_json::to_string(&marker) {
        let _ = ensure_dir(&dir);
        let _ = write_atomic(&backfill_marker_path(&dir), &raw);
    }

    BackfillReport {
        download_finished: finished,
        library_snapshot: true,
        skipped_reason: None,
    }
}

/// Crash recovery + counter flush. Call once per process start.
pub fn activity_startup_housekeeping(app: &AppHandle) -> Result<(), String> {
    with_log_lock(|| {
        let dir = data_dir(app)?;
        ensure_dir(&dir)?;
        close_orphan_watch_if_any(&dir)?;
        Ok(())
    })?;
    flush_counters(app);
    super::activity_stats::housekeeping(app);
    Ok(())
}

// --- Tauri commands ---

#[tauri::command]
pub fn activity_record(
    app: AppHandle,
    webview: WebviewWindow,
    events: Vec<ActivityRecordInput>,
) -> Result<(), String> {
    reject_if_remote(&webview)?;
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        for input in events {
            // Re-parse through typed enum: unknown kinds/fields already failed Deserialize.
            let event = input_to_event(input);
            if let Err(e) = record_event_locked(&dir, &event) {
                log::warn!("activity log: append failed: {e}");
            }
        }
        Ok(())
    })?;
    super::activity_stats::note_activity_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn activity_bump_counters(
    app: AppHandle,
    webview: WebviewWindow,
    ids: Vec<String>,
) -> Result<(), String> {
    reject_if_remote(&webview)?;
    for id in ids {
        if let Err(e) = bump_counter_inner(&app, &id, 1) {
            log::warn!("activity log: bump failed for {id}: {e}");
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn activity_query(
    app: AppHandle,
    webview: WebviewWindow,
    from: i64,
    to: i64,
    kinds: Option<Vec<String>>,
) -> Result<Vec<ActivityEvent>, String> {
    reject_if_remote(&webview)?;
    super::activity_stats::run_blocking(move || {
        with_log_lock(|| {
            let dir = data_dir(&app)?;
            Ok(query_events(&dir, from, to, kinds.as_deref()))
        })
    })
    .await
}

#[tauri::command]
pub async fn activity_export(
    app: AppHandle,
    webview: WebviewWindow,
    format: String,
    path: String,
) -> Result<(), String> {
    reject_if_remote(&webview)?;
    super::activity_stats::run_blocking(move || {
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let events = query_events(&dir, i64::MIN, i64::MAX, None);
        let body = match format.as_str() {
            "json" => export_json(&events)?,
            "csv" => export_csv(&events)?,
            other => return Err(format!("unsupported export format: {other}")),
        };
        // The path comes from a save dialog; refuse anything else so a compromised
        // renderer cannot turn export into an arbitrary file write.
        let dest = PathBuf::from(&path);
        if !dest.is_absolute() {
            return Err("export path must be absolute".into());
        }
        let ext_ok = dest
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case(&format));
        if !ext_ok {
            return Err("export file extension must match the format".into());
        }
        if !dest.parent().is_some_and(|p| p.is_dir()) {
            return Err("export folder does not exist".into());
        }
        write_atomic(&dest, &body)
    })
    })
    .await
}

#[tauri::command]
pub async fn activity_clear(app: AppHandle, webview: WebviewWindow) -> Result<(), String> {
    reject_if_remote(&webview)?;
    super::activity_stats::run_blocking(move || with_log_lock(|| clear_all(&data_dir(&app)?))).await
}

#[tauri::command]
pub fn activity_backfill_report(app: AppHandle, webview: WebviewWindow) -> Result<Option<BackfillMarker>, String> {
    reject_if_remote(&webview)?;
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let path = backfill_marker_path(&dir);
        if !path.is_file() {
            return Ok(None);
        }
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map(Some).map_err(|e| e.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_finished() -> ActivityBody {
        ActivityBody::DownloadFinished {
            item_id: Some("i1".into()),
            job_id: Some("j1".into()),
            video_id: Some("v1".into()),
            title: Some("T".into()),
            channel_id: Some("c1".into()),
            channel_name: Some("Ch".into()),
            media_kind: Some(MediaKind::Video),
            quality: Some("1080p".into()),
            format_spec: Some("bestvideo[height<=1080]+bestaudio".into()),
            container: Some("mp4".into()),
            bytes: Some(1000),
            media_duration_sec: Some(60.0),
            elapsed_ms: Some(5000),
            avg_bps: Some(1600.0),
            peak_bps: Some(2000.0),
            entry_point: Some(DownloadEntryPoint::Paste),
            resumed: Some(false),
            resumed_bytes: None,
            retries: Some(0),
        }
    }

    #[test]
    fn roundtrip_append_and_query() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let (ts, tz, _, _) = local_now_parts();
        let event = ActivityEvent {
            v: SCHEMA_V,
            id: "e1".into(),
            ts,
            tz,
            backfill: false,
            body: sample_finished(),
        };
        append_event_line(path, &event).unwrap();
        let got = query_events(path, ts - 1, ts + 1, None);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "e1");
        assert_eq!(got[0].body, sample_finished());
    }

    #[test]
    fn partial_last_line_skipped() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let (ts, tz, month, _) = local_now_parts();
        let event = ActivityEvent {
            v: SCHEMA_V,
            id: "e1".into(),
            ts,
            tz,
            backfill: false,
            body: ActivityBody::AppSessionStart {},
        };
        append_event_line(path, &event).unwrap();
        let file = month_file(path, &month);
        let mut raw = fs::read_to_string(&file).unwrap();
        raw.push_str("{\"v\":1,\"id\":\"torn");
        fs::write(&file, raw).unwrap();
        let got = query_events(path, i64::MIN, i64::MAX, None);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "e1");
    }

    #[test]
    fn month_rollover_writes_separate_files() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let jan = ActivityEvent {
            v: SCHEMA_V,
            id: "jan".into(),
            ts: 1_735_689_600_000, // 2025-01-01 UTC approx; tz 0 => January
            tz: 0,
            backfill: false,
            body: ActivityBody::AppSessionStart {},
        };
        let feb = ActivityEvent {
            v: SCHEMA_V,
            id: "feb".into(),
            ts: 1_738_368_000_000, // 2025-02-01
            tz: 0,
            backfill: false,
            body: ActivityBody::AppSessionStart {},
        };
        append_event_line(path, &jan).unwrap();
        append_event_line(path, &feb).unwrap();
        assert!(month_file(path, "2025-01").is_file());
        assert!(month_file(path, "2025-02").is_file());
        assert_eq!(query_events(path, i64::MIN, i64::MAX, None).len(), 2);
    }

    #[test]
    fn unknown_kind_rejected() {
        let err = serde_json::from_str::<ActivityEvent>(
            r#"{"v":1,"id":"x","ts":1,"tz":0,"kind":"not_a_real_kind"}"#,
        );
        assert!(err.is_err());
    }

    #[test]
    fn unknown_field_rejected() {
        let err = serde_json::from_str::<ActivityEvent>(
            r#"{"v":1,"id":"x","ts":1,"tz":0,"kind":"app_session_start","sneaky":true}"#,
        );
        assert!(err.is_err());
    }

    #[test]
    fn label_rejection() {
        assert!(is_allowed_activity_label("main"));
        assert!(is_allowed_activity_label("mini"));
        assert!(is_allowed_activity_label("music-mini"));
        assert!(!is_allowed_activity_label("explorer-view"));
        assert!(!is_allowed_activity_label("guide-glance"));
        assert!(!is_allowed_activity_label("island"));
    }

    #[test]
    fn library_snapshot_math() {
        let body = library_snapshot_from_files([
            (100u64, 3600.0, MediaKind::Video),
            (50, 1800.0, MediaKind::Audio),
        ]);
        match body {
            ActivityBody::LibrarySnapshot {
                items,
                bytes,
                hours,
                video_count,
                audio_count,
            } => {
                assert_eq!(items, 2);
                assert_eq!(bytes, 150);
                assert!((hours - 1.5).abs() < 0.001);
                assert_eq!(video_count, 1);
                assert_eq!(audio_count, 1);
            }
            _ => panic!("wrong kind"),
        }
    }
}
