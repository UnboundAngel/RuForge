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

## Website SEO and AI discoverability (mandatory)

The public website at `website/` is a marketing surface for a free open-source desktop YouTube downloader. The SEO and AI-discoverability rules below exist because the default playbook for "software product website" (SaaS funnels, comparison SEO grinding, EV code-signing cert pages, freemium teasers) doesn't fit RuForge and in some cases is actively harmful. Read this before suggesting or implementing any SEO, structured data, copy, or distribution changes.

### Framing rules (user-facing copy)

The product is positioned as: a free, open-source, local-first desktop media tool built on yt-dlp and FFmpeg. Not "the best YouTube downloader." Not "download YouTube videos easily."

- Lead nouns on titles, meta descriptions, and hero copy: "open-source media library", "yt-dlp GUI", "Tauri desktop app", "local media library", "free media downloader". Never lead with "YouTube downloader" as the primary noun even though that is what people search for. The exposure is asymmetric: low organic upside (Google demotes the category as parasite SEO under the March 2026 Spam Update), real DMCA Section 1201 exposure if RIAA/BPI templates match your copy.
- NEVER use this language anywhere on the public website, in JSON-LD descriptions, in meta tags, in README copy, or in release notes: "bypass", "rolling cipher", "circumvention", "DRM", "rip", "stream-rip", "unlock content", "any video any site". These map directly to RIAA/BPI DMCA takedown templates. Replace with: "download for offline viewing", "local media library", "personal archive", "yt-dlp frontend".
- The implicit audience is yt-dlp CLI users who want a GUI, 4K Video Downloader refugees, r/DataHoarder / r/selfhosted users, and the Tauri/Rust crowd. Not casual "convert youtube to mp3" searchers. Copy reflects this.

### Structured data rules

- SoftwareApplication JSON-LD on `/` and `/download` is required. Required fields: `name`, `description`, `operatingSystem`, `applicationCategory: "MultimediaApplication"`, `softwareVersion`, `offers` with `price: "0"` and `priceCurrency: "USD"`, `publisher` Organization reference.
- NEVER include `aggregateRating` in SoftwareApplication JSON-LD until there are real user reviews from a real source (AlternativeTo, GitHub Discussions). Fake or fabricated ratings trigger Google manual actions. The penalty is worse than not having the rich result.
- Organization JSON-LD lives site-wide in `BaseLayout.astro`. BreadcrumbList JSON-LD lives on every docs page and feature page. FAQPage JSON-LD only on pages that have a real FAQ section with the same Q&A visible in HTML.

### Code signing reality

- Do NOT recommend purchasing an EV Authenticode certificate to bypass SmartScreen. Microsoft deprecated the EV-auto-bypass behavior. EV certs no longer guarantee a clean first install. Cost is $249-700/year for a benefit that no longer exists.
- The current path is Azure Trusted Signing at approximately $9.99/month. SmartScreen reputation builds over install volume regardless of cert type. First-run warnings are unavoidable for any new publisher.
- The `Build-signed-windows.bat` script uses minisign for updater signature verification, not Authenticode. The two are independent. Keep them independent.

### Crawler and AI discoverability rules

- `robots.txt` follows the citation-allowed / training-blocked split: allow `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `Claude-User`, `Amazonbot`, `Applebot-Extended`. Disallow `GPTBot`, `Google-Extended`, `CCBot`, `Bytespider`, `Meta-ExternalAgent`, `Meta-ExternalFetcher`. Standard search crawlers (`Googlebot`, `Bingbot`) stay open.
- `llms.txt` ships at the site root as a curated index. Frame it internally as cheap infrastructure, not as a citation lever. Independent measurement (Limy 2026, ALLMO 2026) shows no measured citation uplift from llms.txt across major AI assistants. Ship it anyway because the cost is 30 minutes and Anthropic/Perplexity/Cursor docs tooling consume it.
- Submit to Bing Webmaster Tools FIRST, then Google Search Console. Bing's index feeds ChatGPT Search, Microsoft Copilot, You.com, Kagi, and Perplexity's fallback retrieval. Google Search Console is still required but is the lower-leverage first move for a brand-new domain.
- IndexNow auto-ping on every deploy (Cloudflare Pages can trigger this via a Worker or a GitHub Action). Drops Bing indexing latency from weeks to hours.

### Distribution and acquisition rules

- The highest-ROI single moves for RuForge's audience (per verified May 2026 research):
  1. AlternativeTo submission as a free alternative to 4K Video Downloader Plus. Provides the structured "X is a free alternative to Y" relationship data that LLMs ingest.
  2. PR to `awesome-tauri`, `awesome-rust-desktop-apps`, and any `awesome-yt-dlp` lists that exist.
  3. WinGet Releaser GitHub Action (powered by Komac) for automated winget manifest PRs on every release.
  4. Reddit posts tailored per sub: r/DataHoarder (library/persistence angle), r/selfhosted (Tauri local-first angle), r/opensource (MIT license / no telemetry angle), r/rust (Tauri v2 build angle), r/youtubedl (yt-dlp GUI angle).
  5. yt-dlp wiki "Frontends" PR.

- Do NOT recommend or implement: Product Hunt as primary launch channel (lower ROI than Reddit niche subs for this category), Softpedia / FossHub / SourceForge directory submissions (declining AI citation value, malware-association risk after January 2026 fake-tools campaign), paid Google Ads on "youtube downloader" terms (DMCA-adjacent and zero-click compressed), comparison SEO pages targeting "youtube downloader windows" as the primary keyword (parasite SEO penalty exposure).

### What ships in Phase 1 (when website SEO work is authorized)

In order:
1. `astro.config.mjs` `site` field + `@astrojs/sitemap` integration.
2. `public/robots.txt` with the citation/training split.
3. `public/_headers` with HSTS, CSP, Referrer-Policy, X-Content-Type-Options, X-Frame-Options.
4. Canonical URL pattern in `BaseLayout.astro`.
5. SoftwareApplication JSON-LD on `/` and `/download` (no `aggregateRating`).
6. Organization JSON-LD site-wide.
7. Unique `<title>` (under 60 chars) and `<meta description>` (under 155 chars) per page, framing per the rules above.
8. `public/.well-known/security.txt`.
9. Bing Webmaster Tools verification.
10. Google Search Console verification.
11. `public/llms.txt` (last, deliberately).

Phase 2 work (distribution, content, README polish) is authorized separately.

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

## Code quality guardrails (mandatory)

Three rules. Every agent, every edit. These exist because the default
failure mode is code that works but reads like it was generated: narrated
comments, 400-line files with everything inline, and styles buried inside
logic. The rules below define boundaries so the agent never drifts there.

### 1. Comments: zero narration

Comments explain **why**, never **what**. If the code already says what is
happening, a comment restating it is noise.

**Banned patterns (delete on sight, never produce):**

- `// Import X` / `// Define the function` / `// Return the result`
- `// Set state to ...` / `// Handle the error` / `// Increment counter`
- `// This function does X` when the function name already says X
- Block headers like `/* ---- Rendering ---- */` unless separating 200+
  line sections in a file that genuinely cannot be split
