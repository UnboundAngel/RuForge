//! Per-item / channel / track / game timeline from the rollup cache.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};

use super::rollups::{ensure_rollups, NamedCount};
use super::{activity_dir, app_data_dir, reject_remote, run_blocking, StatValue};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsItemQuery {
    pub item_id: Option<String>,
    pub identity_key: Option<String>,
    pub channel: Option<String>,
    pub game_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsItemTimelinePoint {
    pub date: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsItemDetail {
    pub count: StatValue<u64>,
    pub first_ts: StatValue<Option<i64>>,
    pub last_ts: StatValue<Option<i64>>,
    pub timeline: Vec<StatsItemTimelinePoint>,
}

fn detail_from_days(
    days: &BTreeMap<String, super::rollups::DayAgg>,
    pick: impl Fn(&super::rollups::DayAgg) -> Option<&NamedCount>,
) -> StatsItemDetail {
    let mut count = 0u64;
    let mut first: Option<i64> = None;
    let mut last: Option<i64> = None;
    let mut timeline = Vec::new();
    for (date, day) in days {
        let Some(row) = pick(day) else {
            continue;
        };
        if row.count == 0 {
            continue;
        }
        count = count.saturating_add(row.count);
        if row.first_ts > 0 {
            first = Some(first.map(|f| f.min(row.first_ts)).unwrap_or(row.first_ts));
        }
        if row.last_ts > 0 {
            last = Some(last.map(|l| l.max(row.last_ts)).unwrap_or(row.last_ts));
        }
        timeline.push(StatsItemTimelinePoint {
            date: date.clone(),
            count: row.count,
        });
    }
    StatsItemDetail {
        count: StatValue::all(count, count),
        first_ts: StatValue::all(first, if first.is_some() { 1 } else { 0 }),
        last_ts: StatValue::all(last, if last.is_some() { 1 } else { 0 }),
        timeline,
    }
}

#[tauri::command]
pub async fn stats_item(
    app: AppHandle,
    webview: WebviewWindow,
    query: StatsItemQuery,
) -> Result<StatsItemDetail, String> {
    reject_remote(&webview)?;
    run_blocking(move || {
    let rollups = ensure_rollups(&activity_dir(&app)?, &app_data_dir(&app)?)?;
    if let Some(id) = query.item_id.as_deref().filter(|s| !s.is_empty()) {
        return Ok(detail_from_days(&rollups.days, |d| d.items_watch.get(id)));
    }
    if let Some(key) = query.identity_key.as_deref().filter(|s| !s.is_empty()) {
        return Ok(detail_from_days(&rollups.days, |d| d.tracks.get(key)));
    }
    if let Some(ch) = query.channel.as_deref().filter(|s| !s.is_empty()) {
        let mut dl = detail_from_days(&rollups.days, |d| d.channels_dl.get(ch));
        let watch = detail_from_days(&rollups.days, |d| d.channels_watch.get(ch));
        // Merge download + watch timelines for a channel key.
        let mut by_date: BTreeMap<String, u64> = BTreeMap::new();
        for p in dl.timeline.drain(..).chain(watch.timeline.into_iter()) {
            *by_date.entry(p.date).or_default() += p.count;
        }
        let count = dl.count.value.saturating_add(watch.count.value);
        let first = match (dl.first_ts.value, watch.first_ts.value) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        };
        let last = match (dl.last_ts.value, watch.last_ts.value) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (a, b) => a.or(b),
        };
        return Ok(StatsItemDetail {
            count: StatValue::all(count, count),
            first_ts: StatValue::all(first, if first.is_some() { 1 } else { 0 }),
            last_ts: StatValue::all(last, if last.is_some() { 1 } else { 0 }),
            timeline: by_date
                .into_iter()
                .map(|(date, c)| StatsItemTimelinePoint { date, count: c })
                .collect(),
        });
    }
    if let Some(gid) = query.game_id.as_deref().filter(|s| !s.is_empty()) {
        return Ok(detail_from_days(&rollups.days, |d| d.games.get(gid)));
    }
    Err("stats_item requires itemId, identityKey, channel, or gameId".into())
    })
    .await
}
