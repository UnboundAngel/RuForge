# RuForge - Known problems (report-only backlog)

This file is for **reporting broken behavior only**. Do not implement fixes here or in the same pass as adding an entry. Fixes land in a dedicated batch patch pass later.

For project context, read `STATE.md`. For open bugs to fix, read this file after a report-only update.

Last updated: 2026-06-28

---

## Workflow

1. **Report** new or recurring issues in this file (symptoms, repro, code pointers). Status stays **Open** until a fix ships.
2. **Batch fix pass** (separate session): pick items from here, implement, then move shipped fixes to `AGENTS.md` Shipped log / release notes. Do not mark **Fixed** or **Mitigated** in this file during the fix pass until release (optional: remove closed items or add a one-line "Shipped in X.Y.Z" after release).

---

## P0 - Auto-update hangs on "Applying update"

**Severity:** Blocks in-app updates for real users.  
**Status:** Open  
**Reported:** 2026-06-28

### Symptom

1. User taps **Install & Restart** (or Settings triggers a user-initiated check that auto-installs).
2. Full-window **Downloading update** screen appears and progress completes (or indeterminate bar runs).
3. UI transitions to **Applying update** / "Finalizing installation".
4. Screen never advances. App does not restart. User remains stuck indefinitely.
5. If the user clicks the full-screen overlay, a **What's New** modal can appear showing **BUILD 9.9.9-MOCK** and debug copy (see P0-b).

### Repro (observed)

1. Run a build older than `updater.json` on `main` (or point `plugins.updater.endpoints` at a higher version for local testing).
2. Settings > Check for updates, or accept the teaser card > **Install & Restart**.
3. Wait through download > installing phase.

### Expected

- NSIS installer runs after download `Finished`.
- App process exits and relaunches on the new version.
- On first launch after install, `consumePendingPostInstall()` reads `ruforge.postInstallPayload.v1` from `localStorage` and shows **What's New** for the actual update version and `updater.json` notes.

### Actual

- Phase stays `installing` with no restart.
- Clicking the overlay can surface mock debug UI instead of helping recovery (P0-b).

### Relevant code

| Area | Location |
|------|----------|
| Install handler | `src/App.tsx` > `handleInstallRestart` |
| Full-window phases | `src/components/UpdaterLayers.tsx` > `UpdaterFullWindowUpdate` |
| Pre-install payload write | `src/updatePostInstall.ts` > `setPendingPostInstall` / `consumePendingPostInstall` |
| Updater endpoint | `src-tauri/tauri.conf.json` > `plugins.updater` |
| Live manifest | `updater.json` on `main` |

### Suspected cause (for fix pass)

- `handleInstallRestart` sets phase to `installing` on plugin `Finished` but has no timeout or error path if NSIS never completes or never kills the webview.
- The `catch` path treats `installFinished === true` as success and returns silently, which can leave **Applying update** forever if install fails after `Finished`.
- `setPendingPostInstall` runs before download starts; failed installs may leave stale payload in `localStorage` unless `clearPendingPostInstall` runs.

---

## P0-b - Debug updater cycle on production update screen (mock 9.9.9-MOCK)

**Severity:** High (masks real failure, exposes debug UX to all users).  
**Status:** Open  
**Reported:** 2026-06-28  
**Cluster:** Same session as P0; clicking while stuck triggers this.

### Symptom

While on **Downloading update** or **Applying update**, a click on the full-screen overlay opens the debug **What's New** flow with version **9.9.9-MOCK** and placeholder additions/fixes (screenshot 2026-06-28).

### Expected

Production update overlay is not interactive for debug flows. Mock updater UI only via Settings > Debugging when enabled.

### Actual

Overlay click emits `debug-cycle-updater` with no `showDebuggingSettings` or dev guard.

### Relevant code

- `src/components/UpdaterLayers.tsx` > `UpdaterFullWindowUpdate` (`onClick` emits `debug-cycle-updater`, `cursor-pointer` on full window).
- `src/App.tsx` > listener cycles phases and mock post-install; `MOCK_POST_INSTALL_JSON` / `buildPostInstallPayload("9.9.9-mock", ...)`.
- Intended debug entry: Settings > Debugging > **Cycle updater UI**.

### Suspected cause (for fix pass)

