//! Daily rollup cache: per-month files + shared name table over JSONL + listen log.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};

use super::local_date_for;
use crate::commands::activity_log::{list_month_files, parse_month_file, ActivityBody, ActivityEvent};
use crate::commands::music_playlists::write_atomic;

pub(crate) const ROLLUPS_DIRNAME: &str = "rollups";
pub(crate) const ROLLUPS_FILENAME: &str = "rollups.json"; // legacy single-file cache
pub(crate) const MILESTONES_FILENAME: &str = "milestones.json";
const LISTEN_EVENTS_FILENAME: &str = "music-listen-events.jsonl";
const INDEX_FILENAME: &str = "index.json";
/// Bump when on-disk shape changes so stale caches rebuild.
pub(crate) const SCHEMA_V: i32 = 4;

fn map_empty<K: Ord, V>(m: &BTreeMap<K, V>) -> bool {
    m.is_empty()
}
fn is_zero_u64(n: &u64) -> bool {
    *n == 0
}
fn is_zero_i64(n: &i64) -> bool {
    *n == 0
}
fn is_zero_f64(n: &f64) -> bool {
    *n == 0.0
}
fn is_false(b: &bool) -> bool {
    !*b
}
fn is_empty_str(s: &str) -> bool {
    s.is_empty()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NamedCount {
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub count: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub bytes: u64,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub seconds: f64,
    #[serde(default, skip_serializing_if = "is_zero_i64")]
    pub first_ts: i64,
    #[serde(default, skip_serializing_if = "is_zero_i64")]
    pub last_ts: i64,
}

impl NamedCount {
    pub fn bump(&mut self, count: u64, bytes: u64, seconds: f64, ts: i64) {
        self.count = self.count.saturating_add(count);
        self.bytes = self.bytes.saturating_add(bytes);
        self.seconds += seconds.max(0.0);
        if self.first_ts == 0 || (ts > 0 && ts < self.first_ts) {
            self.first_ts = ts;
        }
        if ts > self.last_ts {
            self.last_ts = ts;
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DayAgg {
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub downloads: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub download_bytes: u64,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub download_media_sec: f64,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub watch_sec: f64,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub listen_sec: f64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub active_minutes: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub resumed_bytes: u64,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub sponsor_seconds_skipped: f64,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub speed_saved_sec: f64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub playlist_imports: u64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub live_downloads: u64,
    #[serde(default, skip_serializing_if = "is_false")]
    pub live_active: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub active: bool,
    #[serde(default, skip_serializing_if = "is_zero_i64")]
    pub first_ts: i64,
    #[serde(default, skip_serializing_if = "is_zero_i64")]
    pub last_ts: i64,
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub live_peak_bps: f64,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub live_peak_title: String,
    #[serde(default, skip_serializing_if = "is_zero_i64")]
    pub live_peak_ts: i64,
    #[serde(default, skip_serializing_if = "is_zero_u64")]
    pub largest_bytes: u64,
    #[serde(default, skip_serializing_if = "map_empty")]
    pub channels_dl: BTreeMap<String, NamedCount>,
    #[serde(default, skip_serializing_if = "map_empty")]
    pub channels_watch: BTreeMap<String, NamedCount>,
    #[serde(default, skip_serializing_if = "map_empty")]
    pub items_watch: BTreeMap<String, NamedCount>,
    #[serde(default, skip_serializing_if = "map_empty")]
    pub tracks: BTreeMap<String, NamedCount>,
    #[serde(default, skip_serializing_if = "map_empty")]
    pub artists: BTreeMap<String, NamedCount>,
    #[serde(default, skip_serializing_if = "map_empty")]
    pub games: BTreeMap<String, NamedCount>,
}

impl DayAgg {
    fn clear_listen(&mut self) {
        self.listen_sec = 0.0;
        self.tracks.clear();
        self.artists.clear();
    }

    fn is_empty(&self) -> bool {
        self == &DayAgg::default()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct MonthMeta {
    mtime_ms: i64,
    size: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct RollupsIndex {
    v: i32,
    #[serde(default)]
    names: BTreeMap<String, String>,
    #[serde(default)]
    months: BTreeMap<String, MonthMeta>,
    #[serde(default)]
    listen_mtime_ms: i64,
    #[serde(default)]
    listen_size: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct MonthFile {
    #[serde(default)]
    days: BTreeMap<String, DayAgg>,
}

/// In-memory view: all days merged + shared names.
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct RollupsFile {
    pub v: i32,
    pub names: BTreeMap<String, String>,
    months: BTreeMap<String, MonthMeta>,
    pub days: BTreeMap<String, DayAgg>,
    listen_mtime_ms: i64,
    listen_size: u64,
}

pub(crate) fn rollups_dir(dir: &Path) -> PathBuf {
    dir.join(ROLLUPS_DIRNAME)
}

pub(crate) fn milestones_path(dir: &Path) -> PathBuf {
    dir.join(MILESTONES_FILENAME)
}

pub(crate) fn listen_events_path(app_data: &Path) -> PathBuf {
    app_data.join(LISTEN_EVENTS_FILENAME)
}

fn index_path(dir: &Path) -> PathBuf {
    rollups_dir(dir).join(INDEX_FILENAME)
}

fn month_path(dir: &Path, stem: &str) -> PathBuf {
    rollups_dir(dir).join(format!("{stem}.json"))
}

fn month_stem_of_day(date: &str) -> Option<&str> {
    if date.len() >= 7 {
        Some(&date[..7])
    } else {
        None
    }
}

fn file_meta(path: &Path) -> Option<(i64, u64)> {
    let meta = fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Some((mtime, meta.len()))
}

fn note_name(names: &mut BTreeMap<String, String>, key: &str, label: &str) {
    if !label.is_empty() {
        names.insert(key.to_string(), label.to_string());
    }
}

fn touch_ts(day: &mut DayAgg, ts: i64) {
    if day.first_ts == 0 || ts < day.first_ts {
        day.first_ts = ts;
    }
    if ts > day.last_ts {
        day.last_ts = ts;
    }
}

/// Local calendar day for a past instant (offset at that moment, not "now").
pub(crate) fn local_date_at(ts: i64) -> String {
    Local
        .timestamp_millis_opt(ts)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| local_date_for(ts, 0))
}

pub(crate) fn apply_event_to_day(
    day: &mut DayAgg,
    names: &mut BTreeMap<String, String>,
    ev: &ActivityEvent,
) {
    day.active = true;
    if !ev.backfill {
        day.live_active = true;
    }
    touch_ts(day, ev.ts);
    match &ev.body {
        ActivityBody::DownloadFinished {
            bytes,
            media_duration_sec,
            resumed_bytes,
            channel_id,
            channel_name,
            title,
            peak_bps,
            ..
        } => {
            day.downloads = day.downloads.saturating_add(1);
            let b = bytes.unwrap_or(0);
            day.download_bytes = day.download_bytes.saturating_add(b);
            day.largest_bytes = day.largest_bytes.max(b);
            if let Some(s) = media_duration_sec {
                day.download_media_sec += s.max(0.0);
            }
            if let Some(r) = resumed_bytes {
                day.resumed_bytes = day.resumed_bytes.saturating_add(*r);
            }
            if !ev.backfill {
                day.live_downloads = day.live_downloads.saturating_add(1);
                if let Some(p) = peak_bps.as_ref().filter(|p| **p > day.live_peak_bps) {
                    day.live_peak_bps = *p;
                    day.live_peak_title = title.clone().unwrap_or_default();
                    day.live_peak_ts = ev.ts;
                }
            }
            let key = channel_id
                .clone()
                .or_else(|| channel_name.clone())
                .unwrap_or_else(|| "unknown".into());
            let label = channel_name.clone().unwrap_or_else(|| key.clone());
            note_name(names, &key, &label);
            day.channels_dl.entry(key).or_default().bump(
                1,
                b,
                media_duration_sec.unwrap_or(0.0).max(0.0),
                ev.ts,
            );
        }
        ActivityBody::WatchSession {
            sponsor_seconds_skipped,
            channel_name,
            item_id,
            title,
            ..
        } => {
            let (wall, media) = crate::commands::activity_log::watch_wall_and_media(ev)
                .unwrap_or((0.0, 0.0));
            day.watch_sec += wall;
            day.sponsor_seconds_skipped += sponsor_seconds_skipped.max(0.0);
            if media > wall {
                day.speed_saved_sec += media - wall;
            }
            let ch_key = channel_name.clone().unwrap_or_else(|| "unknown".into());
            note_name(names, &ch_key, &ch_key);
            day.channels_watch
                .entry(ch_key)
                .or_default()
                .bump(1, 0, wall, ev.ts);
            let item_key = item_id
                .clone()
                .or_else(|| title.clone())
                .unwrap_or_else(|| "unknown".into());
            let item_label = title.clone().unwrap_or_else(|| item_key.clone());
            note_name(names, &item_key, &item_label);
            day.items_watch
                .entry(item_key)
                .or_default()
                .bump(1, 0, wall, ev.ts);
        }
        ActivityBody::AppSessionEnd { active_minutes } => {
            day.active_minutes = day.active_minutes.saturating_add(u64::from(*active_minutes));
        }
        ActivityBody::PlaylistImported { .. } => {
            day.playlist_imports = day.playlist_imports.saturating_add(1);
        }
        ActivityBody::GameSession {
            game_id,
            game_name,
            duration_sec,
            continued,
            ..
        } => {
            note_name(names, game_id, game_name);
            day.games
                .entry(game_id.clone())
                .or_default()
                .bump(u64::from(!*continued), 0, duration_sec.max(0.0), ev.ts);
        }
        _ => {}
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListenLine {
    #[serde(rename = "type")]
    event_type: Option<String>,
    pub started_at: Option<i64>,
    ended_at: Option<i64>,
    listened_sec: Option<f64>,
    pub identity_key: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

pub(crate) fn listen_sec_of(line: &ListenLine) -> f64 {
    if let Some(s) = line.listened_sec {
        return s.max(0.0);
    }
    match (line.started_at, line.ended_at) {
        (Some(a), Some(b)) if b > a => (b - a) as f64 / 1000.0,
        _ => 0.0,
    }
}

fn parse_listen_line(t: &str) -> Option<ListenLine> {
    let row: ListenLine = serde_json::from_str(t).ok()?;
    if row.event_type.as_deref().unwrap_or("track_played") != "track_played" {
        return None;
    }
    Some(row)
}

pub(crate) fn parse_listen_lines(path: &Path) -> Vec<ListenLine> {
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    raw.lines()
        .filter_map(|line| {
            let t = line.trim();
            if t.is_empty() {
                None
            } else {
                parse_listen_line(t)
            }
        })
        .collect()
}

fn parse_listen_from_offset(path: &Path, offset: u64) -> Vec<ListenLine> {
    let Ok(mut f) = fs::File::open(path) else {
        return Vec::new();
    };
    if f.seek(SeekFrom::Start(offset)).is_err() {
        return Vec::new();
    }
    let mut raw = String::new();
    if f.read_to_string(&mut raw).is_err() {
        return Vec::new();
    }
    // Mid-line start: drop a partial first line when offset was not on a boundary.
    let body = if offset > 0 && !raw.is_empty() && !raw.starts_with('\n') {
        raw.split_once('\n').map(|(_, rest)| rest).unwrap_or("")
    } else {
        raw.trim_start_matches('\n')
    };
    body.lines()
        .filter_map(|line| {
            let t = line.trim();
            if t.is_empty() {
                None
            } else {
                parse_listen_line(t)
            }
        })
        .collect()
}

fn apply_listen_to_day(
    day: &mut DayAgg,
    names: &mut BTreeMap<String, String>,
    line: &ListenLine,
    started: i64,
    sec: f64,
) {
    day.listen_sec += sec;
    day.active = true;
    day.live_active = true;
    touch_ts(day, started);
    let track_key = line
        .identity_key
        .clone()
        .or_else(|| line.path.clone())
        .unwrap_or_else(|| "unknown".into());
    let track_label = line.title.clone().unwrap_or_else(|| track_key.clone());
    note_name(names, &track_key, &track_label);
    day.tracks
        .entry(track_key)
        .or_default()
        .bump(1, 0, sec, started);
    let artist = line.artist.clone().unwrap_or_else(|| "unknown".into());
    note_name(names, &artist, &artist);
    day.artists
        .entry(artist)
        .or_default()
        .bump(1, 0, sec, started);
}

fn load_index(dir: &Path) -> RollupsIndex {
    let path = index_path(dir);
    if !path.is_file() {
        return RollupsIndex {
            v: SCHEMA_V,
            ..Default::default()
        };
    }
    match fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<RollupsIndex>(&raw).ok())
    {
        Some(f) if f.v == SCHEMA_V => f,
        _ => RollupsIndex {
            v: SCHEMA_V,
            ..Default::default()
        },
    }
}

fn load_month_days(dir: &Path, stem: &str) -> BTreeMap<String, DayAgg> {
    let path = month_path(dir, stem);
    if !path.is_file() {
        return BTreeMap::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<MonthFile>(&raw).ok())
        .map(|m| m.days)
        .unwrap_or_default()
}

fn save_index(dir: &Path, index: &RollupsIndex) -> Result<(), String> {
    fs::create_dir_all(rollups_dir(dir)).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string(index).map_err(|e| e.to_string())?;
    write_atomic(&index_path(dir), &raw)
}

fn save_month(dir: &Path, stem: &str, days: &BTreeMap<String, DayAgg>) -> Result<(), String> {
    fs::create_dir_all(rollups_dir(dir)).map_err(|e| e.to_string())?;
    let path = month_path(dir, stem);
    if days.is_empty() {
        if path.is_file() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let raw = serde_json::to_string(&MonthFile {
        days: days.clone(),
    })
    .map_err(|e| e.to_string())?;
    write_atomic(&path, &raw)
}

fn days_for_month<'a>(
    days: &'a BTreeMap<String, DayAgg>,
    stem: &str,
) -> BTreeMap<String, DayAgg> {
    let prefix = format!("{stem}-");
    days.iter()
        .filter(|(d, _)| d.starts_with(&prefix))
        .map(|(d, v)| (d.clone(), v.clone()))
        .collect()
}

fn apply_listen_lines(
    file: &mut RollupsFile,
    lines: &[ListenLine],
    dirty_months: &mut BTreeSet<String>,
) {
    for line in lines {
        let Some(started) = line.started_at else {
            continue;
        };
        let sec = listen_sec_of(line);
        if sec <= 0.0 {
            continue;
        }
        let day_key = local_date_at(started);
        if let Some(stem) = month_stem_of_day(&day_key) {
            dirty_months.insert(stem.to_string());
        }
        apply_listen_to_day(
            file.days.entry(day_key).or_default(),
            &mut file.names,
            line,
            started,
            sec,
        );
    }
}

fn clear_all_listen(file: &mut RollupsFile, dirty_months: &mut BTreeSet<String>) {
    let keys: Vec<String> = file.days.keys().cloned().collect();
    for k in keys {
        if let Some(stem) = month_stem_of_day(&k) {
            dirty_months.insert(stem.to_string());
        }
        if let Some(day) = file.days.get_mut(&k) {
            day.clear_listen();
            if day.is_empty() {
                file.days.remove(&k);
            }
        }
    }
}

pub(crate) fn ensure_rollups(dir: &Path, app_data: &Path) -> Result<RollupsFile, String> {
    // Drop legacy monolith if present so size reports reflect the new layout.
    let legacy = dir.join(ROLLUPS_FILENAME);
    if legacy.is_file() {
        let _ = fs::remove_file(&legacy);
    }

    let index = load_index(dir);
    let mut file = RollupsFile {
        v: SCHEMA_V,
        names: index.names,
        months: index.months.clone(),
        days: BTreeMap::new(),
        listen_mtime_ms: index.listen_mtime_ms,
        listen_size: index.listen_size,
    };
    for stem in index.months.keys() {
        for (d, agg) in load_month_days(dir, stem) {
            file.days.insert(d, agg);
        }
    }
    // Listen-only month files may exist without an activity meta entry.
    if let Ok(entries) = fs::read_dir(rollups_dir(dir)) {
        for ent in entries.flatten() {
            let name = ent.file_name();
            let Some(s) = name.to_str() else {
                continue;
            };
            if !s.ends_with(".json") || s == INDEX_FILENAME {
                continue;
            }
            let stem = s.trim_end_matches(".json");
            if index.months.contains_key(stem) {
                continue;
            }
            for (d, agg) in load_month_days(dir, stem) {
                file.days.entry(d).or_insert(agg);
            }
        }
    }

    let mut dirty_months: BTreeSet<String> = BTreeSet::new();
    let mut months_dirty = false;
    let month_files = list_month_files(dir);
    let mut keep_months = BTreeMap::new();

    for path in &month_files {
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let Some((mtime, size)) = file_meta(path) else {
            continue;
        };
        let unchanged = file
            .months
            .get(stem)
            .is_some_and(|m| m.mtime_ms == mtime && m.size == size);
        if unchanged {
            keep_months.insert(stem.to_string(), MonthMeta { mtime_ms: mtime, size });
            continue;
        }
        months_dirty = true;
        dirty_months.insert(stem.to_string());
        let prefix = format!("{stem}-");
        file.days.retain(|d, _| !d.starts_with(&prefix));
        for ev in parse_month_file(path) {
            let day = local_date_for(ev.ts, ev.tz);
            apply_event_to_day(file.days.entry(day).or_default(), &mut file.names, &ev);
        }
        keep_months.insert(stem.to_string(), MonthMeta { mtime_ms: mtime, size });
    }

    if file.months.keys().any(|k| !keep_months.contains_key(k)) {
        months_dirty = true;
        let gone: Vec<String> = file
            .months
            .keys()
            .filter(|k| !keep_months.contains_key(*k))
            .cloned()
            .collect();
        for m in gone {
            dirty_months.insert(m.clone());
            let prefix = format!("{m}-");
            file.days.retain(|d, _| !d.starts_with(&prefix));
            let _ = fs::remove_file(month_path(dir, &m));
        }
    }
    file.months = keep_months;

    let listen_path = listen_events_path(app_data);
    let (lm, ls) = file_meta(&listen_path).unwrap_or((0, 0));
    let listen_grew = ls > file.listen_size;
    let listen_shrank = ls < file.listen_size;
    let listen_touched = file.listen_mtime_ms != lm || file.listen_size != ls;

    if months_dirty || listen_shrank || (file.listen_size == 0 && ls > 0) {
        clear_all_listen(&mut file, &mut dirty_months);
        apply_listen_lines(&mut file, &parse_listen_lines(&listen_path), &mut dirty_months);
        file.listen_mtime_ms = lm;
        file.listen_size = ls;
    } else if listen_grew {
        let from = file.listen_size;
        let lines = parse_listen_from_offset(&listen_path, from);
        apply_listen_lines(&mut file, &lines, &mut dirty_months);
        file.listen_mtime_ms = lm;
        file.listen_size = ls;
    } else if listen_touched {
        // Same size, mtime churn: nothing to re-read.
        file.listen_mtime_ms = lm;
    }

    let index_dirty = months_dirty || listen_touched || !dirty_months.is_empty();
    if index_dirty {
        // Also rewrite any listen-only month whose days are present but not yet dirty-tracked.
        for d in file.days.keys() {
            if let Some(s) = month_stem_of_day(d) {
                if !file.months.contains_key(s) {
                    dirty_months.insert(s.to_string());
                }
            }
        }
        for stem in &dirty_months {
            save_month(dir, stem, &days_for_month(&file.days, stem))?;
        }
        save_index(
            dir,
            &RollupsIndex {
                v: SCHEMA_V,
                names: file.names.clone(),
                months: file.months.clone(),
                listen_mtime_ms: file.listen_mtime_ms,
                listen_size: file.listen_size,
            },
        )?;
    }
    file.v = SCHEMA_V;
    Ok(file)
}

pub(crate) fn clear_rollups_cache(dir: &Path) -> Result<(), String> {
    let legacy = dir.join(ROLLUPS_FILENAME);
    if legacy.is_file() {
        fs::remove_file(&legacy).map_err(|e| e.to_string())?;
    }
    let rd = rollups_dir(dir);
    if rd.is_dir() {
        fs::remove_dir_all(&rd).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::activity_stats::test_util::{ev, finished, write_event};
    use chrono::Utc;
    use tempfile::tempdir;

    #[test]
    fn tz_change_mid_month_splits_days() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let ts = 1_705_278_600_000i64;
        write_event(path, &ev(ts, 0, false, finished(100, None)));
        write_event(path, &ev(ts, -120, false, finished(100, None)));
        let app_data = path.parent().unwrap_or(path);
        let rollups = ensure_rollups(path, app_data).unwrap();
        assert!(rollups.days.contains_key("2024-01-15") && rollups.days.contains_key("2024-01-14"));
    }

    #[test]
    fn rollups_rebuild_identical() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        write_event(path, &ev(1_700_000_000_000, 0, false, finished(500, Some(10.0))));
        write_event(path, &ev(1_700_000_100_000, 0, true, finished(700, None)));
        let app_data = path.parent().unwrap_or(path);
        let a = ensure_rollups(path, app_data).unwrap();
        clear_rollups_cache(path).unwrap();
        assert_eq!(a.days, ensure_rollups(path, app_data).unwrap().days);
    }

    #[test]
    fn watch_1_5x_wall_media_and_saved() {
        use crate::commands::activity_log::{ActivityBody, WatchEndReason, WatchSurface};
        let dir = tempdir().unwrap();
        let path = dir.path();
        let body = ActivityBody::WatchSession {
            item_id: Some("v".into()),
            title: Some("T".into()),
            channel_name: Some("Ch".into()),
            started_at: 1_700_000_000_000,
            seconds_watched: 400.0,
            media_seconds_watched: 600.0,
            media_duration_sec: Some(600.0),
            completed: true,
            effective_speed: 1.5,
            surface: WatchSurface::Main,
            end_reason: WatchEndReason::Closed,
            sponsor_skips: 0,
            sponsor_seconds_skipped: 0.0,
        };
        write_event(path, &ev(1_700_000_400_000, 0, false, body));
        let app_data = path.parent().unwrap_or(path);
        let rollups = ensure_rollups(path, app_data).unwrap();
        let day = rollups.days.values().next().expect("day");
        assert!((day.watch_sec - 400.0).abs() < 0.01, "watch_sec={}", day.watch_sec);
        assert!(
            (day.speed_saved_sec - 200.0).abs() < 0.01,
            "speed_saved={}",
            day.speed_saved_sec
        );

        // v1 row: secondsWatched was media; same wall/media/saved after conversion.
        clear_rollups_cache(path).unwrap();
        let v1 = r#"{"v":1,"id":"old","ts":1700000400000,"tz":0,"kind":"watch_session","itemId":"v","title":"T","channelName":"Ch","startedAt":1700000000000,"secondsWatched":600,"mediaDurationSec":600,"completed":true,"effectiveSpeed":1.5,"surface":"main","endReason":"closed","sponsorSkips":0,"sponsorSecondsSkipped":0}"#;
        let month = path.join("2023-11.jsonl");
        fs::write(&month, format!("{v1}\n")).unwrap();
        let rollups = ensure_rollups(path, app_data).unwrap();
        let day = rollups.days.values().next().expect("v1 day");
        assert!((day.watch_sec - 400.0).abs() < 0.01, "v1 watch_sec={}", day.watch_sec);
        assert!(
            (day.speed_saved_sec - 200.0).abs() < 0.01,
            "v1 speed_saved={}",
            day.speed_saved_sec
        );
    }

    #[test]
    fn july_and_december_plays_keep_own_offsets() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let app_data = path;
        let listen = listen_events_path(app_data);
        let july = Utc
            .with_ymd_and_hms(2024, 7, 15, 4, 0, 0)
            .single()
            .unwrap()
            .timestamp_millis();
        let dec = Utc
            .with_ymd_and_hms(2024, 12, 15, 4, 0, 0)
            .single()
            .unwrap()
            .timestamp_millis();
        let line = |ts: i64, id: &str| {
            format!(
                r#"{{"type":"track_played","startedAt":{ts},"listenedSec":30,"identityKey":"{id}","title":"{id}"}}"#
            )
        };
        fs::write(&listen, format!("{}\n{}\n", line(july, "j"), line(dec, "d"))).unwrap();
        let expected_july = local_date_at(july);
        let expected_dec = local_date_at(dec);
        let a = ensure_rollups(path, app_data).unwrap();
        assert!(a.days.contains_key(&expected_july), "july -> {expected_july}");
        assert!(a.days.contains_key(&expected_dec), "dec -> {expected_dec}");
        clear_rollups_cache(path).unwrap();
        let b = ensure_rollups(path, app_data).unwrap();
        assert_eq!(
            a.days.get(&expected_july).map(|d| d.listen_sec),
            b.days.get(&expected_july).map(|d| d.listen_sec)
        );
        assert_eq!(
            a.days.get(&expected_dec).map(|d| d.listen_sec),
            b.days.get(&expected_dec).map(|d| d.listen_sec)
        );
    }
}
