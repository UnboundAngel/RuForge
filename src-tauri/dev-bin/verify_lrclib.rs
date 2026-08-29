//! Live LRCLIB match smoke + library distribution report.
//!
//! ```text
//! cargo run -p ruforge --features dev-verify-bins --bin verify_lrclib
//! cargo run -p ruforge --features dev-verify-bins --bin verify_lrclib -- library <root> [N]
//! cargo run -p ruforge --features dev-verify-bins --bin verify_lrclib -- library <root> [N] --write
//! ```
//!
//! Library mode defaults to dry-run (full match chain, no sidecar writes).
//! Pass `--write` to persist `.lyrics.json`.

use std::collections::BTreeMap;

use ruforge_lib::commands::lyrics::{
    collect_library_audio_limited, ensure_lyrics_for_path_with_write, fetch_lyrics_for_queries,
    probe_canonical_identity, probe_duration, verify_no_duration_search_guard,
    verify_no_duration_search_miss_when_no_agree, LyricsQuery,
};

#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    match args.first().map(String::as_str) {
        None => run_smoke().await,
        Some("library") => {
            args.remove(0);
            let write = take_flag(&mut args, "--write");
            let _ = take_flag(&mut args, "--dry-run");
            let root = args
                .first()
                .cloned()
                .expect("usage: verify_lrclib library <root> [N] [--write]");
            let limit: Option<usize> = args.get(1).and_then(|s| s.parse().ok());
            run_library_report(&root, limit, write).await;
        }
        Some(other) => {
            eprintln!("unknown mode {other:?}");
            eprintln!("usage: verify_lrclib");
            eprintln!("       verify_lrclib library <root> [N] [--write]");
            std::process::exit(2);
        }
    }
}

fn take_flag(args: &mut Vec<String>, flag: &str) -> bool {
    if let Some(i) = args.iter().position(|a| a == flag) {
        args.remove(i);
        true
    } else {
        false
    }
}

async fn run_smoke() {
    let cases: Vec<LyricsQuery> = vec![
        LyricsQuery {
            artist: "Borislav Slavov".into(),
            title: "I Want to Live".into(),
            album: Some("Baldur's Gate 3 (Original Game Soundtrack)".into()),
            duration: Some(233.0),
            identity: "canonical",
            candidate_index: 0,
        },
        LyricsQuery {
            artist: "Portal".into(),
            title: "Still Alive".into(),
            album: Some("Portal".into()),
            duration: Some(176.0),
            identity: "canonical",
            candidate_index: 0,
        },
        LyricsQuery {
            artist: "Radiohead".into(),
            title: "Karma Police".into(),
            album: Some("OK Computer".into()),
            duration: Some(264.0),
            identity: "canonical",
            candidate_index: 0,
        },
    ];

    for (i, q) in cases.iter().enumerate() {
        eprintln!("--- case {} ---", i + 1);
        eprintln!(
            "query artist={:?} title={:?} album={:?} duration={:?} identity={} cand={}",
            q.artist, q.title, q.album, q.duration, q.identity, q.candidate_index
        );
        let outcome = fetch_lyrics_for_queries(std::slice::from_ref(q)).await;
        let hit = outcome.sidecar.synced_lyrics.is_some()
            || outcome.sidecar.plain_lyrics.is_some()
            || outcome.sidecar.matched_track_name.is_some();
        eprintln!("match_step={}", outcome.match_step);
        eprintln!("candidate_index={:?}", outcome.candidate_index);
        eprintln!("raw={}", if hit { "match" } else { "miss" });
        println!("{}", serde_json::to_string_pretty(&outcome.sidecar).unwrap());
    }

    eprintln!("--- no-duration search guard ---");
    let (skipped_wrong, accepted) = verify_no_duration_search_guard();
    eprintln!("skipped_wrong_first_hit={skipped_wrong}");
    eprintln!("accepted_track={accepted:?}");
    let miss_ok = verify_no_duration_search_miss_when_no_agree();
    eprintln!("refuse_when_no_agree={miss_ok}");
    if !skipped_wrong || accepted.as_deref() != Some("Karma Police") || !miss_ok {
        eprintln!("FAIL: no-duration search guard");
        std::process::exit(1);
    }
    eprintln!("no-duration search guard: ok");
}

fn fmt_opt(s: &Option<String>) -> &str {
    s.as_deref().unwrap_or("null")
}

fn trunc(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let t: String = s.chars().take(max.saturating_sub(1)).collect();
    format!("{t}…")
}

