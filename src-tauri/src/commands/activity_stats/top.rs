//! Top lists from the rollup cache (no raw month rescans).

use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

use super::rollups::{ensure_rollups, NamedCount, RollupsFile};
use super::{
    run_blocking,
    activity_dir, app_data_dir, day_in_range, reject_remote, resolve_range, StatValue, StatsRange,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopRow {
    pub key: String,
    pub label: String,
    pub count: StatValue<u64>,
    pub bytes: Option<StatValue<u64>>,
    pub seconds: Option<StatValue<f64>>,
}

fn merge_maps(
    into: &mut BTreeMap<String, NamedCount>,
    from: &BTreeMap<String, NamedCount>,
) {
    for (k, v) in from {
        into.entry(k.clone())
            .or_default()
            .bump(v.count, v.bytes, v.seconds, v.last_ts);
    }
}

fn collect_maps(
    rollups: &RollupsFile,
    from: i64,
    to: i64,
    pick: fn(&super::rollups::DayAgg) -> &BTreeMap<String, NamedCount>,
) -> BTreeMap<String, NamedCount> {
    let mut out = BTreeMap::new();
    for (date, day) in &rollups.days {
        if !day_in_range(date, from, to) {
            continue;
        }
        merge_maps(&mut out, pick(day));
    }
    out
}

fn resolve_label(names: &BTreeMap<String, String>, key: &str) -> String {
    names.get(key).cloned().unwrap_or_else(|| key.to_string())
}

fn rows_by_count(
    names: &BTreeMap<String, String>,
    map: BTreeMap<String, NamedCount>,
    limit: usize,
    with_bytes: bool,
) -> Vec<TopRow> {
    let mut rows: Vec<_> = map
        .into_iter()
        .map(|(key, v)| TopRow {
            label: resolve_label(names, &key),
            key,
            count: StatValue::all(v.count, v.count),
            bytes: if with_bytes {
                Some(StatValue::all(v.bytes, v.count))
            } else {
                None
            },
            seconds: Some(StatValue::all(v.seconds, v.count)),
        })
        .collect();
    rows.sort_by(|a, b| b.count.value.cmp(&a.count.value));
    rows.truncate(limit.max(1));
    rows
}

fn rows_by_seconds(
    names: &BTreeMap<String, String>,
    map: BTreeMap<String, NamedCount>,
    limit: usize,
) -> Vec<TopRow> {
    let mut rows: Vec<_> = map
        .into_iter()
        .map(|(key, v)| TopRow {
            label: resolve_label(names, &key),
            key,
            count: StatValue::all(v.count, v.count),
            bytes: None,
            seconds: Some(StatValue::all(v.seconds, v.count)),
        })
        .collect();
    rows.sort_by(|a, b| {
        b.seconds
            .as_ref()
            .map(|s| s.value)
            .partial_cmp(&a.seconds.as_ref().map(|s| s.value))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    rows.truncate(limit.max(1));
    rows
}

fn top_from_rollups(
    dir: &Path,
    app_data: &Path,
    area: &str,
    metric: &str,
    from: i64,
    to: i64,
    limit: usize,
) -> Result<Vec<TopRow>, String> {
    let rollups = ensure_rollups(dir, app_data)?;
    Ok(match (area, metric) {
        ("downloads", "channel") | ("downloads", "channels") => rows_by_count(
            &rollups.names,
            collect_maps(&rollups, from, to, |d| &d.channels_dl),
            limit,
            true,
        ),
        ("watching", "channel") | ("watching", "channels") => rows_by_seconds(
            &rollups.names,
            collect_maps(&rollups, from, to, |d| &d.channels_watch),
            limit,
        ),
        ("watching", "rewatch") | ("watching", "rewatched") => rows_by_count(
            &rollups.names,
            collect_maps(&rollups, from, to, |d| &d.items_watch),
            limit,
            false,
        ),
        ("music", "track") | ("music", "tracks") => rows_by_count(
            &rollups.names,
            collect_maps(&rollups, from, to, |d| &d.tracks),
            limit,
            false,
        ),
        ("music", "artist") | ("music", "artists") => rows_by_count(
            &rollups.names,
            collect_maps(&rollups, from, to, |d| &d.artists),
            limit,
            false,
        ),
        ("games", "hours") | ("games", "game") => rows_by_seconds(
            &rollups.names,
            collect_maps(&rollups, from, to, |d| &d.games),
            limit,
        ),
        _ => return Err(format!("unknown area/metric: {area}/{metric}")),
    })
}

#[tauri::command]
pub async fn stats_top(
    app: AppHandle,
    webview: WebviewWindow,
    area: String,
    metric: String,
    range: StatsRange,
    limit: Option<u32>,
) -> Result<Vec<TopRow>, String> {
    reject_remote(&webview)?;
    let r = resolve_range(&range)?;
    run_blocking(move || {
        top_from_rollups(
            &activity_dir(&app)?,
            &app_data_dir(&app)?,
            &area,
            &metric,
            r.from,
            r.to,
            limit.unwrap_or(10) as usize,
        )
    })
    .await
}
