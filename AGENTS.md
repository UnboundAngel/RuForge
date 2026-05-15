# RuForge — notes for IDE agents (Cursor / automation)

Concise context for agents working **inside this repo’s IDE workspace**. This is **not** a full architecture audit; use it as an onboarding + guardrails doc.

## Product scope (read before suggesting features)

**North star:** the **downloader** — reliable YouTube + local handling, **persistent downloads**, resumability/caching where it matters, and **performance**. Treat player, gallery, and polish as supporting that story, not a reason to chase general-purpose media apps.

**What we ship today (mental model):**

- **Inputs:** YouTube URLs and **user-provided video files** (library path / uploads). Expect **rough edges on extensions and casing** (e.g. iPhone `*.MP4` vs `*.mp4`) until scan/filter logic is tightened — fix when touched, but do not re-scope the product around “every container on earth.”
- **Player:** so people can **watch what they already downloaded**; it is not the competitive wedge.
- **Media view:** a **convenient** local library surface on top of downloaded (and scanned) files — secondary to downloader quality.
- **In-app explorer webview:** primarily for **cookie / session flows** that yt-dlp needs (age-restricted, members-only, etc.). It is **not** positioned as a full in-app browser for casual watching. A **uBlock** payload may exist under `src-tauri` for this webview; treat it as **experimental / not relied upon** until it is verified working end-to-end.

**How to advise:** ground recommendations in **what RuForge already is** and what is **already solved well elsewhere** (generic browsers, dedicated players, Plex-like libraries). Avoid **feature creep** and “compete with X” pivots unless the maintainer explicitly widens scope. Longer roadmap, priorities, and out-of-scope list live in the **planning doc** linked below — prefer that over inventing new product direction in chat.

## Planning & ideas (canonical doc)

- **Living roadmap / ideas (outside this git repo):**  
  `c:\Random things i dont want deleted\markdown files\RuForge.md`  
  Open it from Explorer or paste the path in the editor. When work completes, **update that file** (or ask the maintainer to) so IDE agents and humans share one source of truth.
- **In-repo machine plans:** `.cursor/plans/` (e.g. Zustand migration audit) — implementation detail, may lag; trust code + this `AGENTS.md` for “what shipped.”

## Who does what (this workspace vs elsewhere)

| Role | Environment | Scope |
|------|-------------|--------|
| **Chad** (default agent in Cursor) | Cursor, this workspace | **Logic only:** TypeScript / React behavior, state, Tauri wiring, bug fixes, refactors. Small `.ts` / `.tsx` edits are in scope when they touch behavior, types, or data flow—not pure styling passes. |
| **Jim** (Gemini) | Your CLI or Antigravity—**not** Cursor | **Visuals only:** layout, typography, color, motion, component styling. **No** business logic, state machines, or store changes. |

**Handoff rule:** If something needs Jim’s pass (pure UI polish), Chad should **not** pretend to be Jim. Instead, Chad ends with a **short, copy-paste prompt for you to run in Jim’s environment** (file paths, desired look, explicit “do not change logic or props contracts”). Chad implements or preserves the logic and prop surfaces Jim should style against.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind v4, Zustand (`src/store/ruforgeStore.ts` + `ruforgePersistStorage.ts`).
- **Desktop:** Tauri v2 (`src-tauri/`), WebView2 on Windows. **Two windows:** `main` (full app) and `mini` (mini player); optional `explorer` webview.
- **Cross-window sync:** Zustand does **not** span webviews. Use existing Tauri **`emit` / `listen`** (`play-media`, `stop-playback`, `send-to-main`, `play-in-mini`, etc.) as the only bridge between main and mini.

## Quick audit snapshot (maintenance-oriented)