fn step_bucket(step: &str) -> &'static str {
    if step.starts_with("get:canonical") {
        "get:canonical"
    } else if step.starts_with("get:fallback") {
        "get:fallback"
    } else if step.starts_with("search:") {
        "search"
    } else if step.starts_with("miss") {
        "miss"
    } else if step == "cache" {
        "cache"
    } else {
        "other"
    }
}

fn is_match(step: &str, synced: &Option<String>, plain: &Option<String>, matched: &Option<String>) -> bool {
    if step_bucket(step) == "miss" {
        return false;
    }
    synced.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        || plain.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        || matched.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)
}

async fn run_library_report(root: &str, limit: Option<usize>, write: bool) {
    let paths = collect_library_audio_limited(&[root.to_string()], limit);
    let n = paths.len();
    eprintln!("root={root}");
    eprintln!("limit={}", limit.map(|v| v.to_string()).unwrap_or_else(|| "all".into()));
    eprintln!("tracks={n}");
    if write {
        eprintln!("mode=write (force refetch; writes .lyrics.json)");
    } else {
        eprintln!("mode=dry-run (force refetch; no sidecar writes)");
    }
    eprintln!();

    println!(
        "{:<26} {:<16} {:<20} {:>7} {:<9} {:<16} {:>4} {:>8}",
        "STEM", "CANON_ARTIST", "CANON_TITLE", "DUR", "DUR_SRC", "STEP", "CAND", "Δ_SEARCH"
    );
    println!("{}", "-".repeat(128));

    let mut step_counts: BTreeMap<&'static str, u32> = BTreeMap::new();
    let mut cand_counts: BTreeMap<String, u32> = BTreeMap::new();
    let mut matches: u32 = 0;
    let mut dur_src_counts: BTreeMap<&'static str, u32> = BTreeMap::new();

    for (i, path) in paths.iter().enumerate() {
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("?");
        let (canon_artist, canon_title) = probe_canonical_identity(path);
        let dur_probe = probe_duration(path);
        *dur_src_counts.entry(dur_probe.source).or_insert(0) += 1;

        let result = ensure_lyrics_for_path_with_write(path, true, write).await;
        let (step, matched_dur, synced, plain, matched_name, cand) = match &result {
            Some(r) => (
                r.match_step.as_str(),
                r.matched_duration,
                r.sidecar.synced_lyrics.clone(),
                r.sidecar.plain_lyrics.clone(),
                r.sidecar.matched_track_name.clone(),
                r.candidate_index,
            ),
            None => ("skip", None, None, None, None, None),
        };

        let bucket = step_bucket(step);
        *step_counts.entry(bucket).or_insert(0) += 1;
        if is_match(step, &synced, &plain, &matched_name) {
            matches += 1;
            let key = cand
                .map(|c| c.to_string())
                .unwrap_or_else(|| "-".into());
            *cand_counts.entry(key).or_insert(0) += 1;
        }

        let delta = if bucket == "search" {
            match (dur_probe.secs, matched_dur) {
                (Some(ours), Some(theirs)) => format!("{:.1}", (ours - theirs).abs()),
                _ => "-".to_string(),
            }
        } else {
            "-".to_string()
        };

        let dur_s = dur_probe
            .secs
            .map(|d| format!("{d:.1}"))
            .unwrap_or_else(|| "-".into());
        let cand_s = cand
            .map(|c| c.to_string())
            .unwrap_or_else(|| "-".into());

        println!(
            "{:<26} {:<16} {:<20} {:>7} {:<9} {:<16} {:>4} {:>8}",
            trunc(stem, 26),
            trunc(fmt_opt(&canon_artist), 16),
            trunc(fmt_opt(&canon_title), 20),
            dur_s,
            dur_probe.source,
            trunc(step, 16),
            cand_s,
            delta
        );

        if i + 1 < n {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
    }

    println!();
    println!("=== TOTALS ===");
    println!("tracks={n}");
    if n > 0 {
        println!(
            "match_rate={:.1}% ({matches}/{n})",
            (matches as f64) * 100.0 / (n as f64)
        );
    } else {
        println!("match_rate=n/a");
    }
    println!("step_distribution:");
    for (k, v) in &step_counts {
        println!("  {k}: {v}");
    }
    println!("hit_candidate_distribution:");
    for (k, v) in &cand_counts {
        println!("  cand_{k}: {v}");
    }
    println!("duration_source_distribution:");
    for (k, v) in &dur_src_counts {
        println!("  {k}: {v}");
    }
}
