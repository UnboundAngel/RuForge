# RuForge competitive audit

**Date:** 2026-05-21  
**RuForge versions:** 0.1.7 shipped (`package.json`, `updater.json`); 0.1.8 unreleased (see `STATE.md`, `AGENTS.md` Shipped log).  
**Method:** Live workspace code is source of truth; competitor columns use maintainer audit summaries plus public READMEs/releases (Parabolic, imsyy/yt-dlp-gui, ErrorFlynn/ytdlp-interface, dsymbol/yt-dlp-gui).  
**Scope:** Four named yt-dlp GUIs vs RuForge. Not Motrix, FreeTube, or CLI.

---

## Competitor reference (condensed)

Structured to match the maintainer audit depth. Public docs only where noted.

### 1. Parabolic (NickvisionApps)

**Stack:** .NET 10, GTK (Linux), WinUI (Windows), macOS releases. yt-dlp frontend.

**Initialization / onboarding:** First-run flows in platform shells; DMCA/copyright caution surfaced in README and app. No RuForge-style library player.

**Navigation:** Home vs active downloads views; add-download dialog. Settings organized in app tabs (platform-specific). No embedded site browser for daily watching.

**URL intake:** Add-download dialog; extension can send URLs (Firefox AMO; Chrome manual unpack).

**Download config:** mp4, webm, mp3, opus, flac, wav; quality and subtitle options in add flow; playlist options including reverse order (release notes).

**Queue:** Concurrent downloads; history/downloads view with filters (e.g. failed). States typical of download managers (queued, active, complete, failed). Keyring for saved credentials (Linux keyring bugs noted in issues).

**Library / playback:** Metadata and subtitles to disk; **no** integrated local media player or watch-progress library in product positioning.

**Settings:** Multi-tab settings; tray/system integration varies by platform.

**Auth / cookies:** Credentials in keyring; not RuForge's embedded WebView2 profile model.

**Tools / extras:** Browser extensions for URL handoff. No SponsorBlock player, chapter scrubber, or mini player in README scope.

**Updater / signing:** Platform installers from GitHub Releases; not Tauri minisign updater.

**Shortcuts / context:** Platform-native patterns; not audited line-by-line here.

---

### 2. yt-dlp-gui (dsymbol)

**Stack:** Python 3.9+, single-window app (`app/app.py`), `config.toml` presets.

**Initialization:** Portable ZIP or `pip install`; no wizard. Preset errors go to `debug.log`.

**Navigation:** **One screen** (minimal wrapper).

**URL intake:** URL field + queue; no global drag-drop layer documented.

**Download config:** Presets in `config.toml` appended to base yt-dlp args; advanced users edit TOML.

**Queue:** List queue with worker; pause/resume implied by worker design.

**Library / playback:** **None** (downloader only).

**Settings:** `config.toml` `[general]` + `[presets]`; not a multi-tab GUI settings tree.

**Auth / cookies:** Via yt-dlp args in presets, not a browser strip.

**Tools / extras:** **None** beyond presets.

**Updater:** GitHub Workflow releases (stable/nightly ZIP).

**Shortcuts / context:** **Right-click context** on queue/UI (maintainer audit); no player shortcuts.

---

### 3. ytdlp-interface (ErrorFlynn)

**Stack:** Windows C++, Nana GUI, portable 7z.

**Initialization:** Unpack and run `ytdlp-interface.exe`; no account onboarding.

**Navigation:** Main window + **format selection sub-windows** + output/log area.

**URL intake:** URL entry; queue table; non-YouTube URLs since v1.2.

**Download config:** Per-item format picker with highlighted yt-dlp default formats; multiple audio formats; playlist uses first-video formats; JSON media info from yt-dlp.

**Queue:** Table with columns (format id, note, ext, size); reorder; subtitle commands from queue menu; copy URLs (Ctrl+C).

**Library / playback:** **None**.

**Settings:** JSON settings file; cookie file import; optional aria2c.

**Auth / cookies:** Cookie **file** import.

**Tools / extras:** Output window context menu (copy); JSON viewer for media info (maintainer audit).

**Updater:** Manual download new 7z from Releases.

**Shortcuts / context:** Queue/output context menus; Ctrl+C on selection.

---

### 4. imsyy yt-dlp-gui (YDLG UI)

**Stack:** Tauri 2 + Vue + Naive UI; Windows, macOS, Linux shipped.

**Initialization:** Settings → download yt-dlp binary; optional Deno for YouTube formats; set download folder. **Zero-config** positioning in README.

