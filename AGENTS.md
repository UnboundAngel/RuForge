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
- **Graph surfaces (`docs/changes.html`, `docs/versions/version-<semver>.json`, `docs/versioner.html`):** Angel's project-tracking + release-note source. These are **drained from the Shipped log at release time only** (see `## Release ritual`, step 6). **Never** edited per-change mid-cycle. The gap between the Shipped log and the last version present in the graph surfaces IS the release-prep to-do; do not wait to be told.
- **In-repo machine plans:** `.cursor/plans/` (e.g. Zustand migration audit). Implementation detail, may lag; trust code + this `AGENTS.md` for "what shipped."

## Who does what (this workspace vs elsewhere)

| Role | Environment | Scope |
|------|-------------|--------|
| **Chad** (default agent in Cursor) | Cursor, this workspace | **Logic only:** TypeScript / React behavior, state, Tauri wiring, bug fixes, refactors. Small `.ts` / `.tsx` edits are in scope when they touch behavior, types, or data flow. Not pure styling passes. |
| **Jim** (Gemini) | Your CLI or Antigravity. **Not** Cursor | **Visuals only:** layout, typography, color, motion, component styling. **No** business logic, state machines, or store changes. |

**Handoff rule:** If something needs Jim's pass (pure UI polish), Chad should **not** pretend to be Jim. Instead, Chad ends with a **short, copy-paste prompt for you to run in Jim's environment** (file paths, desired look, explicit "do not change logic or props contracts"). Chad implements or preserves the logic and prop surfaces Jim should style against.

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

### v0.1.6 (unreleased)

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

**Hard rule (branching):** RuForge is a solo-dev repo. **All release commits go directly to `main`.** Do **not** create, switch to, or commit on any branch for a release. If you are not on `main`, stop and say so. Do not "fix" it with git surgery on a possibly-dirty tree; ask Angel.

1. **Drain the Shipped log → version bump decision.** Read the entire `### vX.Y.Z (unreleased)` block. Decide PATCH vs MINOR from its contents (behavior change = at least PATCH; new feature / new persisted setting / new command = MINOR). State the chosen version and why, one line.
2. **Bump all three version files together:** `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package] version`. A mismatch here is a known past failure. Confirm all three match.
3. **Build signed.** `Build-signed-windows.bat` or `npm run build:signed`. Locate the emitted `.sig` next to the NSIS installer under `src-tauri/target/release/bundle/`. Read the base64 out of the `.sig` file yourself. Do not ask Angel to.
4. **Update `updater.json`:** bump `version`, `pub_date`, per-platform `url` (URL tag segment must match the GitHub release tag exactly, incl. leading `v` if used), and paste the `.sig` base64 into `signature`. Distill a SHORT teaser from the Shipped block for `notes`. Do not paste the whole block.
   The `signature` value is the literal base64 CONTENTS of the `.sig` file,
   never a path or URL to it. This is a documented common failure that
   breaks every install silently.
5. **Commit + push to `main`.** Confirm current branch is `main` first. The commit MUST include `updater.json`, all three version files, and any code. Push to `origin main`. State the pushed commit hash.
6. **Drain Shipped log → graph surfaces AND roll STATE.md (scoped, this
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
   unreleased after this step. If they do not, step 6 is not complete.
7. **HARD BLOCK: verify live, or it did not ship.** Fetch the live raw URL:
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
8. **Report.** One block: chosen version + rationale, pushed commit hash, the live `version` string you actually fetched in step 7, and confirmation the GitHub Release contains the installer asset at the manifest `url` (`.sig` stays out of the Release; it lives only in `updater.json`).

**If any step fails, stop at that step and report the failure plainly. Do not continue and do not claim partial success as success.**