- Commented-out code left behind "in case we need it." That is what git
  history is for. Delete it.
- AI-voice narration patterns: `// Now we need to ...`, `// Here we are doing ...`, `// First, let's ...`, `// Note that ...`, `// This elegantly ...`, `// Let me ...`. These read as AI-generated even when the action they describe is real. Delete them. If the comment's only function is to narrate the next line in conversational voice, it's noise.
- Section-progress narration: `// Step 1: ...`, `// Now for the tricky part`, `// Putting it all together`. The code is the steps. The variable names are the labels.
- Future-tense self-talk: `// We'll handle X below`, `// Going to refactor this later`. If there's a real TODO, write `// TODO:` with a specific actionable note. Otherwise delete.

**Allowed (encouraged):**

- Non-obvious constraints: `// WebView2 does not fire resize on drag; poll.`
- Tradeoffs: `// Uses O(n^2) here because n < 20 and the simpler loop is
  clearer than a map lookup.`
- External references: `// See Tauri issue #4821 for the workaround.`
- Intent that the signature cannot convey: `// Intentionally no await.
  Fire-and-forget; errors logged in the handler.`

**Test:** if you delete the comment and the code is equally clear, the
comment should not exist.

### 2. Component and function extraction

Do not let a single file grow into a monolith. These thresholds are not
suggestions.

**Extract to its own file when ANY of these are true:**

- A React component exceeds ~120 rendered lines (JSX return + hooks above
  it). At that point it is its own unit and belongs in its own file.
- A helper function is used by more than one file. Shared helpers live in
  a `lib/` or `utils/` file, never copy-pasted.
- A hook has its own state + effects and is not trivial (more than ~30
  lines). Extract to `use<Name>.ts` next to or near its consumer.
- An inline SVG or animation component exceeds ~40 lines. Give it a file.
- You are about to add a fourth level of nesting inside JSX. That inner
  tree is a component. Extract it.

**Where extracted files go:**

- Components: `components/<feature>/` or `components/ui/` (shared).
- Hooks: next to the component that uses them, or `hooks/` if shared.
- Helpers/utils: `lib/` for the website, `src/lib/` or relevant slice
  directory for the desktop app.
- Types: co-locate with the module that owns them. A shared `types.ts`
  exists at the app root for cross-cutting types.

**File naming:** `PascalCase.tsx` for components, `camelCase.ts` for
non-component modules, `use<Name>.ts` for hooks. Match what already exists
in the directory.

### 3. Styles belong in stylesheets or Tailwind classes, not JS objects

This project uses Tailwind v4 utility classes and CSS custom properties
defined in `global.css` (desktop) or `website/src/styles/global.css`
(website). Follow the existing pattern.

**Rules:**

- **Tailwind classes on the element.** That is the default. Use them.
- **CSS custom properties (`--color-rf-*`, `--font-*`) for tokens.** Never
  hardcode a hex color in JSX when a token exists. If a new token is
  needed, add it to the relevant `global.css`, not as a JS constant.
- **Inline `style={}` only for dynamic values** that Tailwind cannot
  express: computed transforms, `clipPath`, data-driven widths, animation
  keyframe progress. If the value is static, it belongs in a class.
- **No `styled-components`, `css-in-js`, or `sx` props.** Not in this
  project's stack. Do not introduce them.
- **Scoped `.rf-*` classes for complex or reusable visual patterns.** The
  download page uses `.rf-dl-*` classes. SponsorBlock uses `.rf-sb-*`. If
  a pattern has more than 3-4 properties and is reused, give it a class in
  the appropriate CSS file.

### Nesting and complexity

- **Maximum JSX nesting: 3 levels of authored wrappers.** If your return
  has `<A><B><C><D>...</D></C></B></A>` where all four are local to the
  same component, `D` (or `C+D`) should be its own component.
- **Early returns over deep conditionals.** Guard-clause style: check the
  bad case, return early, keep the happy path at the top indent level.
