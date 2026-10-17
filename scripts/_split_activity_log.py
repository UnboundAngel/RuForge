"""One-shot split of activity_log.rs into activity_log/{mod,types,watch}.rs."""
from __future__ import annotations

from pathlib import Path

SRC = Path(r"C:\Users\Attic\AppData\Local\Temp\activity_log_full.rs")
OUT = Path(r"D:\ruforge\src-tauri\src\commands\activity_log")
LINES = SRC.read_text(encoding="utf-8").splitlines(keepends=True)


def find_line(substr: str, start: int = 0) -> int:
    text = "".join(LINES)
    idx = text.find(substr, start)
    if idx < 0:
        raise SystemExit(f"not found: {substr!r}")
    return text.count("\n", 0, idx) + 1


media_kind_derive = find_line(
    '#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]\n'
    '#[serde(rename_all = "snake_case")]\n'
    "pub enum MediaKind"
)
watch_active_derive = find_line(
    '#[derive(Debug, Clone, Serialize, Deserialize)]\n'
    '#[serde(rename_all = "camelCase")]\n'
    "struct WatchActiveSession"
)
counters_derive = find_line(
    '#[derive(Debug, Clone, Serialize, Deserialize, Default)]\n'
    '#[serde(rename_all = "camelCase")]\n'
    "struct CountersFile"
)
watch_wall = find_line("pub fn watch_wall_and_media")
# include the doc comment above watch_wall_and_media
watch_wall_doc = find_line("/// Wall and media seconds for a `watch_session`.")
parse_event = find_line("fn parse_event_line")
read_watch = find_line("fn read_watch_active")
export_json = find_line("fn export_json")
watch_begin = find_line(
    "#[derive(Debug, Clone, Deserialize)]\n"
    '#[serde(rename_all = "camelCase")]\n'
    "pub struct WatchBeginInput"
)
backfill_report = find_line("pub fn activity_backfill_report")
tests_mod = find_line("#[cfg(test)]\nmod tests")
watch_test_1 = find_line("fn watch_session_1_5x_writes_wall_and_media")
watch_test_1_attr = watch_test_1 - 1
if LINES[watch_test_1_attr - 1].strip() != "#[test]":
    raise SystemExit(f"expected #[test] above watch test, got {LINES[watch_test_1_attr - 1]!r}")

print(
    "cuts:",
    {
        "media_kind_derive": media_kind_derive,
        "watch_active_derive": watch_active_derive,
        "counters_derive": counters_derive,
        "watch_wall_doc": watch_wall_doc,
        "parse_event": parse_event,
        "read_watch": read_watch,
        "export_json": export_json,
        "watch_begin": watch_begin,
        "backfill_report": backfill_report,
        "tests_mod": tests_mod,
        "watch_test_1_attr": watch_test_1_attr,
    },
)

# --- types.rs ---
types = (
    "//! Activity log event types (shared by the log and watch session modules).\n"
    "\n"
    "use serde::{Deserialize, Serialize};\n"
    "\n"
    + "".join(LINES[media_kind_derive - 1 : watch_active_derive - 1])
)
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "types.rs").write_text(types, encoding="utf-8", newline="\n")

# --- watch.rs ---
watch_header = """//! Active watch session tracking and IPC for the activity log.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};
use uuid::Uuid;

use crate::commands::music_playlists::write_atomic;

use super::{
    data_dir, ensure_dir, local_now_parts, record_event_locked, reject_if_remote, with_log_lock,
    ActivityBody, ActivityEvent, SCHEMA_V, WatchEndReason, WatchSurface,
};

pub(crate) const WATCH_ACTIVE_FILENAME: &str = "watch-active.json";

fn watch_active_path(dir: &Path) -> PathBuf {
    dir.join(WATCH_ACTIVE_FILENAME)
}

"""

watch_active_block = "".join(LINES[watch_active_derive - 1 : counters_derive - 1])
# Make WatchActiveSession visible to tests in this module
watch_active_block = watch_active_block.replace(
    "struct WatchActiveSession", "struct WatchActiveSession", 1
)

watch_wall_block = "".join(LINES[watch_wall_doc - 1 : parse_event - 1])
read_close_block = "".join(LINES[read_watch - 1 : export_json - 1])
commands_block = "".join(LINES[watch_begin - 1 : backfill_report - 1])

# Visibility for mod clear_all / tests
read_close_block = read_close_block.replace(
    "fn read_watch_active", "pub(crate) fn read_watch_active", 1
)
read_close_block = read_close_block.replace(
    "fn clear_watch_active", "pub(crate) fn clear_watch_active", 1
)
read_close_block = read_close_block.replace(
    "fn close_watch_session", "pub(crate) fn close_watch_session", 1
)
read_close_block = read_close_block.replace(
    "fn close_orphan_watch_if_any", "pub(crate) fn close_orphan_watch_if_any", 1
)

