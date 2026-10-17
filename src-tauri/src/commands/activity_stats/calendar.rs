//! Calendar grid and hour-by-weekday clock.

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

use super::rollups::ensure_rollups;
use super::{
    run_blocking,
    activity_dir, app_data_dir, local_parts, reject_remote, resolve_range, StatValue, StatsRange,
};
use crate::commands::activity_log::{list_month_files, parse_month_file, ActivityBody};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDay {
    pub date: String,
    pub downloads: StatValue<u64>,
    pub watch_sec: StatValue<f64>,
    pub listen_sec: StatValue<f64>,
    pub active_minutes: StatValue<u64>,
}

#[tauri::command]
pub async fn stats_calendar(
    app: AppHandle,
    webview: WebviewWindow,
    year: i32,
) -> Result<Vec<CalendarDay>, String> {
    reject_remote(&webview)?;
    run_blocking(move || {
    let dir = activity_dir(&app)?;
    let app_data = app_data_dir(&app)?;
    let rollups = ensure_rollups(&dir, &app_data)?;
    let prefix = format!("{year:04}-");
    let mut out: Vec<CalendarDay> = rollups
        .days
        .iter()
        .filter(|(d, _)| d.starts_with(&prefix))
        .map(|(date, day)| CalendarDay {
            date: date.clone(),
            downloads: StatValue::all(day.downloads, day.downloads),
            watch_sec: StatValue::all(day.watch_sec, 1),
            listen_sec: StatValue::all(day.listen_sec, 1),
            active_minutes: StatValue::all(day.active_minutes, 1),
        })
        .collect();
    out.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(out)
    })
    .await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockMatrix {
    pub cells: Vec<Vec<StatValue<f64>>>,
}

fn empty_clock() -> Vec<Vec<StatValue<f64>>> {
    (0..7)
        .map(|_| (0..24).map(|_| StatValue::all(0.0, 0)).collect())
        .collect()
}

#[tauri::command]
pub async fn stats_clock(
    app: AppHandle,
    webview: WebviewWindow,
    area: String,
    range: StatsRange,
) -> Result<ClockMatrix, String> {
    reject_remote(&webview)?;
    run_blocking(move || {
    let dir = activity_dir(&app)?;
    let app_data = app_data_dir(&app)?;
    let r = resolve_range(&range)?;
    let _ = ensure_rollups(&dir, &app_data)?;
    let mut cells = empty_clock();
    match area.as_str() {
        "downloads" | "watching" => {
            for path in list_month_files(&dir) {
                for ev in parse_month_file(&path) {
                    if ev.ts < r.from || ev.ts > r.to {
                        continue;
                    }
                    let add = match (&area[..], &ev.body) {
                        ("downloads", ActivityBody::DownloadFinished { .. }) => 1.0,
                        ("watching", ActivityBody::WatchSession { .. }) => {
                            crate::commands::activity_log::watch_wall_and_media(&ev)
                                .map(|(wall, _)| wall)
                                .unwrap_or(0.0)
                        }
                        _ => continue,
                    };
                    let (wd, h) = local_parts(ev.ts, ev.tz);
                    let cell = &mut cells[wd as usize][h as usize];
                    cell.value += add;
                    cell.sample_size = cell.sample_size.saturating_add(1);
                }
            }
        }
        "music" => {
            use super::rollups::{listen_sec_of, parse_listen_lines, listen_events_path};
            use chrono::Local;
            let tz = Local::now().offset().local_minus_utc() / 60;
            for line in parse_listen_lines(&listen_events_path(&app_data)) {
                let Some(started) = line.started_at else {
                    continue;
                };
                if started < r.from || started > r.to {
                    continue;
                }
                let (wd, h) = local_parts(started, tz);
                let cell = &mut cells[wd as usize][h as usize];
                cell.value += listen_sec_of(&line);
                cell.sample_size = cell.sample_size.saturating_add(1);
            }
        }
        other => return Err(format!("unknown clock area: {other}")),
    }
    Ok(ClockMatrix { cells })
    })
    .await
}