- **No ternary chains.** One ternary is fine. A ternary inside a ternary
  is unreadable. Use `if`/`else` or a lookup object.

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
- **Music mode (`navMode === "music"`):** Full shell swap in **`App.tsx`** → **`MusicShell`** (Home/Explore/Library, chapters sidebar, **`NowPlayingBar`**). Playback in **`useMusicPlayback`** (single `<audio>`, store-backed queue). Tag metadata via **`lofty`** in **`gallery.rs`**; UI under **`src/components/music/`**. Normal downloader/media/player paths unchanged in default/movie modes.

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
- **`### vX.Y.Z (unreleased)`** is the live block during a cycle. At release, the ritual (below) drains it to graph surfaces, then **deletes** it from this file and opens a fresh empty `(unreleased)` block.
- **Do NOT keep `(shipped)` blocks here.** After release ritual step 8, shipped history lives only in `docs/changes.html` and `docs/versions/version-<semver>.json`. Keeping old blocks bloats every agent read for no benefit.

**This block is the single source for release notes and the graph surfaces.** At push time the whole `(unreleased)` block is read once and drained (see `## Release ritual`). That is the only time the graph JSON / `changes.html` get touched. Prefer one line per user-visible feature or fix; batch incremental polish passes into one line instead of ten `(fix)` breakpoints.

### v0.1.9 (unreleased)