**Navigation:** Home, downloading, **Tools** hub, settings; tab-per-video style parse/download UI (maintainer audit).

**URL intake:** Paste URL → preview title, thumb, duration, formats; **browser extension** (`ytdlp-gui://`) sends URL + cookies; extension supports many sites.

**Download config:** Per-video quality; audio-only / video-only; filename templates; time-range clip trim; re-encode targets; embed subs/thumb/metadata/chapters.

**Queue:** Pause / resume / cancel; progress, speed, ETA; concurrent jobs + fragment threading.

**Library / playback:** **Downloader-centric**; no RuForge-class local library player with resume/progress (README).

**Settings:** Light/dark/auto theme; proxy; speed limiter; cookie Netscape text or file; **cookie from browsers** (maintainer audit: 9 browsers; README emphasizes file/Netscape + extension).

**Auth / cookies:** Extension + settings; ChromeCookieUnlock via plugin manager.

**Tools / extras:** Thumbnail downloader, subtitle extractor (multi format + bilingual merge), live chat archiver, **plugin manager**, SponsorBlock on download, toolbox browser extension docs.

**Updater:** GitHub Releases per platform (.exe, .dmg, AppImage/.deb).

**Shortcuts / context:** Extension context menu entries; in-app i18n (7 languages).

---

## 1. RuForge feature audit (code-verified)

**Version baseline:** Shipped **0.1.7** unless noted as **0.1.8 unreleased**.

### Initialization and onboarding

- **No first-run wizard.** App opens to Download tab (`ruforgeStore.ts` default `activeTab: "downloader"`).
- **Platform path hydration:** `hydratePlatformDefaultPaths()` on boot (`platformPaths.ts`, `App.tsx`); Windows defaults include internal vault `C:\RuForge\Media` and custom output dir.
- **Post-install What's New:** After updater install, `consumePendingPostInstall()` drives `UpdaterPostInstallStack`: sidebar dimmed, explorer/settings/gallery blocked, scrollable structured notes (`App.tsx`, `updatePostInstall.ts`, `UpdaterLayers.tsx`). **0.1.8:** modal viewport clamp + internal scroll for long notes (`UpdaterLayers.tsx`).
- **Post-update yt-dlp:** Downloader tab banner for bundled yt-dlp update check (12h cache), progress phases, blocked while jobs active (`ytdlp_update.rs`, `DownloaderView.tsx`).
- **No DMCA modal.** Legal/compliance not implemented as a gated onboarding step.
- **No i18n.** UI strings are English-only (no vue-i18n equivalent).

### Global navigation (sidebar, top bar, window chrome)

- **Sidebar tabs (4):** Download, Videos (library), Explorer, System (settings). Player is **not** a sidebar entry; `activeTab === "player"` when `playingFile` set (`App.tsx` `navItems`, `ruforgeStore.ts`).
- **Sidebar expand/collapse:** Persisted `ruforge-sidebar-expanded`; auto-collapse when width &lt; 1100px (`App.tsx`).
- **Custom undecorated window:** `decorations: false` in `tauri.conf.json`; `WindowControls` fixed top-right (`z-[100]`): updater pill, explorer queue button (explorer only), mini player launch, min/max/close.
- **Explorer chrome (mandatory placement):** Back/forward/reload in `ExplorerTitlebarNav` fixed at sidebar seam (`80px` / `240px`); **not** inside explorer panel (AGENTS.md: child webview paints on top). `ExplorerWatchQueueButton` in title band only on Explorer tab.
- **Title band bulges:** Videos tab: filter pills (All / In Progress / Watched) + expandable library search. Explorer: Open in Browser for `lastExplorerUrl`. Settings: sub-tab strip morphs into title band (`App.tsx`).
- **Storage widget:** Sidebar footer shows used GB vs `storageLimitGB` when internal target; **Authorize Cleanup** when at cap (`StorageWidget`, `AuthorizeCleanupModal.tsx`).
- **Second window:** Mini player webview label `mini` (`MiniPlayer.tsx` routed from `App.tsx` / `main.tsx`).
- **System tray:** Show, Reload Interface, Toggle GPU & Restart (exit only, does not toggle pref), Reset App Data (`localStorage` only), Quit (`tray.rs`).
- **Notify overlay:** Separate `notify` webview for unfocused download toasts (`NotifyOverlayApp.tsx`).

### URL intake and parsing flow