Remove or guard overlay click in release builds; keep Settings Debugging button as sole mock entry.

---

## P1 - Music album cover mismatch: library grid vs album detail

**Severity:** High (wrong or missing art on album pages).  
**Status:** Open  
**Reported:** 2026-06-28

### Symptom

1. Music mode library/home/artist shelves show an album tile with one cover (e.g. Linkin Park "LIVING THINGS" shows a per-track video still or yt-dlp thumbnail).
2. Opening that album detail page shows a **different** cover, a broken image icon, or the music-note placeholder.
3. Screenshot evidence (2026-06-28): grid tile art does not match album header art; detail can show broken remote image or empty placeholder while the shelf still looked fine.

### Repro (observed)

1. Download a YouTube Music album/playlist via Music Explore so tracks land under `{library}/Playlists/{folder}/`.
2. Open Music mode > Home, Library, or Artist view album shelf.
3. Note the album tile cover on the grid/shelf.
4. Click the album to open `MusicAlbumView`.
5. Compare header + square cover to the shelf tile.

Best with playlist-downloaded albums (paths contain `/Playlists/`). Single-folder or metadata-only albums may not hit the playlist sidecar path.

### Expected

- Same album cover on shelf and album detail.
- Covers loaded from local/cached files only after initial download.
- No yt-dlp or ytimg network traffic when merely opening album detail.

### Actual

- Shelf uses local `bestCoverPath` (embedded cover, then `{stem}.jpg` thumbnail, then poster).
- Album detail prefers remote `coverUrl` from `.ruforge-playlist.json` when usable; local art is fallback only.
- Remote signed ytimg URLs can 403/404 at render time (broken `<img>`), or differ from per-track thumbnails (mismatch).
- Opening album detail with stale/missing `coverUrl` triggers lazy heal via yt-dlp (`get_playlist_items_page`).

### Relevant code

| Area | Location | Notes |
|------|----------|-------|
| Local cover priority (shelf/grid) | `src/mediaKind.ts` > `bestCoverPath` | `embeddedCoverPath ?? thumbnailPath ?? ruforgePosterPath` |
| Shelf album tiles | `MusicHomeView.tsx`, `MusicArtistView.tsx`, `MusicLibraryView.tsx`, `MusicAlbumCard.tsx` | Use `bestCoverPath(g.tracks[0])` |
| Album detail cover logic | `src/components/music/MusicAlbumView.tsx` | Remote sidecar `coverUrl` first; local fallback second |
| Sidecar read + lazy heal on view | `src/hooks/usePlaylistSidecar.ts` | `healStaleCover: true` on album view |
| Heal / backfill (yt-dlp) | `src/lib/playlistDownloadSidecar.ts` | `healPlaylistSidecarCover`, `fetchPlaylistRootMetaPage`, `schedulePlaylistSidecarRootMetaBackfill` |
| Download-time backfill | `MusicExploreBottomBar.tsx`, `MusicExploreDownloadPanel.tsx` | Heal scheduled at kickoff when cover stale |
| Rust yt-dlp page fetch | `src-tauri/src/commands/downloader.rs` > `get_playlist_items_page` | Network via yt-dlp |
| Sidecar schema (URL only) | `src-tauri/src/commands/playlist_sidecar.rs` | `cover_url` is remote string |
| Scan: per-track thumb + embedded | `src-tauri/src/commands/gallery.rs` | `thumbnail_path`, `embedded_cover_path` |
| MB cover fetch (download/backfill only) | `src-tauri/src/commands/musicmeta.rs` | `fetch_caa_cover` during enrichment, not album view |

### Suspected cause (for fix pass)

1. **Intentional split (0.2.0):** Album view prefers signed playlist `coverUrl` for album art; shelves never adopted that path.
2. **No local album cover asset:** Sidecar stores a remote URL only; nothing writes a playlist-folder cover file at download time.
3. **Signed URL decay:** `isUsablePlaylistCoverUrl` accepts signed ytimg URLs, but they can fail at `<img>` load time; no `onError` fallback to local art.
4. **Lazy heal on navigation:** `MusicAlbumView` passes `healStaleCover: true`, re-running yt-dlp when `coverUrl` is stale.
5. **Per-track vs playlist art:** Grid uses first track's `{stem}.jpg` (often video still); sidecar may point at playlist/album shelf art from YTM.

