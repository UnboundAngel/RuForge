//! Period summary totals from the rollup cache.

use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

use super::rollups::{ensure_rollups, DayAgg, RollupsFile};
use super::{
    run_blocking,
    activity_dir, app_data_dir, day_in_range, previous_range, reject_remote, resolve_range,
    StatValue, StatsRange,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AreaTotals {
    pub downloads: StatValue<u64>,
    pub download_bytes: StatValue<u64>,
    pub download_media_sec: StatValue<f64>,
    pub watch_sec: StatValue<f64>,
    pub listen_sec: StatValue<f64>,
    pub active_minutes: StatValue<u64>,
    pub resumed_bytes: StatValue<u64>,
    pub sponsor_seconds_skipped: StatValue<f64>,
    pub speed_saved_sec: StatValue<f64>,
    pub playlist_imports: StatValue<u64>,
    pub game_sec: StatValue<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSummary {
    pub current: AreaTotals,
    pub previous: AreaTotals,
}

pub(crate) fn sum_days(rollups: &RollupsFile, from: i64, to: i64) -> DayAgg {
    let mut out = DayAgg::default();
    for (date, day) in &rollups.days {
        if !day_in_range(date, from, to) {
            continue;
        }
        out.downloads = out.downloads.saturating_add(day.downloads);
        out.download_bytes = out.download_bytes.saturating_add(day.download_bytes);
        out.download_media_sec += day.download_media_sec;
        out.watch_sec += day.watch_sec;
        out.listen_sec += day.listen_sec;
        out.active_minutes = out.active_minutes.saturating_add(day.active_minutes);
        out.resumed_bytes = out.resumed_bytes.saturating_add(day.resumed_bytes);
        out.sponsor_seconds_skipped += day.sponsor_seconds_skipped;
        out.speed_saved_sec += day.speed_saved_sec;
        out.playlist_imports = out.playlist_imports.saturating_add(day.playlist_imports);
        out.live_downloads = out.live_downloads.saturating_add(day.live_downloads);
        out.live_active = out.live_active || day.live_active;
        out.active = out.active || day.active;
        for (k, v) in &day.games {
            out.games
                .entry(k.clone())
                .or_default()
                .bump(v.count, v.bytes, v.seconds, v.last_ts);
        }
    }
    out
}

fn game_sec(agg: &DayAgg) -> f64 {
    agg.games.values().map(|g| g.seconds).sum()
}

fn area_from_agg(agg: &DayAgg) -> AreaTotals {
    let n = agg.downloads;
    AreaTotals {
        downloads: StatValue::all(agg.downloads, n),
        download_bytes: StatValue::all(agg.download_bytes, n),
        download_media_sec: StatValue::all(agg.download_media_sec, n),
        watch_sec: StatValue::all(agg.watch_sec, 1),
        listen_sec: StatValue::all(agg.listen_sec, 1),
        active_minutes: StatValue::all(agg.active_minutes, 1),
        resumed_bytes: StatValue::live(agg.resumed_bytes, agg.live_downloads),
        sponsor_seconds_skipped: StatValue::all(agg.sponsor_seconds_skipped, 1),
        speed_saved_sec: StatValue::live(agg.speed_saved_sec, 1),
        playlist_imports: StatValue::all(agg.playlist_imports, agg.playlist_imports),
        game_sec: StatValue::all(game_sec(agg), 1),
    }
}

pub(crate) fn compute_summary(
    dir: &Path,
    app_data: &Path,
    range: &StatsRange,
) -> Result<StatsSummary, String> {
    let rollups = ensure_rollups(dir, app_data)?;
    let cur = resolve_range(range)?;
    let prev = previous_range(cur);
    Ok(StatsSummary {
        current: area_from_agg(&sum_days(&rollups, cur.from, cur.to)),
        previous: area_from_agg(&sum_days(&rollups, prev.from, prev.to)),
    })
}

#[tauri::command]
pub async fn stats_summary(
    app: AppHandle,
    webview: WebviewWindow,
    range: StatsRange,
) -> Result<StatsSummary, String> {
    reject_remote(&webview)?;
    run_blocking(move || compute_summary(&activity_dir(&app)?, &app_data_dir(&app)?, &range)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::activity_stats::test_util::{ev, finished, write_event};
    use tempfile::tempdir;

    #[test]
    fn summary_all_warm_under_100ms_on_50k() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let base = 1_700_000_000_000i64;
        for i in 0..50_000i64 {
            write_event(
                path,
                &ev(base + i * 60_000, 0, i % 10 == 0, finished(1000, Some(100.0))),
            );
        }
        let app_data = path.parent().unwrap_or(path);
        let _ = ensure_rollups(path, app_data).unwrap();
        let start = std::time::Instant::now();
        let _ = compute_summary(path, app_data, &StatsRange::Named("all".into())).unwrap();
        let ms = start.elapsed().as_millis();
        eprintln!("stats_summary(all) warm: {ms}ms");
        assert!(ms < 100, "stats_summary(all) took {ms}ms");
    }
}