watch_tests = """
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::activity_log::query_events;
    use tempfile::tempdir;

    #[test]
    fn watch_session_1_5x_writes_wall_and_media() {
        let dir = tempdir().unwrap();
        let path = dir.path();
        let session = WatchActiveSession {
            id: "w1".into(),
            item_id: Some("vid".into()),
            title: Some("T".into()),
            channel_name: None,
            started_at: 1_700_000_000_000,
            media_seconds_watched: 600.0,
            media_duration_sec: Some(600.0),
            speed_weighted_sec: 600.0,
            wall_watched_sec: 400.0,
            surface: WatchSurface::Main,
            sponsor_skips: 0,
            sponsor_seconds_skipped: 0.0,
            last_tick_at: 1_700_000_400_000,
        };
        close_watch_session(path, session, WatchEndReason::Closed).unwrap();
        let got = query_events(path, i64::MIN, i64::MAX, None);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].v, 2);
        let (wall, media) = watch_wall_and_media(&got[0]).unwrap();
        assert!((wall - 400.0).abs() < 0.01, "wall={wall}");
        assert!((media - 600.0).abs() < 0.01, "media={media}");
        assert!((media - wall - 200.0).abs() < 0.01);
        match &got[0].body {
            ActivityBody::WatchSession {
                seconds_watched,
                media_seconds_watched,
                effective_speed,
                completed,
                ..
            } => {
                assert!((*seconds_watched - 400.0).abs() < 0.01);
                assert!((*media_seconds_watched - 600.0).abs() < 0.01);
                assert!((*effective_speed - 1.5).abs() < 0.01);
                assert!(*completed);
            }
            _ => panic!("wrong kind"),
        }
    }

    #[test]
    fn watch_session_v1_reads_as_wall_media() {
        let raw = r#"{"v":1,"id":"old","ts":1700000400000,"tz":0,"kind":"watch_session","itemId":"vid","startedAt":1700000000000,"secondsWatched":600,"mediaDurationSec":600,"completed":true,"effectiveSpeed":1.5,"surface":"main","endReason":"closed","sponsorSkips":0,"sponsorSecondsSkipped":0}"#;
        let ev: ActivityEvent = serde_json::from_str(raw).unwrap();
        assert_eq!(ev.v, 1);
        let (wall, media) = watch_wall_and_media(&ev).unwrap();
        assert!((wall - 400.0).abs() < 0.01, "wall={wall}");
        assert!((media - 600.0).abs() < 0.01, "media={media}");
        assert!((media - wall - 200.0).abs() < 0.01);
    }
}
"""

watch = watch_header + watch_active_block + watch_wall_block + read_close_block + commands_block + watch_tests
(OUT / "watch.rs").write_text(watch, encoding="utf-8", newline="\n")

# --- mod.rs: original minus extracted ranges ---
skip_ranges = [
    (media_kind_derive, watch_active_derive - 1),
    (watch_active_derive, counters_derive - 1),
    (watch_wall_doc, parse_event - 1),
    (read_watch, export_json - 1),
    (watch_begin, backfill_report - 1),
    (watch_test_1_attr, len(LINES)),  # drop watch tests; keep closing brace of tests mod
]


def skipped(lineno: int) -> bool:
    for a, b in skip_ranges:
        if a <= lineno <= b:
            return True
    return False


out: list[str] = []
inserted = False
skip_watch_active_path = False
for li, line in enumerate(LINES, 1):
    if skipped(li):
        continue
    if "const WATCH_ACTIVE_FILENAME" in line:
        continue
    if line.startswith("fn watch_active_path"):
        skip_watch_active_path = True
        continue
    if skip_watch_active_path:
        if line.strip() == "}":
            skip_watch_active_path = False
        continue

    if not inserted and line.startswith("use super::music_playlists"):
        out.append("mod types;\n")
        out.append("mod watch;\n")
        out.append("\n")
        out.append("pub use types::*;\n")
        out.append("pub use watch::{\n")
        out.append(
            "    activity_watch_accumulate, activity_watch_begin, activity_watch_end,\n"
        )
        out.append(
            "    activity_watch_sponsor_skip, activity_watch_transfer, watch_wall_and_media,\n"
        )
        out.append("    WatchBeginInput, WatchBeginResult,\n")
        out.append("};\n")
        out.append(
            "pub(crate) use watch::{close_orphan_watch_if_any, WATCH_ACTIVE_FILENAME};\n"
        )
        out.append("\n")
        inserted = True
    out.append(line)

# Close the tests mod (we removed the last tests and the closing `}`)
# Find if tests mod still open
text = "".join(out)
if "#[cfg(test)]\nmod tests" in text and not text.rstrip().endswith("}"):
    text = text.rstrip() + "\n}\n"

# Visibility for watch module
repls = [
    ("const SCHEMA_V:", "pub(crate) const SCHEMA_V:"),
    ("fn ensure_dir(", "pub(crate) fn ensure_dir("),
    ("fn local_now_parts(", "pub(crate) fn local_now_parts("),
    ("fn with_log_lock<", "pub(crate) fn with_log_lock<"),
    ("fn record_event_locked(", "pub(crate) fn record_event_locked("),
    ("fn query_events(", "pub(crate) fn query_events("),
]
for a, b in repls:
    if a in text:
        text = text.replace(a, b, 1)

(OUT / "mod.rs").write_text(text, encoding="utf-8", newline="\n")

# Delete monolithic file
mono = Path(r"D:\ruforge\src-tauri\src\commands\activity_log.rs")
if mono.exists():
    mono.unlink()
    print("deleted", mono)

for name in ("types.rs", "watch.rs", "mod.rs"):
    p = OUT / name
    t = p.read_text(encoding="utf-8")
    cfg = t.find("#[cfg(test)]")
    prod = t if cfg < 0 else t[:cfg]
    print(f"{name}: total={t.count(chr(10))+1} prod={prod.count(chr(10))+1}")