- **Music queue drag UX (fix)**: Grip uses default cursor (no grab hand until drag); body locks to grabbing during drag; hover/menu/grip suppressed while dragging; `layoutScroll` + `layout={false}` to reduce fast-drag flicker. `MusicQueueTab.tsx`, `index.css`.
- **Music right sidebar (fix)**: Removed standalone "Playing from" header; queue list uses "Next from: {source}" or "Next up" (`musicQueueSource.ts`). Sticky Now playing block with scroll shadow. Drag-reorder via framer-motion `Reorder` (`musicQueueReorder.ts`, `setManualQueueOrder`; next-up rows promote into manual queue). Panel corner radius; tab switch without mount churn; history toggle hover/blur fixes. `MusicRightPanel.tsx`, `MusicQueueTab.tsx`, `MusicHistoryTab.tsx`, `index.css`, `ruforgeStore.ts`.
- **Music right sidebar visual pass**: Tab button typography, active bottom underline, close button hover background, playing-from source header layout, empty states styled with owl placeholder and CTAs, SegmentRow colored dot affordance and active highlight, iOS-style skip toggle track and thumb, and RowContextMenu sizing tightened.
- **Music right sidebar Phase A**: Tabbed right panel in music mode (Queue / Recently played / Segments tabs; 2-vs-3 tab flex row, Segments conditional on hasChapters or hasSbSegments). Manual queue drained before effectivePlaylist (store actions: `enqueueManualQueue`, `removeManualQueue`, `clearManualQueue`). `useMusicPlayback` advance order and skipPrev updated (Commit 1). `musicPlayHistory.ts` ring buffer (50 entries, play count per identity key, recent + most-played sort). `MusicRowContextMenu` (Add to queue, Show in folder, Go to artist/album; portal + right-click + 3-dot hover-reveal). `MusicQueueTab` (Now playing / Next in queue / Next up, empty state CTA). `MusicHistoryTab` (recent/most-played toggle, play triangle on active row). `MusicSegmentsTab` (density strip with SB colors + chapter ticks, music-only skip toggle for `music_offtopic`-only auto-seek). `NowPlayingBar` queue-panel toggle button (accent when open). `ChaptersSidebar` removed. `--music-right-panel-width: 272px` CSS token. `musicAdvanceQueue.ts`, `musicPlayHistory.ts`, `musicOnlySkipStorage.ts`, `musicShelfDedup.ts` (19 unit tests). `ruforgeStore.ts`, `useMusicPlayback.ts`, `MusicShell.tsx`, `NowPlayingBar.tsx`, `index.css`.
- **Manual queue playback (Commit 1)**: `manualQueue: string[]` added to Zustand store with `enqueueManualQueue`, `removeManualQueue`, `clearManualQueue`, `applyManualQueueAdvance`, `clearManualQueuePlayingState` actions. `useMusicPlayback` advance order drains manualQueue (FIFO) before effectivePlaylist; skipPrev from a manual-queue track uses stored `manualQueueContextIndex`; `handleEnded` follows same order. `musicAdvanceQueue.ts` (10 unit tests). `musicOnlySkipStorage.ts`. `ruforgeStore.ts`, `useMusicPlayback.ts`.
- **Music album/artist detail (fix)**: Back button on album header was unclickable because the hero row shared z-10 and sat above it in DOM order; Back is z-20, hero art/gradient are pointer-events-none, artist link stays clickable. `MusicAlbumView.tsx`, `MusicArtistView.tsx`.
- **Music Explore paste + panel header (fix)**: Paste link no longer auto-submits clipboard (prefill only; Enter to fetch); input clears after submit; Cancel resets paste URL and panel idle state; sidebar header chevron removed for longer title; progress ring spin only while progress is below 100%. `MusicExploreBottomBar.tsx`, `MusicExploreDownloadPanel.tsx`, `MusicExploreDownloadCollapsed.tsx`, `MusicShell.tsx`.
- **Music Explore collapsed download (fix)**: Progress ring spin and completion checkmark work in bottom-anchored orbs and dock chip (layout transform conflict removed, celebration before paint via useLayoutEffect, dock-minimized path keeps success UI). `MusicExploreDownloadCollapsed.tsx`, `MusicExploreDownloadPanel.tsx`, `MusicShell.tsx`.
- **Music Explore collapsed download stack (fix)**: Collapsed sidebar orbs anchor at the bottom (active track on the bottom edge, queued tracks fade above); multi-track playlist shows one focal bubble until tap expands the stack upward with staggered motion; minimize chevron sits above the stack. `MusicExploreDownloadCollapsed.tsx`, `MusicExploreDownloadPanel.tsx`.
- **Music Home shelves (fix)**: Rediscover, Recently added, and Quick picks dedupe re-downloads (YouTube id / title), collapse album edition variants, and cap cards per artist so the same Juice WRLD or "Alone Again" art does not repeat across a shelf. `musicShelfDedup.ts`, `MusicHomeView.tsx`, `musicShelfDedup.test.ts`.
- **Music Explore chrome (fix)**: Left nav + Back are one L-shaped surface (shared fill/radius wrapper); Explore Paste/Reload sit on the same bottom row as Back with webview filling the column above. `MusicShell.tsx`, `MusicNav.tsx`, `MusicNavBackCell.tsx`, `MusicExploreBottomBar.tsx`.
- **Music Explore layout (fix)**: Explore boot bar moved back to a row under the main panel (not stacked inside the content column, which had shrunk the webview and floated Paste/Reload mid-screen). Home/Library still use nav+Back column stack with full-height content. `MusicShell.tsx`, `MusicExploreBottomBar.tsx`.
- **Music Home header (fix)**: Removed unshipped fourth mood chip (energize); search bar no longer uses absolute full-width centering that overlapped filter pills (flex row: chips, centered search, profile). `MusicHomeView.tsx`.
- **Music shell layout (fix)**: Home/Library content panels fill the main column height again: Back cell and Explore boot bar stack inside the main row (nav flex-1 + Back left; content flex-1 + boot bar right) instead of a separate bottom row that left the gray island ~44px short. `MusicShell.tsx`, `MusicNavBackCell.tsx`, `MusicNav.tsx`.
- **Music shell chrome**: Back to RuForge in bottom-left chrome cell (same row as Explore Paste/Reload), not inside nav column; chevron-only when nav collapsed. Ctrl+B toggles left nav; Alt+1/2/3 for Home/Explore/Library. `MusicNavBackCell.tsx`, `MusicShell.tsx`, `MusicNav.tsx`.
- **AudioHeroStage (fix)**: Vinyl layout restored (`left: -48%`, pause `translateX(30%)`); removed stage `overflow-hidden` that clipped the disc; spin RAF runs without `audioEl` (music expanded player); circular clip on rotator stops right-edge flicker. `AudioHeroStage.tsx`.
- **Music Home + AudioHeroStage**: Cover click toggles play/pause in expanded player; `MusicHomeSkeleton` while `galleryLoading` with empty library. `MusicShell.tsx`, `MusicHomeView.tsx`, `MusicHomeSkeleton.tsx`.
- **AudioHeroStage (fix)**: Expanded player cover is opaque `object-cover`; vinyl clipped to a left-only lane so the spinning square bbox no longer flickers on the right; pause slide reduced; SVG drop-shadow removed; analyser glow RAF only when `audioEl` is wired. `AudioHeroStage.tsx`.
- **Music Explore paste (fix)**: Single-track `music.youtube.com/watch?v=` URLs (and youtube.com/youtu.be watch links) now route through `classifyMusicExploreUrl` / `resolveMusicExplorePasteUrl`; paste fetch shows a one-track pick panel with metadata instead of error. Tracking params (`si`, `feature`, etc.) stripped. `youtubeUrl.ts`, `MusicExploreDownloadPanel.tsx`, `MusicExploreBottomBar.tsx`, `youtubeUrl.test.ts`.
- **Music + mini player cover art**: Playback surfaces show full cover art without cropping: mini player small/compact uses a fixed-width left column with `object-contain`; large audio hero uses full width + contain; music `AudioHeroStage` and `NowPlayingBar` thumb use contain. `MiniPlayer.tsx`, `AudioHeroStage.tsx`, `NowPlayingBar.tsx`.
- **Music Explore collapsed download + dock (redesign)**: Collapsed panel now shows a vertical column of circular track orbs (one per active/queued track, rounded-full + SVG ring so the arc reads as a circle); minimize chevron docks the column above the Back button as a single `ExploreDownloadDockChip` with the remaining count overlaid inside. Boot bar row restructured to `flex-col` so a full-width filler strip (matching sidebar width, owning `border-bottom-left-radius`) sits flush under the sidebar; `MusicNav` `sideColumn` radius trimmed to top-left only. `MusicExploreDownloadCollapsed.tsx`, `MusicExploreDownloadPanel.tsx`, `MusicNav.tsx`, `MusicShell.tsx`, `MusicExploreBottomBar.tsx`.
- **Music Explore collapsed download (UI)**: When sidebar is collapsed, pick panel shows a single track thumbnail with SVG progress ring (spinner arc while queued, determinate while downloading); green checkmark flash ~1.4s on complete then advances to next active track; remaining count badge. `MusicExploreDownloadCollapsed.tsx`, `MusicExploreDownloadPanel.tsx`, `MusicShell.tsx`.
- **NowPlayingBar (fix)**: Expand-player control is a `div[role=button]` instead of wrapping the artist link button, fixing invalid nested `<button>` DOM and hydration warning. `NowPlayingBar.tsx`.
- **Notifications (fix)**: Removed pre-animation brown background flash by moving background class off the `motion.div` onto an inner div (so opacity:0 on the wrapper suppresses it before framer-motion hydrates). Tightened enter/exit animation (`y:8→0`, `duration:0.18`). `App.tsx`.
- **Expanded player title (fix)**: `MarqueeText` gains `centered` prop; when text fits without scrolling the inner `flex w-max` div uses `margin:0 auto` to be truly centered rather than left-aligned. Used in `MusicShell` expanded overlay. `DownloadJobQueuePanel.tsx`, `MusicShell.tsx`.
- **Music Home shelves (fix)**: Artists deduped by primary artist only (`primaryArtist()` splits on `,`, `&`, `feat.`, `ft.`, `x`) so "Juice WRLD, Trippie Redd" groups under "Juice WRLD"; Albums similarly. Recently added groups by album (one card per album, sorted by newest track date) instead of flooding shelf with individual tracks. Quick picks now uses `readFurthestPlaybackSec` to surface most-listened tracks first, falling back to seeded shuffle when < 6 tracks have play history. `MusicHomeView.tsx`.

