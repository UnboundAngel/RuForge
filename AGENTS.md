# RuForge: notes for IDE agents (Cursor / automation)

Concise context for agents working **inside this repo's IDE workspace**. This is **not** a full architecture audit; use it as an onboarding + guardrails doc.

## Read first, write last (every agent, every task)

Before any task: open STATE.md at the repo root. It is the live cursor for
where this project is right now: current version, what is new since the last
user release, open P0s, next items. Do not reconstruct project state from the
git tree or by asking Angel what was last shipped. STATE.md is that answer.

After any task that changed shipped behavior or moved the project: update
STATE.md last, before you report done. At minimum refresh Now, add a line to
the Shipped log (see Shipped log section), and mirror it into STATE.md's
"What is new since last user release". Skipping this is the single failure
that has cost the most rework in this repo.

If STATE.md and the code disagree, the code wins. Fix STATE.md forward. Never
git-restore a dirty tree to "match" it.

## Output law (non-negotiable, every agent, every surface)

No emdashes. Anywhere. Not in code comments, commit messages, release notes,
updater.json notes, changes.html copy, STATE.md, or chat. Use a period, a
comma, a colon, or rewrite the sentence. A hyphen between words is fine
(audio-only, cross-window). A spaced emdash as a clause break is not.

No AI tells in any repo-facing or user-facing text. No "delve", no "it is
worth noting", no "in conclusion", no rule-of-three padding, no hedging
preambles, no "I hope this helps". Write like the maintainer: terse, factual,
direct.

This applies hardest to release notes and updater.json notes. That text
ships to users.

## Product scope (read before suggesting features)

**North star:** the **downloader** is the wedge: reliable YouTube + local handling, **persistent downloads**, resumability/caching where it matters, and **performance**. Treat player, gallery, and polish as supporting that story, not a reason to chase general-purpose media apps.

**What we ship today (mental model):**

- **Inputs:** YouTube URLs and **user-provided video files** (library path / uploads). Expect **rough edges on extensions and casing** (e.g. iPhone `*.MP4` vs `*.mp4`) until scan/filter logic is tightened. Fix when touched, but do not re-scope the product around "every container on earth."
- **Player:** so people can **watch what they already downloaded**; it is not the competitive wedge.
- **Media view:** a **convenient** local library surface on top of downloaded (and scanned) files. Secondary to downloader quality.
- **In-app explorer webview:** primarily for **cookie / session flows** that yt-dlp needs (age-restricted, members-only, etc.). It is **not** positioned as a full in-app browser for casual watching. A **uBlock** payload may exist under `src-tauri` for this webview; treat it as **experimental / not relied upon** until it is verified working end-to-end.
- **Explorer tab (where controls may live, mandatory):** The embedded explorer **child webview paints on top of** the main-column DOM. Anything rendered inside the Explorer tab body (bulges, `absolute`/`fixed` nodes under `flex-1`, etc.) can be **covered and unclickable**. **Do not** put explorer actions on tab bulges or in the content column.
  - **Only valid chrome:** the **top title band** (`h-10`, `z-[100]`), same layer as `WindowControls` in `App.tsx`.
  - **Left cluster:** back / forward / reload via `ExplorerTitlebarNav`, **`fixed top-0`**, flush at the sidebar→content seam (`left: 80px` collapsed / `240px` expanded; `transition-[left]` must match sidebar width animation). Wired from `App.tsx`, not from inside the explorer panel.
  - **Right cluster:** `WindowControls` (`fixed top-0 right-0`): download queue, mini player, then minimize / maximize / close.

**How to advise:** ground recommendations in **what RuForge already is** and what is **already solved well elsewhere** (generic browsers, dedicated players, Plex-like libraries). Avoid **feature creep** and "compete with X" pivots unless the maintainer explicitly widens scope. Longer roadmap, priorities, and out-of-scope list live in the **planning doc** linked below. Prefer that over inventing new product direction in chat.

## Planning & ideas (canonical doc)

- **Shipped log (THIS FILE, bottom, `## Shipped log`):** the **first and mandatory** place every shipped change is recorded. One appended line per change, no format ceremony. This is the cheap, vague-input-proof capture surface. **If you change behavior, append here before you consider the task done.** See `## Shipped log` for the rule.
- **Living roadmap / ideas (in-repo, canonical for agents):** `docs/RuForge.md`. Update when shipped work lands. Optional mirror outside the repo: `c:\Random things i dont want deleted\markdown files\RuForge.md` (keep in sync by hand if you use both).
- **Graph surfaces (`docs/changes.html`, `docs/versions/version-<semver>.json`, `docs/versioner.html`):** Angel's project-tracking + release-note source. These are **drained from the Shipped log at release time only** (see `## Release ritual`, step 8). **Never** edited per-change mid-cycle. The gap between the Shipped log and the last version present in the graph surfaces IS the release-prep to-do; do not wait to be told.
- **In-repo machine plans:** `.cursor/plans/` (e.g. Zustand migration audit). Implementation detail, may lag; trust code + this `AGENTS.md` for "what shipped."

## Who does what (this workspace vs elsewhere)

| Role | Environment | Scope |
|------|-------------|--------|
| **Chad** (default agent in Cursor) | Cursor, this workspace | **Logic only:** TypeScript / React behavior, state, Tauri wiring, bug fixes, refactors. Small `.ts` / `.tsx` edits are in scope when they touch behavior, types, or data flow. Not pure styling passes. |
| **Jim** (Gemini) | Your CLI or Antigravity. **Not** Cursor | **Visuals only:** layout, typography, color, motion, component styling. **No** business logic, state machines, or store changes. |

**Handoff rule:** If something needs Jim's pass (pure UI polish), Chad should **not** pretend to be Jim. Instead, Chad ends with a **short, copy-paste prompt for you to run in Jim's environment** (file paths, desired look, explicit "do not change logic or props contracts"). Chad implements or preserves the logic and prop surfaces Jim should style against.

**Release handoff (Angel vs agent):** On ship / release / push it out, **the only step that requires Angel** is running the **signed Windows build** locally (`Build-signed-windows.bat` or `npm run build:signed`), because the **private signing key** must not leave the machine. After that build finishes, Angel may paste the build summary in chat; the agent reads the `.sig` from disk under `src-tauri/target/release/bundle/` and does **everything else** without waiting for more input: version bumps (if not done yet), `updater.json` (teaser markdown + structured `additions` / `fixes`, `signature`, `url`, `pub_date`), **commit message**, **commit + push to `main`**, **`gh release create`** (tag `v<semver>`, title, Release body, upload NSIS `.exe` and optional MSI), Shipped log / `STATE.md` / graph surfaces (release ritual step 6), and live `updater.json` verification. Do **not** ask Angel to create the GitHub Release, write release copy, tag, or push unless `gh` auth is missing or the push fails.

## Agent editing guardrails (mandatory)

**Edit source in place. Never "patch via script."**

