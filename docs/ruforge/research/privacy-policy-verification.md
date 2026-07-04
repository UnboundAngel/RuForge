# RuForge privacy policy verification (codebase audit)

**Audit date:** 2026-05-21  
**Repo:** `neotube` (RuForge)  
**App version in tree:** 0.1.7 (`package.json`, `tauri.conf.json`, `Cargo.toml`)  
**Method:** Static review of `src/`, `src-tauri/`, `package.json`, `Cargo.toml`, `updater.json`. No runtime network capture.

## Overall verdict

**MOSTLY ACCURATE**

Core claims hold: no first-party analytics, accounts, cloud library sync, or RuForge-operated upload of library/watch data. Gaps are mostly **undisclosed third-party hosts** and **automatic** GitHub/ SponsorBlock traffic beyond the short "what leaves" list. Wording on cookies and "no telemetry on downloads/sites" should be tightened so readers do not confuse **RuForge not collecting** with **yt-dlp/WebView not contacting sites**.

---

## Claim table

| Claim | Verdict | Evidence |
|-------|---------|----------|
| **1. Local storage:** downloads to user folder | **true** | `DownloadOptions.output_dir` from settings; jobs use `-P` + user path. `downloader.rs` ~1131-1134, `types.ts` `outputDir` / `RUFORGE_INTERNAL_DIR`. |
| **1.** library index (paths, durations, thumbnails, watch progress, chapters) not synced | **true** | Gallery is filesystem scan + sidecars, not a remote DB. `scan_gallery` in `gallery.rs`; chapters from `.info.json` / VTT sidecars. Watch progress: `playbackStorage.ts` (`ruforge-playback-pos:*`, `ruforge-playback-dur:*` in `localStorage`). Thumbnails/posters under `.ruforge_thumbs` beside media. `utils.rs` `THUMB_DIR_NAME`. |
| **1.** settings in user profile | **partial** | Settings persist in WebView `localStorage` (`ruforge-settings`, `ruforge-output-dir`, `ruforge-save-internal`). `ruforgePersistStorage.ts` 5-7, 45-55. Hardware accel pref: `app_local_data_dir` + `hardware-acceleration.json`. `hardware_acceleration.rs` 58-60. Not a single OS "profile" document; WebView2 + app data dirs. |
| **1.** optional explorer cookie data not uploaded | **partial** | Explorer profile is local: `app_data_dir()/explorer-data`. `player.rs` 64-79. RuForge does not upload that store. If user picks **Internal** (`ruforge`) or other browser cookie sources, **yt-dlp** reads cookies locally and sends them to **YouTube/target sites**, not to RuForge. `downloader.rs` `push_ytdlp_download_cookie_args` 1063-1083; default setting `browserContext: "chrome"`. `types.ts` 119. |
| **2.1** yt-dlp direct to source, no proxy | **true** | No `--proxy` / proxy config in downloader or repo grep. `downloader.rs` builds yt-dlp argv only. |
| **2.2** SponsorBlock optional privacy hash, not full ID in request | **partial** | Request URL uses first 4 hex chars of SHA-256(video_id): `hash_prefix_4`, `GET …/api/skipSegments/{prefix}`. `sponsorblock.rs` 30-35, 168-170. Host: `https://sponsor.ajay.app` (not named in policy). Response JSON can include **full `videoID`** for all segments in that bucket; client picks matching id. `sponsorblock.rs` 71-75, 179-180. Sidecar on disk stores full `video_id`. `sponsorblock.rs` 253-258. Feature **on by default**. `types.ts` 129. |
| **2.3** update check JSON from github.com on launch; version + HTTP headers only | **partial** | Endpoint: `tauri.conf.json` 73-75 → `raw.githubusercontent.com/.../updater.json`. Frontend check on main mount: `App.tsx` 761-762 → `runUpdateCheck()` → `check()`. `updaterCheck.ts` 10-21. Rust also calls `updater.check()` at startup. `lib.rs` 78-83. Fetched file includes `version`, `notes` (large JSON string), `pub_date`, `platforms.*.url/signature`. `updater.json`. Installing an update downloads the **installer binary** from `github.com` (user action). `App.tsx` `downloadAndInstall`. |
| **2.4** optional sponsor/donation links on click | **unverified** | No donate/Ko-fi/Patreon URLs in `src/` at audit time. GitHub Releases opened on user action: `RELEASES_PAGE`, `openUrl`. `UpdaterLayers.tsx` 51, `App.tsx` 1462. SponsorBlock settings link to a **gist** (attribution), not a RuForge donate flow. `sponsorBlockConstants.ts` 11-12, `SponsorBlockSettingsTree.tsx` 180-188. |
| **3.** no analytics, crash reporting, accounts, cloud sync, ads, background upload of files/library/watch history | **true** (RuForge) | No sentry/posthog/analytics/oauth matches in app source. No remote gallery sync API. `plugin-store` is a dependency but unused in `src/`. |
| **3.** no telemetry on downloads/sites/content | **partial** | RuForge does not run telemetry SDKs. **yt-dlp** and **embedded YouTube** still contact those sites for downloads, metadata, and browsing. Policy should say RuForge does not **collect** that activity, not that the machine does not talk to those hosts. |
| **4.** SmartScreen on installer; WebView2 Edge behavior for explorer logins | **true** (OS/browser) | NSIS Windows bundle. `tauri.conf.json` 60-67. Explorer uses external YouTube + WebView2 data dir. `player.rs` 72-79. Microsoft network behavior is outside app code. |
| **5.** no automatic crash collection; GitHub issues manual | **true** | `tauri-plugin-log` only; no crash upload pipeline. `lib.rs` 74. Roadmap mentions future Sentry as opt-in only. `docs/ruforge/RuForge.md` 136 (not shipped). |
| **6.** Children / Changes / Contact sanity | **n/a** | No in-repo policy text to compare; standard static-page claims assumed OK if maintained by maintainer. |

