# RuForge — Product feature catalogue (source-verified)

**Generated from implementation** (React/TypeScript + Tauri v2). `docs/RuForge.md` and `AGENTS.md` are hints only; this document reflects what the code actually does as of inventory date **2026-05-16**.

**Tier legend**

| Tier | Meaning |
|------|---------|
| **Headline** | Primary product surface users would name in marketing |
| **Minor** | Real shipped behavior, secondary or contextual |
| **Incidental** | Polish, debug, legacy, backend-only, or emergent from fixes — still user-visible or operator-relevant |

**Half-wired** items are called out inline and summarized in [§ Half-wired / incomplete wiring](#half-wired--incomplete-wiring).

---

## App shell & navigation

- **Main window (undecorated)** — Frameless desktop shell with custom titlebar controls (minimize, maximize, close). `src-tauri/tauri.conf.json`, `src/App.tsx` (`WindowControls`) · **Headline**
- **Sidebar navigation** — Four tabs: Download, Videos (library), Explorer, System (settings). Player is not a sidebar tab; it opens when playback starts. `src/App.tsx` (`navItems`) · **Headline**
- **Sidebar expand/collapse** — Toggle at bottom; collapsed mode shows icon-only nav with hover tooltips. Persisted `ruforge-sidebar-expanded` (default expanded). `src/store/ruforgeStore.ts` (`toggleSidebar`), `src/store/types.ts` · **Minor**
- **Auto-collapse sidebar on narrow window** — When viewport width &lt; 1100px, sidebar collapses. `src/App.tsx` · **Incidental**
- **Accent color theming** — Settings accent drives CSS variables `--accent`, `--accent-rgb`, `--accent-glow` app-wide. `src/accentCss.ts`, `src/App.tsx` · **Minor**
- **Post-install “What’s new” mode** — After updater install, sidebar dims; Explorer/settings/gallery chrome blocked; scrollable release notes overlay. `src/App.tsx`, `src/components/UpdaterLayers.tsx` · **Headline** (updater flow)
- **Global YouTube URL drag-and-drop** — Drop canonical YouTube watch URLs on main content → switches to Download tab and enqueues via downloader registry. Non-YouTube drops ignored with toast. `src/features/downloader/useUrlDropIntake.ts`, `src/features/downloader/dropIntake.ts`, `src/App.tsx` · **Headline**
- **Drop blocked while duplicate dialog open** — Toast “Finish current dialog first.” `src/App.tsx` · **Incidental**
- **Player tab (implicit)** — `activeTab === "player"` when `playingFile` set; back returns to Videos. `src/store/ruforgeStore.ts`, `src/components/PlayerView.tsx` · **Headline**
- **Mini Player window routing** — Separate webview label `mini` renders `MiniPlayer.tsx` instead of main shell. `src/App.tsx`, `src/main.tsx` · **Headline**
- **Titlebar drag region** — Top strip (excluding right controls) moves window. `src/App.tsx` · **Minor**
- **Titlebar “Launch Mini Player”** — Opens/focuses mini window; if already in player, handoffs current file + time. `src/App.tsx` (`WindowControls`), `src/store/ruforgeStore.ts` (`handlePopOut`) · **Headline**
- **Explorer titlebar queue control** — On Explorer tab only: stage/add/remove current watch URL in download queue. `src/components/ExplorerWatchQueueButton.tsx` · **Headline**
- **Updater status pill in titlebar** — “Update Available” / “Downloading Update” when applicable. `src/components/UpdaterLayers.tsx` (`UpdaterStatusIndicator`) · **Minor**
- **Settings tab morph in title band** — Animated integration of settings sub-tabs into top chrome. `src/App.tsx` · **Minor**
- **Videos tab filter bulge** — All / In Progress / Watched pills in title area. `src/App.tsx` · **Headline**
- **Videos tab search bulge** — Expandable “Search library…” field; Escape collapses. `src/App.tsx` · **Headline**
- **Explorer “Open in Browser” bulge** — Opens `lastExplorerUrl` in system default browser via `open_external_url`. `src/App.tsx` · **Minor**
- **In-app toast notifications** — Bottom-right stack: types `info`/`warning` (4s), `error` (10s), `progress` (no auto-dismiss). `src/store/ruforgeStore.ts` (`notify`), `src/App.tsx` · **Headline**
- **Storage widget (sidebar)** — Shows used GB vs limit when internal storage target; “Authorize Cleanup” when full. `src/App.tsx` (`StorageWidget`), `src/store/ruforgeStore.ts` · **Headline**
- **Legacy `GalleryView.tsx`** — Alternate gallery UI; **not imported** by `App.tsx`. `src/components/GalleryView.tsx` · **Incidental** · **Half-wired** (dead UI)

---

## Downloader

### Intake paths

- **URL field (hero)** — Paste/type YouTube URL; placeholder “PASTE LINK”; metadata loads after **500ms** debounce via `get_video_info`. Hero shows title, duration, approx size, playlist count, blurred thumbnail. `src/components/DownloaderView.tsx`, `src/components/downloader/useDownloaderView.ts` · **Headline**
- **Responsive URL field hide** — Center URL input hidden below **700px** width; narrow layouts rely on top URL chip / other intake. `DownloaderView.tsx` · **Minor** · **Incidental** (layout constraint)
- **Main URL chip (copy/clear)** — Collapsible chip: copy link, clear link. `DownloaderView.tsx` (`MainDownloaderUrlChip`) · **Minor**
- **Clipboard on URL focus** — If clipboard has YouTube URL and field empty → auto-fill + “Pasted from clipboard”. If field already has URL → “Use it?” offer without overwrite. `src/downloaderClipboardYoutube.ts`, `useDownloaderView.ts` · **Headline**
- **“Queue another” (clipboard)** — Queue second URL without losing hero; pinned chips for staged URLs; hints for empty clipboard, conflicts, library skip, storage full, wait for metadata. `DownloaderView.tsx`, `useDownloaderView.ts` · **Headline**
- **Quick-enqueue pinned chips** — Removable chips for URLs added via quick enqueue. `DownloaderView.tsx` (`QuickEnqueuePinnedChip`) · **Minor**
- **Auto-stage previous URL** — Changing URL bar to different `http` link while metadata loaded auto-enqueues previous URL as **held** (unless duplicate in queue or auto-skip library duplicate). `useDownloaderView.ts` · **Minor**
- **Global drag-and-drop** — Same enqueue rules as quick enqueue; may stage current bar first. `src/App.tsx`, `useUrlDropIntake.ts`, `dropIntake.ts`, `youtubeUrlDropRegistry` · **Headline**
- **Explorer floating button** — On YouTube watch pages: “Source Found / Direct Download” → `manual-download-trigger`. `src/explorerInjectScript.ts` · **Headline**
- **Explorer context menu: Download video** — Same as floating button (`manual-download-trigger`). `explorerInjectScript.ts`, `App.tsx` · **Headline**
- **Explorer context menu: Send to downloader** — Fills downloader URL + switches to Download tab (metadata only, no queue). `explorerInjectScript.ts`, `App.tsx` · **Headline**
- **Explorer context menu: Copy link / Copy video ID** — Clipboard + toast. `explorerInjectScript.ts`, `App.tsx` · **Minor**
- **Explorer titlebar queue button** — Add/remove watch URL as **held**; duplicate skip when setting on. `ExplorerWatchQueueButton.tsx` · **Headline**
- **`manual-download-trigger` path** — Auto-enqueue when no library duplicate; auto-skip silent; else **only sets URL** (no duplicate dialog). `useDownloaderView.ts` (`requestDownload`), `App.tsx` · **Headline** · **Half-wired** (duplicate dialog not shown from Explorer direct download)
- **Duplicate `manual-download-trigger` listeners** — Both `App.tsx` (tab switch) and `useDownloaderView.ts` (`requestDownload`) subscribe. `App.tsx`, `useDownloaderView.ts` · **Incidental**
- **Browser / cookie strip (idle Download tab)** — Internal (RuForge explorer profile), Firefox, Edge, Safari, Brave, custom cookie file, None. `downloaderConstants.ts` (`BROWSER_OPTIONS`), `DownloaderView.tsx` · **Headline**
- **Default browser context `chrome`** — Persisted default but **not listed** in downloader strip UI until user picks an option; downloads still use `--cookies-from-browser chrome`. `src/store/types.ts` (`DEFAULT_SETTINGS`), `downloader.rs` · **Minor** · **Half-wired** (UI/default mismatch)
- **Custom cookie file picker** — `.txt` via Tauri dialog when “Cookies” selected. `useDownloaderView.ts` · **Minor**
- **Storage gate** — Internal vault at/over `storageLimitGB` blocks new downloads (buttons disabled, warnings). `App.tsx`, `DownloaderView.tsx`, `ExplorerWatchQueueButton.tsx` · **Headline**

### Metadata & hero UI

- **Metadata loading state** — Pacer animation, loading indicators. `DownloadJobQueuePanel.tsx` (`UrlInputPacer`), `DownloaderView.tsx` · **Minor**
- **Metadata error display** — Red pill with yt-dlp stderr under URL. `DownloaderView.tsx`, `useDownloaderView.ts` · **Headline**
- **“Already in your library” banner** — When duplicate detected and not auto-skipping and queue not busy. `DownloaderView.tsx` · **Headline**
- **Duplicate modal (Replace / Create new / Cancel)** — For explicit Download-tab download paths; batch playlist can apply one choice to all. `DuplicateDownloadDialog.tsx`, `duplicateDownload.ts`, `useDownloaderView.ts` · **Headline**
- **Replace filename template** — `%(title)s.%(ext)s` · **Create new** — `%(title)s [%(id)s].%(ext)s`. `duplicateDownload.ts` · **Minor**
- **Playlist detection on Download** — If hero metadata is playlist with resolvable watch URLs, enqueues each video (deduped); else single playlist URL for yt-dlp. `useDownloaderView.ts` (`handleDownloadClick`) · **Headline**
- **Hero subtitle hint** — When download subtitles enabled: “Enqueued Captions” + language label. `DownloaderView.tsx`, `types.ts` (`downloadSubtitleLangLabel`) · **Minor**
- **Hero metadata without cookies** — `get_video_info` uses no cookie options; age-restricted preview may fail while download with cookies might work. `src-tauri/src/commands/downloader.rs` · **Incidental** · **Half-wired**

### Download queue

- **Multi-job queue panel** — Bottom “Download queue” while any job not `completed`/`failed`. Per row: thumb, title, status, % + bytes when downloading, error snippet, actions. `DownloadJobQueuePanel.tsx`, `downloadQueueSlice.ts`, `downloadQueue.ts` · **Headline**
- **Job statuses** — `queued`, `downloading`, `paused`, `completed`, `failed` (human labels in `downloaderConstants.ts`). · **Headline**
- **Approval modes** — `held` (staged), `auto` (pump-eligible), `pending` (Yes/No), `manual` (won’t auto-start). UI suffixes: “staged”, “confirm”, “manual”. `downloadQueue.ts`, `DownloadJobQueuePanel.tsx` · **Headline**
- **Hero Download button** — `releaseHeldDownloadJobs()` then `pumpDownloadQueue()`. `useDownloaderView.ts` · **Headline**
- **Pause / resume** — Pause kills yt-dlp, `resumeOnStart`; resume uses `--continue` when restarting. `downloadQueueSlice.ts`, Tauri `pause_download_job` / `start_download_job` · **Headline**
- **Retry failed** — Re-queue with `auto`, clear error, pump. `downloadQueueSlice.ts` · **Headline**
- **Remove job** — Removes row; pauses first if downloading. `downloadQueueSlice.ts` · **Headline**
- **Reorder** — Chevron up/down for `queued`/`paused` only (not drag-and-drop). `DownloadJobQueuePanel.tsx` · **Minor** · **Incidental** (comment in `mediaKind.ts` notes draggable queue deferred)
- **Pending approval UI** — “Add to auto-queue?” Yes → `auto` + pump; No → `manual`. `DownloadJobQueuePanel.tsx` · **Headline**
- **Concurrency cap** — At most `maxConcurrentDownloads` jobs `downloading` (default **1**, max **6**). `downloadQueueSlice.ts`, `types.ts` · **Headline**
- **Focused job / hero binding** — Click queue row → `focusedJobId`; hero/backdrop/progress mirror focused job; legacy `downloading`/`progress` fields mirror focused downloading job only. `downloadQueueSlice.ts`, `useDownloaderView.ts` · **Headline**
- **Large progress UI when focused job downloading** — Segmented “big progress” bar on hero. `DownloaderView.tsx` · **Minor**
- **Session persistence** — `sessionStorage` key `ruforge-download-queue`: only `queued` and `paused`; on reload `auto` → `held`. `downloadQueue.ts` · **Headline**
- **Orphan metadata hydrate** — Thin queue rows re-fetch `get_video_info` on load. `downloadQueueSlice.ts`, `downloadQueueMetadataCache.ts` · **Minor**
- **Queue panel hides when “done”** — When all jobs `completed` or `failed`, panel hidden (completed/failed rows not shown). `DownloadJobQueuePanel.tsx` (`queuePanelShouldShow`) · **Minor**
- **URL conflict detection** — Blocks enqueue if URL matches main field or active queue job. `downloaderUrlConflict.ts`, `useDownloaderView.ts` · **Minor**
- **Post-download: switch to Videos + notify** — When job finishes and nothing left active, `activeTab` → `media`, toast, unfocused OS notify. `App.tsx` (`onDownloadSuccess`) · **Headline**
- **Download progress events** — `download-progress` (%, speed, ETA, playlist index/title, bytes), `download-job-finished`, `download-job-paused`. Rust `downloader.rs`; listeners in `useDownloaderView.ts` · **Headline**
- **Playlist progress in queue UI** — `DownloadQueueItem` carousel for multi-item playlist jobs. `DownloadJobQueuePanel.tsx` · **Minor**

### Format, output & backend download behavior

- **Preferred quality → yt-dlp `-f`** — 4K / 1080p (default) / 720p / Best Available. `downloadFormat.ts`, `buildDownloadJobOptions` in `downloadQueue.ts`, `downloader.rs` · **Headline**
- **Storage target: Internal** — `C:\RuForge\Media` (`RUFORGE_INTERNAL_DIR`). **Custom** — `outputDir` (default `C:\Downloads`). Persisted `ruforge-save-internal`, `ruforge-output-dir`. · **Headline**
- **Options frozen per job** — Settings changes after enqueue do not alter existing jobs’ `options`. `downloadQueue.ts` · **Minor**
- **Cookies on download** — `browserContext` / `cookieFile` in job options; `ruforge` → Explorer WebView2 profile path. `downloader.rs`, `useDownloaderView.ts` · **Headline**
- **yt-dlp post-processing (Rust)** — `--windows-filenames`, `--write-info-json`, `--write-thumbnail`, thumb→jpg; playlist subfolder; post-download frame extract spawn. `downloader.rs` · **Minor** (user sees results in library)
- **Supported download containers** — Gallery/scan extensions: `mp4`, `mkv`, `webm`, `mp3`, `m4a`, `flac`. `src-tauri/src/utils.rs` · **Minor** (not a downloader UI list)

### Subtitles (download)

- **Download subtitles toggle** — Off → no `--write-subs`; On → `--write-subs`, `--write-auto-subs`, `--sub-langs`, `--convert-subs vtt`. Default **on**. `SettingsView.tsx`, `types.ts`, `downloader.rs` · **Headline**
- **Subtitle language presets** — English (`en.*`, default), Spanish, French, German, Portuguese, Japanese, Korean, Chinese, EN+ES, EN+ES+FR. `types.ts` (`DOWNLOAD_SUBTITLE_LANG_PRESETS`) · **Headline**
- **Playback subtitle preference separate** — `subtitlePreferredLang` is player-only, not enqueue. `types.ts` · **Minor**

### yt-dlp binary & updates

- **Bundled vs userdata binary** — Active binary reported in status (`activeSource`: `bundled` | `userdata`). `ytdlp_update.rs`, `ytdlp_binary.rs` · **Minor**
- **Update banner on Download tab** — When update available / updating / error: version text, progress bar, **Update yt-dlp** / **Later** (session dismiss). `DownloaderView.tsx`, `useDownloaderView.ts` · **Headline**
- **Update check cache TTL** — **12 hours**. `ytdlp_update.rs` · **Incidental**
- **Update blocked during active downloads** — `download_ytdlp_update` checks active jobs. `ytdlp_update.rs` · **Minor**
- **Update progress phases** — `downloading`, `verifying`, `done` via `ytdlp-update-download-progress` event. · **Minor**

### Downloader errors & notifications

- **Download failure toast + overlay** — Truncated error line; unfocused notify. `App.tsx`, `downloadQueueSlice.ts` · **Headline**
- **Success toast** — “Complete”; refreshes storage stats. `App.tsx` · **Headline**
- **Auto-skip duplicate toast** — “Duplicate detected, skipping per user settings.” `useDownloaderView.ts` · **Minor**
- **yt-dlp update errors in banner** — Invoke error or `checkError` from status. `DownloaderView.tsx` · **Minor**

---

## Settings (System tab)

Settings UI: `src/components/SettingsView.tsx`. Persisted via Zustand `partialize` → `ruforge-settings`, `ruforge-output-dir`, `ruforge-save-internal` (`src/store/ruforgePersistStorage.ts`). Defaults: `src/store/types.ts` (`DEFAULT_SETTINGS`).

### Navigation (not a user preference)

- **Settings sub-tabs** — General, Downloads, Appearance, Advanced (`settingsTab`, default `general`). `SettingsView.tsx`, `ruforgeStore.ts` · **Minor**

### General

| Setting | UI label | Options | Default | Behavior | Tier |
|---------|----------|---------|---------|----------|------|
| `storageLimitGB` | Storage Limit | 10, 25, 50, 100, 250 GB | **50** | Internal target: sidebar meter + blocks downloads at ≥100%. Custom target: meter styling only (uses `usedGB * 8` cap trick), no download block. | **Headline** |
| `launchAtStartup` | Launch at Startup | Toggle | **true** | Tauri autostart plugin enable/disable; sync on rehydrate. | **Headline** |
| `minimizeToTray` | System Tray | Toggle | **true** | `update_tray_config`; close hides main window when on. | **Headline** |

### Downloads

| Setting | UI label | Options | Default | Behavior | Tier |
|---------|----------|---------|---------|----------|------|
| `saveToInternal` + `outputDir` | Storage Target | INTERNAL / CUSTOM + path picker | **internal true**, custom path **C:\Downloads** | Scan + download destination. | **Headline** |
| `preferredQuality` | Preferred Quality | 4K, 1080p (HD), 720p, Best Available | **1080p (HD)** | yt-dlp format string per `downloadFormat.ts`. | **Headline** |
| `maxConcurrentDownloads` | Concurrent downloads | Presets 1 (Sequential), 2 (Mild), 3 (Higher); Custom **4–6** stepper | **1** | Parallel `start_download_job` cap; changing value pumps queue. | **Headline** |
| `downloadSubtitles` | Download Subtitles | Toggle | **true** | Controls `--write-subs` / langs. | **Headline** |
| `downloadSubtitleLangs` | Subtitle Languages | Preset list (see Downloader) | **en.*** | `--sub-langs` when subs on. | **Headline** |
| `skipDuplicatesAutomatically` | Skip Duplicates | Toggle | **false** | Skips enqueue + notifies; no Replace/Create dialog. | **Headline** |
| `outputDir` | Download Path | Folder picker | **C:\Downloads** | Used when not internal. | **Headline** |

### Appearance

| Setting | UI label | Options | Default | Behavior | Tier |
|---------|----------|---------|---------|----------|------|
| `accentColor` | Accent Color | Native color input (hex) | **#EDCF9B** | CSS vars via `syncRuforgeAccentCss`; Mini reads same LS key. | **Minor** |
| `gridDensity` | Grid Density | Cozy, Default, Compact | **Default** | `MediaView.tsx` grid column/gap classes. | **Minor** |

### Advanced

| Setting | UI label | Options | Default | Behavior | Tier |
|---------|----------|---------|---------|----------|------|
| `audioAutoAdvanceFolder` | Auto-advance local audio | Toggle (`!== false` = on) | **true** | On track end: pause if off; else folder queue then library-sorted list. **Also advances video** in main/mini despite “audio” label. | **Headline** · **Half-wired** (label vs behavior) |
| `audioPrefetchNext` | Prefetch next audio | Toggle | **true** | Hidden `<audio preload="auto">` for next **folder** track when audio-only. | **Minor** |
| *(none)* | ReplayGain / loudness normalization | Static “Not shipped” | N/A | No-op placeholder. | **Incidental** |
| `hardwareAcceleration` | Hardware Acceleration | Toggle | **true** (+ Rust disk pref sync on load) | Toggle → `set_hardware_acceleration_pref` → **app relaunch**; WebView2 extra args. | **Headline** |
| — | Cycle Updater UI | Button “CYCLE PHASES” | — | Emits `debug-cycle-updater` for dev updater walkthrough. | **Incidental** |
| — | Clear Cache | “PURGE SYSTEM CACHE” | — | `clear_ruforge_cache` (ffprobe cache dir); toast with count. | **Minor** |

### Downloader-only persisted settings (not on System tabs)

| Setting | UI | Options | Default | Behavior | Tier |
|---------|-----|---------|---------|----------|------|
| `browserContext` | Browser strip | ruforge, firefox, edge, safari, brave, custom, None | **chrome** (not in strip) | yt-dlp cookies for downloads. | **Headline** · **Half-wired** |
| `cookieFile` | With custom | `.txt` path | **""** | `--cookies` file. | **Minor** |
| `subtitlePreferredLang` | Player subtitle menu | Per sidecar track | **null** | Playback overlay track pick; persisted in `ruforge-settings`. | **Headline** |

### App chrome preferences (not in SettingsView)

| Key | Default | Persisted | Behavior | Tier |
|-----|---------|-----------|----------|------|
| `isSidebarExpanded` | **true** | `ruforge-sidebar-expanded` | Sidebar width/labels. | **Minor** |
| `galleryFilter` | **all** | No | All / In Progress / Watched on Videos tab. | **Headline** |
| `searchValue` | empty | No | Library title filter. | **Headline** |
| `lastExplorerUrl` | `https://www.youtube.com` | No (session) | Explorer URL mirror + Open in Browser. | **Minor** |
| `volume` | **0.8** | `miniplayer-volume` | Player volume 0–1. | **Headline** |
| `isMuted` | false | No | Session mute. | **Minor** |
| `isLooping` | **false** | `miniplayer-loop` | Player + main store loop. | **Headline** |
| `miniplayer-pinned` | **false** | yes | Mini always-on-top. | **Minor** |
| `ruforge-subtitle-drag-y` | unset | yes | Subtitle overlay vertical offset. | **Minor** |
| `views-{path}` | 0 | per file | Play count on library cards (separate from watch progress). | **Incidental** |

---

## Player (main window)

### Playback & controls

- **Play / pause** — Click media surface, control bar, Space. `PlayerView.tsx` · **Headline**
- **Click flash overlay** — Brief visual on play/pause. `PlayerView.tsx` · **Incidental**
- **Controls auto-hide** — Hide after 3s while playing; show on mouse move; hide cursor when hidden. · **Headline**
- **Volume** — Slider + wheel ±0.05 on surface; persisted `miniplayer-volume`. · **Headline**
- **Mute** — Button, **M** key, middle-click (aux) on surface; transient volume overlay. · **Headline**
- **Playback speed** — 0.25×–2× menu; `preservesPitch` on. · **Headline**
- **Hold-edge speed** — Hold left/right half 500ms → temporary 0.5× / 2× with badge. · **Minor**
- **Skip** — Keyboard ←/→ ±10s; buttons ±15s (sm+). · **Headline** / **Minor**
- **Fullscreen** — Button, double-click video, **F**. · **Headline**
- **Back to library** — Returns to Videos tab. `PlayerView.tsx`, `App.tsx` · **Headline**
- **Pop out to Mini Player** — Saves position, handoff file + time, clears main `playingFile`. · **Headline**
- **Video ambient backdrop** — Blurred canvas sampled from video ~10fps. · **Minor**
- **Opacity dip on file change** — Reduces flash between videos. · **Incidental**
- **Audio-only mode** — `mp3`/`m4a`/`flac`: hidden `<audio>`, poster, optional Windows “Sound settings…”. `mediaKind.ts`, `PlayerView.tsx` · **Headline**
- **Audio disclaimer copy** — Mentions WebView audio; references “Open in Browser” for `sourceUrl` files but **no Open in Browser control on player** (Explorer has it). · **Minor** · **Half-wired**
- **`probe_local_media_ffprobe` on load** — No UI surfacing. · **Incidental**
- **`PlayerViewHandle.getCurrentTime`** — Ref API for pop-out handoff. · **Incidental**
- **`onSubtitleToggle` prop** — Never passed from `App.tsx`. · **Half-wired**

**Main player keyboard** (ignores INPUT/TEXTAREA): Space, ←/→ ±10s, ↑/↓ volume, M, F, L loop — `PlayerView.tsx`.

### Subtitles / CC

- **Sidecar discovery** — Tauri `get_subtitle_tracks`; VTT via `read_local_subtitle_vtt` (+ YouTube rolling VTT normalize). `localVideoSubtitles.ts`, `youtubeRollingVttNormalize.ts` · **Headline**
- **Custom cue overlay** — Native `<track>` hidden; `useSubtitleCueOverlay` renders cues. `index.css` · **Headline**
- **VTT text cleanup** — Strip tags, entities, `>>` speakers. · **Minor**
- **Toggle + language menu** — When multiple tracks; persists `subtitlePreferredLang`. · **Headline**
- **Auto-enable matching persisted lang** — On open. · **Minor**
- **Vertical drag + persist** — `ruforge-subtitle-drag-y`; clamped above scrubber. · **Headline**
- **Hide cues when controls hidden** — `.controls-hidden` padding. · **Minor**
- **No subtitles on audio-only** — · **Headline**

### Scrubber & thumbnails

- **Progress bar** — Buffered + played + hover preview line. · **Headline**
- **Drag scrub** — Pauses if playing; live %; resume on release; `writePlaybackPos` on release. · **Headline**
- **Hover time tooltip** — · **Headline**
- **Sprite hover thumbnails** — `ScrubberHoverThumb`: 160×90, 5s cells, 10×10 grid from `extract_frames`. `scrubSpritePreview.tsx` · **Headline**
- **Sprites loaded per open** — Failures console-only. · **Minor**

### Loop & auto-advance

- **Loop toggle** — UI + `media.loop` + **L**; skips end handler when on. · **Headline**
- **On end (no loop)** — Write full duration to playback storage; advance per settings. · **Headline**
- **Advance order (main)** — `folderAudioPlaylist` → library-wide sorted list (audio vs video list by file type). · **Headline**
- **Folder playlist auto-fill** — Scans same directory for same kind (audio/video) when playing file. `App.tsx` · **Headline**
- **Next Up drawer** — Lists `folderAudioPlaylist` (name says audio; used for video neighbors too). · **Minor** · **Half-wired** (naming)
- **Prev/next folder buttons** — When neighbors exist. · **Minor**
- **Prefetch next audio** — Hidden second `<audio>` for next folder track. · **Minor**
- **Playlist Play All / Shuffle** — Sets `folderAudioPlaylist`. `PlaylistDetailView.tsx`, `ruforgeStore.ts` · **Headline**
- **`handlePlayFolderNeighbor` in store** — No UI callers. · **Half-wired**

### Playback persistence

- **Furthest position** — `ruforge-playback-pos:{path}`; never decreases. · **Headline**
- **Stored duration** — `ruforge-playback-dur:{path}` when catalog duration 0. · **Headline**
- **Resume** — Furthest unless within **1.25s** of end → start at 0. `END_EPSILON_SEC` · **Headline**
- **Watched** — Furthest ≥ **90%** of effective duration. `WATCHED_FRACTION` · **Headline**
- **Persist cadence** — ~4s during play; pause; scrub end; pop-out; natural end. · **Headline**
- **Library progress bars** — `getPlaybackThumbnailBar`, `getWatchProgress`. `playbackStorage.ts`, `MediaView.tsx` · **Headline**
- **`clearPlaybackPos`** — Defined, no UI. · **Half-wired**

---

## Mini Player

- **Separate window** — Label `mini`; undecorated, transparent; dynamic create. `player.rs`, `MiniPlayer.tsx` · **Headline**
- **Own `playingFile` state** — Not main Zustand store. · **Headline**
- **Cross-window events** — `play-media`, `play-in-mini`, `stop-playback`, `send-to-main`, `mini-player-ready`. · **Headline**
- **Resume** — `readResumeSeconds` or handoff `startTime`. · **Headline**
- **Pin always-on-top** — `miniplayer-pinned`. · **Minor**
- **Back to app** — `send-to-main`, focus main, close mini. · **Headline**
- **Media selector + bottom strip** — Empty state = scrollable library grid. · **Headline**
- **Playlist strip plays first item only** — Not full playlist queue. · **Half-wired**
- **Compact mode (&lt;340px or &lt;300px height)** — Smaller chrome; subtitle tracks/hook inactive. · **Headline**
- **Audio compact UI** — Waveform animation, cover, scrub, loop. · **Minor**
- **Dynamic accent from poster** — + settings accent. · **Minor**
- **Own gallery scan** — Duplicates store logic; reads `ruforge-output-dir` + hardcoded internal path. · **Incidental**
- **Loop local state** — Writes `miniplayer-loop` but not Zustand `setLooping` (same LS key as main). · **Half-wired**
- **Advance: full-library sorted list** — Not folder scan; uses `readAudioAutoAdvanceFolder`. · **Headline** (differs from main)
- **Keyboard** — Space, ←/→ ±15s; **no** input guard. · **Minor**
- **View counter** — `views-{path}` on select. · **Incidental**
- **Window drag handle** — `startDragging()`. · **Minor**
- **Resize handle** — `startResizeDragging("SouthEast")`. · **Minor**
- **Windows Sound settings** — `open_windows_sound_settings`. · **Minor**

---

## Video Library (Media view)

### Scanning & data model

- **Dual-root scan** — Always scans internal `C:\RuForge\Media` + custom `outputDir`; dedupe by path. `ruforgeStore.ts` (`fetchEntries`), `gallery.rs` (`scan_gallery`) · **Headline**
- **Supported file types** — `mp4`, `mkv`, `webm`, `mp3`, `m4a`, `flac`. · **Headline**
- **Single files** — `kind: "media"` entries with metadata (duration, posters, subtitles path, chapters, `sourceUrl`, etc.). `types.ts`, `gallery.rs` · **Headline**
- **Folder playlists** — Subdirectories with media → `PlaylistCollection` (title = folder name, `folder.jpg` or first poster as stack thumb). · **Headline**
- **Poster backfill** — `ensure_poster_if_missing` for missing posters → rescan. `posterBackfill.ts` · **Minor**
- **Refetch on path settings change** — `outputDir` / `saveToInternal`. `MediaView.tsx` · **Headline**
- **`libraryScanRevision`** — Bumped on scan for downloader duplicate checks. · **Incidental**
- **Loading state** — `galleryLoading` + empty/loading UI. · **Minor**

### Filter, search, layout

- **Filter tabs** — All / In Progress / Watched (title bar). Playlists **excluded** from In Progress/Watched filters. `App.tsx`, `MediaView.tsx` · **Headline**
- **Search** — Matches entry **title/name** only (expandable field). · **Headline**
- **Grid density** — Cozy / Default / Compact from settings. · **Minor**
- **Date grouping** — Today, Yesterday, formatted date headers. · **Minor**

### Cards & interaction

- **Video card click** — Play + increment `views-{path}`. · **Headline**
- **Hover preview** — Muted `<video>` preview + unmute toggle. · **Headline**
- **Duration badge** — · **Minor**
- **Playback progress bar on card** — From `getPlaybackThumbnailBar`. · **Headline**
- **Playlist stack card** — Opens `PlaylistDetailView`. · **Headline**

### Context menu (right-click or ⋮)

- **Play** — · **Headline**
- **Generate Previews** — `extract_frames` (scrub sprites); “Extracting…” overlay. · **Minor**
- **Delete** — `delete_media` + refresh. · **Headline**
- **Click-away dismiss** — · **Incidental**

### Playlist detail

- **Play All / Shuffle** — Sets queue in store. `PlaylistDetailView.tsx` · **Headline**
- **Per-item play** — · **Headline**
- **Per-row progress bars** — From playback storage. · **Minor**
- **Row ⋮ menu** — **Not wired**. · **Half-wired** / **Incidental**

### Local library intake (no upload UI)

- **No in-app file upload** — Library populated by downloads and by placing files in scanned folders (internal/custom paths). Scan-only. · **Headline** (implicit product model)

---

## Explorer webview

- **Embedded child webview** — Label `explorer-view` on main window; positioned by 1s poll when Explorer tab active; hidden otherwise. `App.tsx` · **Headline**
- **Default / session URL** — Store `lastExplorerUrl` (default YouTube home); updated by **800ms** poll `get_embedded_explorer_webview_url` while tab active. **Not persisted** across restarts. · **Minor**
- **Inject script on create** — Accent-colored floating button + context menu; reinject **not** tied to accent setting changes. `explorerInjectScript.ts`, `App.tsx` · **Half-wired** (accent reinject)
- **Watch-page floating download** — See Downloader intake. · **Headline**
- **Context menu on video area only** — `#movie_player`, `ytd-player`, etc. · **Minor**
- **YouTube URL polling in inject** — 1s interval + `yt-navigate-finish`. · **Incidental**
- **Open in Browser** — External browser for current mirrored URL. · **Minor**
- **Cookie profile for yt-dlp** — `explorer-data/EBWebView/Default` when browser = Internal. · **Headline** (downloader enabler)
- **Shimmer placeholder** — Under webview while loading. `App.tsx` · **Incidental**
- **Explorer debug logging** — `addLog` → `tray_front_debug` / stderr only. · **Incidental**

### Not shipped on embedded Explorer

- **uBlock extension** — Bundled under `src-tauri/extensions/ublock/` but only loaded in **unused** `open_youtube_explorer` standalone command. · **Half-wired**
- **Standalone explorer window** — `open_youtube_explorer` registered in Rust, **never called** from frontend. · **Half-wired**
- **`explorer-url` event listener** — Only standalone script emits; embedded uses polling. `App.tsx` · **Half-wired**

---

## System integration

### System tray

- **Tray icon + menu** — Show; Troubleshooting submenu (Reload Interface, Toggle GPU & Restart, Reset App Data & Restart); Quit. `src-tauri/src/tray.rs` · **Headline**
- **Show** — Emits `ruforge:tray-show-main` → main window unminimize/show/focus (triple pass). `App.tsx` · **Headline**
- **Close to tray** — When `minimizeToTray` true: hide + prevent close. `lib.rs`, settings · **Headline**
- **Reload Interface** — `location.reload()` on main. · **Minor**
- **Toggle GPU & Restart** — **Exits app only**; does not toggle HW pref. · **Half-wired**
- **Reset App Data & Restart** — `localStorage.clear()` + reload + exit; **does not** clear `explorer-data` or app-data dirs. · **Half-wired**

### Background notifications

- **Notify overlay window** — Separate label `notify`; runtime-created (not in `tauri.conf.json`). `NotifyOverlayApp.tsx`, `notify_overlay.rs` · **Headline**
- **`notifyWhenUnfocused`** — Pushes to overlay when main not focused. `systemNotify.ts` · **Headline**
- **Overlay dismiss** — Enter/Space on card. `NotifyOverlayApp.tsx` · **Minor**

### Auto-updater

- **Plugin config** — `tauri.conf.json` `plugins.updater`; capabilities `updater:allow-check`, `updater:allow-download-and-install`. · **Headline**
- **Startup check** — `check()` on main mount; drives phases `idle` | `available` | `downloading` | `installing`. `App.tsx` · **Headline**
- **Teaser card** — Top-right, `line-clamp-3`, markdown teaser from `teaserNotesFromUpdaterBody`. `UpdaterLayers.tsx` (`UpdaterMainOverlays`) · **Headline**
- **Titlebar badge** — See shell. · **Minor**
- **Full-screen update UI** — During download/install. `UpdaterFullWindowUpdate` · **Headline**
- **Post-install notes** — Structured JSON or markdown via `updatePostInstall.ts`; categorized additions/fixes with Iconify slugs. · **Headline**
- **Install + restart** — `downloadAndInstall`, `setPendingPostInstall`. · **Headline**
- **Rust startup check** — Also calls `updater.check()` in `lib.rs` but **println only** (no UI). · **Incidental** · **Half-wired**
- **`onDismiss` on teaser** — Prop passed but **no dismiss button** in overlay component. · **Half-wired**
- **Debug: click full-screen update UI** — Emits `debug-cycle-updater`. · **Incidental**
- **Settings: Cycle Updater UI** — Same debug event. · **Incidental**

### Window & platform

- **WebView2** — Windows desktop target. · **Headline** (platform)
- **Hardware acceleration pref** — Disk + relaunch; browser args on webviews. `settings.rs`, `App.tsx` · **Headline**
- **Autostart** — `@tauri-apps/plugin-autostart`. · **Headline**
- **Open external URL** — Explorer “Open in Browser”. · **Minor**
- **Open Windows sound settings** — Player + Mini audio troubleshooting. · **Minor**
- **Authorize cleanup** — Deletes oldest files in internal vault until **2 GB** free target. `authorize_cleanup` · **Headline**
- **Clear ffprobe cache** — Settings Advanced. · **Minor**

---

## Incidental behaviors (explicit)

| Behavior | Where | Notes |
|----------|-------|-------|
| Queue row Enter/Space focus | `DownloadJobQueuePanel.tsx` | Accessibility |
| Explorer inject Escape closes menu | `explorerInjectScript.ts` | |
| Gallery search Escape collapses | `App.tsx` | |
| Notification timer cleanup on unload/HMR | `main.tsx`, `ruforgeStore.ts` | |
| Persist storage diff skip on identical snapshot | `ruforgePersistStorage.ts` | Reduces LS writes during search typing |
| Zustand player/tab atomicity on mini stop | `App.tsx` | Avoids `player` tab with null `playingFile` |
| `stop-playback` event | `App.tsx`, `MiniPlayer.tsx` | Cross-window stop |
| Mini re-emits `play-in-mini` on `mini-player-ready` | `ruforgeStore.ts` | Handoff race fix (5s timeout) |
| Download metadata cache | `downloadQueueMetadataCache.ts` | Session metadata for queue rows |
| YouTube URL normalization/compare | `youtubeUrl.ts` | Dedup, duplicates, conflicts |
| Titlebar hover tooltips | `TitlebarHoverButton.tsx` | |
| Custom dropdown component in Settings | `SettingsView.tsx` (`CustomSelect`) | |
| `CustomDropdown.tsx` | Standalone component file | Verify usage if marketing lists “custom selects” |
| Chapter data on `MediaFile` | `types.ts`, `gallery.rs` | **No player chapter UI** found |
| `downloadMetadataHint` on entries | `types.ts` | **No UI** surfaced in components grep |
| Deferred: draggable queue, crossfade, gapless | `mediaKind.ts` comment | Not implemented |

---

## Half-wired / incomplete wiring

| Issue | Evidence |
|-------|----------|
| Hero `get_video_info` ignores cookies | `downloader.rs` — simulate with `None` |
| Default `browserContext: "chrome"` not in downloader strip | `types.ts` vs `BROWSER_OPTIONS` |
| Explorer direct download skips duplicate dialog | `requestDownload` only `setDownloaderUrl` |
| Narrow layout hides center URL field | `DownloaderView.tsx` `min-[700px]` |
| `GalleryView.tsx` unused | Not in `App.tsx` |
| uBlock not on embedded Explorer | Only `open_youtube_explorer` |
| Standalone explorer + `explorer-url` dead path | Rust command unused; listener redundant |
| Tray “Toggle GPU” doesn’t toggle pref | `tray.rs` exits only |
| Tray reset doesn’t clear explorer profile | `localStorage` only |
| Auto-advance setting name vs video advance | `PlayerView.tsx`, `MiniPlayer.tsx` |
| Mini vs main advance semantics differ | Folder scan vs library sort |
| Mini loop/volume vs Zustand | Same LS keys, no live sync |
| Mini playlist strip first item only | `MiniPlayer.tsx` |
| `onSubtitleToggle`, `openPath` unused in PlayerView | Props/imports |
| `handlePlayFolderNeighbor` no UI | `ruforgeStore.ts` |
| `clearPlaybackPos` no UI | `playbackStorage.ts` |
| Playlist row ⋮ no menu | `PlaylistDetailView.tsx` |
| Player audio copy mentions Open in Browser without control | `PlayerView.tsx` |
| Updater teaser `onDismiss` unused | `UpdaterLayers.tsx` |
| Explorer accent not reinjected on change | `App.tsx` effect deps |
| Duplicate `manual-download-trigger` handlers | `App.tsx` + `useDownloaderView.ts` |

---

## Primary source index

| Area | Key paths |
|------|-----------|
| Shell | `src/App.tsx`, `src/main.tsx` |
| Store | `src/store/ruforgeStore.ts`, `src/store/downloadQueueSlice.ts`, `src/store/types.ts` |
| Downloader | `src/components/DownloaderView.tsx`, `src/components/downloader/*` |
| Player | `src/components/PlayerView.tsx`, `src/playbackStorage.ts`, `src/useSubtitleCueOverlay.ts` |
| Mini | `src/MiniPlayer.tsx` |
| Library | `src/components/MediaView.tsx`, `src/components/PlaylistDetailView.tsx` |
| Explorer | `src/explorerInjectScript.ts`, `src/components/ExplorerWatchQueueButton.tsx` |
| Settings | `src/components/SettingsView.tsx` |
| Updater | `src/components/UpdaterLayers.tsx`, `src/updatePostInstall.ts`, `updater.json` |
| Tauri | `src-tauri/src/lib.rs`, `commands/downloader.rs`, `commands/gallery.rs`, `commands/player.rs`, `commands/ytdlp_update.rs`, `tray.rs` |

---

*End of catalogue.*