- **Hero URL field:** Debounced `get_video_info` (~500ms); title, duration, approx size (dual simulate for audio vs video in 0.1.7+), playlist count, blurred thumb (`useDownloaderView.ts`, `downloadVideoInfoFetch.ts`).
- **◐ Metadata without cookies:** `get_video_info` simulate path does not pass browser/cookie opts (download path does); age-restricted preview may fail (`downloader.rs`, `STATE.md` notes).
- **Clipboard on focus:** Auto-paste or "Use it?" offer (`downloaderClipboardYoutube.ts`).
- **Global YouTube drag-and-drop:** Anywhere on main content → Download tab + enqueue (`useUrlDropIntake.ts`, `dropIntake.ts`).
- **Quick enqueue / pinned chips / queue another:** Stage URLs without losing hero (`DownloaderView.tsx`, `useDownloaderView.ts`).
- **Explorer intake:** Titlebar add/remove queue for current watch URL (`ExplorerWatchQueueButton.tsx`); **removed** inject script for in-page download (`explorerInjectScript.ts` gone per catalogue).
- **Playlist expand:** Hero playlist → per-video enqueue or single playlist job (`useDownloaderView.ts`).
- **Duplicate handling:** Modal Replace / Create new / Cancel; auto-skip setting; brief `skipped` row (`DuplicateDownloadDialog.tsx`, `duplicateDownload.ts`).
- **Storage gate:** Internal vault at/over limit blocks new enqueues (`App.tsx`, downloader).

### Download configuration (formats, audio-only, quality)

- **Preferred quality presets:** 4K, 1080p (default), 720p, Best Available → yt-dlp `-f` (`downloadFormat.ts`, `SettingsView.tsx`).
- **Audio-only:** Global `downloadAudioOnly` + per-queue-row toggle (Music/Video icons); format `bestaudio/best` with `downloadAudioFormat` m4a/mp3/opus; 0.1.7 prefers m4a stream (`downloader.rs`).
- **Subtitles on download:** Toggle + language presets → `--write-subs` / `--sub-langs` (`types.ts`, `downloader.rs`).
- **Auto scrubber previews:** `autoDownloadScrubberPreviews` (default on) spawns ffmpeg sprite sheets after video download (`SettingsView.tsx`, `downloader.rs`, `media.rs`).
- **Storage target:** Internal vault vs custom `outputDir` (`platformPaths.ts`, settings).
- **Browser/cookie strip (Download tab):** Internal (RuForge explorer profile), Firefox, Edge, Safari, Brave, custom `.txt`, None (`downloaderConstants.ts` `BROWSER_OPTIONS`). **◐** Persisted default `browserContext: "chrome"` not listed in strip until user picks (`types.ts`).
- **Concurrent downloads:** 1–6 (`maxConcurrentDownloads`); presets + custom stepper (`SettingsView.tsx`, `downloadQueueSlice.ts`).
- **Job options frozen at enqueue:** Later settings changes do not alter active jobs (`downloadQueue.ts`).

### Queue UI and states

- **Floating drawer:** Bottom-right collapsible `DownloadJobQueuePanel` with crossfading row/hero thumbs (0.1.7+); not a docked full-width list.
- **Statuses:** `queued`, `downloading`, `paused`, `completed`, `failed`, transient `skipped` (`downloadQueue.ts`, `downloaderConstants.ts`).
- **Processing phase:** While `job.status === "downloading"`, IPC `progress.status === "processing"` shows "Processing…" (ffmpeg post-process); HLS latch in Rust (`downloader.rs`, `downloadProgressPhaseLabel`).
- **No `sleeping` state.** Approval modes instead: `held` (staged until Download click), `auto`, `pending` (Yes/No), `manual` (`downloadQueue.ts`).
- **Pause/resume:** Pause invokes Rust `pause_download_job`; UI commits paused only after success (0.1.7 fix). Resume uses `--continue` when applicable.
- **Retry / remove / reorder:** Chevron reorder for queued/paused only (not drag-drop).
- **Stall watchdog:** Activity-based idle failure, notify, pause yt-dlp (`downloadJobWatchdog.ts`, `downloadQueueSlice.ts`).
- **ETA smoothing + dual size simulate:** EMA byte rate; separate audio/video size on hero/queue (0.1.7+).
- **Session persistence:** `sessionStorage` restores `queued`/`paused`; reload promotes prior `auto` → `held`.
- **Focus binding:** Click row sets `focusedJobId`; hero mirrors focused job.

### Library / gallery