- **Music Explore sidebar downloader (QoL)**: Per-track download state from `downloadJobs` (spinner, row tint, header "Downloading N"); completed tracks animate out of the pick list; shift-click range toggles select/deselect; no focus outline on rows; Explore layout gap 0 between nav and webview, boot bar border removed; profile probe skips music webview when not in music mode. `MusicExploreDownloadPanel.tsx`, `musicExploreDownloadStatus.ts`, `MusicShell.tsx`, `MusicExploreBottomBar.tsx`, `App.tsx`, `index.css`.
- **Music Explore download path (fix)**: Explore enqueue now uses `resolveDownloadOutputDir` (honors `saveToInternal` / internal vault like main downloader); was always passing custom `outputDir` (`C:\Downloads`) so `create_dir_all` failed when internal storage was active. `downloadQueue.ts`, `MusicExploreDownloadPanel.tsx`, `MusicExploreBottomBar.tsx`, `downloader.rs` (trim + path in error).
- **Music Explore webview (fix)**: Webview stays visible whenever Explore strip is shown; removed hide on paste/pick sidebar panel open. `MusicShell.tsx`.
- **Music Explore webview (fix)**: Webview lifecycle aligned with main Explorer: ref-only host (no `webviewHostEl` state), stable effect deps, no hide-on-cleanup race, HMR reattach via `getEmbeddedExplorerWebview`, show+bounds applied in one pass after create. Fixes blank Explore tab and orphaned Tauri callback warnings on HMR. `MusicShell.tsx`.
- **Music Explore (fix)**: Fixed crash `Cannot access 'isPasteMode' before initialization` by moving `isPasteMode` / `showExploreStrip` / `exploreWebviewActive` below store selectors; webview still hides only when paste URL is submitted and sidebar panel is open. `MusicShell.tsx`, `MusicExploreBottomBar.tsx`, `MusicExploreDownloadPanel.tsx`.
- **Music Explore boot bar layout + webview fix**: Boot bar is full-width (sibling below panels row, no gap between them) with a left filler that mirrors the sidebar width and provides `border-bottom-left-radius`; right actions section provides `border-bottom-right-radius`. Sidebar (`MusicNav`) gets `flatBottom` prop that squares off its bottom corners when the bar is present so the two sections connect flush. Content area border-radius switches to top-only when strip is visible. Webview now only hides when paste mode has a submitted URL AND the sidebar panel is open (not on click alone). `MusicShell.tsx`, `MusicNav.tsx`, `MusicExploreBottomBar.tsx`.
- **Paste Link UX (rewrite)**: Clicking "Paste link" transforms the boot bar in place: button disappears, inline input with auto-clipboard detection expands via AnimatePresence. Auto-fills and submits if clipboard contains a valid YTM URL; sidebar panel opens with staggered results. Cancel restores normal boot bar. Download panel no longer has its own URL input when `pasteMode=true`. `MusicExploreBottomBar.tsx`, `MusicExploreDownloadPanel.tsx`, `MusicShell.tsx`.