- **Source of truth (main window):** `useRuforgeStore` holds nav, settings, paths, notifications, downloader fields, gallery list (`entries` + loading flags), player file/playlist/volume/loop, sidebar, search, explorer URL, etc. Persisted slice is settings + output paths (`ruforgePersistStorage.ts` — flat `localStorage` keys preserved for MiniPlayer and other readers).
- **`App.tsx`:** Still uses **local React state** for window chrome / shell only, e.g. **`isMini`** (which webview label you’re in) and **`isMaximized`** for custom titlebar controls—intentional separation from Zustand.
- **Live gallery UI:** **`MediaView`** (used from `App.tsx`) is aligned with the store’s gallery slice. **`GalleryView.tsx`** exists but is **not** imported by `App.tsx`; treat it as legacy / candidate for delete or future wiring—not part of the shipped Zustand path.
- **`MiniPlayer.tsx`:** Own webview → **duplicated playback UI state** (current file, progress, hover, etc.) synchronized via Tauri events + some `localStorage` keys; do not expect the main window store to appear here.
- **Heavy local `useState` in `PlayerView`:** Normal for playback UI (scrubber, menus, transient controls); not a “migration gap” by itself.

## Zustand migration — are we “done”?

**Functionally, yes for the original intent:** central store + persist, main-window concerns moved off ad-hoc `App` state, mini window still event-driven.

**Not a claim of “every audit bullet closed”:** optional follow-ups (extra gallery caching, housekeeping unused files, deleting or wiring `GalleryView.tsx`) were never strict blockers. If you change gallery loading, prefer **`MediaView` + store** as the real product surface.

**Invariant to respect:** avoid transient pairs like `activeTab === "player"` with `playingFile === null` when subscribers still assume a file (e.g. stop-handlers should clear tab + file atomically for mini-driven stops). Player uses a thin outer shell + inner `PlayerViewWithFile` so hooks stay valid with nullable `playingFile`.

## Versions (keep aligned)

These should match for releases and for sane updater behavior:

- `package.json` → `version`
- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `[package] version` (and `Cargo.lock` updates when the crate version changes)

A past mismatch was **`Cargo.toml` behind the JS/Tauri app version** — fix on every bump.

## Version graph manifests (`docs/versioner.html` + `docs/versions/`)

**Purpose:** Internal per-release **dependency graph** (not the shipping “What’s new”). **Graph rows** are stored **only** in **`docs/versions/version-<semver>.json`**. **`docs/versioner.html`** keeps a small **`versions`** registry (`id`, `label`, `status`, `manifest`) plus the shared **`base`** agent/tool matrix, and **loads** each manifest at runtime.

**How to create or extend JSON (additive), registry rows, `fileEdits`, created files, preview:**  
→ **`docs/versions/MANIFEST-EXAMPLE.md`**

**Every field, alias, loader rule, and registry key:**  
→ **`docs/versions/MANIFEST-SCHEMA.md`**

**New semver:** Align **`package.json`**, **`src-tauri/tauri.conf.json`**, and **`src-tauri/Cargo.toml`** (`## Versions (keep aligned)` above), add the JSON file under **`docs/versions/`**, add the **`versions`** row in **`versioner.html`** — checklist in **MANIFEST-SCHEMA.md** §B.

**Preview:** `npx --yes serve docs` from repo root, then open **`/versioner.html`**.

**Roles:** **Chad** — manifests, registry, loader, **`VersionGraphFormat`**. **Jim** — CSS-only on **`versioner.html`**.

## Changelog source (`docs/changes.html`)

- **Audience:** This file is **internal only** — for **you and IDE agents** (structure, copy, release hygiene). **End users do not browse this HTML.** The shipping **“What’s new” / updater** experience is built **in the app** (React + **Iconify** icons, RuForge palette). Keep `docs/changes.html` aligned with what you ship so agents can diff and port content into UI later.
- **Canonical in-repo history** of notable changes, **one block per shipped app version** (same triplet as `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`).
- **Format is HTML only — not Markdown.** Use the structured layout in **`### Structured version block`** below. Inline SVGs in the template are **layout stand-ins**; production UI should use the **Iconify** slugs the maintainer chooses (see **Category icons (in-app)** below).
- **Why HTML:** Easier for agents to emit consistent, parseable trees than Markdown dialects — still **not** the user-facing surface.
- **Order:** **Newest version first** inside `<main>`.
- **Workflow:** **Jim (Gemini)** may own the **first visual pass** on `docs/changes.html` (spacing, typography, faded rules, cream-on-brown harmony) **without changing the DOM contract** (`rf-*` classes, `data-version`, section nesting). **Chad / agents** then **fill and maintain** list rows, counts, and copy when code changes land. On release, distill for `updater.json` `notes` / GitHub Release as needed.
- **Divider lines (agents + Jim):** **Avoid** flat, full-width, low-contrast gray rules that “cut” the panel (they read cheap and fight the warm brown shell). **Prefer** the same language as the **Video Library** date headers: **rules that fade out** toward the edges, **muted cream / gold** (`#EDD79C`-family) with soft alpha — see `docs/changes.html` gradients. If a separator does not fade and harmonize with the brown shell, **do not add it**; use whitespace instead.
- **Policy:** Do not replace this workflow with a Markdown twin unless the maintainer updates this section of `AGENTS.md`.