- **Do not** create or run ad-hoc **Python**, **Node**, or **shell** scripts whose purpose is to search/replace or rewrite repo source (e.g. `scripts/_rebuild_*.py`, `scripts/_patch_*.py`, `scripts/_extracts/` scratch files). Use the IDE's normal edit tools (`StrReplace` / `Write`) on the real file, in **small, reviewable hunks**, after reading the surrounding code.
- **`scripts/`** is for **intentional maintainer tooling** only (e.g. `build-signed-windows.ps1`, `create-desktop-shortcut.ps1`). Do not add agent-generated patch scripts there.
- **Do not** run `git checkout` / `git restore` on individual source files to "fix" a bad edit when the user may have **uncommitted work**. That can wipe hours of local changes. If the file is broken, repair it forward; ask the user before any git operation that discards working-tree content.
- If a large replace fails, **narrow the context** or read more of the file. Do not escalate to string-surgery scripts.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind v4, Zustand (`src/store/ruforgeStore.ts` + `ruforgePersistStorage.ts`).
- **Desktop:** Tauri v2 (`src-tauri/`), WebView2 on Windows. **Two windows:** `main` (full app) and `mini` (mini player); optional `explorer` webview.
- **Cross-window sync:** Zustand does **not** span webviews. Use existing Tauri **`emit` / `listen`** (`play-media`, `stop-playback`, `send-to-main`, `play-in-mini`, etc.) as the only bridge between main and mini.

## Quick audit snapshot (maintenance-oriented)