### Fix-pass constraint (user)

Network fetch for cover art **only at first download**. All music views (shelf, artist, album detail) should read the same local/cached path. Persist playlist/album cover to disk during download/backfill; stop `healStaleCover` on album open; align `MusicAlbumView` with `bestCoverPath` (or a shared local album-cover helper).

### Related

- STATE.md open item: Music sidecar stale coverUrl.
- Shipped 0.2.0: signed coverUrl on album view with lazy sidecar heal (likely root of regression vs shelf).

---

## P2 - Large video download fails mid-transfer with HTTP 403

**Severity:** High (blocks reliable downloads for long/large videos).  
**Status:** Open  
**Reported:** 2026-06-28

### Symptom

1. User enqueues a YouTube video download (typical muxed quality, not audio-only).
2. A short/small video completes successfully.
3. A longer/larger video downloads for a while, then fails at a repeatable progress point (not at 0%).
4. Error notification: `Failed: Download failed (code Some(1)): ERROR: unable to download video data: HTTP Error 403: Forbidden`.

### Repro (reported pattern)

1. Download a small YouTube video (completes).
2. Download a longer/larger video (same quality setting, same cookie source).
3. Wait until progress is well past 0% (user report: fails at a certain point).
4. Job ends failed; notification shows the 403 line above.

Needs confirmation: exact URL length/duration, quality preset (1080p default), cookie source (None / Internal / Firefox / cookies.txt), and whether failure percent is stable across retries.

### Expected

- Download runs to completion or retries transient CDN/auth failures automatically.
- On failure, user gets actionable guidance (refresh cookies, retry with resume, update yt-dlp).

### Actual

- yt-dlp exits code 1 mid-download with `unable to download video data: HTTP Error 403: Forbidden`.
- RuForge surfaces first stderr line in a generic `Failed:` notification.
- No automatic cookie refresh or 403-specific retry on the download path.
- Manual Retry re-queues without `--continue` (`resumeOnStart: false`).

### Relevant code

| Area | Location | Notes |
|------|----------|-------|
| yt-dlp spawn + stderr | `src-tauri/src/commands/downloader.rs` > `start_download_job` | stderr → `format_download_job_failure` |
| Failure formatting | `downloader.rs` > `format_download_job_failure` | `Download failed (code {:?}): {stderr}` |
| Download CLI | `downloader.rs` > `build_ytdlp_download_args` | Dual-stream `-f`, cookies, optional `--continue`; no fragment/retry flags |
| Cookie fallback (metadata only) | `downloader.rs` > `yt_dlp_single_json_simulate_with_cookie_fallback` | Before spawn only |
| Internal cookie export | `downloader.rs` > `ytdlp_download_options_with_ruforge_export` | Once per job start |
| Format strings | `src/downloadFormat.ts` > `ytdlpFormatFromPreferredQuality` | `bestvideo+bestaudio` DASH merge |
| IPC + notification | `src/App.tsx`, `src/store/downloadQueueSlice.ts` > `onDownloadJobFinished` | `Failed: ${firstLine}` |
| Manual retry | `downloadQueueSlice.ts` > `retryDownloadJob` | No resume on retry |
| Rate-limit detection | `src-tauri/src/ytdlp_rate_limit.rs` | Does not match HTTP 403 |
| Stall watchdog | `src/downloadJobWatchdog.ts` | Different error strings |

### Investigation results (2026-06-28, test URL rkdzxRaI68g)

**Test URL:** https://www.youtube.com/watch?v=rkdzxRaI68g  
**Title:** I Quit  
**Duration:** 1385 s (~23:05)  
**Simulate `filesize_approx`:** 820820147 bytes (~783 MB, muxed estimate from `-j` / `--print`)  
**Default RuForge 1080p format** (`bestvideo[height<=1080]+bestaudio/...`): **399+251** (DASH `https`, separate streams: av1 1080p ~151.32 MiB + opus ~19.58 MiB, ~171 MiB merged). Not a single progressive file at default quality.  
**4K stream available:** format **401** ~763.21 MiB video only (~820 MiB merged with 251).