- **Dual-root scan:** Internal `RUFORGE_INTERNAL_DIR` + custom `outputDir`; dedupe by path and `source_id` / title fallbacks (0.1.7+ dedupe fixes in `gallery.rs`, `galleryDedupe.ts`).
- **Media kinds:** mp4, mkv, webm, mp3, m4a, flac; folder playlists (`MediaView.tsx`, `gallery.rs`).
- **Filters:** All / In Progress / Watched (playlists excluded from progress filters).
- **Search:** Title/name match in title band field.
- **Grid density:** Cozy / Default / Compact (settings).
- **Cards:** Hover video preview (muted) for video; **audio keeps cover** + Music badge (0.1.7); progress bar from `playbackStorage.ts`; view counter in `localStorage`.
- **Context menu:** Play, Generate Previews (`extract_frames`), Delete with `ConfirmDialog` (not native `confirm`) (`MediaView.tsx`).
- **Playlist detail:** Play All / Shuffle; row ⋮ menu **not wired** (◐).
- **Replace before re-download:** `replaceLibraryDownload.ts` removes matched library file when user chooses Replace.
- **Authorize Cleanup:** Modal at cap; oldest unwatched/watched/least watched; batch delete toward ~75% of cap (`AuthorizeCleanupModal.tsx`, `cleanupCandidates.ts`).
- **Legacy `GalleryView.tsx`:** Not imported (dead).

### Player (main + mini + audio-only hero)

**Main (`PlayerView.tsx`):**

- Video and audio-only (`mediaKind.ts`); audio uses `AudioHeroStage.tsx`: blurred cover, **90-bar LED equalizer** (loudness-driven, adaptive AGC), glass side waveforms (0.1.7).
- Controls: frosted dock, More menu for secondary actions; play/pause, skip, speed 0.25–2×, volume, mute, fullscreen, loop (per-path persist), pop-out to mini.
- **Chapter scrubber:** Segmented `ChapterScrubber.tsx` from yt-dlp sidecar; prev/next chapter; Shift+arrow; hover thumb + title (`chapters.ts`, `gallery.rs`).
- **SponsorBlock:** Fetch hash, `{stem}.sponsorblock.json` sidecar, skip button, scrub overlays, adaptive category learning; settings tree under Playback (`useSponsorBlockPlayback.ts`, `sponsorblock.rs`, `SponsorBlockSettingsTree.tsx`).
- **Subtitles:** Sidecar VTT; custom `useSubtitleCueOverlay` (native tracks hidden); drag Y persist; language menu (`localVideoSubtitles.ts`).
- **Scrubber sprites:** Hover thumbnails from ffmpeg grid; auto-generated on download when setting on (`scrubSpritePreview.tsx`).
- **Playback persistence:** Furthest position, watched at 90%, resume rules (`playbackStorage.ts`).
- **Auto-advance:** Folder queue then library-sorted list; setting labeled audio but applies to video too (◐ naming).
- **Keyboard (main):** Space play/pause; arrows ±10s (Shift+chapter); Up/Down volume; M mute; F fullscreen; L loop. No `?` overlay.

**Mini (`MiniPlayer.tsx`):**

- Undecorated transparent window; layouts: large, small (&lt;450w or &lt;300h), compact, **micro** (70–135px height), **tiny** (70–85px) per shipped log 0.1.6–0.1.7.
- Pin always-on-top; back to app handoff (`play-in-mini`, `send-to-main`, `playerHandoff.ts`).
- SponsorBlock on layouts with scrub bar (0.1.7); subtitles when not compact.
- **0.1.8 unreleased:** Large mode video not washed by cover/gradient/ambient/control blur layers.
- **Keyboard (mini):** Space, ←/→ ±15s; **no** input-field guard (differs from main).
- **No global hotkeys** (planned in `miniplayer_plan.md`, not implemented).

### Settings panels

**System tab → sub-tabs** (`SettingsView.tsx`): General, Downloads, Playback, Appearance, Advanced.

| Area | Notable controls |
|------|------------------|
| General | Storage limit GB, launch at startup, minimize to tray |
| Downloads | Internal/custom path, quality, concurrent jobs, download subtitles + langs, skip duplicates, auto scrubber previews, audio-only default + format |
| Playback | Auto-advance audio, prefetch next, **SponsorBlock tree**, ReplayGain placeholder (not shipped) |
| Appearance | Accent color, grid density |
| Advanced | Hardware acceleration (relaunch), check for updates, clear ffprobe cache, debug updater cycle |

Downloader-only (not all in Settings tree): `browserContext`, `cookieFile` on Download tab strip.

### Authentication / cookies / explorer webview

