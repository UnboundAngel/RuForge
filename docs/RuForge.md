# RuForge — Roadmap to Product Ready

> Living document tracking everything between current state and shippable v1.0.  
> **Canonical copy for this repo:** `docs/RuForge.md` (agents: update here when work ships).  
> Last updated: 2026-05-16  
> **Shipping version:** `0.1.4` (`package.json`, `tauri.conf.json`, `updater.json`)

---

## Status Legend

- ✅ **Done** — fixed in current build
- 🚧 **In Progress** — actively being worked on
- 🔴 **P0** — blocks public use, must fix before next release
- 🟠 **P1** — significant UX or polish issue, fix before v1.0
- 🟡 **P2** — minor polish, nice-to-have before v1.0
- 🔵 **Future** — post-v1.0 ideas

---

## Recently Resolved

### Release 0.1.3 → 0.1.4 — Downloader wedge (shipped)

**Theme:** stage many URLs, control when work starts, parallel yt-dlp when configured, intake from clipboard / Explorer / drag-drop — not a general library or player pivot.

- ✅ **Download queue + pause / resume / retry** — `downloadQueueSlice` (persisted), `DownloadJobQueuePanel`, Rust `DownloadJobManager`, `--continue` on resume.
- ✅ **Queue rearchitecture** — `held` / `auto` / `pending` / `manual` approval; manual **Download** releases held rows; no pump on rehydrate; `focusedJobId` drives hero; mid-batch adds stay `pending` until row Yes/No (UI present — see backlog #15).
- ✅ **Concurrent downloads** — Settings presets + custom (cap **6**); multi-slot `pumpDownloadQueue`.
- ✅ **Hero art bound to active job** — metadata snapshot on enqueue; hero reads `focusedJob` / job cache, not URL bar alone (`useDownloaderView`, `downloadQueueMetadataCache`).
- ✅ **Queue/library gating** — duplicate banner suppressed while `anyDownloading`; tab switch gating on intake paths.
- ✅ **Downloaded / total on queue rows** — `X MB / Y MB` from progress payload (`DownloadJobQueuePanel`).
- ✅ **URL drag-and-drop intake** — DOM `dataTransfer` via `useUrlDropIntake` / `dropIntake.ts`; main window `dragDropEnabled: false` in `tauri.conf.json` so OS file-drop does not steal URL drops; Explorer webview drop + titlebar queue button.
- ✅ **Duplicate URL detection** — library match by normalized video id; Replace / save-as-new; Skip Duplicates in settings.
- ✅ **Clipboard on focus** — current OS clipboard only (not Win+V history).
- ✅ **Explorer intake** — watch-page context menu; titlebar queue control; webview URL sync (poll only while Explorer tab active).
- ✅ **Subtitle download languages** — Settings → Downloads → `sub_langs` on `download_video`.
- ✅ **yt-dlp auto-update** — cached GitHub check, banner, install to `app_data/bin/`.
- ✅ **Storage-full guard (coarse)** — blocks new enqueues when internal library at limit (`storageBlocksNewDownloads`); not per-row estimated size (see backlog #10).
- ✅ **Tray icon** — OS tray menu (Show / Quit / troubleshooting); Show emits to main webview (`src-tauri/src/tray.rs`, `TRAY_SHOW_MAIN_EVENT`).
- ✅ **Downloader module split** — `useDownloaderView` + `src/components/downloader/*`.
- ✅ **In-app notify overlay** — replaces PowerShell toasts for download completion (0.1.4 release notes).
- ✅ **Subtitles (player)** — CC picker, VTT pipeline, scrubber clamp (`useSubtitleCueOverlay`) — largely 0.1.3 session 05-14.
- 🚧 **Jim downloader visuals (t25+)** — layout/cards polish ongoing; logic frozen for Jim pass (backlog #12–14).

### Session 2026-05-14 — Subtitles end to end

- ✅ Subtitle toggle UI — CC button + popover track picker (main player + expanded MiniPlayer).
- ✅ Subtitle download flag — `--sub-langs` (plural), `en.*` default; post-download VTT logging.
- ✅ Gallery / player subtitle discovery unified — `vtt_sidecars_for_stem` in `utils.rs`.
- ✅ Subtitle blob URL pipeline — `read_local_subtitle_vtt` (cross-origin fix).
- ✅ Rolling YouTube ASR normalization — `youtubeRollingVttNormalize.ts`.
- ✅ Karaoke word-fill removed — plain cue display.
- ✅ MiniPlayer blank window, seamless loop, resize handle, gallery filter transitions.

### Earlier shipped (pre–0.1.3)

- ✅ Paste-to-download sidecar name fix (`yt-dlp` not `binaries/yt-dlp`).
- ✅ Downloader error surfacing + Rust `log::error!` to AppData.
- ✅ Updater artifacts + signing keys aligned with `pubkey`.
- ✅ `lib.rs` modularization (commands split, thin entrypoint).
- ✅ Player/gallery UX batch: tooltips, click-to-play, skip overlay, scrubber stutter, watch progress, filter tabs, thumbnail bars, microcopy, marquee titles, etc.
- ✅ Zustand main-window store + persist (`AGENTS.md`).

---

## Active backlog — Downloader & storage (2026-05-16)

Tracked list for planning/brainstorm sessions. **Shipped** = in `0.1.4` build unless noted.

| # | Feature / bug | Priority | Status | Notes |
|---|---------------|----------|--------|-------|
| 1 | URL drag-and-drop intake | — | ✅ Shipped | `useUrlDropIntake`, `dragDropEnabled: false` on main window |
| 2 | Queue rearchitecture | — | ✅ Shipped | Approval system, manual trigger, auto-advance, `focusedJobId` hero |
| 3 | Concurrent downloads | — | ✅ Shipped | Multi-slot pump; parallel yt-dlp processes |
| 4 | Hero art bound to active job | — | ✅ Shipped | Metadata snapshot on enqueue; hero reads job not URL bar |
| 5 | Queue/library gating | — | ✅ Shipped | No duplicate banner while jobs active; intake tab rules |
| 6 | Downloaded / total display | — | ✅ Shipped | Queue rows: `X MB / Y MB` |
| 7 | Tray icon right-click / Quit | — | ✅ Shipped | Tray menu + Show/Quit via `tray.rs` (0.1.3–0.1.4) |
| 8 | **Authorize Cleanup** | 🔴 Critical | ✅ Shipped | Modal lists oldest unwatched (filter toggles), checklist by watch % + size, deletes selected via `delete_media_batch`; frees toward **~75%** of storage cap (`AuthorizeCleanupModal`, `cleanupCandidates.ts`). |
| 9 | **ETA smoothing** | 🔴 High | 🔴 Open | Instantaneous rate → wild ETA jumps; need rolling average over last N progress samples |
| 10 | **Storage cap before enqueue** | 🔴 High | 🔴 Open | Estimate video size vs free disk **before** queueing; red row border + “Not enough storage”. (Distinct from shipped **library-full** block.) |
| 11 | **429 / rate-limit spacing** | 🟡 Medium | 🔴 Open | Configurable delay between **job starts** (not retry-on-failure). Concurrency presets hint at risk only. |
| 12 | **UI overhaul — Jim pass** | 🟡 Medium | 🔴 Open | Queue right, vertical, all jobs visible, active shaded, completed hidden |
| 13 | **Paperclip strip redesign** | 🟡 Medium | 🔴 Open | Per-job paperclip, collapsed default, expand on hover, no overflow, × to cancel |
| 14 | **Download screen declutter** | 🟡 Medium | 🔴 Open | Chunky completion/idle visuals |
| 15 | **Mid-download drop permission UI** | 🟡 Medium | 🟡 Partial | `pending` approval + Yes/No row exists (`DownloadJobQueuePanel`); **not fully verified E2E** |
| 16 | **Crossfade hero art** | 🟢 Low | 🔴 Open | Plain swap works; smooth transition → Jim (#12) |
| 17 | **Multiple download indicators** | 🟢 Low | 🔴 Open | Lower priority now queue state is correct |
| 18 | **Playlist per-item thumbnail** | 🟢 Low | 🔴 Open | Hero does not advance thumb per playlist item |
| 19 | **Focus-click row → hero swap** | 🟢 Low | 🟡 Verify | Likely survives rearchitecture; regression-check |

---

## 🔴 P0 — Blockers

- _(Authorize Cleanup #8 shipped 0.1.4 session — modal + playback-aware candidate list.)_

---

## 🟠 P1 — Pre-v1.0 Required

### Downloader

- **`get_video_info` paste preview without cookies.** Deprioritized — public metadata works without cookies; restricted videos may fail preview but download with internal browser. Reopen only if users complain.
- **ETA smoothing (#9)** and **per-enqueue storage estimate (#10)** — see backlog table.

### Explorer / intake

- _(Drag-and-drop, clipboard-on-focus, Explorer context menu, titlebar queue — shipped 0.1.3–0.1.4.)_

### Library

- **SQLite-backed gallery index.** Full `scan_gallery` on every refresh; hangs at 500+ videos.
- **Playlist right-click context menu (Media view).** Play All, Shuffle, Delete, Rename, Open Folder — distinct from Explorer menu.
- **Auto-generate scrubber previews on download.** Setting toggle, default ON.

### Settings & Config

- **"Storage Target" vs "Download Path" deduplication.** Merge or clarify.
- ~~**System tray icon.**~~ ✅ Shipped 0.1.3–0.1.4 (backlog #7).

### Distribution

- **Updater UI testing on actual release.** End-to-end `updater.json` + signed artifacts.
- **Code signing / SmartScreen.** EV cert or README walkthrough.
- **Crash reporting (Sentry or equivalent).** Opt-in.

---

## 🟡 P2 — Polish

### Downloader follow-ups

- ~~**Max concurrent downloads (Settings).**~~ ✅ Settings → Downloads — presets (1 / 2 / 3) plus **Custom** (4–hard cap); default **1**; store slice syncs from **`settings`**.

### Media Player Quality-of-Life

- **Playback speed control.** 0.5×–2×.
- **A-B loop.**
- **Frame-by-frame stepping** (`,` / `.` when paused).

### Gallery UX

- **Multi-select** batch ops.
- **Keyboard navigation** in gallery.
- **Sort options** beyond search.
- ~~**Watch progress on thumbnails.**~~ ✅ Done (accent bar).

### Config

- **`assetProtocol.scope` is `C:\**` only.** Other drive letters break `convertFileSrc` until dynamic scope.

---

## 🔵 Future — Post-v1.0

### Downloader Power Features

- **Clipboard history (multi-item).** Not feasible via stable OS APIs — Win+V stack is private to the OS. Current clipboard-on-focus is the supported approach.
- **Format presets** — Best 1080p, audio only, smallest.
- **Download history view** — including deleted files.
- **In-app yt-dlp updater button** (manual) in addition to auto-check.

### Library Power Features

- **Comments panel** (opt-in yt-dlp `--write-comments` + sidecar JSON).
- **Library import** from existing folders.
- **Drag-out export**, tags, smart playlists, Watch Later.

### Global

- **Command palette (`Ctrl+K`).**
- **Rich metadata** from `info.json`.
- **SponsorBlock.**
- **Discord Rich Presence**, theme presets, tray now-playing, recents.

### Infrastructure

- **Tests** — Rust snapshot tests on critical commands.
- **Onboarding** first launch.
- **About page** — versions, credits, log path.
- **Update channel** selector.

---

## Strategic Notes

- **Wedge:** downloader-first; library and player support that story.
- **Explorer:** cookie/session capture for yt-dlp; right-click + floating pill are intake shortcuts, not a general browser.
- **Free forever.** Apache-2.0. No AI features in scope.
- **Scope discipline:** portfolio / personal tool — don't compete with Plex on library UX.

---

## Out of Scope

- Non-YouTube sources
- Cloud sync / multi-device
- Mobile apps
- Paid tier
- AI summaries / recommendations

---

## Suggested next (for planning sessions)

**Downloader / storage (from backlog — order is opinion):**

1. **Fix Authorize Cleanup (#8)** — P0; correct free-bytes target (75% of cap), unwatched ordering, invoke args.
2. **ETA smoothing (#9)** + **storage estimate before enqueue (#10)** — high UX trust on the wedge.
3. **429 start spacing (#11)** — before leaning harder on concurrency >1.

**Library scale (still P1, separate from downloader table):**

4. **SQLite gallery index** — before libraries get large.

**Jim-sized (visuals only, backlog #12–14, #16):** queue layout right column, paperclip strip, declutter idle/completion, hero crossfade.

**Version graph:** downloader work in `docs/versions/version-0.1.3.json` (t17–t37, fixes f2–f14); **0.1.4** = release bump + `updater.json` notes.
