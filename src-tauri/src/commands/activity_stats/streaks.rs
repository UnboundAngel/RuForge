//! Day and download streaks from the rollup cache.

use std::collections::HashSet;
use std::path::Path;

use chrono::{Duration, Local, NaiveDate};
use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

use super::rollups::ensure_rollups;
use super::{activity_dir, app_data_dir, reject_remote, run_blocking, StatValue};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsStreaks {
    pub current_day_streak: StatValue<u64>,
    pub best_day_streak: StatValue<u64>,
    pub current_download_streak: StatValue<u64>,
    pub best_download_streak: StatValue<u64>,
    pub days_active: StatValue<u64>,
    pub member_since: StatValue<Option<i64>>,
}

fn streak_from_dates(dates: &[NaiveDate], today: NaiveDate) -> (u64, u64) {
    if dates.is_empty() {
        return (0, 0);
    }
    let mut best = 1u64;
    let mut run = 1u64;
    for w in dates.windows(2) {
        if w[1] == w[0] + Duration::days(1) {
            run += 1;
            best = best.max(run);
        } else {
            run = 1;
        }
    }
    let mut current = 0u64;
    let set: HashSet<_> = dates.iter().copied().collect();
    let mut cursor = if set.contains(&today) {
        today
    } else {
        today - Duration::days(1)
    };
    while set.contains(&cursor) {
        current += 1;
        cursor -= Duration::days(1);
    }
    (current, best)
}

pub(crate) fn compute_streaks(dir: &Path, app_data: &Path) -> Result<StatsStreaks, String> {
    let rollups = ensure_rollups(dir, app_data)?;
    let today = Local::now().date_naive();
    let mut live_dates = Vec::new();
    let mut download_dates = Vec::new();
    let mut member_since: Option<i64> = None;
    for (date, day) in &rollups.days {
        let Ok(nd) = NaiveDate::parse_from_str(date, "%Y-%m-%d") else {
            continue;
        };
        if day.live_active {
            live_dates.push(nd);
        }
        if day.downloads > 0 {
            download_dates.push(nd);
        }
        if day.first_ts > 0 {
            member_since = Some(match member_since {
                Some(m) => m.min(day.first_ts),
                None => day.first_ts,
            });
        }
    }
    live_dates.sort();
    live_dates.dedup();
    download_dates.sort();
    download_dates.dedup();
    let (cur_day, best_day) = streak_from_dates(&live_dates, today);
    let (cur_dl, best_dl) = streak_from_dates(&download_dates, today);
    let days_active = rollups.days.values().filter(|d| d.active).count() as u64;
    Ok(StatsStreaks {
        current_day_streak: StatValue::live(cur_day, live_dates.len() as u64),
        best_day_streak: StatValue::live(best_day, live_dates.len() as u64),
        current_download_streak: StatValue::all(cur_dl, download_dates.len() as u64),
        best_download_streak: StatValue::all(best_dl, download_dates.len() as u64),
        days_active: StatValue::all(days_active, days_active),
        member_since: StatValue::all(member_since, if member_since.is_some() { 1 } else { 0 }),
    })
}

#[tauri::command]
pub async fn stats_streaks(app: AppHandle, webview: WebviewWindow) -> Result<StatsStreaks, String> {
    reject_remote(&webview)?;
    run_blocking(move || compute_streaks(&activity_dir(&app)?, &app_data_dir(&app)?)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::activity_stats::rollups::{
        ensure_rollups, listen_events_path, local_date_at,
    };
    use crate::commands::activity_stats::test_util::{ev, finished, write_event};
    use chrono::{Duration, Local};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn streak_across_month_boundary() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        write_event(path, &ev(1_738_281_600_000, 0, false, finished(1, None)));
        write_event(path, &ev(1_738_368_000_000, 0, false, finished(1, None)));
        let app_data = path.parent().unwrap_or(path);
        let streaks = compute_streaks(path, app_data).unwrap();
        assert!(streaks.best_download_streak.value >= 2);
    }

    #[test]
    fn listen_only_days_form_a_day_streak() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let app_data = path;
        let today = Local::now().date_naive();
        let d0 = (today - Duration::days(2))
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_local_timezone(Local)
            .single()
            .unwrap()
            .timestamp_millis();
        let d1 = (today - Duration::days(1))
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_local_timezone(Local)
            .single()
            .unwrap()
            .timestamp_millis();
        let line = |ts: i64, id: &str| {
            format!(
                r#"{{"type":"track_played","startedAt":{ts},"listenedSec":45,"identityKey":"{id}","title":"{id}"}}"#
            )
        };
        fs::write(
            listen_events_path(app_data),
            format!("{}\n{}\n", line(d0, "a"), line(d1, "b")),
        )
        .unwrap();
        let _ = ensure_rollups(path, app_data).unwrap();
        assert_eq!(local_date_at(d0).is_empty(), false);
        let streaks = compute_streaks(path, app_data).unwrap();
        assert!(
            streaks.best_day_streak.value >= 2,
            "best day streak {}, live sample {}",
            streaks.best_day_streak.value,
            streaks.best_day_streak.sample_size
        );
        assert!(streaks.current_day_streak.value >= 1);
    }
}
