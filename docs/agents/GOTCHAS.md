# RuForge gotchas

Cross-cutting landmines with no single feature directory. Root [`AGENTS.md`](../../AGENTS.md) still applies. Directory-scoped gotchas: `src/explorer/AGENTS.md`, `src/components/island/AGENTS.md`, `src/components/music-mini/AGENTS.md`.

## Rust tests on Windows

`cargo test` in `src-tauri` compiles but the test binary crashes on Windows (`STATUS_ENTRYPOINT_NOT_FOUND`). Run pure-logic modules through the harness crates in `src-tauri/test-harness/` (see its README); add a crate there when a new module needs one.

## Title bar drag regions

Title bar drag regions ignore z-order. New title bar buttons need the drag strip offset moved or clicks get eaten.

## Background Rust work

Use `tauri::async_runtime::spawn` for async HTTP, emit only on change, never hold a mutex across an await, and stay off the yt-dlp rate gate when a plain HTTP request works (for example, channel RSS).

## Big features

Plan doc in `docs/ruforge/plans/`, one phase per session, each phase verified, committed and pushed on a feature branch on **`sync`**. Public PR only if Angel asks. Handoffs: leave/back triggers only (root AGENTS).