**yt-dlp binary (matches RuForge resolution order):** `%LOCALAPPDATA%\RuForge\yt-dlp.exe` (18448981 bytes, `2026.03.17`). Same size as bundled `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe`. Python PATH `yt-dlp` on this machine is newer (`2026.05.05.233942`) but RuForge prefers AppData when present.

**Commands run (no RuForge cookies; no `--cookies-from-browser`):**

| Step | Command summary | Outcome |
|------|-----------------|--------|
| Metadata | `--print title/duration/filesize` and `-j --simulate --no-download` | OK |
| Partial | `-f` RuForge 1080p string, `--download-sections "*0:00-0:30"` | OK (~3.4 MiB webm) |
| Full 1080p DASH | `-f bestvideo[height<=1080]+bestaudio/best[height<=1080]/best` | OK, 100% video+audio, merged ~179 MB, ~16 s |
| Full 4K DASH | `-f 401+251` | OK, ~820 MB merged, ~39 s, no errors |
| Slow 4K video | `-f 401 --limit-rate 250K` (stopped after ~19% / ~10+ min) | No 403 in log; download still progressing |

**403 reproduced on this URL:** **No** (fast full downloads at 1080p and 4K; throttled 4K had no 403 through ~19%).

**RuForge yt-dlp args vs bare download:**

| RuForge (`build_ytdlp_download_args` + spawn) | Bare test above |
|-----------------------------------------------|-----------------|
| `-P`, `-o`, `--windows-filenames`, `--no-restrict-filenames`, `--trim-filenames 200` | Not used |
| `--newline`, `--write-info-json`, `--write-thumbnail`, `--convert-thumbnails jpg` | Not used |
| `-f` from job/settings, optional `--continue`, optional subs | `-f` only |
| Cookie args from job (`push_ytdlp_download_cookie_args`) | No cookies |
| `ytdlp_push_js_runtime_args` (Deno when present) | yt-dlp auto-used Deno |
| **No** `ytdlp_push_politeness_args` on download spawn (only metadata/browse subprocesses) | N/A |
| **No** `--retries` / `--fragment-retries` | N/A |

**Refined suspected cause (evidence-based):**

1. This specific URL at default 1080p is ~171 MiB DASH, not multi-GB. User "large video" failures may be other URLs (longer runtime, Best Available / 4K, or muxed HLS), or depend on **cookie source** (Internal / Firefox / cookies.txt) not exercised here.
2. Mid-download 403 was **not** reproduced with the RuForge binary and format strings on a clean network path. Failure may need stale cookies, age-restricted/members content, PO-token edge cases, or very slow transfers where signed `googlevideo.com` URLs expire before completion (throttle test did not reach failure in ~19%).
3. AppData yt-dlp pinned to **2026.03.17** while system pip is newer; worth checking on user machine but not the trigger in this run.

**Repro with this URL (investigation):**

1. Preferred Quality **1080p (HD)**, not audio-only.
2. Queue https://www.youtube.com/watch?v=rkdzxRaI68g (no cookies in CLI; in-app use your normal cookie setting).
3. **Expected on fast link (this run):** completes (~171 MiB). For user-reported 403, capture cookie mode, quality preset, failure percent, and whether retry without resume still fails.

**In-app user report (same URL, not reproduced in CLI):**

- Failure at **720p** preferred quality; CLI investigation used **1080p** and **4K** format strings only (720p `-f bestvideo[height<=720]+bestaudio/...` not re-run after user report).
- Error appeared in the **toast** (`Failed: Download failed... 403`); no `console.error` in devtools (stderr stays in Rust `rf_log` unless debugging categories enabled).
- Background throttle test used `--limit-rate 250K` (~200 KB/s); RuForge does not cap download speed. That run was stopped manually; not representative of in-app throughput.

### Suspected cause (for fix pass)

1. **Signed googlevideo URL expiry** on long DASH/HLS transfers; failure when fetching a later fragment or the second stream (audio after video) once URLs age out.
2. **No download-time recovery**: cookie fallback and rate-limit handling apply to metadata subprocesses, not the long-running download child.
3. **Frozen cookie snapshot** for Internal/ruforge exports across multi-minute jobs.
4. **Cookie/auth gap**: CLI runs had no cookies; in-app failure may depend on Internal/Firefox export state not captured in investigation.
5. Fix-pass options: detect 403 in download stderr; re-simulate metadata + re-export cookies + retry with `--continue`; pass yt-dlp `--retries` / `--fragment-retries`; offer resume-by-default on retry; ensure yt-dlp is current; re-test **720p** `-f` with user's cookie mode; surface full stderr when debugging enabled; extend rate-limit/403 detection for user-facing guidance.