**[NEW: Canvas Architecture Workflow — `docs/changes.html` only]**
- **Architecture (Canvas Graph):** The **changes.html** changelog UI uses an interactive dependency graph on a canvas; the underlying data remains LLM-readable JSON inside that file.
- **Source of Truth (LLM-Readable):** The changelog data lives in a structured JSON block inside a `<script type="application/json" id="changelog-data">` tag **within `docs/changes.html`**.
- **Workflow for Agents:**
  - **NEVER** attempt to edit the JavaScript rendering logic or the CSS styles for the **changes.html** graph.
  - When adding new version notes, you **ONLY** append to the `versions` array inside the `<script id="changelog-data">` JSON block.
  - Create nodes for tasks (`"type": "task"`) or fixes (`"type": "fix"`), add `details` and modified `files` to those nodes, and create `"edges"` connecting the agent(s) who did the work to the task, and the task to the `ruforge` core node.
- **Exporting for Release:** The HTML UI includes an "Export Release Notes" button. When clicked, the JavaScript parses the JSON graph and generates a cleanly formatted Markdown summary of the selected version, ready to be copied into `updater.json` or GitHub Releases.

**Related internal graph (`docs/versioner.html`):** Authoring rules and examples live in **`docs/versions/MANIFEST-EXAMPLE.md`** and **`docs/versions/MANIFEST-SCHEMA.md`** (see **`## Version graph manifests`**). Do not assume the same editing rules as **changes.html**.

### Category icons (in-app, Iconify)

Maintainer-provided slug set for **category** glyphs (compare contrast on `#1D1613` / `#271C18` with muted cream strokes):

| Role | Iconify slug | Notes |
|------|----------------|-------|
| **Additions** | `material-symbols:add-ad` | “Window + plus” — reads as **new surface / feature**; pairs visually with the wrench family because both use a **frame**, but the **corner glyph differs** (plus vs wrench). |
| **Fixes (wrench family)** | `fluent:window-wrench-24-regular` or `fluent:window-wrench-32-filled` | **Tool on window** — clear **repair / maintenance** story; **filled** pops slightly more on dark brown at small sizes. |
| **Fixes (alternate)** | `material-symbols:reset-wrench-rounded` | Emphasizes **repair / reset** — still wrench-adjacent; distinct silhouette from `add-ad` if both are rounded. |
| **Fixes (semantic bug)** | `mdi:bug-check-outline` | **Most semantically “fixes”** and **least confusable** with “add” (different metaphor entirely). Strong candidate if you want zero chance users mix “new” vs “fixed.” |

**Opinion (for RuForge’s brown + muted cream):** At small sizes, render these icons in **muted cream** (`stone-200` / `#EDD79C` tint) or **slightly warmed white**, not pure `#fff`, so they match the library UI. **`mdi:bug-check-outline`** is the safest **distinct** choice for fixes next to **`material-symbols:add-ad`**. If you prefer a **unified “window chrome”** language, pair **`add-ad`** + **`fluent:window-wrench-24-regular`** and rely on **plus vs wrench** in the same corner — works if both icons stay **large enough** in the UI; if they shrink below ~18px, prefer **bug-check** for fixes.

### Structured version block (for agents)

When you add or extend a release in **`docs/changes.html`**, follow this **layout contract** so the same tree is easy to map into the in-app “What’s new” view later.