- **Embedded explorer:** Child webview `explorer-view` (label per `explorerWebviewLifecycle.ts`); bounds sync via rAF + ResizeObserver + sidebar transition (`explorerBoundsSync.ts`, `App.tsx`).
- **Purpose:** Session/cookie capture for yt-dlp (`browserContext: ruforge` → WebView2 profile under app data), not general browsing (AGENTS.md).
- **Pause on tab leave;** reload once on enter; URL poll ~800ms while active (`get_embedded_explorer_webview_url`).
- **Open in Browser:** External opener for mirrored URL.
- **No browser extension** and no one-click cookie import from 9 browsers (contrast YDLG).
- **◐ uBlock:** Payload may exist under `src-tauri`; gitignored/removed from bundle policy; not verified end-to-end (AGENTS.md).

### Tools and extras

| Feature | RuForge | Notes |
|---------|---------|-------|
| Chapter playback UI | Yes | Sidecar from download |
| SponsorBlock playback | Yes | Sidecar + API hash |
| Custom subtitle overlay | Yes | VTT sidecars |
| Scrubber sprite previews | Yes | Auto on download + manual Generate |
| Thumbnail/subtitle/live-chat tools hub | No | YDLG-style toolbox absent |
| Time-range clip download | No | |
| Filename templates UI | ◐ | Replace/create templates in code; not rich template editor |
| Plugin manager | No | |
| Proxy / speed limiter UI | No | |
| Playlist reverse order | No | |

### Updater and signing

- **Tauri plugin-updater:** `updater.json` on GitHub raw `main`; minisign signatures; NSIS artifact URL (`tauri.conf.json`, `updater.json`).
- **UI:** Startup check, titlebar pill, teaser card (`UpdaterMainOverlays`), full-screen download/install (`UpdaterFullWindowUpdate`), post-install categorized notes (`UpdaterPostInstallStack`, `teaserNotesFromUpdaterBody`).
- **Windows-only shipped** installer/updater ritual per `AGENTS.md`; Linux `tauri dev` only (`STATE.md`).

### Keyboard shortcuts

| Surface | Shortcuts |
|---------|-----------|
| Main player | Space, ←/→, Shift+←/→ chapters, ↑/↓ vol, M, F, L |
| Mini player | Space, ←/→ ±15s |
| Gallery search | Escape collapses (title band) |
| Queue panel | Enter/Space focus row |
| Global / media keys | **No** |
| Cheatsheet `?` | **No** |

### Right-click context menus

| Surface | Menu |
|---------|------|
| Library cards | Play, Generate Previews, Delete (`MediaView.tsx`) |
| Download queue | **No** dedicated right-click menu (buttons/hover actions) |
| Explorer page | **No** (inject removed) |
| Confirm dialogs | In-app React only |

---

## 2. Feature parity matrix

Legend: **✓** has · **✗** missing · **◐** partial · **—** not applicable (downloader-only competitor)

### Downloader

| Feature | RuForge | Parabolic | yt-dlp-gui (dsymbol) | ytdlp-interface | YDLG UI |
|---------|:-------:|:---------:|:--------------------:|:---------------:|:-------:|
| Multi-site yt-dlp | ✓ | ✓ | ✓ | ✓ | ✓ |
| Paste URL + metadata preview | ✓ | ✓ | ◐ | ✓ | ✓ |
| Per-URL format picker (granular list) | ◐ | ✓ | ◐ | ✓ | ✓ |
| Quality presets (resolution) | ✓ | ✓ | ◐ | ✓ | ✓ |
| Audio-only download | ✓ | ✓ | ◐ | ✓ | ✓ |
| Video-only download | ✗ | ✓ | ◐ | ✓ | ✓ |
| Playlist download | ✓ | ✓ | ◐ | ✓ | ✓ |
| Concurrent jobs | ✓ | ✓ | ◐ | ◐ | ✓ |
| Pause / resume | ✓ | ✓ | ◐ | ✓ | ✓ |
| Queue: failed + retry | ✓ | ✓ | ◐ | ✓ | ✓ |
| Queue: processing / ffmpeg phase | ✓ | ◐ | ◐ | ◐ | ◐ |
| Queue: staged / held before start | ✓ | ◐ | ✗ | ◐ | ◐ |
| Download history view | ✗ | ✓ | ✗ | ◐ | ◐ |
| Duplicate detection / skip | ✓ | ◐ | ✗ | ◐ | ◐ |
| Replace existing library file | ✓ | ✗ | — | — | ✗ |
| Subtitle download | ✓ | ✓ | ◐ | ✓ | ✓ |
| SponsorBlock on download | ◐ | ✗ | ✗ | ✗ | ✓ |
| Time-range clip trim | ✗ | ◐ | ✗ | ✗ | ✓ |
| Custom filename templates | ◐ | ✓ | ✓ | ◐ | ✓ |
| Proxy | ✗ | ◐ | ◐ | ◐ | ✓ |
| Speed limit | ✗ | ◐ | ◐ | ◐ | ✓ |
| aria2c backend | ✗ | ◐ | ✗ | ✓ | ◐ |
| Drag-drop URL intake | ✓ | ◐ | ✗ | ◐ | ◐ |
| Browser extension URL handoff | ✗ | ✓ | ✗ | ✗ | ✓ |
| Cookie: file import | ✓ | ◐ | ◐ | ✓ | ✓ |
| Cookie: multi-browser import UI | ◐ | ◐ | ✗ | ✗ | ✓ |
| Embedded browser for cookies | ✓ | ✗ | ✗ | ✗ | ◐ |
| yt-dlp self-update in app | ✓ | ◐ | ◐ | ◐ | ✓ |
| Stall / watchdog fail | ✓ | ◐ | ✗ | ✗ | ◐ |
| Storage cap / cleanup UX | ✓ | ✗ | ✗ | ✗ | ✗ |
| Cross-platform macOS/Linux ship | ✗ | ✓ | ✓ | ✗ | ✓ |
| DMCA / legal modal | ✗ | ✓ | ✗ | ✗ | ✗ |

