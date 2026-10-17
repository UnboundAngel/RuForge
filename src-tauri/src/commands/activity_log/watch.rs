//! Active watch session tracking and IPC for the activity log.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};
use uuid::Uuid;

use crate::commands::music_playlists::write_atomic;

use super::{
    data_dir, ensure_dir, local_now_parts, record_event_locked, reject_if_remote, with_log_lock,
    ActivityBody, ActivityEvent, SCHEMA_V, WatchEndReason, WatchSurface,
};

pub(crate) const WATCH_ACTIVE_FILENAME: &str = "watch-active.json";

fn watch_active_path(dir: &Path) -> PathBuf {
    dir.join(WATCH_ACTIVE_FILENAME)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WatchActiveSession {
    id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    item_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    channel_name: Option<String>,
    started_at: i64,
    /// Media seconds covered (delta * playback speed).
    #[serde(default, alias = "secondsWatched")]
    media_seconds_watched: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    media_duration_sec: Option<f64>,
    /// Sum of (speed * wall_sec) for time-weighted effective speed.
    speed_weighted_sec: f64,
    /// Wall seconds spent watching while playing.
    wall_watched_sec: f64,
    surface: WatchSurface,
    sponsor_skips: u32,
    sponsor_seconds_skipped: f64,
    last_tick_at: i64,
}

/// Wall and media seconds for a `watch_session`.
/// Schema v1 stored media time in `secondsWatched`; v2+ stores wall there and media in
/// `mediaSecondsWatched`.
pub fn watch_wall_and_media(ev: &ActivityEvent) -> Option<(f64, f64)> {
    let ActivityBody::WatchSession {
        seconds_watched,
        media_seconds_watched,
        effective_speed,
        ..
    } = &ev.body
    else {
        return None;
    };
    if ev.v >= 2 {
        Some((seconds_watched.max(0.0), media_seconds_watched.max(0.0)))
    } else {
        let media = seconds_watched.max(0.0);
        let spd = if *effective_speed > 0.0 {
            *effective_speed
        } else {
            1.0
        };
        Some((media / spd, media))
    }
}

fn read_watch_active(dir: &Path) -> Result<Option<WatchActiveSession>, String> {
    let path = watch_active_path(dir);
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&raw) {
        Ok(session) => Ok(Some(session)),
        Err(e) => {
            log::warn!("activity log: discarded unreadable watch session: {e}");
            let _ = fs::remove_file(&path);
            Ok(None)
        }
    }
}

fn write_watch_active(dir: &Path, session: &WatchActiveSession) -> Result<(), String> {
    ensure_dir(dir)?;
    let raw = serde_json::to_string(session).map_err(|e| e.to_string())?;
    write_atomic(&watch_active_path(dir), &raw)
}

fn clear_watch_active(dir: &Path) -> Result<(), String> {
    let path = watch_active_path(dir);
    if path.is_file() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn close_watch_session(
    dir: &Path,
    session: WatchActiveSession,
    end_reason: WatchEndReason,
) -> Result<(), String> {
    let media_dur = session.media_duration_sec.unwrap_or(0.0);
    let media_watched = session.media_seconds_watched.max(0.0);
    let wall_watched = session.wall_watched_sec.max(0.0);
    let completed = media_dur > 0.0
        && (media_watched >= media_dur * 0.9
            || matches!(end_reason, WatchEndReason::Completed));
    let effective_speed = if wall_watched > 0.0 {
        (session.speed_weighted_sec / wall_watched).max(0.01)
    } else {
        1.0
    };
    let (ts, tz, _, _) = local_now_parts();
    let event = ActivityEvent {
        v: SCHEMA_V,
        id: session.id,
        ts,
        tz,
        backfill: false,
        body: ActivityBody::WatchSession {
            item_id: session.item_id,
            title: session.title,
            channel_name: session.channel_name,
            started_at: session.started_at,
            seconds_watched: wall_watched,
            media_seconds_watched: media_watched,
            media_duration_sec: session.media_duration_sec,
            completed,
            effective_speed,
            surface: session.surface,
            end_reason,
            sponsor_skips: session.sponsor_skips,
            sponsor_seconds_skipped: session.sponsor_seconds_skipped.max(0.0),
        },
    };
    record_event_locked(dir, &event)?;
    clear_watch_active(dir)
}

pub(crate) fn close_orphan_watch_if_any(dir: &Path) -> Result<(), String> {
    if let Some(active) = read_watch_active(dir)? {
        if active.media_seconds_watched <= 0.0
            && active.wall_watched_sec <= 0.0
            && active.last_tick_at <= active.started_at
        {
            return clear_watch_active(dir);
        }
        close_watch_session(dir, active, WatchEndReason::Abandoned)?;
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchBeginInput {
    #[serde(default)]
    pub item_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub channel_name: Option<String>,
    #[serde(default)]
    pub media_duration_sec: Option<f64>,
    pub surface: WatchSurface,
    #[serde(default)]
    pub started_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchBeginResult {
    pub event_id: String,
}

#[tauri::command]
pub fn activity_watch_begin(
    app: AppHandle,
    webview: WebviewWindow,
    input: WatchBeginInput,
) -> Result<WatchBeginResult, String> {
    reject_if_remote(&webview)?;
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        if let Some(active) = read_watch_active(&dir)? {
            let same = active.item_id == input.item_id
                && active.title == input.title
                && input.item_id.is_some();
            if same {
                return Ok(WatchBeginResult {
                    event_id: active.id,
                });
            }
            close_watch_session(&dir, active, WatchEndReason::Switched)?;
        }
        let now = input.started_at.unwrap_or_else(|| local_now_parts().0);
        let session = WatchActiveSession {
            id: Uuid::new_v4().to_string(),
            item_id: input.item_id,
            title: input.title,
            channel_name: input.channel_name,
            started_at: now,
            media_seconds_watched: 0.0,
            media_duration_sec: input.media_duration_sec,
            speed_weighted_sec: 0.0,
            wall_watched_sec: 0.0,
            surface: input.surface,
            sponsor_skips: 0,
            sponsor_seconds_skipped: 0.0,
            last_tick_at: now,
        };
        write_watch_active(&dir, &session)?;
        Ok(WatchBeginResult {
            event_id: session.id,
        })
    })
}

#[tauri::command]
pub fn activity_watch_accumulate(
    app: AppHandle,
    webview: WebviewWindow,
    event_id: String,
    delta_sec: f64,
    speed: f64,
    last_tick_at: i64,
) -> Result<(), String> {
    reject_if_remote(&webview)?;
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let mut active = read_watch_active(&dir)?.ok_or_else(|| "No active watch session".to_string())?;
        if active.id != event_id {
            return Err("Active watch session id mismatch".to_string());
        }
        let delta = delta_sec.max(0.0);
        if delta > 0.0 {
            let spd = if speed.is_finite() && speed > 0.0 {
                speed
            } else {
                1.0
            };
            active.media_seconds_watched += delta * spd;
            active.wall_watched_sec += delta;
            active.speed_weighted_sec += spd * delta;
        }
        active.last_tick_at = last_tick_at.max(active.started_at);
        write_watch_active(&dir, &active)
    })
}