**Numbered slots (what goes where):**

1. **Contributor (per line)** — A short handle or name in a **left** pill on each change row (`<span class="rf-contrib">…</span>`). This is **credit for who wrote the change** (contributor / maintainer), **not** a “founder” or role badge. Use real handles or `Team` when mixed.
2. **Color coding** — **Do not** use the tired **green = additions / red = fixes** pairing (red for fixes reads as alarm-y and ages poorly). The repo template uses **teal / mint for additions** and **indigo / lavender for fixes** (see `:root` in `docs/changes.html`). If you extend the palette, keep fixes **non-red** unless the maintainer changes this rule.
3. **Category icons (this file)** — Inline SVGs in `docs/changes.html` are **placeholders** for layout only. **Shipping icons** = Iconify in the app (**Category icons (in-app)** table above).
4. **Version label** — Plain **top-right** of the version block header row (`<span class="rf-version">x.y.z</span>` next to the title flex row). **Do not** copy a boxed pill jammed against the title; the template uses a clean right-aligned label (`margin-left: auto`).
5. **Count badges** — In the **category header row**, opposite the icon + title: `<span class="rf-count">N</span>` where **N** equals the number of `<li class="rf-change-row">` entries in that category (keep counts accurate when you edit lists).
6. **Optional scope line** — Centered rule with short text (e.g. `RuForge core`) via `<p class="rf-scope">…</p>` when the release spans multiple areas; omit if unnecessary. Rules **must** use **faded cream gradients** (see `docs/changes.html`), not flat gray hairlines.

**DOM shape to mirror** (classes and nesting are stable API for this repo — extend presentation in the same file’s `<style>` block, respecting divider rules above):

```html
<section class="rf-release" id="v0-1-3" data-version="0.1.3">
  <div class="rf-release-head">
    <h2 class="rf-title">What&apos;s new in RuForge</h2>
    <span class="rf-version" aria-label="Release version">0.1.3</span>
  </div>
  <p class="rf-scope">RuForge core</p>

  <div class="rf-category rf-additions">
    <div class="rf-category-head">
      <div class="rf-category-title">
        <!-- placeholder SVG in docs/changes.html; app: material-symbols:add-ad -->
        <span>Additions</span>
      </div>
      <span class="rf-count">1</span>
    </div>
    <ul class="rf-list">
      <li class="rf-change-row">
        <span class="rf-contrib" title="Contributor">handle</span>
        <span class="rf-change-text">User-visible summary of the change.</span>
      </li>
    </ul>
  </div>

  <div class="rf-category rf-fixes">
    <div class="rf-category-head">
      <div class="rf-category-title">
        <!-- placeholder SVG; app: see Iconify table (e.g. mdi:bug-check-outline) -->
        <span>Fixes</span>
      </div>
      <span class="rf-count">1</span>
    </div>
    <ul class="rf-list">
      <li class="rf-change-row">
        <span class="rf-contrib" title="Contributor">handle</span>
        <span class="rf-change-text">What was wrong and how it behaves now.</span>
      </li>
    </ul>
  </div>

  <footer class="rf-foot">
    <a href="https://github.com/UnboundAngel/RuForge/releases" target="_blank" rel="noopener noreferrer">Full changelog</a>
  </footer>
</section>
```

**Live reference:** Open `docs/changes.html` in a browser — the newest `<section class="rf-release">` is the **full** copy-paste reference. When adding a new version, **duplicate that section**, bump `id` / `data-version`, reset lists, and **recompute** each `.rf-count`.

**Handoff (Jim):** Run a visuals-only pass on `docs/changes.html` (and optionally the future in-app changelog shell) using RuForge **brown + muted cream**; **do not** change class names, `data-version`, or list semantics. Honor **faded dividers**; no harsh full-width gray rules.

## Auto-updater (Tauri plugin-updater)

