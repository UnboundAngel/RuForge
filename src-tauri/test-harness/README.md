# Rust test harnesses

`cargo test` on the app crate crashes on Windows (STATUS_ENTRYPOINT_NOT_FOUND), so these small crates compile app modules through `#[path]` with stub dependencies and run their tests on their own. Each is its own workspace, separate from `src-tauri`.

| Crate | Covers |
| --- | --- |
| `child-job/` | `child_job.rs`: kill-on-close job objects, timeouts, force-killed owners, long and detached runs |
| `listen-log/` | `music_listen_log.rs`, `music_playlists.rs`, `capability_audit.rs` (with a `tauri` stub) |
| `download-artifacts/` | `download_artifacts.rs`; `src/lib.rs` carries a copy of `strip_ytdlp_stream_suffix` from `commands/gallery.rs`, so keep the two in step |

Run with `cd src-tauri/test-harness/<crate> && cargo test`.