### Library

| Feature | RuForge | Parabolic | yt-dlp-gui | ytdlp-interface | YDLG UI |
|---------|:-------:|:---------:|:------------:|:---------------:|:-------:|
| Local library grid | ✓ | ◐ | — | — | ◐ |
| Watch progress / resume | ✓ | ✗ | — | — | ✗ |
| In Progress / Watched filters | ✓ | ✗ | — | — | ✗ |
| Folder playlists | ✓ | ✗ | — | — | ✗ |
| Hover preview on cards | ✓ | ✗ | — | — | ✗ |
| Library search | ✓ | ◐ | — | — | ◐ |
| Context menu on items | ✓ | ◐ | ✓ | ◐ | ◐ |

### Player

| Feature | RuForge | Parabolic | yt-dlp-gui | ytdlp-interface | YDLG UI |
|---------|:-------:|:---------:|:------------:|:---------------:|:-------:|
| In-app player | ✓ | ✗ | — | — | ✗ |
| Chapter scrubber | ✓ | ✗ | — | — | ✗ |
| SponsorBlock during playback | ✓ | ✗ | — | — | ◐ |
| Custom subtitle overlay | ✓ | ✗ | — | — | ✗ |
| Scrubber hover sprites | ✓ | ✗ | — | — | ✗ |
| Mini player window | ✓ | ✗ | — | — | ✗ |
| Audio-only visualizer hero | ✓ | ✗ | — | — | ✗ |
| Playback speed / loop | ✓ | ✗ | — | — | ✗ |
| Pop-out / handoff main ↔ mini | ✓ | ✗ | — | — | ✗ |
| Player keyboard shortcuts | ✓ | ✗ | — | — | ✗ |

### Settings

| Feature | RuForge | Parabolic | yt-dlp-gui | ytdlp-interface | YDLG UI |
|---------|:-------:|:---------:|:------------:|:---------------:|:-------:|
| Multi-tab settings | ✓ | ✓ | ◐ | ◐ | ✓ |
| Keyring / saved credentials | ✗ | ✓ | ✗ | ✗ | ◐ |
| Light/dark theme | ✗ | ✓ | ✗ | ◐ | ✓ |
| i18n | ✗ | ✓ | ✗ | ✗ | ✓ |
| HW acceleration toggle | ✓ | ◐ | ✗ | ✗ | ◐ |
| Autostart / tray | ✓ | ◐ | ✗ | ✗ | ◐ |

### Auth

| Feature | RuForge | Parabolic | yt-dlp-gui | ytdlp-interface | YDLG UI |
|---------|:-------:|:---------:|:------------:|:---------------:|:-------:|
| Age-restricted / members content | ◐ | ✓ | ◐ | ◐ | ✓ |
| Internal app browser profile | ✓ | ✗ | ✗ | ✗ | ✗ |

### Tools

| Feature | RuForge | Parabolic | yt-dlp-gui | ytdlp-interface | YDLG UI |
|---------|:-------:|:---------:|:------------:|:---------------:|:-------:|
| Tools hub (thumb/subtitle/chat) | ✗ | ✗ | ✗ | ✗ | ✓ |
| Plugin manager | ✗ | ✗ | ✗ | ✗ | ✓ |
| JSON media info viewer | ◐ | ◐ | ✗ | ✓ | ◐ |
| Live chat archive | ✗ | ✗ | ✗ | ✗ | ✓ |