---

## Missing disclosures (traffic or data not covered by policy)

1. **`https://sponsor.ajay.app`** when SponsorBlock is enabled (default on) and a library file has a YouTube `id` in its `.info.json`. Triggered from player/mini via `ensure_sponsorblock_segments`. `useSponsorBlockPlayback.ts` 86-94, `sponsorblock.rs` 204-278.

2. **`https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest`** on app startup (background warm, 12h cache) and when the downloader UI loads status / user updates yt-dlp. `warm_ytdlp_release_cache_spawn` in `lib.rs` 77; `ytdlp_update.rs` 17-18, 239-245, 170-184. Custom User-Agent includes app name and version. `ytdlp_update.rs` 172-176.

3. **`https://github.com/yt-dlp/yt-dlp/releases/download/...`** when the user chooses to download a newer yt-dlp binary. `ytdlp_update.rs` 123-138, 336+.

4. **YouTube and CDN hosts** (and any URL the user submits) via **yt-dlp** for metadata simulation, downloads, and thumbnails. `get_video_info`, `start_download_job` in `downloader.rs`.

5. **YouTube (and linked sites)** in the **explorer** webview and embedded explorer surface when the user browses there. `player.rs`, `explorer_embed.rs`, default `https://www.youtube.com`. `ruforgeStore.ts` `lastExplorerUrl`.

6. **Cookie export to target sites (not RuForge):** optional `--cookies`, `--cookies-from-browser` (Chrome default, Edge/Firefox/Brave/Safari, or RuForge explorer profile path). `downloaderConstants.ts` 35-42, `downloader.rs` 1058-1083.

7. **GitHub installer download** when the user installs an app update (in addition to the `updater.json` check). `App.tsx` `handleInstallRestart`, `updater.json` `platforms.windows-x86_64.url`.

8. **Local view counters** (`views-{file.path}` in `localStorage`) in main and mini library UIs. `MediaView.tsx` 96-120, `MiniPlayer.tsx` 1347-1349. Not uploaded; omit or mention as local-only if the policy lists stored data types.

9. **Download metadata cache** in `localStorage` (`ruforge-dl-jobmeta-v1`, titles/thumbnails/sizes). `downloadQueueMetadataCache.ts` 4-23.

---

## Overclaims or imprecise wording

| Policy wording | Issue |
|----------------|-------|
| Explorer cookies "not uploaded" | Accurate vs RuForge servers; misleading if read as "never sent over the network." yt-dlp can send explorer/Chrome cookies to **YouTube** when configured. |
| "no telemetry on downloads/sites/content" | Implies no network activity to those destinations. yt-dlp and WebView do contact them; RuForge does not instrument/report it. |
| Update check "version + standard HTTP headers only" | `updater.json` body includes full release `notes` (JSON/markdown). Install step pulls a large `.exe` from GitHub. |
| SponsorBlock "hash … not full ID" | Request path uses 4-char prefix only; API **response** may include full video IDs for multiple videos in the hash bucket. |
| "optional" SponsorBlock | Enabled by default. `types.ts` `sponsorBlockEnabled: true`. |

---

## Suggested copy edits (minimal)

Add a short **"Other connections"** bullet list:

- **YouTube and video hosts:** yt-dlp and the in-app explorer connect directly to sites you use (no RuForge proxy). Optional cookies from your browser or RuForge explorer are sent to those sites by yt-dlp, not to us.
- **SponsorBlock (default on):** segment lookup to `sponsor.ajay.app` using a 4-character privacy prefix derived from the video ID; responses are cached locally beside your file.
- **yt-dlp updates:** periodic check to GitHub (`api.github.com` / release assets) for a newer bundled tool; only if you tap update.
- **App updates:** check `updater.json` on GitHub at launch; installing downloads the signed installer from GitHub when you choose.

Tighten **"What we do not do"**:

- Replace "no telemetry on downloads/sites/content" with: "We do not collect analytics or telemetry about your downloads, browsing, or playback. yt-dlp and the embedded browser still connect to those services under your control."

Tighten **local storage**:

- "Settings and playback progress are stored in the app WebView storage and local app data folders on your PC, not on RuForge servers."

---

## Dependencies note (no runtime phone-home found)

- **Frontend:** `@tauri-apps/plugin-updater`, `@iconify/react` with bundled `@iconify-json/tabler` (no `api.iconify.design` in shipped `src/`).
- **Rust:** `reqwest` for SponsorBlock + yt-dlp GitHub API only in reviewed commands.
- **Not found:** Sentry, PostHog, Firebase, account/OAuth flows.

---

## Coordinator executive summary

- **Verdict: MOSTLY ACCURATE.** No RuForge analytics, accounts, or cloud library sync; local-first storage matches the code.
- **Add disclosures** for `sponsor.ajay.app`, automatic **yt-dlp GitHub** release checks at startup, **YouTube/site** traffic via yt-dlp and explorer, and **cookie forwarding to sites** (not to RuForge).
- **Clarify** SponsorBlock is default-on; hash is request-side only; update fetch includes release notes and optional full installer download.