- **Music Explore boot bar (fix)**: sidebar back to gray `--music-surface`; boot bar matches; More dropdown removed (native webview covers all popups). Paste link, Reload, Copy URL are inline bar buttons. Webview host uses absolute inset-0 + ResizeObserver rebind on mount. Webview hides when paste mode is active (`panelPasteMode` added to `exploreWebviewActive`). Paste panel: clipboard auto-detect on mount, auto-fetch if URL detected, staggered 40ms per-track fade-in, back button to re-enter URL. Boot bar rounded corners removed (wrong direction). `MusicExploreBottomBar.tsx`, `MusicExploreDownloadPanel.tsx`, `MusicShell.tsx`, `index.css`.
- **Music Explore UX fixes**: webview stays visible while pick/paste panel is open (panel moved into sidebar); paste link opens sidebar panel instead of hiding webview; bounds resync on explore enter/panel close/sidebar toggle; collapsed More menu portaled to body. Track selection uses url/index keys (not empty flat-playlist id); whole-row click + Shift range; clearer selected state; header shows Download N when selected; Load all remaining replaces load-more loop; playlist folder names from yt-dlp title (not raw URL, fixes output-dir error). YTM nav icon aligned in fixed 20px slot. `get_playlist_items_page` returns `title`. `musicExploreTracks.ts`, `MusicExploreDownloadPanel.tsx`, `MusicShell.tsx`, `MusicNav.tsx`, `MusicExploreSidebarActions.tsx`, `downloader.rs`.
- **Music Explore sidebar actions**: download/more controls moved into the music sidebar (same `--music-surface` panel as nav, never under the webview); bottom black bar removed. YTM nav icon uses `material-symbols:youtube-music` with accent hover. Profile probe detects YTM login via avatar DOM first. Music webview hides when leaving music mode (no stacked webviews). `MusicExploreSidebarActions.tsx`, `MusicNav.tsx`, `MusicShell.tsx`, `explorerProfileScript.ts`, `App.tsx`.
- **YouTube Music Explore webview**: `MusicShell` embeds `music-explore-view` (shared `explorer-data` cookie dir with main Explorer) over the Explore tab content column; RAF bounds sync; URL bridge via `music-explore-url`. `MusicShell.tsx`, `MusicExploreView.tsx`, `explorerWebviewLifecycle.ts`.
- **Music Explore download strip**: Floating `MusicExploreFloatingStrip` rendered outside the webview bounds (between content column and NowPlayingBar) shows "Download all" and "Pick tracks" when URL is a playlist, "Browse playlists" for artist/channel pages, plus a "Paste URL" overflow button always visible. Strip uses `isMusicYouTubePlaylistUrl` / `isMusicYouTubeUrl` on `currentMusicExploreUrl`. `MusicExploreFloatingStrip.tsx`, `MusicShell.tsx`.
- **Music Explore download panel**: `MusicExploreDownloadPanel` (extracted and generalized from old `MusicExploreView` playlist UI) slides in over the content column when "Pick tracks" / "Browse playlists" is clicked; webview auto-hides while panel is open. Feeds via `get_playlist_items_page` + `get_music_browse_info`; multi-select + per-track download + Load More. `MusicExploreDownloadPanel.tsx`, `MusicShell.tsx`.
- **Paste URL overflow**: "Paste URL" button in the floating strip opens the headless URL intake form (old Explore bar) as a full-content overlay in `MusicExploreView`; webview hides while open. `MusicExploreView.tsx`.
- **App-wide YouTube profile chip**: Avatar chip appears in `WindowControls` titlebar (right of USB button) when `navMode !== "music"` and `youtubeExplorerProfile !== null`; click navigates to Explorer tab. Music mode continues showing the existing `MusicProfileChip` in Home. `App.tsx`.
- **Dual-webview profile probe**: Probe interval in `App.tsx` now also evals `MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT` against `music-explore-view` (ytcfg-based; same `explorer-youtube-profile` event). `explorerProfileScript.ts`, `App.tsx`.
- **YouTube profile chip (Music Home)**: Explorer webview probe reads signed-in account from `ytInitialData` / `ytcfg.LOGGED_IN` and emits `explorer-youtube-profile`; store slice `youtubeExplorerProfile`; `MusicProfileChip` renders avatar only when logged in (no fake placeholder). `explorerProfileScript.ts`, `App.tsx`, `ruforgeStore.ts`, `MusicProfileChip.tsx`, `MusicHomeView.tsx`.
- **Music Home polish**: quick picks use neutral gradient rows (removed fake per-track hue hash); sticky transparent top row, glass search pill only. `MusicHomeView.tsx`.
- **Music Home shelves**: fixed quick picks / recently added split (quick picks = seeded shuffle excluding newest 8, not "top 8 recent"; recently added = newest 12 audio by created date, dedicated shelf); added Rediscover shelf (seeded random from older half of library), Artists horizontal pill row (opens MusicArtistView), Albums horizontal scroll (opens MusicAlbumView). Empty state copy updated to point users to Explore tab. `MusicHomeView.tsx`.
- **Music artist/album detail pages**: `musicDetail` store slice (`MusicDetail` type, `openMusicArtist` / `openMusicAlbum` / `closeMusicDetail` actions); `MusicArtistView` (blurred hero, stats, albums shelf, songs list, Play/Shuffle); `MusicAlbumView` (cover header, tracklist by `trackNo`, artist link, Play/Shuffle). Wired from MusicShell `AnimatePresence`, Home, and Library. `store/types.ts`, `ruforgeStore.ts`, `MusicArtistView.tsx`, `MusicAlbumView.tsx`, `MusicShell.tsx`.
- **Library navigation**: Album rows open `MusicAlbumView`; artist rows open `MusicArtistView` (click no longer plays). Album dedup key is `artistKey::albumKey` (was album name only). Artist grouping key normalized to `trim().toLowerCase()`. `MusicLibraryView.tsx`.
- **Scan parity**: `scan_media_file_direct` (bucket-root loose files) now calls `extract_music_meta` for audio extensions; previously returned `artist: None` for root-level audio files. Reuses already-resolved sidecar path (no double resolve). `gallery.rs`.
- **Thumbnail aspect honesty**: `hasSquareCover(file)` added to `mediaKind.ts`; Home, Artist, Album views use `objectFit: cover` for embedded cover art, `objectFit: contain` + surface background for video-origin thumbnails. `mediaKind.ts`, `MusicHomeView.tsx`, `MusicArtistView.tsx`, `MusicAlbumView.tsx`.
- **NowPlayingBar artist clickable**: artist second line is a `<button>` that calls `openMusicArtist` on click; navigates to the local artist detail page without leaving music mode. `NowPlayingBar.tsx`.
- **Explore tab rewrite**: `MusicExploreView` replaced with a custom YTM download intake surface. URL bar accepts `music.youtube.com` artist/channel/album/playlist URLs. Artist URLs call `get_music_browse_info` and show playlist/album shelves; playlist URLs call `get_playlist_items_page` (10 items, paginated). Per-track download button + multi-select + "Download all loaded" batch enqueue. All downloads use audio-only via existing `buildDownloadJobOptions` + `patchDownloadJobOptionsForAudio` (no new music-specific output path). Explore-only offline state (WifiOff icon + Retry) when yt-dlp fails with a network error; Home/Library unaffected. `MusicExploreView.tsx`.
- **Rust browse API**: `get_music_browse_info(url)` and `get_playlist_items_page(url, offset, limit)` Tauri commands using `yt-dlp --flat-playlist -J` with `--playlist-start/end` for pagination. Registered in `lib.rs`. `downloader.rs`, `lib.rs`.
- **music.youtube.com URL helpers**: `isMusicYouTubeUrl`, `isMusicYouTubePlaylistUrl`, `canonicalMusicYouTubeUrl` added to `youtubeUrl.ts` for Explore intake routing.
- **Batch start delay**: `downloadJobStartDelayMs` setting (default 0 / Off); `pumpDownloadQueue` sleeps between job starts in a batch. Settings > Downloads "Batch start delay" dropdown (Off / 0.5s / 1s / 2s / 3s / 5s). `store/types.ts`, `downloadQueueSlice.ts`, `SettingsView.tsx`.