### Polish

| Feature | RuForge | Parabolic | yt-dlp-gui | ytdlp-interface | YDLG UI |
|---------|:-------:|:---------:|:------------:|:---------------:|:-------:|
| Signed auto-updater in app | ✓ | ✗ | ✗ | ✗ | ✗ |
| Post-install release notes UI | ✓ | ✗ | ✗ | ✗ | ◐ |
| System notify on download | ✓ | ◐ | ✗ | ✗ | ✓ |
| Windows mixer app label | ✓ | ✗ | ✗ | ✗ | ✗ |
| Global media hotkeys | ✗ | ◐ | ✗ | ✗ | ✗ |

---

## 3. Gap analysis

Features competitors have that RuForge lacks, ranked by how many of the four also have them. One-line disposition each.

### Table stakes (3+ of 4)

| Feature | Count | RuForge should… | Reason |
|---------|:-----:|-----------------|--------|
| Download history (incl. failed filter) | 3+ | **Defer** | Useful for downloader-only workflows; RuForge library + queue session is the retention model. High UI cost, low wedge value per `docs/RuForge.md`. |
| Per-URL granular format list UI | 3+ | **Defer** | Quality presets + audio toggle cover most users; full format grid is complexity solo dev should not chase before #10–#11 P0s in `STATE.md`. |
| Cross-platform macOS/Linux **ship** | 3+ | **Defer** | Linux dev exists; ship when maintainer widens release ritual, not for parity alone. |
| Proxy support | 3+ | **Defer** | Niche for RuForge audience; yt-dlp flag can wait until support tickets justify UI. |
| Cookie import beyond strip (file/Netscape bulk) | 3+ | **◐ Add small** | File picker exists for custom; improving discoverability beats 9-browser matrix. Aligns with explorer cookie story. |
| Light/dark theme | 3+ | **Skip** | Single branded warm palette is intentional; Jim pass targets polish not theme systems. |
| i18n | 3+ | **Skip** | Solo maintainer; English-first until user base demands it. |
| Browser extension handoff | 3+ | **Defer** | High value for YDLG parity, but protocol handler + extension maintenance is a product fork; explorer queue button is the current path. |
| Video-only download mode | 3+ | **Skip** | Rare vs audio-only wedge; complicates library playback assumptions. |

### Common (2 of 4)

| Feature | Count | RuForge should… | Reason |
|---------|:-----:|-----------------|--------|
| DMCA / legal acknowledgment modal | 2 | **Defer** | Parabolic-style caution is cheap copy; not blocking downloads today. Add before public marketing site if counsel wants it. |
| Keyring / saved login credentials | 2 | **Defer** | RuForge uses cookies, not username/password vaults; keyring is Parabolic-shaped. |
| Time-range clip / partial download | 2 | **Skip** | Niche; conflicts with "download whole item to library" model. |
| Filename template editor | 2 | **Defer** | Templates exist for duplicate replace/create; full editor is downloader-depth, not player wedge. |
| Speed limiter UI | 2 | **Skip** | Edge case; yt-dlp flag without UI is enough until requested. |
| aria2c integration | 2 | **Skip** | Windows WebView2 stack already bundles yt-dlp; second transport layer is maintenance. |
| Tools hub (thumb/subtitle/chat) | 2 | **Skip** | YDLG scope creep; RuForge auto thumbs/subs on download cover mainstream cases. |
| SponsorBlock at **download** time | 2 | **◐ Partial** | Playback SponsorBlock shipped; download-time removal is YDLG/yt-dlp feature, optional later. |
| JSON info viewer | 2 | **Skip** | Dev/power user; metadata already surfaces in hero/queue. |

### Niche (1 of 4)

| Feature | Count | RuForge should… | Reason |
|---------|:-----:|-----------------|--------|
| Single-screen minimal UI | 1 | **Skip** | Opposite of RuForge's library+player story. |
| config.toml preset hacking | 1 | **Skip** | dsymbol power-user path; not audience. |
| Queue table column toggles | 1 | **Skip** | ytdlp-interface density; RuForge floating drawer trades columns for focus. |
| Plugin manager | 1 | **Defer** | Only YDLG; consider if cookie unlock plugins become necessary. |
| Live chat archiver | 1 | **Skip** | Narrow use case. |
| Global media hotkeys | 1 | **Defer** | Planned in `miniplayer_plan.md`; good mini player upgrade, not downloader table stakes. |
| ReplayGain / loudness norm | 1 | **Defer** | Placeholder already in settings; ship when audio wedge deepens. |
| Right-click on queue rows | 1 | **Defer** | Nice QoL; queue already has hover actions. |
| `sleeping` queue state label | 1 | **Skip** | RuForge uses `held`/`manual`; rename docs only if users confuse.stall |

