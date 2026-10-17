//! Personal bests: peaks/largest from rollups; binge still stitches raw watch sessions.

use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

use super::rollups::ensure_rollups;
use super::{activity_dir, app_data_dir, reject_remote, run_blocking, StatValue};
use crate::commands::activity_log::{list_month_files, parse_month_file, ActivityBody};

const BINGE_GAP_MS: i64 = 10 * 60 * 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FastestDownload {
    pub peak_bps: f64,
    pub title: Option<String>,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiggestDay {
    pub date: String,
    pub downloads: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LongestBinge {
    pub seconds: f64,
    pub started_at: i64,
    pub ended_at: i64,
    pub titles: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsBests {
    pub fastest_download: StatValue<Option<FastestDownload>>,
    pub biggest_download_day: StatValue<Option<BiggestDay>>,
    pub longest_binge: StatValue<Option<LongestBinge>>,
    pub longest_game_session: StatValue<Option<f64>>,
    pub most_plays_one_track_day: StatValue<Option<u64>>,
    pub largest_file: StatValue<Option<u64>>,
}

pub(crate) fn longest_binge(dir: &Path) -> Option<LongestBinge> {
    let mut sessions: Vec<(i64, i64, f64, Option<String>)> = Vec::new();
    for path in list_month_files(dir) {
        for ev in parse_month_file(&path) {
            let ActivityBody::WatchSession {
                started_at,
                title,
                ..
            } = &ev.body
            else {
                continue;
            };
            let Some((wall, _)) = crate::commands::activity_log::watch_wall_and_media(&ev) else {
                continue;
            };
            let end = started_at + (wall * 1000.0) as i64;
            sessions.push((*started_at, end, wall, title.clone()));
        }
    }
    sessions.sort_by_key(|s| s.0);
    if sessions.is_empty() {
        return None;
    }
    let mut best: Option<LongestBinge> = None;
    let mut run_start = sessions[0].0;
    let mut run_end = sessions[0].1;
    let mut run_sec = sessions[0].2.max(0.0);
    let mut titles: Vec<String> = sessions[0].3.clone().into_iter().collect();
    for w in sessions.windows(2) {
        let prev_end = w[0].1;
        let next = &w[1];
        if next.0 - prev_end <= BINGE_GAP_MS {
            run_end = run_end.max(next.1);
            run_sec += next.2.max(0.0);
            if let Some(t) = &next.3 {
                if !titles.iter().any(|x| x == t) {
                    titles.push(t.clone());
                }
            }
        } else {
            let cand = LongestBinge {
                seconds: run_sec,
                started_at: run_start,
                ended_at: run_end,
                titles: titles.clone(),
            };
            if best.as_ref().map(|b| b.seconds).unwrap_or(0.0) < cand.seconds {
                best = Some(cand);
            }
            run_start = next.0;
            run_end = next.1;
            run_sec = next.2.max(0.0);
            titles = next.3.clone().into_iter().collect();
        }
    }
    let cand = LongestBinge {
        seconds: run_sec,
        started_at: run_start,
        ended_at: run_end,
        titles,
    };
    if best.as_ref().map(|b| b.seconds).unwrap_or(0.0) < cand.seconds {
        best = Some(cand);
    }
    best
}

pub(crate) fn compute_bests(dir: &Path, app_data: &Path) -> Result<StatsBests, String> {
    let rollups = ensure_rollups(dir, app_data)?;
    let mut fastest: Option<FastestDownload> = None;
    let mut largest = 0u64;
    let mut live_n = 0u64;
    let mut longest_game = 0.0f64;
    let mut most_plays = 0u64;
    let mut play_day: HashMap<(String, String), u64> = HashMap::new();

    for (date, day) in &rollups.days {
        largest = largest.max(day.largest_bytes);
        live_n = live_n.saturating_add(day.live_downloads);
        if day.live_peak_bps > 0.0 {
            let better = fastest.as_ref().map(|f| f.peak_bps).unwrap_or(0.0) < day.live_peak_bps;
            if better {
                fastest = Some(FastestDownload {
                    peak_bps: day.live_peak_bps,
                    title: if day.live_peak_title.is_empty() {
                        None
                    } else {
                        Some(day.live_peak_title.clone())
                    },
                    ts: day.live_peak_ts,
                });
            }
        }
        for g in day.games.values() {
            longest_game = longest_game.max(g.seconds);
        }
        for (key, track) in &day.tracks {
            let e = play_day.entry((date.clone(), key.clone())).or_insert(0);
            *e = e.saturating_add(track.count);
            most_plays = most_plays.max(*e);
        }
    }

    let biggest = rollups
        .days
        .iter()
        .max_by_key(|(_, d)| d.downloads)
        .map(|(date, d)| BiggestDay {
            date: date.clone(),
            downloads: d.downloads,
        });

    Ok(StatsBests {
        fastest_download: StatValue::live(fastest, live_n),
        biggest_download_day: StatValue::all(biggest, rollups.days.len() as u64),
        longest_binge: StatValue::all(longest_binge(dir), 1),
        longest_game_session: StatValue::all(
            if longest_game > 0.0 {
                Some(longest_game)
            } else {
                None
            },
            1,
        ),
        most_plays_one_track_day: StatValue::all(
            if most_plays > 0 { Some(most_plays) } else { None },
            most_plays,
        ),
        largest_file: StatValue::all(if largest > 0 { Some(largest) } else { None }, 1),
    })
}

#[tauri::command]
pub async fn stats_bests(app: AppHandle, webview: WebviewWindow) -> Result<StatsBests, String> {
    reject_remote(&webview)?;
    run_blocking(move || compute_bests(&activity_dir(&app)?, &app_data_dir(&app)?)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::activity_log::{WatchEndReason, WatchSurface};
    use crate::commands::activity_stats::test_util::{ev, finished, write_event};
    use tempfile::tempdir;

    #[test]
    fn backfill_excluded_from_live_peak() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        write_event(path, &ev(1_700_000_100_000, 0, true, finished(100, Some(9_999.0))));
        write_event(path, &ev(1_700_000_200_000, 0, false, finished(100, Some(100.0))));
        let app_data = path.parent().unwrap_or(path);
        let bests = compute_bests(path, app_data).unwrap();
        assert!(bests.fastest_download.live_only);
        assert_eq!(
            bests.fastest_download.value.as_ref().map(|f| f.peak_bps),
            Some(100.0)
        );
    }

    #[test]
    fn binge_stitches_gaps_under_10_min() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let start = 1_700_100_000_000i64;
        let body = |id: &str, title: &str, started: i64| ActivityBody::WatchSession {
            item_id: Some(id.into()),
            title: Some(title.into()),
            channel_name: None,
            started_at: started,
            seconds_watched: 300.0,
            media_seconds_watched: 300.0,
            media_duration_sec: Some(300.0),
            completed: true,
            effective_speed: 1.0,
            surface: WatchSurface::Main,
            end_reason: WatchEndReason::Completed,
            sponsor_skips: 0,
            sponsor_seconds_skipped: 0.0,
        };
        write_event(path, &ev(start + 60_000, 0, false, body("a", "A", start)));
        let start2 = start + 300_000 + 60_000;
        write_event(path, &ev(start2 + 60_000, 0, false, body("b", "B", start2)));
        let binge = longest_binge(path).unwrap();
        assert!(binge.seconds >= 600.0);
        assert_eq!(binge.titles.len(), 2);
    }
}