- **Delete + Recently Deleted**: Library delete sends media and the full export sidecar set (incl. comments.json, all VTT langs, thumb tree) to the OS Recycle Bin via `trash`; prunes empty item and `.ruforge_thumbs/{stem}` folders. App-data manifest tracks trashed paths; title-band trash icon opens Recently Deleted with Restore (Windows `$Recycle.Bin` / Linux freedesktop trash); emptied bin shows unrecoverable. `media_bundle.rs`, `recently_deleted.rs`, `media.rs`, `App.tsx`, `RecentlyDeletedModal.tsx`.
- **Media library restructure (reader/writer/migration/cleanup)**: `scan_gallery` is now bucket-aware: `Videos/`, `Music/`, `Movies/`, `Shows/` top-level dirs yield per-item `Media` entries; `Playlists/` dir yields per-playlist entries with nested per-item item folders. Legacy flat layout still works unchanged. `get_storage_stats`/`authorize_cleanup` are now recursive (work with bucketed tree). New downloader template writes `{Bucket}/%(title)s/%(title)s.%(ext)s` for single items and `Playlists/{folder}/{NN - stem}/{NN - stem}.%(ext)s` for playlists (bucket determined by `audio_only` flag). `migrate_library_layout` Rust command (dry-run + execute) moves existing flat library into the new structure; `MigrateLibraryModal` in Settings > Debugging previews and runs it; `remapMigrationLocalStorage` remaps playback-pos/dur/loop/views keys in lockstep. `move_media_bundle` (regroup) updated to include sponsorblock.json/comments.json/all VTT lang variants. `scan_media_file_direct` subtitle now uses `primary_vtt_sidecar` (all langs). `.wav` added to `MEDIA_EXTS`. Neighbor-queue (`App.tsx`) scans the bucket dir instead of the single-item folder so auto-advance crosses all siblings. `utils.rs`, `gallery.rs`, `settings.rs`, `downloader.rs`, `migrate.rs`, `App.tsx`, `MigrateLibraryModal.tsx`, `migrateLibrary.ts`, `SettingsView.tsx`.
- **Radial nav palettes**: per-mode wedge colors aligned to shell themes (default tan/brown strokes, movie copper, music red/black); portaled radial uses palette accent for active icons instead of inherited `--accent`. `radialNavTheme.ts`, `radial-menu.tsx`.
- **Explorer webview**: reuse existing `explorer-view` via `Webview.getByLabel` before create and on "already exists" after HMR/hard refresh; startup hydration attaches stale native webview to JS ref. `explorerWebviewLifecycle.ts`, `App.tsx`. playhead, hover wash, and seek now use grid-aware pixel mapping (3px segment gaps no longer drift playhead vs fill or hover ahead of cursor on long chaptered videos). `chapters.ts`, `ChapterScrubber.tsx`, `PlayerView.tsx`, `MiniPlayer.tsx`. Alt-release hover-to-select added (hold Alt, hover wedge, release fires action without click); wedge `onClick` removed; all icon animations removed from radial and sidebar (static render only); `freezeLineMdIcon.ts` deleted; dead `rf-nav-icon-*` CSS removed. `useAltRadialNav.ts`, `radial-menu.tsx`, `RadialNavIcon.tsx`, `AppSidebarRail.tsx`, `index.css`.
- **Music mini handoff**: `handlePopOut` now gates on `activeTab === "player" || navMode === "music"` so pop-out works from the music bar; `navMode` included in `PlayInMiniPayload`; `activeTab` not forced to "media" when in music mode. `ruforgeStore.ts`, `playerHandoff.ts`.
- **Mini stop-main on pick**: `handleSelectMedia` in mini emits `stop-playback "mini-player"` so main music stops when user picks a video inside the mini library. `MiniPlayer.tsx`.
- **Mini hover scale bug**: removed stacked card `scale: 1.02` + thumbnail `group-hover:scale-110` from library grid tiles; kept subtle `y: -3` lift only. `MiniPlayer.tsx`.
- **Mini music rounding**: mini reads `navMode` from `play-in-mini` payload (fallback `localStorage`); sets `data-music-mode="true"` on root for CSS token inheritance; library scroll container gets `overflow-x-hidden` + `rounded-3xl` to respect clip-path. `MiniPlayer.tsx`.
- **Chrome relocate**: mini player button moved from titlebar to PlayerView bottom bar (left of fullscreen) and NowPlayingBar (left of expand); "Mini player" removed from both more menus; export USB button hidden in music mode only; `onMiniPlayerToggle` prop removed from `WindowControls`. `App.tsx`, `PlayerView.tsx`, `NowPlayingBar.tsx`.
- **Mini hover-to-front**: `handleMouseEnter` now calls `setAlwaysOnTop(true)` instead of `setFocus()`; `handleMouseLeave` restores `setAlwaysOnTop(isPinned)`. Raises z-order without Windows `SetForegroundWindow` synthetic mouseleave that was clearing `isHovering` and hiding controls. Covers both player and library view via shared root handlers. `MiniPlayer.tsx`.
- **Mini transparent corners**: `html`/`body`/`#root` set to `background: transparent` on mini mount so clip-path rounded corners show the desktop rather than the brownish `#1c1512` body background. `MiniPlayer.tsx`.
- **Radial icon swap**: default-mode icons switched from animated `line-md:*` to static `material-symbols:*` (download-rounded, play-circle-rounded, youtube-searched-for-rounded, settings-rounded); `registerNavIcons` import removed from `RadialNavIcon`. `RadialNavIcon.tsx`.
- **Music mode**: `navMode === "music"` swaps the shell for a YouTube Music-style local library (`MusicShell`: Home/Explore/Library, chapters sidebar, persistent now-playing bar). `lofty` reads embedded ID3/FLAC/Vorbis tags (artist, album, track, cover to `.ruforge_thumbs/`); falls back to `.info.json` then filename heuristic. Single hidden `<audio>` in `MusicShell` via `useMusicPlayback` (fixes duplicate stream and pause no-op after HMR). Spotify-style black U-frame + gray content island; vinyl `AudioHeroStage` in expanded player; accent `#ff0033` under `[data-music-mode]`. Transport: ±15s skip, prev/next queue, speed/loop/more menus, drag scrub, scroll-wheel volume, `formatDuration` timestamps, chapter hover marquee. `src/components/music/*`, `gallery.rs`, `App.tsx`, `index.css`.
- **Radial nav + sidebar**: Alt-hold full-screen radial (Download/Videos/Explorer/System); 56px icon rail; center click cycles `navMode`; cursor-locked anchor on Alt press; hover-only Iconify animations (~0.42s cap); storage ring glyph. Flat sidebar list with left accent bar; inset vignette restored; explorer webview mount guard + bounds host outside AnimatePresence; storage widget hidden on CUSTOM path. `AppSidebarRail.tsx`, `RadialNavOverlay.tsx`, `useAltRadialNav.ts`, `App.tsx`.
- **Export (Phases A/B/B4)**: `export_media_bundle` / `cancel_export_bundle` copy video + full sidecar set into `RuForge Export <timestamp>/` (manifest v1, canonical dedup, skip-if-exists, cancel). Panel modal (media + playlist context menus, Settings library export, hide-during-run without cancel). USB title-bar button with Windows removable-drive poll; default dest to last plugged drive. Fast copy (`export_copy.rs`); video copies last; live progress detail line. `export.rs`, `ExportBundleModal.tsx`, `removable_drives.rs`.
- **Library scan + delete**: `libraryScanDirs` persisted separately from download path (internal vault + scan folders only; CUSTOM download path not auto-scanned). `delete_media` returns honest sidecar result; native open-in-folder via `reveal_item_in_dir`. Export USB scans library when `entries` still empty. `libraryScanDirs.ts`, `media.rs`, `deleteMedia.ts`, `App.tsx`.
- **Settings**: Claude-style flat rows; Downloads regrouped (Location, Audio, Video & Quality, Updates, Export); toggle fixes (subtitles, auto scrubber previews always persist, queue row sync, dropdown no longer blocks clicks); resize flash fix (opaque root, morph guard during window resize); SponsorBlock categories collapsed by default with tree line when expanded. `SettingsView.tsx`, `downloadQueueSlice.ts`, `SponsorBlockSettingsTree.tsx`.
- **Website + mobile**: Full `/m/` shell (94 pages, three templates, universal BaseLayout redirect, canonical + noindex). Link audit, pages.dev redirect, mobile polish (header cross-fade, Material ripple, haptics, nav accordion). Desktop: asset audit (22.9 to 8.3 MB), Obsidian `/docs` (search, glossary, screenshots), six `/features/*` pages, download page redesign, responsive strip removed. `website/`.
- **Downloader cookies (fix)**: Default browser context None; legacy `chrome` migrates on load; metadata retry without cookies when export fails. `downloader.rs`, `useDownloaderView.ts`.
- **Copy transcript menu**: Visual polish on inline-expansion menus (tree line, aligned buttons). `MediaView.tsx`, `PlayerView.tsx`.
- **Audio-only hero (redesign)**: Vinyl disc + album art combo replaces LED equalizer; analyser radial glow. `AudioHeroStage.tsx`.

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

   **WinGet manifest auto-update.** Once the WinGet Releaser GitHub Action is set up (one-time install per `https://github.com/vedantmgoyal9/winget-releaser`), it watches for new GitHub Releases on `UnboundAngel/RuForge` and automatically opens the winget manifest update PR against `microsoft/winget-pkgs` using Komac. No manual `wingetcreate` invocation needed per release. If the action is not yet installed, set it up before the next release. If a winget PR fails to auto-open for a release, that is a release blocker for the NEXT release, not a hard block on the current one.

8. **Drain Shipped log → graph surfaces AND roll STATE.md (scoped, this
   step only).**
   a. Append the now-released changes into
      `docs/versions/version-<semver>.json` and the
      `<script id="changelog-data">` JSON inside `docs/changes.html`
      (append to the `versions` array only; recompute `.rf-count`; never
      touch the JS/CSS/DOM contract; see `docs/CHANGELOG-AUTHORING.md`).
      Add the registry row in `docs/versioner.html`.
   b. In AGENTS.md: drain the `(unreleased)` block into graph surfaces, then
      **delete that block** and open a fresh empty
      `### v<next> (unreleased)` block. Do **not** leave `(shipped)` blocks
      in AGENTS.md; released history lives in graph surfaces only.
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