### Near-term P0 already tracked (`STATE.md`)

| Item | Disposition |
|------|-------------|
| Storage cap before enqueue (#10) | **Add** (table stakes for internal vault) |
| 429 rate-limit spacing (#11) | **Add** (downloader reliability) |
| Hero metadata with cookies | **Add** (fixes ◐ age-restricted preview) |

---

## 4. RuForge unique value (none of the four have all)

Specific capabilities for marketing copy. One sentence each usable on a landing page.

1. **Download-to-library loop:** Paste a link, queue with live size/ETA, and land in a searchable local Videos grid with watch progress, not a loose folder of files.
2. **Resume-aware player:** Pick up at furthest watched position with In Progress / Watched filters and thumbnail progress bars on every card.
3. **Chapter bar from your files:** Segmented scrubber with hover preview frames and prev/next chapter jumps from yt-dlp chapter sidecars, in main and mini players.
4. **SponsorBlock while watching:** Skip segments with adaptive learning, colored scrub markers, and a `{stem}.sponsorblock.json` sidecar, not just download-time removal.
5. **Audio-only LED stage:** Full-canvas bronze-to-red equalizer driven by real playback loudness with adaptive range, plus glass side waveforms, for downloaded music.
6. **Mini player desk companion:** Second transparent window with pin, five layout tiers, and one-click handoff of time, speed, volume, and mute back to the main app.
7. **Explorer cookie profile:** Embedded WebView2 YouTube session wired to yt-dlp Internal cookies without exporting files from nine browsers.
8. **Floating queue with hero sync:** Bottom-right drawer, crossfading thumbnails, stall watchdog, and processing phase labels tied to a focused hero download.
9. **Internal vault + cleanup:** Storage cap on `C:\RuForge\Media` with Authorize Cleanup to batch-delete toward 75% of limit using watch stats, not manual file hunting.
10. **Signed in-app updates:** Minisign-verified Tauri updater with a structured post-install What's New (additions/fixes), not only a GitHub Release page.
11. **Windows mixer truth:** Volume mixer shows RuForge with the app icon on WebView2 audio sessions, not a generic Chromium label.
12. **Replace-in-library re-download:** Duplicate dialog can remove the matched library file and redownload without orphan twin cards (0.1.7 dedupe).

---

## 5. Positioning paragraph

RuForge is the only app in this set built as a **download-and-watch library** on Windows: persistent queue, local Videos surface, a full player with chapters and SponsorBlock, and a separate mini player. Parabolic, yt-dlp-gui, ytdlp-interface, and YDLG UI are stronger if you only need to rip files, pick exact formats, or use a browser extension and tools hub without caring about playback. RuForge trades granular format pickers, download history screens, proxy/speed UI, cross-platform installers, and extension-first cookie import for that integrated library and player experience. Use **YDLG UI** or **Parabolic** when you want maximum site/format coverage and OS parity without a built-in theater. Use **ytdlp-interface** or **dsymbol yt-dlp-gui** when you want a small downloader-only utility. Use **RuForge** when the job is queue YouTube (and local files), keep them in a capped internal vault, and watch with chapter and sponsor-aware scrubbers without leaving the app.

---

## Source index (RuForge)

| Area | Paths |
|------|-------|
| Shell / nav | `src/App.tsx`, `src/store/ruforgeStore.ts` |
| Downloader | `src/components/DownloaderView.tsx`, `src/components/downloader/*`, `src-tauri/src/commands/downloader.rs` |
| Queue | `src/store/downloadQueueSlice.ts`, `src/downloadQueue.ts`, `src/downloadJobWatchdog.ts` |
| Library | `src/components/MediaView.tsx`, `src-tauri/src/commands/gallery.rs` |
| Player | `src/components/PlayerView.tsx`, `src/components/player/*` |
| Mini | `src/MiniPlayer.tsx` |
| Explorer | `src/explorerBoundsSync.ts`, `src/components/ExplorerTitlebarNav.tsx` |
| Settings | `src/components/SettingsView.tsx`, `src/store/types.ts` |
| Updater | `src/components/UpdaterLayers.tsx`, `updater.json`, `src-tauri/tauri.conf.json` |
| State | `STATE.md`, `AGENTS.md` |

*End of audit.*
