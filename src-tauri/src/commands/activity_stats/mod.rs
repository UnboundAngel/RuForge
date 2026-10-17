//! Activity stats: daily rollups, query commands, and milestone notes.
//! Raw monthly JSONL is the truth; `rollups/` is a rebuildable cache.

mod bests;
mod calendar;
mod item;
mod milestones;
mod rollups;
mod streaks;
mod summary;
mod top;

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};

use chrono::{Datelike, FixedOffset, Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

pub use bests::{stats_bests, StatsBests};
pub use calendar::{stats_calendar, stats_clock};
pub use item::{stats_item, StatsItemQuery};
pub use milestones::{
    stats_milestones, stats_take_milestone_notes, MilestoneNote, MilestoneRow,
};
pub(crate) use rollups::{ensure_rollups, NamedCount};
pub use streaks::{stats_streaks, StatsStreaks};
pub use summary::{stats_summary, StatsSummary};
pub use top::{stats_top, TopRow};

use milestones::{evaluate_milestones_from, load_milestones};
use summary::compute_summary;
use streaks::compute_streaks;
use bests::compute_bests;

const MILESTONE_DEBOUNCE_MS: i64 = 60_000;
const STATS_MILESTONES_EVENT: &str = "stats-milestones";

static LAST_EVAL_MS: AtomicI64 = AtomicI64::new(0);
static EVAL_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

fn eval_mutex() -> &'static Mutex<()> {
    EVAL_MUTEX.get_or_init(|| Mutex::new(()))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StatValue<T> {
    pub value: T,
    pub live_only: bool,
    pub sample_size: u64,
}

impl<T> StatValue<T> {
    pub(crate) fn all(value: T, sample_size: u64) -> Self {
        Self {
            value,
            live_only: false,
            sample_size,
        }
    }
    pub(crate) fn live(value: T, sample_size: u64) -> Self {
        Self {
            value,
            live_only: true,
            sample_size,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum StatsRange {
    Named(String),
    Custom { from: i64, to: i64 },
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ResolvedRange {
    pub from: i64,
    pub to: i64,
}

pub(crate) fn resolve_range(range: &StatsRange) -> Result<ResolvedRange, String> {
    match range {
        StatsRange::Custom { from, to } => {
            if *to < *from {
                return Err("range to must be >= from".into());
            }
            Ok(ResolvedRange {
                from: *from,
                to: *to,
            })
        }
        StatsRange::Named(name) => {
            let now = Utc::now().timestamp_millis();
            let day_ms = 24_i64 * 60 * 60 * 1000;
            match name.as_str() {
                "7d" => Ok(ResolvedRange {
                    from: now - 7 * day_ms,
                    to: now,
                }),
                "30d" => Ok(ResolvedRange {
                    from: now - 30 * day_ms,
                    to: now,
                }),
                "year" => {
                    let local = Local::now();
                    let start = local
                        .timezone()
                        .with_ymd_and_hms(local.year(), 1, 1, 0, 0, 0)
                        .single()
                        .ok_or_else(|| "bad year start".to_string())?;
                    Ok(ResolvedRange {
                        from: start.timestamp_millis(),
                        to: now,
                    })
                }
                "all" => Ok(ResolvedRange {
                    from: i64::MIN / 4,
                    to: now,
                }),
                other => Err(format!("unknown range: {other}")),
            }
        }
    }
}

pub(crate) fn previous_range(r: ResolvedRange) -> ResolvedRange {
    if r.from <= i64::MIN / 4 {
        return ResolvedRange {
            from: i64::MIN / 4,
            to: r.from.saturating_sub(1),
        };
    }
    let len = r.to.saturating_sub(r.from);
    ResolvedRange {
        from: r.from.saturating_sub(len),
        to: r.from.saturating_sub(1),
    }
}

pub(crate) fn local_date_for(ts: i64, tz_min: i32) -> String {
    let offset = FixedOffset::east_opt(tz_min * 60).unwrap_or(FixedOffset::east_opt(0).unwrap());
    let dt = offset
        .timestamp_millis_opt(ts)
        .single()
        .unwrap_or_else(|| offset.timestamp_opt(0, 0).single().unwrap());
    dt.format("%Y-%m-%d").to_string()
}

pub(crate) fn local_parts(ts: i64, tz_min: i32) -> (u32, u32) {
    use chrono::Timelike;
    let offset = FixedOffset::east_opt(tz_min * 60).unwrap_or(FixedOffset::east_opt(0).unwrap());
    let dt = offset
        .timestamp_millis_opt(ts)
        .single()
        .unwrap_or_else(|| offset.timestamp_opt(0, 0).single().unwrap());
    (dt.weekday().num_days_from_monday(), dt.hour())
}

pub(crate) fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

pub(crate) fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Tauri runs sync commands on the main thread; rollup rebuilds and log scans must not.
pub(crate) async fn run_blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

pub(crate) fn reject_remote(webview: &WebviewWindow) -> Result<(), String> {
    super::activity_log::reject_if_remote(webview)
}

pub(crate) fn activity_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    super::activity_log::data_dir(app)
}

/// Day date `YYYY-MM-DD` included if that UTC calendar day overlaps `[from, to]`.
pub(crate) fn day_in_range(date: &str, from: i64, to: i64) -> bool {
    let Ok(nd) = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") else {
        return false;
    };
    let Some(start) = nd.and_hms_opt(0, 0, 0) else {
        return false;
    };
    let Some(end) = nd.and_hms_opt(23, 59, 59) else {
        return false;
    };
    let start_ms = start.and_utc().timestamp_millis();
    let end_ms = end.and_utc().timestamp_millis();
    start_ms <= to && end_ms >= from
}

pub fn clear_rollups_and_milestones(dir: &std::path::Path) -> Result<(), String> {
    rollups::clear_rollups_cache(dir)?;
    let milestones = dir.join(rollups::MILESTONES_FILENAME);
    if milestones.is_file() {
        std::fs::remove_file(&milestones).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn note_activity_changed(app: &AppHandle) {
    let now = now_ms();
    let last = LAST_EVAL_MS.load(Ordering::Relaxed);
    if last != 0 && now - last < MILESTONE_DEBOUNCE_MS {
        return;
    }
    housekeeping(app);
}

pub fn housekeeping(app: &AppHandle) {
    let Ok(_guard) = eval_mutex().lock() else {
        return;
    };
    let Ok(dir) = activity_dir(app) else {
        return;
    };
    let Ok(app_data) = app_data_dir(app) else {
        return;
    };
    let _ = std::fs::create_dir_all(&dir);
    let Ok(rollups) = ensure_rollups(&dir, &app_data) else {
        return;
    };
    let ping = evaluate_milestones_from(&dir, &app_data, &rollups);
    LAST_EVAL_MS.store(now_ms(), Ordering::Relaxed);
    if ping {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.emit(STATS_MILESTONES_EVENT, ());
        }
    }
}

pub fn compute_summary_for_paths(
    dir: &std::path::Path,
    app_data: &std::path::Path,
    range: &StatsRange,
) -> Result<StatsSummary, String> {
    compute_summary(dir, app_data, range)
}

pub fn compute_streaks_for_paths(
    dir: &std::path::Path,
    app_data: &std::path::Path,
) -> Result<StatsStreaks, String> {
    compute_streaks(dir, app_data)
}

pub fn compute_bests_for_paths(
    dir: &std::path::Path,
    app_data: &std::path::Path,
) -> Result<StatsBests, String> {
    compute_bests(dir, app_data)
}

pub fn seed_milestones_for_paths(
    dir: &std::path::Path,
    app_data: &std::path::Path,
) -> Result<usize, String> {
    let rollups = ensure_rollups(dir, app_data)?;
    let _ = evaluate_milestones_from(dir, app_data, &rollups);
    Ok(load_milestones(dir).crossed.len())
}

#[cfg(test)]
pub(crate) mod test_util {
    use super::*;
    use crate::commands::activity_log::{ActivityBody, ActivityEvent, MediaKind};
    use std::io::Write;
    use std::path::Path;

    pub fn write_event(dir: &Path, ev: &ActivityEvent) {
        let offset = FixedOffset::east_opt(ev.tz * 60).unwrap();
        let dt = offset.timestamp_millis_opt(ev.ts).single().unwrap();
        let month = dt.format("%Y-%m").to_string();
        let path = dir.join(format!("{month}.jsonl"));
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        writeln!(f, "{}", serde_json::to_string(ev).unwrap()).unwrap();
    }

    pub fn ev(ts: i64, tz: i32, backfill: bool, body: ActivityBody) -> ActivityEvent {
        ActivityEvent {
            v: crate::commands::activity_log::SCHEMA_V,
            id: uuid::Uuid::new_v4().to_string(),
            ts,
            tz,
            backfill,
            body,
        }
    }

    pub fn finished(bytes: u64, peak: Option<f64>) -> ActivityBody {
        ActivityBody::DownloadFinished {
            item_id: Some("vid1".into()),
            job_id: Some("job1".into()),
            video_id: Some("vid1".into()),
            title: Some("T".into()),
            channel_id: Some("c1".into()),
            channel_name: Some("Ch".into()),
            media_kind: Some(MediaKind::Video),
            quality: Some("1080p".into()),
            format_spec: None,
            container: Some("mp4".into()),
            bytes: Some(bytes),
            media_duration_sec: Some(60.0),
            elapsed_ms: Some(1000),
            avg_bps: Some(1000.0),
            peak_bps: peak,
            entry_point: None,
            resumed: None,
            resumed_bytes: None,
            retries: None,
        }
    }
}

#[cfg(test)]
mod range_tests {
    use super::*;

    #[test]
    fn previous_period_math() {
        let r = ResolvedRange {
            from: 1_000,
            to: 2_000,
        };
        let p = previous_range(r);
        assert_eq!(p.from, 0);
        assert_eq!(p.to, 999);
    }
}
