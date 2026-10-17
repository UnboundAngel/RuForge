//! Threshold milestones and quiet bell notes.

use std::fs;
use std::path::Path;

use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};

use super::bests::compute_bests;
use super::rollups::{ensure_rollups, milestones_path, RollupsFile, SCHEMA_V};
use super::streaks::compute_streaks;
use super::summary::sum_days;
use super::{activity_dir, app_data_dir, now_ms, reject_remote, run_blocking};
use crate::commands::music_playlists::write_atomic;

struct MilestoneDef {
    id: &'static str,
    kind: &'static str,
    threshold: f64,
}

const MILESTONE_DEFS: &[MilestoneDef] = &[
    MilestoneDef { id: "downloads:100", kind: "downloads", threshold: 100.0 },
    MilestoneDef { id: "downloads:500", kind: "downloads", threshold: 500.0 },
    MilestoneDef { id: "downloads:1000", kind: "downloads", threshold: 1000.0 },
    MilestoneDef { id: "downloads:2500", kind: "downloads", threshold: 2500.0 },
    MilestoneDef { id: "downloads:5000", kind: "downloads", threshold: 5000.0 },
    MilestoneDef { id: "downloads:10000", kind: "downloads", threshold: 10000.0 },
    MilestoneDef { id: "data:10gb", kind: "bytes", threshold: 10.0 * 1e9 },
    MilestoneDef { id: "data:50gb", kind: "bytes", threshold: 50.0 * 1e9 },
    MilestoneDef { id: "data:100gb", kind: "bytes", threshold: 100.0 * 1e9 },
    MilestoneDef { id: "data:250gb", kind: "bytes", threshold: 250.0 * 1e9 },
    MilestoneDef { id: "data:500gb", kind: "bytes", threshold: 500.0 * 1e9 },
    MilestoneDef { id: "data:1tb", kind: "bytes", threshold: 1.0 * 1e12 },
    MilestoneDef { id: "data:2tb", kind: "bytes", threshold: 2.0 * 1e12 },
    MilestoneDef { id: "data:5tb", kind: "bytes", threshold: 5.0 * 1e12 },
    MilestoneDef { id: "watch:10h", kind: "watch_hours", threshold: 10.0 },
    MilestoneDef { id: "watch:50h", kind: "watch_hours", threshold: 50.0 },
    MilestoneDef { id: "watch:100h", kind: "watch_hours", threshold: 100.0 },
    MilestoneDef { id: "watch:250h", kind: "watch_hours", threshold: 250.0 },
    MilestoneDef { id: "watch:500h", kind: "watch_hours", threshold: 500.0 },
    MilestoneDef { id: "watch:1000h", kind: "watch_hours", threshold: 1000.0 },
    MilestoneDef { id: "listen:10h", kind: "listen_hours", threshold: 10.0 },
    MilestoneDef { id: "listen:50h", kind: "listen_hours", threshold: 50.0 },
    MilestoneDef { id: "listen:100h", kind: "listen_hours", threshold: 100.0 },
    MilestoneDef { id: "listen:250h", kind: "listen_hours", threshold: 250.0 },
    MilestoneDef { id: "listen:500h", kind: "listen_hours", threshold: 500.0 },
    MilestoneDef { id: "listen:1000h", kind: "listen_hours", threshold: 1000.0 },
    MilestoneDef { id: "streak:7", kind: "day_streak", threshold: 7.0 },
    MilestoneDef { id: "streak:30", kind: "day_streak", threshold: 30.0 },
    MilestoneDef { id: "streak:100", kind: "day_streak", threshold: 100.0 },
    MilestoneDef { id: "streak:365", kind: "day_streak", threshold: 365.0 },
    MilestoneDef { id: "playlists:10", kind: "playlists", threshold: 10.0 },
    MilestoneDef { id: "playlists:50", kind: "playlists", threshold: 50.0 },
    MilestoneDef { id: "playlists:100", kind: "playlists", threshold: 100.0 },
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneRow {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub crossed_at: i64,
    /// Record value (bytes/s or seconds); only personal-best rows carry it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    /// The record this one beat, for the comparison bars.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous: Option<f64>,
    /// What the record was about: the download title, or the binge's titles.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub titles: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MilestonesFile {
    v: i32,
    #[serde(default)]
    pub seeded: bool,
    #[serde(default)]
    pub crossed: Vec<MilestoneRow>,
    #[serde(default)]
    pub pending_notes: Vec<MilestoneRow>,
    #[serde(default)]
    last_best_fastest_note_ms: i64,
    #[serde(default)]
    last_best_binge_note_ms: i64,
    #[serde(default)]
    best_peak_bps: f64,
    #[serde(default)]
    best_binge_sec: f64,
}

pub(crate) fn load_milestones(dir: &Path) -> MilestonesFile {
    let path = milestones_path(dir);
    if !path.is_file() {
        return MilestonesFile {
            v: SCHEMA_V,
            ..Default::default()
        };
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or(MilestonesFile {
            v: SCHEMA_V,
            ..Default::default()
        })
}

fn save_milestones(dir: &Path, file: &MilestonesFile) -> Result<(), String> {
    let raw = serde_json::to_string(file).map_err(|e| e.to_string())?;
    write_atomic(&milestones_path(dir), &raw)
}

/// One formatter for every milestone subtitle.
/// `%d` zero-pads the day; strip the leading space-zero so "Oct 11" not "Oct 011".
fn reached_label(ts: i64) -> String {
    let dt = Utc
        .timestamp_millis_opt(ts)
        .single()
        .unwrap_or_else(|| Utc.timestamp_opt(0, 0).single().unwrap());
    let s = dt.format("%b %d, %Y").to_string().replace(" 0", " ");
    format!("Reached {s}")
}

fn format_int(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out.chars().rev().collect()
}

fn milestone_title(def: &MilestoneDef) -> String {
    match def.kind {
        "downloads" => format!("{} downloads", format_int(def.threshold as u64)),
        "bytes" => {
            if def.threshold >= 1e12 {
                format!("{} TB pulled", (def.threshold / 1e12) as u64)
            } else {
                format!("{} GB pulled", (def.threshold / 1e9) as u64)
            }
        }
        "watch_hours" => format!("{} watch hours", def.threshold as u64),
        "listen_hours" => format!("{} listen hours", def.threshold as u64),
        "day_streak" => format!("{}-day streak", def.threshold as u64),
        "playlists" => format!("{} playlists imported", def.threshold as u64),
        _ => def.id.to_string(),
    }
}

/// Walk sorted rollup days (not raw month files) until the cumulative total crosses.
fn cumulative_cross_ts(rollups: &RollupsFile, kind: &str, threshold: f64) -> Option<i64> {
    let mut sum = 0.0;
    for day in rollups.days.values() {
        let delta = match kind {
            "downloads" => day.downloads as f64,
            "bytes" => day.download_bytes as f64,
            "watch_hours" => day.watch_sec / 3600.0,
            "listen_hours" => day.listen_sec / 3600.0,
            "playlists" => day.playlist_imports as f64,
            _ => 0.0,
        };
        sum += delta;
        if sum >= threshold {
            return Some(if day.last_ts > 0 {
                day.last_ts
            } else {
                day.first_ts
            });
        }
    }
    None
}

pub(crate) fn evaluate_milestones_from(
    dir: &Path,
    app_data: &Path,
    rollups: &RollupsFile,
) -> bool {
    let mut file = load_milestones(dir);
    // Lifetime totals: do not clip "today" when noon UTC is still ahead of now_ms.
    let totals = sum_days(rollups, i64::MIN / 4, i64::MAX / 4);
    let streaks = compute_streaks(dir, app_data).ok();
    let bests = compute_bests(dir, app_data).ok();
    let mut new_notes = false;
    let seeded_before = file.seeded;
    let week = 7 * 24 * 60 * 60 * 1000i64;

    let mut ensure_crossed = |id: &str,
                              title: String,
                              ts: i64,
                              notify: bool,
                              value: Option<f64>,
                              previous: Option<f64>,
                              titles: Option<Vec<String>>| {
        if file.crossed.iter().any(|r| r.id == id) {
            return;
        }
        let row = MilestoneRow {
            id: id.to_string(),
            title,
            subtitle: reached_label(ts),
            crossed_at: ts,
            value,
            previous,
            titles,
        };
        file.crossed.push(row.clone());
        if notify {
            file.pending_notes.push(row);
            new_notes = true;
        }
    };

    for def in MILESTONE_DEFS {
        let current = match def.kind {
            "downloads" => totals.downloads as f64,
            "bytes" => totals.download_bytes as f64,
            "watch_hours" => totals.watch_sec / 3600.0,
            "listen_hours" => totals.listen_sec / 3600.0,
            "day_streak" => streaks
                .as_ref()
                .map(|s| s.best_day_streak.value as f64)
                .unwrap_or(0.0),
            "playlists" => totals.playlist_imports as f64,
            _ => 0.0,
        };
        if current < def.threshold {
            continue;
        }
        let ts = if def.kind == "day_streak" {
            now_ms()
        } else {
            cumulative_cross_ts(rollups, def.kind, def.threshold).unwrap_or_else(now_ms)
        };
        // Seeding swallows the backlog; any later newly-crossed id notifies.
        ensure_crossed(def.id, milestone_title(def), ts, seeded_before, None, None, None);
    }

    if let Some(bests) = bests {
        if let Some(f) = &bests.fastest_download.value {
            if f.peak_bps > file.best_peak_bps + 1.0 {
                // First live peak only sets the bar; later improvements can notify.
                if file.best_peak_bps > 0.0 {
                    let id = format!("best:fastest:{}", f.ts);
                    let notify =
                        seeded_before && now_ms() - file.last_best_fastest_note_ms >= week;
                    ensure_crossed(
                        &id,
                        "Fastest download".into(),
                        f.ts,
                        notify,
                        Some(f.peak_bps),
                        Some(file.best_peak_bps),
                        f.title.clone().map(|t| vec![t]),
                    );
                    if notify {
                        file.last_best_fastest_note_ms = now_ms();
                    }
                }
                file.best_peak_bps = f.peak_bps;
            }
        }
        if let Some(b) = &bests.longest_binge.value {
            if b.seconds > file.best_binge_sec + 1.0 {
                if file.best_binge_sec > 0.0 {
                    let id = format!("best:binge:{}", b.started_at);
                    let notify =
                        seeded_before && now_ms() - file.last_best_binge_note_ms >= week;
                    ensure_crossed(
                        &id,
                        "Longest binge".into(),
                        b.started_at,
                        notify,
                        Some(b.seconds),
                        Some(file.best_binge_sec),
                        Some(b.titles.iter().take(5).cloned().collect()),
                    );
                    if notify {
                        file.last_best_binge_note_ms = now_ms();
                    }
                }
                file.best_binge_sec = b.seconds;
            }
        }
    }

    if !seeded_before {
        file.seeded = true;
        file.pending_notes.clear();
        new_notes = false;
    }
    file.crossed.sort_by_key(|r| r.crossed_at);
    let _ = save_milestones(dir, &file);
    new_notes
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneNote {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub titles: Option<Vec<String>>,
}

#[tauri::command]
pub async fn stats_milestones(
    app: AppHandle,
    webview: WebviewWindow,
) -> Result<Vec<MilestoneRow>, String> {
    reject_remote(&webview)?;
    run_blocking(move || {
        let dir = activity_dir(&app)?;
        let app_data = app_data_dir(&app)?;
        let rollups = ensure_rollups(&dir, &app_data)?;
        let _ = evaluate_milestones_from(&dir, &app_data, &rollups);
        Ok(load_milestones(&dir).crossed)
    })
    .await
}

#[tauri::command]
pub async fn stats_take_milestone_notes(
    app: AppHandle,
    webview: WebviewWindow,
) -> Result<Vec<MilestoneNote>, String> {
    reject_remote(&webview)?;
    run_blocking(move || {
    let dir = activity_dir(&app)?;
    let mut file = load_milestones(&dir);
    let notes: Vec<MilestoneNote> = file
        .pending_notes
        .drain(..)
        .map(|r| MilestoneNote {
            id: r.id,
            title: r.title,
            subtitle: r.subtitle,
            created_at: r.crossed_at,
            value: r.value,
            previous: r.previous,
            titles: r.titles,
        })
        .collect();
    save_milestones(&dir, &file)?;
    Ok(notes)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::activity_stats::rollups::ensure_rollups;
    use crate::commands::activity_stats::test_util::{ev, finished, write_event};
    use tempfile::tempdir;

    #[test]
    fn first_milestone_seed_posts_no_notes() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        for i in 0..120 {
            write_event(
                path,
                &ev(1_700_000_000_000 + i * 1000, 0, true, finished(1_000_000, None)),
            );
        }
        let app_data = path.parent().unwrap_or(path);
        let rollups = ensure_rollups(path, app_data).unwrap();
        let ping = evaluate_milestones_from(path, app_data, &rollups);
        assert!(!ping);
        let file = load_milestones(path);
        assert!(file.seeded);
        assert!(file.pending_notes.is_empty());
        assert!(file.crossed.iter().any(|r| r.id == "downloads:100"));
    }

    #[test]
    fn crossed_five_minutes_ago_still_notifies() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let app_data = path.parent().unwrap_or(path);
        let base = now_ms() - 5 * 60_000;
        for i in 0..50 {
            write_event(path, &ev(base + i * 1000, 0, false, finished(1_000, None)));
        }
        let rollups = ensure_rollups(path, app_data).unwrap();
        assert!(!evaluate_milestones_from(path, app_data, &rollups));
        assert!(load_milestones(path).seeded);

        for i in 50..110 {
            write_event(path, &ev(base + i * 1000, 0, false, finished(1_000, None)));
        }
        let rollups = ensure_rollups(path, app_data).unwrap();
        let ping = evaluate_milestones_from(path, app_data, &rollups);
        assert!(ping);
        let file = load_milestones(path);
        assert!(file.pending_notes.iter().any(|n| n.id == "downloads:100"));
    }

    #[test]
    fn first_ever_best_does_not_notify() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let app_data = path.parent().unwrap_or(path);
        let ts = now_ms() - 1_000;
        write_event(path, &ev(ts, 0, false, finished(1_000, Some(5_000.0))));
        let rollups = ensure_rollups(path, app_data).unwrap();
        assert!(!evaluate_milestones_from(path, app_data, &rollups));
        let file = load_milestones(path);
        assert!(file.seeded);
        assert!(file.best_peak_bps > 0.0);
        assert!(file.pending_notes.is_empty());
        assert!(!file.crossed.iter().any(|r| r.id.starts_with("best:fastest:")));

        write_event(
            path,
            &ev(ts + 2_000, 0, false, finished(1_000, Some(9_000.0))),
        );
        let rollups = ensure_rollups(path, app_data).unwrap();
        let ping = evaluate_milestones_from(path, app_data, &rollups);
        assert!(ping);
        let file = load_milestones(path);
        assert!(file.pending_notes.iter().any(|n| n.title == "Fastest download"));
    }
}