---

## P3 - Update available should use expanded Dynamic Island, not side card

**Severity:** Medium (UX / design backlog)  
**Status:** Open  
**Reported:** 2026-06-28  
**Screenshot:** 2026-06-28 (top-right "UPDATE AVAILABLE" pill + floating "RUFORGE IS READY TO UPDATE" card with RuForge 0.2.0 teaser bullets and "INSTALL & RESTART")

### Symptom

When an in-app update is available (`updaterPhase === "available"`), the app shows two separate surfaces:

1. Top-right titlebar pill: **Update Available** (`UpdaterStatusIndicator` in `WindowControls`, `z-[100]`).
2. Main-pane floating card top-right: **RuForge is ready to update**, teaser notes (`line-clamp-3`), dismiss X, **Install & Restart** (`UpdaterMainOverlays`, `z-[60]`).

The Dynamic Island stays in its normal playback/idle state and does not present the update.

### Expected

Island-centric update-available UX:

- **Expanded Dynamic Island** at the titlebar center slot (portal, same stack as playback island).
- **Download icon on the left** + copy that an update is needed (version + short teaser from `updater.json` via existing `teaserNotesFromUpdaterBody` / `availableUpdatePayload.notes`).
- Same teaser content as today (markdown bullets, truncated inside 350×184 if needed).
- Primary action affordance: **Install & Restart** (same handler as `handleInstallRestart`).
- Optional collapse to **compact** island pill (download icon + "Update available") if user dismisses expanded detail; no separate floating card.

Remove or demote the current **side card** and **titlebar pill** once the island owns update-available presentation.

### Actual

Dual pattern: titlebar pill + main-pane card. Island unused for updates.

### Recommended island state / phase

| Phase | Island state | Notes |
|-------|--------------|-------|
| Update available (default) | **`expanded`** | Informational/update layout, **not** playback (no waveform, scrubber, or track skip). Auto-expand on check success. |
| Update available (collapsed) | **`compact`** (optional) | Short pill: download icon + "Update available" / version; tap re-expands. |
| Downloading / installing | N/A (keep `UpdaterFullWindowUpdate`) | Full-window overlay unchanged. |
| Post-install What's New | N/A (keep `UpdaterPostInstallStack`) | Separate from pre-install teaser. |

Precedence (fix pass): when playback session is active **and** update is available, update island content should take the titlebar slot (or merge into expanded update UI). Do not stack pill + card + playback compact pill.

### Relevant code

| Area | Location |
|------|----------|
| Side card | `src/components/UpdaterLayers.tsx` > `UpdaterMainOverlays` |
| Titlebar pill | `src/components/UpdaterLayers.tsx` > `UpdaterStatusIndicator`; `App.tsx` > `WindowControls` |
| Updater state / handlers | `App.tsx` (`updaterPhase`, `updaterVersion`, `availableUpdatePayload`, `handleInstallRestart`, `updaterTeaserDismissed`) |
| Teaser copy | `src/updatePostInstall.ts` > `teaserNotesFromUpdaterBody`, `buildPostInstallPayload` |
| Island integration point | `src/components/island/ActivityIsland.tsx`, `DynamicIsland.tsx`; mount `App.tsx` `{!shellBlocked && <ActivityIsland />}` |
| Architecture constraints | `src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md` |

### Fix-pass constraints

