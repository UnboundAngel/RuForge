# RuForge — Roadmap to Product Ready

> Living document tracking everything between current state and shippable v1.0.  
> **Canonical copy for this repo:** `docs/RuForge.md` (agents: update here when work ships).  
> Last updated: 2026-05-15

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

### Session 2026-05-15 — Downloader wedge (v0.1.3 work in progress)

- ✅ **Download subtitle languages** — Settings → Downloads: **Download Subtitles** toggle + language picker (`downloadSubtitleLangs`). Wired to yt-dlp `--sub-langs` via `effectiveDownloadSubLangs()` → `download_video` `sub_langs`. Downloader shows selected language before download. Player lists **only on-disk** `.vtt` sidecars with clearer lang labels.
- ✅ **Duplicate URL detection** — Before download, match gallery `sourceUrl` by normalized YouTube video id. **Already downloaded** banner shows when metadata loads (before clicking Download). **Download** opens modal: Cancel / Replace / Create new (`[%(id)s]` template). Settings **Skip Duplicates** uses ToggleSlot (no dialog checkbox).
- ✅ **Clipboard on focus** — Focusing the paste-link field reads **current** OS clipboard (not Win+V history); auto-fills empty field or offers **Use it?** when field has text. Hint **above** input with enter animation. No settings toggle (by design).
- ✅ **Explorer right-click menu** — On YouTube watch pages in embedded Explorer: themed menu on video area — Download video, Send to downloader, Copy link, Copy video ID. Injected via `src/explorerInjectScript.ts`; events in `App.tsx`. Recreate Explorer webview after update to pick up inject script.
- ✅ **Download queue + pause / resume / retry** — Jobs in Zustand (`downloadQueueSlice`, persisted `ruforge-download-queue`), sidebar **Download queue** UI (`DownloadJobQueuePanel`), reorder/remove. Pause invokes Rust `pause_download_job`; resume respawns with yt-dlp **`--continue`** when `resumeOnStart`; failed jobs **Retry**. **`maxConcurrentDownloads`** is persisted in **`settings`** (default **1**) and mirrored in the queue slice; Settings → Downloads exposes presets + custom (hard cap **6**).
- ✅ **URL bubble + queue-from-clipboard UX** — When metadata loads, the corner **URL bubble** stacks vertically: **current link chip → pinned queued URLs → Queue another → hint row** (fixed-height strip so “no clipboard link” / conflict copy fades without jumping the layout). **Paperclip** on active link rows (main + pins); **clipboard icon only** on **Queue another**, which stays **collapsed** (`max-w-9`) until hover expands the label. Link rows drop the hover wash background; copy vs clear tooltips fade on the right targets (`DownloaderView.tsx`: `MainDownloaderUrlChip`, `QuickEnqueuePinnedChip`; centered paste layout mirrors the same queue stack).
- ✅ **yt-dlp update UX** — GitHub `releases/latest` with **12h TTL** cache (`app_data/ytdlp-update-cache.json`), **launch warm**, downloader banner (**Update yt-dlp** / **Later**), progress via `ytdlp-update-download-progress`; install to **`app_data/bin/`** after verify `--version`; all runs prefer userdata binary via [`ytdlp_binary.rs`](../src-tauri/src/ytdlp_binary.rs); commands `get_ytdlp_update_status`, `download_ytdlp_update`.
- 🚧 **Downloader screen visuals (Jim, t25)** — polish pass on downloader layout/cards; logic unchanged.

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

## 🔴 P0 — Blockers

Nothing currently blocking.

---

## 🟠 P1 — Pre-v1.0 Required

### Downloader

- ~~**Download queue.**~~ ✅ Shipped — persisted jobs, pump/start next, reorder/remove; concurrency capped in store (`maxConcurrentDownloads`, default **1**).
- ~~**Pause / resume / retry.**~~ ✅ Shipped — pause kills sidecar path via backend; resume with **`--continue`**; per-job options retained for retry.
- ~~**yt-dlp auto-update.**~~ ✅ Shipped — GitHub check (cached + warm on launch), downloader banner (`DownloaderView`); download to **`app_data/bin/`** with bundled sidecar fallback; `get_ytdlp_update_status` / `download_ytdlp_update` (`commands/ytdlp_update.rs`).
- ~~**Duplicate detection by URL.**~~ ✅ Shipped (see 2026-05-15).
- ~~**Subtitle language picker in downloader.**~~ ✅ Shipped — Settings → Downloads (separate from player `subtitlePreferredLang`).
- **`get_video_info` paste preview without cookies.** Deprioritized — public metadata works without cookies; restricted videos may fail preview but download with internal browser. Reopen only if users complain.

### Explorer / intake

- ~~**Clipboard auto-detect on downloader focus.**~~ ✅ Shipped (current clipboard only).
- ~~**Explorer right-click on watch video.**~~ ✅ Shipped (see 2026-05-15).
- **Drag-and-drop URLs onto window.** Drop link → queue or downloader.

### Library

- **SQLite-backed gallery index.** Full `scan_gallery` on every refresh; hangs at 500+ videos.
- **Playlist right-click context menu (Media view).** Play All, Shuffle, Delete, Rename, Open Folder — distinct from Explorer menu.
- **Auto-generate scrubber previews on download.** Setting toggle, default ON.

### Settings & Config

- **"Storage Target" vs "Download Path" deduplication.** Merge or clarify.
- **System tray icon click behavior.** Left-click vs menu convention.

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

**Highest leverage for the wedge (order is opinion):**

1. **SQLite gallery index** — before libraries get large.
2. **Drag-and-drop URL** onto app window — fast intake alongside Explorer + clipboard.
3. **Optional:** expose **max concurrent downloads** in Settings (engine already supports >1; default remains conservative until UX decides).

**Jim-sized (visuals only):** downloader screen t25; any duplicate/clipboard microcopy tweaks.

**Version graph:** shipped downloader work logged in `docs/versions/version-0.1.3.json` (t17–t24; t25 Jim WIP).