- **Source of truth (main window):** `useRuforgeStore` holds nav, settings, paths, notifications, downloader fields, gallery list (`entries` + loading flags), player file/playlist/volume/loop, sidebar, search, explorer URL, etc. Persisted slice is settings + output paths (`ruforgePersistStorage.ts`: flat `localStorage` keys preserved for MiniPlayer and other readers).
- **`App.tsx`:** Still uses **local React state** for window chrome / shell only, e.g. **`isMini`** (which webview label you're in) and **`isMaximized`** for custom titlebar controls. Intentional separation from Zustand.
- **Downloader screen:** **`src/components/DownloaderView.tsx`** is the routed shell only; **`src/components/downloader/`** holds **`useDownloaderView`** (effects + handlers), job-queue UI (**`DownloadJobQueuePanel.tsx`**), and small **`downloaderConstants` / `downloaderFormat`** helpers. **`App.tsx`** imports **`DownloaderView`** from **`./components/DownloaderView`** only.
- **Live gallery UI:** **`MediaView`** (used from `App.tsx`) is aligned with the store's gallery slice. **`GalleryView.tsx`** exists but is **not** imported by `App.tsx`; treat it as legacy / candidate for delete or future wiring. Not part of the shipped Zustand path.
- **`MiniPlayer.tsx`:** Own webview. **Duplicated playback UI state** (current file, progress, hover, etc.) synchronized via Tauri events + some `localStorage` keys; do not expect the main window store to appear here.
- **Heavy local `useState` in `PlayerView`:** Normal for playback UI (scrubber, menus, transient controls); not a "migration gap" by itself.
- **Custom subtitles (`useSubtitleCueOverlay`):** Renders VTT cues over `<video>` (native tracks stay hidden); vertical drag persists in `localStorage`. **Layout clamps** against the scrub strip ref + player shell so captions never sit under the higher-`z` progress bar (where pointer events would trap the drag handle). Wired from **`PlayerView.tsx`** and **`MiniPlayer.tsx`**.

## Zustand migration: are we "done"?

**Functionally, yes for the original intent:** central store + persist, main-window concerns moved off ad-hoc `App` state, mini window still event-driven.

**Not a claim of "every audit bullet closed":** optional follow-ups (extra gallery caching, housekeeping unused files, deleting or wiring `GalleryView.tsx`) were never strict blockers. If you change gallery loading, prefer **`MediaView` + store** as the real product surface.

**Invariant to respect:** avoid transient pairs like `activeTab === "player"` with `playingFile === null` when subscribers still assume a file (e.g. stop-handlers should clear tab + file atomically for mini-driven stops). Player uses a thin outer shell + inner `PlayerViewWithFile` so hooks stay valid with nullable `playingFile`.

## Versions (keep aligned)

These should match for releases and for sane updater behavior:

- `package.json` → `version`
- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `[package] version` (and `Cargo.lock` updates when the crate version changes)

A past mismatch was **`Cargo.toml` behind the JS/Tauri app version**. Fix on every bump.

## Changelog & version-graph authoring (pointer)

The full authoring detail for the release-notes and version-graph surfaces
lives in `docs/CHANGELOG-AUTHORING.md`. It is not inlined here on purpose:
the per-task agent path stays thin so the Shipped log and release ritual
below are not buried under manuals.

You only go to that doc when the release ritual sends you (step 6), or when
explicitly changing one of these surfaces. For all normal work, ignore it.

- Version graph manifests (`docs/versioner.html` + `docs/versions/version-<semver>.json`):
  schema, registry rows, fileEdits, preview. See CHANGELOG-AUTHORING.md part 1.
- Changelog source (`docs/changes.html`): HTML-only DOM contract (`rf-*`
  classes, `data-version`), the embedded `<script id="changelog-data">` JSON
  island, faded-divider rule, Canvas Architecture Workflow, Iconify category
  icons. See CHANGELOG-AUTHORING.md part 2.
- Structured version block + DOM template for a new release section.
  See CHANGELOG-AUTHORING.md part 3.

Hard rule unchanged by the move: never edit the changes.html JS or CSS
rendering logic. Append to the JSON island only, recompute `.rf-count`,
honor faded dividers, fixes are non-red. Full detail in the authoring doc.

## Auto-updater (Tauri plugin-updater)

- Config: `src-tauri/tauri.conf.json` → `plugins.updater` (`endpoints`, `pubkey`). Bundles: `"createUpdaterArtifacts": true`.
- Permissions: `src-tauri/capabilities/default.json` includes `updater:allow-check` and `updater:allow-download-and-install`.
- **Runtime:** `src/App.tsx` calls `check()` on startup; in-app update UI uses `downloadAndInstall()` from the returned `Update` object. **Structured release copy** for agents lives in **`docs/changes.html`** (internal HTML); user-facing strings also come from **`updater.json` `notes`**, GitHub Releases, and the in-app changelog UI. Keep them consistent when you ship.
- **Where "what's in this update" comes from (not hardcoded in the old build):** On each `check()`, the updater plugin fetches **`updater.json`** from `plugins.updater.endpoints` (e.g. raw `main` on GitHub). The **`version`** and **`notes`** fields describe the **available** update. Users on an older build see whatever **`notes`** says **at check time**. You do **not** need to ship new frontend code just to change that copy. The GitHub **Release description** is **not** read automatically; mirror anything you want users to see into **`updater.json` `notes`** (or keep Release + `notes` in sync by hand).
- **Two UI surfaces, keep copy split sensible:** (1) **`UpdaterMainOverlays`**: small top-right card, **`line-clamp-3`**, narrow width. Treat this as a **teaser** (one short line, or a tiny markdown blurb). (2) **`UpdaterPostInstallStack`**: after install, scrollable "What's new". Use **`src/updatePostInstall.ts`**: plain markdown in `notes`, or structured JSON `{"notes","additions","fixes"}` for categorized lists. When `notes` is JSON, the teaser card uses **only** the inner `"notes"` string via **`teaserNotesFromUpdaterBody`** so raw JSON does not fill the small card. **Agents:** do **not** paste long `docs/changes.html` blobs into `updater.json`; distill. Prefer short teaser + fuller post-install payload.
- **Why "no update" is often correct:** `check()` returns **`null` unless the version in `updater.json` is greater than the running app's version.** If `updater.json` on `main` still says the same version as the installed build, users will see nothing. That is expected, not a broken wire.
- **Shipping a new version users can receive:** bump app version, build **signed** artifacts, publish GitHub Release assets, then update **`updater.json`** on `main` with new `version`, `pub_date`, per-platform `url`, and **`signature`** (from the `.sig` files next to each installer; see below). Mismatch between signing key and embedded `pubkey` breaks installs.
- **GitHub `url` vs tag:** the path segment after `releases/download/` must match the **exact** release tag (including a leading `v` if you use `v0.1.2`). A typo or wrong tag yields **404** and "update failed" in the app.

### Signed Windows build (this machine's layout)

Keys live under **`%USERPROFILE%\.tauri\`** (e.g. `ruforge.key` private, `ruforge.key.pub` public). **Never commit** the private key or paste it into docs/chat logs.

**Before building:** confirm `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` matches the **public** key material (minisign format). Example check in PowerShell (read-only):

```powershell
Get-Content "$env:USERPROFILE\.tauri\ruforge.key.pub" -Raw
```

**Environment for `npm run tauri build`:**

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$HOME\.tauri\ruforge.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password-if-key-is-encrypted>"
npm run tauri build
```

Omit `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has no password.

**One-click local signed build (Windows, no Git push):** run `Build-signed-windows.bat` from the repo root, or `npm run build:signed`. Script loads `%USERPROFILE%\.tauri\ruforge.key`, sets signing env vars, runs `npm run tauri build`, then prints paths under `src-tauri/target/release/bundle/`. Optional password file **`.tauri-signing-password`** (single line, gitignored) avoids typing each run. To recreate a **Desktop shortcut** to the batch file, run once: `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/create-desktop-shortcut.ps1`.

**Who runs the signed build:** **Angel only** (private key). Agents prepare release notes and bump versions first, then tell Angel to run the batch once; after artifacts exist, the agent pastes the NSIS `.sig` into `updater.json` from the printed path. Agents do **not** run `tauri build` for release signing unless Angel explicitly asks.

**After a successful release build**, Tauri writes **one `.sig` per bundle** next to the installer, for example:

- `src-tauri\target\release\bundle\msi\RuForge_<version>_x64_en-US.msi.sig`
- `src-tauri\target\release\bundle\nsis\RuForge_<version>_x64-setup.exe.sig`

Copy the **base64 signature** from each `.sig` into `updater.json` for the matching platform entry. Use the CLI / docs for your exact updater JSON shape if it changes between Tauri releases.

**Frontend bundle:** `npm run build` may warn when a JS chunk exceeds ~500 kB. That is a Vite/Rollup heads-up, not a signing issue. Address with code-splitting when it becomes a priority.

## Builds

- **Web bundle only:** `npm run build` (runs `tsc` + `vite build`).
- **Desktop installer:** `npm run tauri build` (after frontend build per `beforeBuildCommand`).

## Git / large binaries

- **`src-tauri/binaries/ffmpeg-*` and `ffprobe-*`** are very large (~hundreds of MB). Do **not** commit them unless the project explicitly uses Git LFS or a documented policy. **`yt-dlp-*`** is smaller and may already be tracked.
- Typical junk to exclude unless intended: `.cursor/`, ad-hoc archives like `ffmpeg.7z`.

## Product / UX pointers (from recent work)

- **Playback persistence:** `src/playbackStorage.ts`: furthest position + stored duration for progress/watched when catalog `duration` is still 0; thumbnail bars use `getPlaybackThumbnailBar`.
- **Mini player:** transparent undecorated window; clip-path + control bar behavior affects perceived corners; "back to app" should focus `main` before closing mini.
- **Player:** main `PlayerView` uses opacity dip + no remounting `key` on `<video>` to reduce flash when auto-advancing; folder queue first, then library sorted list for advance when settings allow.

## When unsure

- Prefer reading **`ruforgeStore.ts`**, **`App.tsx`**, **`MiniPlayer.tsx`**, and **`tauri.conf.json`** before large refactors.
- For updater or signing behavior, trust **current Tauri v2 + plugin-updater docs** over memory; the surface changes over time.

## Shipped log

**Why this exists:** Updates were getting lost because the only places to record them lived in `docs/`. Files Chad has no reason to open during a bug fix. This log lives **here, in the file you already read every task**, so there is zero distance between finishing work and recording it. Distance is what kills logging, not effort.

**The rule (non-negotiable):**

- **Any change to shipped runtime behavior gets ONE appended line under the current `### vX.Y.Z (unreleased)` block, before the task is considered done.** Not after release. Not "I'll batch it." Now, as the last action of the change.
- **Vague input is not an excuse to skip.** "Log that we fixed the sidecar thing" means you append one line under the current version. There is nothing to decide: no schema, no file to create, no format. Append. Done. If you find yourself thinking "what format / where / does this need fields", stop. That hesitation is the bug; it is one sentence appended here.
- **Format per line:** `- **Area**: what changed, plainly. `relevant.ts` / `file.rs` if useful.` Past tense, user-or-dev-visible, one sentence. Mirror the density of the Finch log if you've seen it: terse, factual, no marketing.
- **Newest version block on top, inside this section.** Newest line on top within a block.
- **Do NOT create per-change files or per-version folders.** That reintroduces the exact distance/ceremony this section deletes. The flat block IS the system. Editing this file every time is fine. Finch does exactly this and never misses; editing was never the friction, distance was.
- **`### vX.Y.Z (unreleased)`** is the live block during a cycle. At release, the ritual (below) renames it to `### vX.Y.Z` and opens a fresh `(unreleased)` block.

**This block is the single source for release notes and the graph surfaces.** At push time the whole `(unreleased)` block is read once and drained (see `## Release ritual`). That is the only time the graph JSON / `changes.html` get touched. Keeping this log honest mid-cycle is what makes release night a 10-minute job instead of an archaeology dig.

### v0.1.8 (unreleased)

- **Downloader correctness (fix)**: Auto-skip duplicates now stops already-started native downloads before showing a skipped row, ignores late finish/progress events for skipped jobs, and playlist regroup keeps moved files inside the root where they were found. `downloadQueueSlice.ts`, `useDownloaderView.ts`, `gallery.rs`.
- **Public website features**: Tutorial hubs on landing page use 3-column stacked-card previews (step 1 cover, hover spreads steps 2–3) and click opens full 3-step modal; all six hubs in one grid. `TutorialHubsGrid.tsx`, `stacked-cards-interaction.tsx`, `tutorial-hub-modal.tsx`, `index.astro`.
- **Public website features**: Wired all five feature sketch tutorial hubs (library, player, SponsorBlock, mini player, settings) from `public/website/tutorials/` into landing page; shared `TutorialSketchHub.astro`. `FeatureTutorialSections.astro`, `index.astro`.
- **SponsorBlock scrub hover**: Color-coded pill for every bar segment (skip, highlight/POI, SB chapter, music off-topic, etc.) on seek hover. `ScrubHoverPreview.tsx`, `sponsorBlock.ts`.
- **Scrubber previews (fix)**: Simple (no-chapter) seek bar no longer clips hover previews (`overflow-hidden` only on track); chapter path unchanged; sprite reload event + `..info.json` duration. `PlayerView.tsx`, `ChapterScrubber.tsx`, `useScrubberThumbs.ts`, `media.rs`.
- **SponsorBlock (fix)**: API fetch requests all skip/chapter/POI categories (not sponsor-only default); old sidecars refetch on next play. `sponsorblock.rs`.
- **Playlist regroup (fix)**: Group playlist modal refreshes library scan, matches by id/url/title, searches internal + custom roots; Debugging settings tab (toggle in General) holds regroup + cycle updater UI. `duplicateDownload.ts`, `RegroupPlaylistModal.tsx`, `SettingsView.tsx`, `gallery.rs`.
- **Playlist downloads (fix)**: Playlist URL clipboard/focus/paste/drop; link chip paste vs copy; per-row audio toggle and sizes; pre-download duplicate summary; batch jobs land in ordered subfolder for Media stack cards; Settings regroup tool for flat files. `youtubeUrl.ts`, `playlistDownloadPlan.ts`, `useDownloaderView.ts`, `DownloaderView.tsx`, `downloader.rs`, `gallery.rs`, `RegroupPlaylistModal.tsx`.
- **Public website features (fix)**: Download flow art: copy from `public/website/tutorials/download/` into `src/assets` only (never overwrite drop folder); all three steps 515x749. `DownloadTutorialHub.astro`, `tutorials/download/README.md`.
- **Public website features**: Download flow all three steps use sketch PNGs (`downloadStep1/2/3.png`); title + description overlay only (step labels in art). `DownloadTutorialHub.astro`.
- **Public website features (fix)**: Sketch card copy top-aligned in lower panel (not bottom-centered); README documents 252:369 export size. `DownloadTutorialHub.astro`, `tutorials/download/README.md`.
- **Public website features (fix)**: Download step 01: no duplicate STEP 01 badge (label in PNG); sketch cards stretch to row height on desktop. Step 02 unchanged. `DownloadTutorialHub.astro`.
- **Public website features (fix)**: Replaced download flow step 02 sketch frame with larger `downloadStep2.png` export; aspect ratio updated. `DownloadTutorialHub.astro`.
- **Public website features (fix)**: Download flow step 02 uses Figma sketch frame asset `downloadStep2.png` with overlaid Step 02 badge and copy; steps 01 and 03 unchanged. `DownloadTutorialHub.astro`.
- **Public website landing (fix)**: Highlight card release footer: no top rule or status dot, single-line hierarchy, normal padding so text does not clip the card bottom. `index.astro`.
- **Public website landing**: Latest-release teaser moved into highlight card footer instead of floating pill below. `index.astro`.
- **Public website landing (fix)**: Tech ticker brand colors restored (inline Simple Icons hex, no monochrome filter); Zustand bear visible with fixed SVG fills instead of `currentColor` in `<img>`. `techTickerIcons.ts`, `TechTickerIcon.astro`, `index.astro`, `zustand.svg`.
- **Public website landing (fix)**: Tech ticker: no glow/separators; Simple Icons for YouTube/Tauri/Rust/React/FFmpeg; yt-dlp + Zustand from `public/website` (bear silhouette ~9 KB not 119 KB); brand SVGs monochrome via CSS filter. `TechTickerIcon.astro`, `techTickerIcons.ts`, `index.astro`, `public/icons/tech/`.
- **Public website landing (design)**: Upgraded the tech stack ticker with premium hover-interactive capsule badges, customized glowing inline SVG icons, subtle amber radial ambient lighting, and increased padding for standard layout density. `index.astro`.
- **Public website features (fix)**: Reworked download tutorial cards to map 1-to-1 to portrait Figma frames (5:6 aspect ratio, 400x480) with full edge-to-edge coverage and uniform premium warm cream bottom text panels. `DownloadTutorialHub.astro`, `tutorials/download/README.md`.
- **Public website features**: Daylight-style download tutorial hub (header art, hover 1-to-3 step cards with screenshots); color-coded visual cards for other features. `DownloadTutorialHub.astro`, `FeatureVisualCard.astro`, `index.astro`.
- **Public website header (fix)**: OS-detect static Download pill (uil windows / simple-icons linux / generic mac); no motion expand; safe-area padding; hero title spacing below underline. `HeaderDownloadButton.astro`, `animated-underline-text-one.tsx`.
- **Public website header**: Floating sticky pill nav (logo home, Changelog/Roadmap/Legal, motion Download CTA) like Daylight Health pattern. `SiteHeader.astro`, `BaseLayout.astro`.
- **Public website fonts/hero**: Unzipped Cabinet Grotesk, Satoshi, Patrick Hand into `public/fonts`; hero uses framer-motion AnimatedText island (hand-drawn underline). `fonts.css`, `HeroAnimatedTitle.tsx`, `animated-underline-text-one.tsx`.
- **Public website footer (fix)**: Increased content top padding so link columns sit below the top fade band on the paper background. `SiteFooter.astro`.
- **Public website footer**: Aged-paper doodle WebP background via Astro Image, curved top radius, top fade into page bg, scrim for link legibility. `footer-doodles-aged-paper.webp`, `SiteFooter.astro`.
- **Public website landing (fix)**: Motion download button hides label until hover, fixed icon position, Iconify twotone icons with crossfade (off / download / done on click). `MotionDownloadButton.astro`.
- **Public website landing**: Highlight card download CTA is rounded motion button (accent circle expands on hover, download icon, label "Download Latest"). `MotionDownloadButton.astro`, `index.astro`.
- **Public website landing**: Tech ticker uses hairline gradient rails, edge fades, accent cadence on labels, pause on hover; removed panel background and heavy borders. `index.astro`.
- **Public website landing**: Reworked tech ticker marquee layout to completely remove separator dots and fade the text opacity to be highly subtle. `index.astro`.
- **Public website images**: Migrated logos, carousel screenshots, testimonial avatars, and highlight photo to Astro `<Image />` via `src/assets/` and `sharp` (responsive WebP, build-time optimization). `imageAssets.ts`, components, `package.json`.
- **Public website landing**: Bottom highlight card uses coffee beans WebP background (`highlight-coffee-beans.webp`) with readability scrim instead of gradient. `index.astro`, `public/highlight-coffee-beans.webp`.
- **Public website testimonials (fix)**: Removed left accent tab; full-card thin border only with 16 spread muted rim hues so same-avatar cards match quietly. `testimonials.ts`, `TestimonialsSection.astro`, `TestimonialsColumn.astro`.
- **Public website testimonials**: Replaced em dashes in quotes with styled middle-dot pauses; matching avatar file shares rim color and avatar ring so card sets are visible while scrolling. `testimonials.ts`, `TestimonialsColumn.astro`, `TestimonialsSection.astro`.
- **Public website testimonials**: Import all 16 `public/website` assets (including formerly skipped unused-named files) as angel-01..09 and susie-01..07 WebP; expanded image pools in `testimonials.ts`.
- **Public website landing**: Expanded testimonials to 30 quotes (Angel/Susie casual voice), round-robin three-column split, cyclic avatar paths, README for nine Pinterest photos. `testimonials.ts`, `TestimonialsSection.astro`, `public/testimonials/README.md`.
- **Public website landing**: Reworked testimonials: flat cards without inner shadow wash, cursor border spotlight, natural copy, star row, avatar initials fallback, column pause-on-hover. `TestimonialsSection.astro`, `testimonials.ts`.
- **Public website landing (fix)**: Resolved button hover transition flickering where buttons would momentarily bright-flash and then dim down. Prevented standard link `opacity-80` dimming inheritance and added premium scale-down active states and glowing shadows on hover. `global.css`, `index.astro`.
- **Public website landing**: Added staggered scroll-reveal animations, custom accent scrollbars, and dynamic interactive border spotlight mouse-tracking hover effects to details cards. Removed 'Windows Desktop Client' pill and fixed logo anchor accessible name. `index.astro`, `Logo.astro`.
- **Public website landing**: Reworked home page for a modern high-fidelity look featuring 3D perspective hero hover transitions, bottom-faded screenshot blends, scrolling tech marquee ticker, and an interactive grid of 6 detail cards with transitioning arrows. `index.astro`.
- **Public website landing**: Reworked home page for a highly-focused developer-centric design, reducing word count by over 65%, rendering logo-only in the header, and adding subtle CSS-only ambient movement. `index.astro`, `SiteHeader.astro`.
- **Public website landing**: Redesigned landing page and site footer with improved visual hierarchy, multi-column links, and spacing-based visual separation. `index.astro`, `SiteFooter.astro`.
- **Public website**: Astro 5 static site in `website/` (home, changelog, roadmap, legal); Cloudflare Pages ready; design tokens match app shell. `website/`.
- **Public website legal**: `marked` renders `docs/legal/*.md` after unescaping and paragraph reflow (fixes `\-` lists and per-line breaks). `website/src/lib/legal.ts`.
- **Public website polish**: RuForge logo from `neotubeIcon.png`, inline icons, color-coded changelog (add/fix) and roadmap badges, improved spacing. `website/src/components/`, `website/docs/ICON-WISHLIST.md`.
- **Public website home**: logo only in header; hero carousel from `website/public/screenshots/` with progress bar. Dev-only `ruforgeScreenshot.frame()` in console for 1200×675 captures. `HeroCarousel.astro`, `devScreenshotFrame.ts`.
- **Public website carousel**: eager+fetchpriority on first slide only; deferred `data-src` for rest; prev/next, pause, tab keyboard. `HeroCarousel.astro`.
- **Mini player video (fix)**: large-mode playback no longer stacks blurred cover/gradient or idle ambient blur; controls dock unmounts when hidden so backdrop-blur cannot wash the frame. `MiniPlayer.tsx`.
- **Updater post-install**: What's New modal clamps to viewport; header/footer fixed, notes/additions/fixes scroll with thin scrollbar. `UpdaterLayers.tsx`.

### v0.1.7 (shipped)

- **Audio analyser teardown**: hard release clears MES attachment set so track changes re-tap; RAF alive guard on hero canvas. `audioAnalyserGraph.ts`, `AudioHeroStage.tsx`.
- **Audio hero equalizer look**: segmented LED block render in paintWaveform only. `AudioHeroStage.tsx`.
- **Audio hero equalizer visibility**: restored normal blend and bar opacity after over-dim pass; balanced AMP_CAP so cover and bars both read. `AudioHeroStage.tsx`.
- **Audio hero equalizer**: Whispers-style full-canvas 90-bar dancer (always visible, loudness-driven random targets + smooth, not frequency-mapped). `AudioHeroStage.tsx`.
- **Audio LED adaptive range**: visible row window tracks recent peak usage; segments scale to fill strip; AGC normalization for quiet tracks; global row cap hides unused rows. `AudioHeroStage.tsx`, `audioAnalyserGraph.ts`.
- **Audio-only CORS**: `crossOrigin="anonymous"` + ordered src via `convertFileSrc` (Tauri v2 `HeaderConfig` has no ACAO key). `PlayerView.tsx`.
- **Audio LED strips**: draw lit segments only (no ghost grid); per-bin `readLedBandLevels`; higher gain; strips flush to art via flex layout. `AudioHeroStage.tsx`, `audioAnalyserGraph.ts`.
- **Audio-only LED visualizer**: segmented mirrored bars (30 per side, bronze-gold-orange-red ramp); personality-driven heights; MES soft-release + captureStream->destination; dual strip canvases. `AudioHeroStage.tsx`, `audioAnalyserGraph.ts`.
- **Audio side ribbons (fix)**: single continuous glass strip per side (no A/B blade or center seam); straight inner edge; media-element analyser first on audio. `AudioHeroStage.tsx`, `audioAnalyserGraph.ts`.
- **Audio side waveforms (fix)**: flat idle baseline (no faux sine on pause); adaptive time-domain gain while playing; auto-fallback to media-element tap if captureStream reads silence. `audioAnalyserGraph.ts`, `AudioHeroStage.tsx`.
- **Audio-only hero**: blurred cover backdrop, centered art, thin glass side waveforms (A top / B bottom per side, mirrored left-right); replaced horizontal spectrum. `AudioHeroStage.tsx`, `PlayerView.tsx`.
- **Audio visualizer (fix)**: tap `captureStream()` so bars follow playback in WebView2; idle wave only when paused; peak + waveform bins. `audioAnalyserGraph.ts`, `AudioHeroVisualizer.tsx`.
- **Audio visualizer (fix)**: spectrum reacts to playback via shared per-element Web Audio graph, callback ref on `<audio>`, suspended context resume on play, time-domain + frequency sampling; mute dampens bars not idle freeze. `audioAnalyserGraph.ts`, `AudioHeroVisualizer.tsx`, `PlayerView.tsx`.
- **Media library audio badge**: top-left Music pill on audio-only gallery cards. `MediaView.tsx`.
- **Audio-only UX**: library hover keeps cover art for audio files (no blank video preview); main player hero is left cover art plus live spectrum visualizer (AnalyserNode), removed WebView copy and Sound settings button. `MediaView.tsx`, `PlayerView.tsx`, `AudioHeroVisualizer.tsx`.
- **Mini player large mode (fix)**: clamped fixed-position tooltips stay inside the window; elapsed/total uses shared `formatDuration`; volume icon tiers match mute/level like main player. `MiniPlayer.tsx`.
- **SponsorBlock reach**: audio-only main player and mini large/small layouts (scrub bar present); compact/micro/tiny mini layouts unchanged. `PlayerView.tsx`, `MiniPlayer.tsx`.
- **SponsorBlock colors**: aligned scrub/POI palette and 0.7 bar opacity with official extension `barTypes` (chapter `#FFC83D`, POI `#FF1684`, `music_offtopic`). `sponsorBlockColors.ts`, `SponsorBlockScrubOverlay.tsx`, `ChapterScrubber.tsx`.
- **Download duplicate library rows (fix)**: dedupe and post-download cleanup group `.fNNN` video-only leftovers with muxed outputs via shared `Title.info.json`, title fallback, folder sweep on scan; cross-dir merge in `fetchEntries`. `gallery.rs`, `galleryDedupe.ts`, `ruforgeStore.ts`.
- **SponsorBlock polish**: added extension-aligned color map, overlay for skip ranges and POI ticks across scrubbers, skip button fill, default-on master toggle. `useSponsorBlockPlayback.ts`, `SponsorBlockScrubOverlay.tsx`, `SponsorBlockSkipButton.tsx`, `PlayerView.tsx`.

- **Settings UI**: short descriptions always visible, info icon only when long; SponsorBlock uses same SettingItem row rhythm (FadingDivider, nested indent, chevron collapse); bundled logo `src/assets/sponsorblock.svg`. `settingsDescription.tsx`, `SponsorBlockSettingsTree.tsx`.
- **SponsorBlock**: privacy hash fetch, `{stem}.sponsorblock.json` sidecar, silent API fail; main player skip button, adaptive per-category learning, chapter/poi bar markers; Settings Playback tab with tree UI. `sponsorblock.rs`, `useSponsorBlockPlayback.ts`, `SponsorBlockSettingsTree.tsx`, `PlayerView.tsx`.
- **Settings Playback tab**: moved auto-advance audio, prefetch, ReplayGain placeholder from Advanced; added `playback` tab in `App.tsx` / `types.ts`.
- **Chapter scrubber perf**: removed duplicate scrub hover handlers on main player (parent bubble only). `PlayerView.tsx`, `ChapterScrubber.tsx`.
- **Player chapter scrubber layout**: CSS grid `fr` columns (no flex % + gap overflow); global hover line aligned with cursor/thumbnail. **Player controls dock**: frosted bar, primary actions visible, secondary in More menu. `ChapterScrubber.tsx`, `chapters.ts`, `PlayerView.tsx`.
- **Player chapter scrubber visibility**: restored separated rounded segment pills (`gap-[3px]` grid, per-chapter `rounded-full`); raw chapters kept when scan duration is 0; normalize on video duration. `ChapterScrubber.tsx`, `PlayerView.tsx`, `galleryScan.ts`.
- **Chapter scrub hover preview**: thumb + spaced `w-max` caption bubble (`MarqueeText`); playhead on scaled segment; per-segment hover wash. `ChapterScrubber.tsx`.
- **Player dock**: play/pause icon centered and sized like other bar controls. `PlayerView.tsx`.
- **Download duplicate library rows**: after a successful job, remove orphan outputs that share the same yt-dlp `id` (e.g. leftover audio beside muxed mp4); gallery scan hides duplicates by `source_id`. `gallery.rs`, `downloader.rs`.
- **Player chapters**: segmented scrubber per yt-dlp sidecar chapter, current chapter title, prev/next and Shift+arrow jumps; normalized in `gallery.rs` and `chapters.ts`. `ChapterScrubber.tsx`, `PlayerView.tsx`, `MiniPlayer.tsx`, `galleryScan.ts`.
- **Windows volume mixer label**: background thread renames WebView2 child audio sessions to product name and exe icon via Core Audio API (sndvol workaround). `windows_audio_brand.rs`, `lib.rs`, `Cargo.toml`.
- **Playback audio (WebView)**: sync store volume/mute onto `<video>` / `<audio>` on load and play; stop reading autoplay `muted` into pop-out/handoff; MiniPlayer now applies mute state. `applyMediaOutputState.ts`, `PlayerView.tsx`, `MiniPlayer.tsx`.
- **Preview ffmpeg lock**: fixed deadlock when generating sprites/posters (nested per-file mutex); download finish always runs scrub fallback (idempotent). `media.rs`, `downloader.rs`.
- **Delete vs auto previews**: player respects auto scrubber previews setting (no ffmpeg on open when off); delete cancels ffmpeg and stops blocking; deleting shows progress toast. `media.rs`, `PlayerView.tsx`, `MediaView.tsx`.
- **Auto scrubber previews**: Settings → Downloads toggle (default on); video downloads spawn ffmpeg sprite sheets on processing/finish; manual Generate Previews when off. `types.ts`, `downloadQueue.ts`, `downloader.rs`, `SettingsView.tsx`.
- **Library replace + delete locks**: Replace removes the matched library file before re-download (audio vs video ext); delete cancels in-flight RuForge ffmpeg preview work and waits for the per-file lock. `replaceLibraryDownload.ts`, `media.rs`, `process_tree.rs`, `useDownloaderView.ts`.
- **Downloader hero progress**: removed top-right and traveling percent; 0/100 flank bar only, speed/time under bar. `DownloaderView.tsx`.
- **Downloader URL chip**: hide paperclip when URL is not in queue; clear bar hero on remove when URL has no queue row; prune pinned quick-enqueue chips. `useDownloaderView.ts`, `downloadQueueSlice.ts`.
- **Downloader floating queue**: drawer is one attached unit (top-left handle + panel); width collapse hides content fully; bottom-right float; viewport-aware portaled tooltips. `DownloadJobQueuePanel.tsx`.
- **Downloader floating queue (expanded)**: redesigned expanded queue state; removed all section and border dividers; consolidated status, sizes, and format details into a single horizontal dot-separated paragraph to prevent layout wrapping; hid secondary actions and reordering chevrons behind dynamic hover/focus states to eliminate button clutter; transitioned small audio/video toggle to high-fidelity Music/Video Lucide icons. `DownloadJobQueuePanel.tsx`.
- **Downloader floating queue (initial)**: moved queue panel to collapsible bottom-right floating pop-up card; added full-card faded, blurred, active-hover crossfading backdrop thumbnails; morphed left-side thumbnail directly into card surface via a CSS linear-gradient mask to remove hard-bordered boxes; integrated overflow MarqueeText titles; created z-index focus overlays to prevent outline clipping on cards. `DownloadJobQueuePanel.tsx`.
- **Downloader thumbnails**: hero backdrop and queue row thumbs crossfade on URL/thumb change (focus row or queue advance); opacity-only, 320ms. `DownloaderView.tsx`, `DownloadJobQueuePanel.tsx`.
- **Explorer bounds sync**: rAF-coalesced layout updates during sidebar transition and window resize; skips redundant IPC when rect unchanged; sidebar toggle no longer tears down listeners. `explorerBoundsSync.ts`, `App.tsx`, `explorer_embed.rs`.
- **Download stall watchdog**: per-job activity-based idle detection (ETA-aware, longer pre-transfer/processing budgets); marks failed, kills yt-dlp via pause, notifies user. `downloadJobWatchdog.ts`, `downloadQueueSlice.ts`.
- **Downloader metadata cookies**: `get_video_info` passes browser/cookie-file opts into both yt-dlp simulates (same as download); partial success keeps title/sizes when only video or audio simulate succeeds. `downloader.rs`, `downloadVideoInfoFetch.ts`, `downloadQueue.ts`, `useDownloaderView.ts`, `downloadQueueSlice.ts`.
- **Duration display**: `formatDuration` guards non-finite values; `normalizeDurationSeconds` / `sanitizeVideoInfo` at fetch and snapshot boundaries; Rust single-video `get_video_info` uses `ytdlp_duration_secs`. `downloaderFormat.ts`, `downloader.rs`, `gallery.rs`.
- **Download queue panel**: sorted job list drops ids missing from `downloadJobs` instead of non-null asserting; `jobMembershipKey` keeps `sortedJobIds` in sync on remove. `DownloadJobQueuePanel.tsx`.
- **Download finish hero clear**: `onDownloadJobFinished` resolves finished URL from the queue row and IPC `url` inside one `set()`, clears hero fields in that same update, and `removeDownloadJob` clears hero when the removed URL matches; Rust `download-job-finished` includes `url`. `downloadQueueSlice.ts`, `downloader.rs`, `App.tsx`.
- **Download queue pause**: `pauseDownloadJob` commits paused state only after `pause_download_job` invoke succeeds, so a failed pause no longer frees a slot or shows paused while yt-dlp still runs. `downloadQueueSlice.ts`.
- **Downloader processing phase**: `download_reached_full` latches at 100% and no longer clears on later sub-100% `[download]` lines (HLS/playlist), so post-process stdout still emits `processing`. `downloader.rs`.
- **Explorer layout (Linux)**: embedded browser uses a parented `explorer-surface` child window positioned in screen space (fixes GtkBox stacking and upward drift); closes legacy `explorer-view` child. `explorer_embed.rs`, `App.tsx`.
- **Linux dev**: `tauri.conf.json` asset scopes for `$HOME`, `/home`, `/media`, `/mnt`, and `C:`–`F:`; `platformPaths.ts` hydrates download/internal dirs from Tauri path APIs on non-Windows; `App.tsx` / `MiniPlayer.tsx`.
- **Audio-only download size**: format changed from `bestaudio/best` to `bestaudio[ext=m4a]/bestaudio`; removed `--audio-quality 0`. The old format fell back to the full video stream and then up-encoded via ffmpeg VBR Q0, producing an audio file the same size as the full video. `downloader.rs` and simulate constant updated together so preview matches actual output.
- **Downloader size/ETA follow-up**: dual yt-dlp simulate (video + `bestaudio`) so audio vs video previews differ; legacy URL-only metadata cache no longer shared across modes; queue transfer uses `max(progress, metadata)` total; ETA catches up on fast downloads (min with raw yt-dlp, larger downward steps).
- **Downloader ETA smoothing**: per-job byte-rate EMA and derived countdown in `downloadProgress.ts` via `applyDownloadProgress`; resets on pause/finish.
- **Downloader size estimates**: `get_video_info` runs yt-dlp `-J -s` with user `-f` (incl. audio-only); prefers `requested_formats` sizes, audio ceiling fallback; metadata cache and in-flight fetch keyed by format + mode.
- **Downloader hero size**: focused idle hero only merges `videoInfo` sizes when job format matches current settings (`DownloaderView.tsx`).
- **Downloader prod regressions**: monotonic download progress (yt-dlp fragment % jumps), shared deduped `get_video_info` with timeout, queue row hydration no longer blocked on dual file sizes, metadata loading effect deps tightened, queue bar animation de-sprung.

### v0.1.6 (shipped)

- **Mini player controls**: Tiny title shifts right when hover sidebar opens (marquee remeasures); compact shuffle toggles random library track and hides with volume slider; tiny skip/advance/shuffle wiring.
- **Mini player Video Library**: locks the mini window to 430x275 and disables resize while browsing with no active file; restores flexible resize when a video is selected. Hides the top-left library strip toggle in full-library browse. Removed the accent glow behind the Video Library header camera icon.
- **Mini player micro layout**: added an even smaller micro layout (Size 2: height 86-135px; Size 1: height 70-85px) with the minimum window height set to 70px. In Size 1, a marquee track title renders on the left, and Play & Next controls render on the right. Sidebars and controls stay in static horizontal positions on hover (no layout shifting). In Size 2, Loop and Rewind controls dynamically hide when the window width drops below 250px and 210px. In Size 2, a Pin button renders in the top-right corner on hover, while in Size 1, the Pin button is removed and the Back to Library button displays in the top-right corner on hover instead. Restored the full background image layout fading to the right in all compact modes, and removed the small sticker cover art square in Size 1. Added smooth spring and fade animations for the metadata when entering Size 1.
- **Mini player metadata and controls**: wired the compact mode title display with the `MarqueeText` scrolling component for long titles, conditionally removed the empty subtitle row when the uploader/artist metadata is unavailable (replacing the fallback "RuForge Media" text), aligned thumbnail fallback priority to prefer local `thumbnailPath` over `ruforgePosterPath`, and introduced dynamic button sizing/spacing that automatically scales down under 250px window widths to prevent controls from overflowing the window.
- **Video preview loading**: added the `poster` attribute referencing the `coverArtSrc` thumbnail to the `<video>` elements in `MiniPlayer.tsx` and `PlayerView.tsx` to ensure the actual thumbnail/preview is loaded and displayed immediately when swapping videos instead of displaying a blank screen or a decoded first frame of the video.
- **Audio visualizer SVG path crash**: padded the `idlePaths1` array in `MiniPlayer.tsx` to 3 elements to match the length of `playingPaths1` and `playingPaths2`, preventing Framer Motion from looking up `undefined` keyframe values and throwing a `<path> attribute d: Expected moveto path command` error when toggling play/pause.
- **Mini player cover art**: refactored cover art backgrounds into a unified component inside the main container to fix visibility issues when resized; small mode (`isSmallMode`) and compact mode (`isCompactMode`) display the cover art using the identical full `absolute inset-0` background layout with a smooth horizontal black gradient overlay to prevent any shifting, misalignment, or differing crop ratios, and large mode (`isLargeMode`) displays full background cover art with a blurred backing and gradient dark overlay for maximum readability.
- **Mini player layout**: wired compact responsive mode below 180px height using AnimatePresence; styled the compact controls (track title, artist/uploader name parsing, and morphing circular audio visualizer row, clean overlay volume slider with no card background, and right export button), unified cover art rendering with borderless blending into background, a tight centered control cluster (Shuffle, Rewind, Play, Next, Repeat), and a prominent shadowless Play/Pause button colored with the user's custom accent color. Upgraded the visualizer in the top right to a dual-layered morphing fluid orb with ambient glow (removed the outer circle), removed the placeholder "RuForge Media" artist fallback, and added an animated hover shift that moves metadata down when hovered to prevent overlapping top controls. In the non-compact small player layout, morphed/blended the left cover art into the background instead of displaying it as a boxed square.
- **Explorer title bar**: back/forward/reload in `ExplorerTitlebarNav` flush
  at sidebar edge (`80`/`240px`); queue + window chrome stay in
  `WindowControls`. Documented explorer UI placement in `AGENTS.md`
  (no bulge / in-tab controls).
- **Sidebar collapse label**: replaced `AnimatePresence popLayout` on
  "Collapse" / nav labels with overflow-clipped `max-width` transitions so
  text no longer flashes at the top while the rail narrows.

### v0.1.5 (shipped)

- **Audio-only download**: toggle extracts audio only; `pub audio_only: bool`
  on Rust `DownloadOptions` (was missing from committed HEAD; serde silently
  dropped it).
- **Processing… phase**: queue row + hero show "Processing…" on
  `progress.status === "processing"` while ffmpeg extracts; `job.status`
  stays `downloading`.
- **In-app delete confirm**: replaced native `confirm()` (dead in WebView2)
  with React `ConfirmDialog`.
- **Duplicate skip feedback**: transient `skipped` status, "Already in
  library" 1.8s then removes.
- **Ghost queue rows on delete**: `MediaView` `handleDelete` calls
  `removeDownloadJob` for queue jobs matching `file.sourceUrl`.
- **Hero URL not clearing**: `onDownloadJobFinished` clears hero URL +
  `videoInfo` when finished URL matches hero.
- **Double-dot sidecar bug**: `resolve_info_json_path` now tries
  `{stem}.info.json` and `{stem}..info.json`; `MediaFile` gains `source_id`.

## Release ritual

**Why this exists:** "Push and commit everything" is ambiguous to an agent. The failure mode (observed): Chad invented a feature branch, committed there, and stranded `updater.json` off `main`. Then produced a flawless postmortem of the problem it had just caused. Chad's knowledge was never the gap. The gap was no defined, ordered, verified sequence. This is that sequence.

**Trigger:** Angel says ship / release / push it out. Run these steps **in order, top to bottom.** Do not reorder, do not skip, do not parallelize.

**Angel vs agent (default):** See **Release handoff** under **Who does what**. Angel runs the signed build only; the agent owns GitHub (`gh`), commits, tags, and release copy.

**Hard rule (branching):** RuForge is a solo-dev repo. **All release commits go directly to `main`.** Do **not** create, switch to, or commit on any branch for a release. If you are not on `main`, stop and say so. Do not "fix" it with git surgery on a possibly-dirty tree; ask Angel.

1. **Drain the Shipped log → version bump decision.** Read the entire `### vX.Y.Z (unreleased)` block. Decide PATCH vs MINOR from its contents (behavior change = at least PATCH; new feature / new persisted setting / new command = MINOR). State the chosen version and why, one line.
2. **Bump all three version files together:** `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package] version`. A mismatch here is a known past failure. Confirm all three match.
3. **Prep `updater.json` notes (agent, before build).** Write structured JSON in `notes`: markdown **teaser** (header + three bullets for the pre-download card; full markdown supported), plus `additions` and `fixes` arrays for post-install. Set `version`, `url` (`.../releases/download/v<semver>/RuForge_<semver>_x64-setup.exe`), leave `signature` empty until step 5.
4. **Signed build (Angel only).** Angel runs `Build-signed-windows.bat` or `npm run build:signed`. Agent then reads NSIS `RuForge_<semver>_x64-setup.exe.sig` under `src-tauri/target/release/bundle/nsis/` (do not ask Angel to paste base64 unless the file is missing).
5. **Finish `updater.json` (agent).** Paste `.sig` base64 into `signature`, set `pub_date` from the build time or minisign timestamp. The `signature` value is the literal base64 CONTENTS of the `.sig` file, never a path or URL. That mistake breaks every install silently.
6. **Commit + push to `main` (agent).** Confirm current branch is `main`. Write a clear commit message (version + one-line summary). The commit MUST include `updater.json`, all three version files, and any unreleased code. Push to `origin main`. State the pushed commit hash.
7. **GitHub Release (agent, `gh`).** Use GitHub CLI on `UnboundAngel/RuForge`. Tag **`v<semver>`** must match the `updater.json` download path. Example:

   ```powershell
   gh release create v0.1.7 `
     "src-tauri/target/release/bundle/nsis/RuForge_0.1.7_x64-setup.exe" `
     "src-tauri/target/release/bundle/msi/RuForge_0.1.7_x64_en-US.msi" `
     --title "RuForge 0.1.7" `
     --notes "## RuForge 0.1.7`n`n<paste teaser + additions/fixes from updater notes>"
   ```

   Upload the NSIS `.exe` (required for auto-update). MSI is optional. Do **not** attach `.sig` files. If the release already exists, use `gh release upload` or edit; do not duplicate tags. Release body can mirror the `updater.json` teaser and bullet lists (markdown). Installers stay out of git.

8. **Drain Shipped log → graph surfaces AND roll STATE.md (scoped, this
   step only).**
   a. Append the now-released changes into
      `docs/versions/version-<semver>.json` and the
      `<script id="changelog-data">` JSON inside `docs/changes.html`
      (append to the `versions` array only; recompute `.rf-count`; never
      touch the JS/CSS/DOM contract; see `docs/CHANGELOG-AUTHORING.md`).
      Add the registry row in `docs/versioner.html`.
   b. In AGENTS.md: rename the `### vX.Y.Z (unreleased)` block to
      `### vX.Y.Z (shipped)`. Open a fresh empty
      `### v<next> (unreleased)` block at the top of the Shipped log.
   c. In STATE.md (repo root): set `Last shipped to users:` to the version
      just released. Set `Shipping version:` to the next `(unreleased)`
      version. Move the just-shipped lines into the
      "What is new since last user release" section as the closed release
      for that version, and clear that section's unreleased mirror so it
      reflects only the new empty cycle. Refresh `Now`, `Next 3`, and
      `Open P0` to current reality. Update `Last updated:` to today.
   STATE.md and the AGENTS.md Shipped log must agree on what is shipped vs
   unreleased after this step. If they do not, step 8 is not complete.
9. **HARD BLOCK: verify live, or it did not ship.** Fetch the live raw URL:
   `https://raw.githubusercontent.com/UnboundAngel/RuForge/main/updater.json`
   - Confirm the response body PARSES as JSON. A 200 with malformed JSON
     still means every user gets nothing: Tauri validates the entire
     updater file before it ever compares versions, and a parse failure
     reads as "no update available", not as an error.
   - Confirm the parsed `version` EQUALS the version you just released.
   - Confirm `platforms.windows-x86_64.signature` is a long base64 string,
     not a path, not a URL, not empty. The signature field must be the
     literal contents of the `.sig` file. A path or URL there silently
     breaks every install.
   If any check fails the release FAILED. Say exactly which check failed,
   show old vs expected version, and stop. "I committed it" / "I pushed it"
   is NOT done. Live, parsed, and version-matched is the only definition of
   done. (Same principle as the session lesson: code present ≠ running on
   the path that matters. Committed ≠ live on `main`.)
10. **Report.** One block: chosen version + rationale, pushed commit hash, GitHub Release URL, the live `version` string you actually fetched in step 9, and confirmation the Release asset matches `updater.json` `url` (`.sig` only in `updater.json`).

**If any step fails, stop at that step and report the failure plainly. Do not continue and do not claim partial success as success.**