- **Portal:** keep island on `#root` via `mainWindowPortalRoot()`; do not mount expanded update UI inside `overflow-hidden` main column.
- **Z-index:** island wrapper `z-[110]`, expanded backdrop dismiss `z-[109]`; do not fight `WindowControls` (`z-[100]`) with a second top-right card.
- **`shellBlocked`:** `ActivityIsland` is hidden while post-install stack is open; update-available island must not show during that block.
- **Onboarding occupancy:** follow `onboardingRadialBridge` precedence; do not render two pills.
- **Single morphing shell:** extend `ActivityIsland` / `DynamicIsland` content mapping; do not add a second morphing island (see architecture anti-patterns).
- **Logic boundary:** updater phase/version/notes/handlers wired from `App.tsx` into `ActivityIsland`; `DynamicIsland.tsx` stays props-in, pixels-out.
- **Layout:** expanded content must fit **350×184** (scroll/truncate inside shell); `originY: 0`, spring morph unchanged unless product retunes dimensions.
- **Demote/remove:** stop rendering `UpdaterMainOverlays` for `phase === "available"`; hide or remove `UpdaterStatusIndicator` for `available`.

### Suspected cause (for fix pass)

Update UX was built before island-centric chrome; `UpdaterMainOverlays` and `UpdaterStatusIndicator` were added as independent overlays and never integrated with `ActivityIsland`.

---

## Audit layer (rate limiting, re-renders, race conditions)

Shallow pass 2026-06-28. Only must-fix items listed below. Broader perf/re-render notes were reviewed and skipped (no wrong-state or data-loss evidence at P1 bar).

---

## P4 - Pause during pre-spawn simulate marks job failed

**Severity:** High (wrong queue state after user pause)  
**Status:** Open  
**Reported:** 2026-06-28

### Symptom

User pauses a job while it is still in the pre-transfer phase (metadata simulate inside `start_download_job`, before yt-dlp spawn completes). Row ends as **failed** with a cancel/start error toast instead of staying **paused**.

### Relevant code

| Area | Location |
|------|----------|
| Simulate before spawn | `src-tauri/src/commands/downloader.rs` > `start_download_job`, `place_running_child` |
| Cancel error string | Same file: `"Download job was cancelled before yt-dlp could start."` |
| Frontend catch | `src/store/downloadQueueSlice.ts` > `startHydratedDownloadJob` |
| Cancel detector | `isYtDlpStartCancelledError` in same file |
| Pause UI path | `pauseDownloadJob` in same file |

### Suspected cause (for fix pass)

`startHydratedDownloadJob` routes cancelled-start invoke errors to `onDownloadJobFinished({ success: false })` without checking whether the user already paused the job. Race: `pauseDownloadJob` sets paused, then the in-flight invoke rejection overwrites to failed.

---

## P5 - Global 2-minute wall clock aborts long downloads

**Severity:** High (downloads killed at 2 minutes; silent pause on video jobs)  
**Status:** Open  
**Reported:** 2026-06-28

### Symptom

Downloads still in progress after ~2 minutes from `downloadingSince` are killed by the watchdog. Video or slow-link jobs that need longer often stop around the 2-minute mark. Row may show **paused** with no `"Download timed out. Skipped to the next item."` toast because pause IPC clears `downloading` before the timed-out finish path runs.

### Relevant code

| Area | Location |
|------|----------|
| Wall clock constant | `src/downloadJobWatchdog.ts` > `MAX_DOWNLOAD_WALL_CLOCK_MS` (2 min) |
| Timeout trigger | `jobExceededWallClock`, `evaluateStall`, `armDownloadJobWatchdog` |
| Timeout handler | `src/store/downloadQueueSlice.ts` > `handleTimedOutDownloadJob` |
| Watchdog arm site | `startHydratedDownloadJob` after `start_download_job` invoke |

### Suspected cause (for fix pass)

Comment says the cap is for music auto-save audio, but it applies to all jobs. `downloadingSince` is not extended by progress. Timeout handler invokes pause first; `onDownloadJobPaused` often wins, suppressing the timed-out notification while still killing yt-dlp.

---

## Backlog (add issues here)

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| P1 | Music album cover mismatch (grid vs detail) | High | Open |
| P2 | Large video mid-download HTTP 403 | High | Open |
| P3 | Update available should use expanded Dynamic Island, not side card | Medium | Open |
| P4 | Pause during pre-spawn simulate marks job failed | High | Open |
| P5 | Global 2-minute wall clock aborts long downloads | High | Open |

### Section template

```markdown
## P? - Title

**Severity:**  
**Status:** Open  
**Reported:** YYYY-MM-DD

### Symptom

### Expected

### Actual

### Relevant code

### Suspected cause (for fix pass)
```