- Config: `src-tauri/tauri.conf.json` → `plugins.updater` (`endpoints`, `pubkey`). Bundles: `"createUpdaterArtifacts": true`.
- Permissions: `src-tauri/capabilities/default.json` includes `updater:allow-check` and `updater:allow-download-and-install`.
- **Runtime:** `src/App.tsx` calls `check()` on startup; in-app update UI uses `downloadAndInstall()` from the returned `Update` object. **Structured release copy** for agents lives in **`docs/changes.html`** (internal HTML); user-facing strings also come from **`updater.json` `notes`**, GitHub Releases, and the in-app changelog UI — keep them consistent when you ship.
- **Where “what’s in this update” comes from (not hardcoded in the old build):** On each `check()`, the updater plugin fetches **`updater.json`** from `plugins.updater.endpoints` (e.g. raw `main` on GitHub). The **`version`** and **`notes`** fields describe the **available** update. Users on an older build see whatever **`notes`** says **at check time** — you do **not** need to ship new frontend code just to change that copy. The GitHub **Release description** is **not** read automatically; mirror anything you want users to see into **`updater.json` `notes`** (or keep Release + `notes` in sync by hand).
- **Two UI surfaces — keep copy split sensible:** (1) **`UpdaterMainOverlays`** — small top-right card, **`line-clamp-3`**, narrow width: treat this as a **teaser** (one short line, or a tiny markdown blurb). (2) **`UpdaterPostInstallStack`** — after install, scrollable “What’s new”: use **`src/updatePostInstall.ts`** — plain markdown in `notes`, or structured JSON `{"notes","additions","fixes"}` for categorized lists. When `notes` is JSON, the teaser card uses **only** the inner `"notes"` string via **`teaserNotesFromUpdaterBody`** so raw JSON does not fill the small card. **Agents:** do **not** paste long `docs/changes.html` blobs into `updater.json`; distill. Prefer short teaser + fuller post-install payload.
- **Why “no update” is often correct:** `check()` returns **`null` unless the version in `updater.json` is greater than the running app’s version.** If `updater.json` on `main` still says the same version as the installed build, users will see nothing — that is expected, not a broken wire.
- **Shipping a new version users can receive:** bump app version, build **signed** artifacts, publish GitHub Release assets, then update **`updater.json`** on `main` with new `version`, `pub_date`, per-platform `url`, and **`signature`** (from the `.sig` files next to each installer — see below). Mismatch between signing key and embedded `pubkey` breaks installs.
- **GitHub `url` vs tag:** the path segment after `releases/download/` must match the **exact** release tag (including a leading `v` if you use `v0.1.2`). A typo or wrong tag yields **404** and “update failed” in the app.

### Signed Windows build (this machine’s layout)

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

**Frontend bundle:** `npm run build` may warn when a JS chunk exceeds ~500 kB; that is a Vite/Rollup heads-up, not a signing issue. Address with code-splitting when it becomes a priority.

## Builds

- **Web bundle only:** `npm run build` (runs `tsc` + `vite build`).
- **Desktop installer:** `npm run tauri build` (after frontend build per `beforeBuildCommand`).

## Git / large binaries

- **`src-tauri/binaries/ffmpeg-*` and `ffprobe-*`** are very large (~hundreds of MB). Do **not** commit them unless the project explicitly uses Git LFS or a documented policy. **`yt-dlp-*`** is smaller and may already be tracked.
- Typical junk to exclude unless intended: `.cursor/`, ad-hoc archives like `ffmpeg.7z`.

## Product / UX pointers (from recent work)

- **Playback persistence:** `src/playbackStorage.ts` — furthest position + stored duration for progress/watched when catalog `duration` is still 0; thumbnail bars use `getPlaybackThumbnailBar`.
- **Mini player:** transparent undecorated window; clip-path + control bar behavior affects perceived corners; “back to app” should focus `main` before closing mini.
- **Player:** main `PlayerView` uses opacity dip + no remounting `key` on `<video>` to reduce flash when auto-advancing; folder queue first, then library sorted list for advance when settings allow.

## When unsure

- Prefer reading **`ruforgeStore.ts`**, **`App.tsx`**, **`MiniPlayer.tsx`**, and **`tauri.conf.json`** before large refactors.
- For updater or signing behavior, trust **current Tauri v2 + plugin-updater docs** over memory; the surface changes over time.