#[tauri::command]
pub fn activity_watch_sponsor_skip(
    app: AppHandle,
    webview: WebviewWindow,
    event_id: String,
    seconds: f64,
) -> Result<(), String> {
    reject_if_remote(&webview)?;
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let mut active = read_watch_active(&dir)?.ok_or_else(|| "No active watch session".to_string())?;
        if active.id != event_id {
            return Err("Active watch session id mismatch".to_string());
        }
        active.sponsor_skips = active.sponsor_skips.saturating_add(1);
        active.sponsor_seconds_skipped += seconds.max(0.0);
        write_watch_active(&dir, &active)
    })
}

#[tauri::command]
pub fn activity_watch_transfer(
    app: AppHandle,
    webview: WebviewWindow,
    surface: WatchSurface,
) -> Result<(), String> {
    reject_if_remote(&webview)?;
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let mut active = read_watch_active(&dir)?.ok_or_else(|| "No active watch session".to_string())?;
        active.surface = surface;
        active.last_tick_at = local_now_parts().0;
        write_watch_active(&dir, &active)
    })
}

#[tauri::command]
pub fn activity_watch_end(
    app: AppHandle,
    webview: WebviewWindow,
    event_id: String,
    end_reason: WatchEndReason,
) -> Result<(), String> {
    reject_if_remote(&webview)?;
    with_log_lock(|| {
        let dir = data_dir(&app)?;
        let active = read_watch_active(&dir)?.ok_or_else(|| "No active watch session".to_string())?;
        if active.id != event_id {
            return Err("Active watch session id mismatch".to_string());
        }
        close_watch_session(&dir, active, end_reason)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::activity_log::query_events;
    use tempfile::tempdir;

    #[test]
    fn watch_session_1_5x_writes_wall_and_media() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let session = WatchActiveSession {
            id: "w1".into(),
            item_id: Some("vid".into()),
            title: Some("T".into()),
            channel_name: None,
            started_at: 1_700_000_000_000,
            media_seconds_watched: 600.0,
            media_duration_sec: Some(600.0),
            speed_weighted_sec: 600.0,
            wall_watched_sec: 400.0,
            surface: WatchSurface::Main,
            sponsor_skips: 0,
            sponsor_seconds_skipped: 0.0,
            last_tick_at: 1_700_000_400_000,
        };
        close_watch_session(path, session, WatchEndReason::Closed).unwrap();
        let got = query_events(path, i64::MIN, i64::MAX, None);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].v, 2);
        let (wall, media) = watch_wall_and_media(&got[0]).unwrap();
        assert!((wall - 400.0).abs() < 0.01, "wall={wall}");
        assert!((media - 600.0).abs() < 0.01, "media={media}");
        assert!((media - wall - 200.0).abs() < 0.01);
        match &got[0].body {
            ActivityBody::WatchSession {
                seconds_watched,
                media_seconds_watched,
                effective_speed,
                completed,
                ..
            } => {
                assert!((*seconds_watched - 400.0).abs() < 0.01);
                assert!((*media_seconds_watched - 600.0).abs() < 0.01);
                assert!((*effective_speed - 1.5).abs() < 0.01);
                assert!(*completed);
            }
            _ => panic!("wrong kind"),
        }
    }

    #[test]
    fn watch_session_v1_reads_as_wall_media() {
        let raw = r#"{"v":1,"id":"old","ts":1700000400000,"tz":0,"kind":"watch_session","itemId":"vid","startedAt":1700000000000,"secondsWatched":600,"mediaDurationSec":600,"completed":true,"effectiveSpeed":1.5,"surface":"main","endReason":"closed","sponsorSkips":0,"sponsorSecondsSkipped":0}"#;
        let ev: ActivityEvent = serde_json::from_str(raw).unwrap();
        assert_eq!(ev.v, 1);
        let (wall, media) = watch_wall_and_media(&ev).unwrap();
        assert!((wall - 400.0).abs() < 0.01, "wall={wall}");
        assert!((media - 600.0).abs() < 0.01, "media={media}");
        assert!((media - wall - 200.0).abs() < 0.01);
    }
}
