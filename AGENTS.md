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
  - **Left cluster:** back / forward / reload via `ExplorerTitlebarNav`, **`fixed top-0`**, flush at the sidebarâ†’content seam (`left: 80px` collapsed / `240px` expanded; `transition-[left]` must match sidebar width animation). Wired from `App.tsx`, not from inside the explorer panel.
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
- **Dynamic Island (architecture & usability):** `src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`. Read before island, motion, playback-bridge, or island-onboarding edits. Extend that file when you learn something future agents must not break; do not duplicate long island animation rules here.

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
- **Music mode (`navMode === "music"`):** Full shell swap in **`App.tsx`** â†’ **`MusicShell`** (Home/Explore/Library, chapters sidebar, **`NowPlayingBar`**). Playback in **`useMusicPlayback`** (single `<audio>`, store-backed queue). Tag metadata via **`lofty`** in **`gallery.rs`**; UI under **`src/components/music/`**. Normal downloader/media/player paths unchanged in default/movie modes.

## Zustand migration: are we "done"?

**Functionally, yes for the original intent:** central store + persist, main-window concerns moved off ad-hoc `App` state, mini window still event-driven.

**Not a claim of "every audit bullet closed":** optional follow-ups (extra gallery caching, housekeeping unused files, deleting or wiring `GalleryView.tsx`) were never strict blockers. If you change gallery loading, prefer **`MediaView` + store** as the real product surface.

**Invariant to respect:** avoid transient pairs like `activeTab === "player"` with `playingFile === null` when subscribers still assume a file (e.g. stop-handlers should clear tab + file atomically for mini-driven stops). Player uses a thin outer shell + inner `PlayerViewWithFile` so hooks stay valid with nullable `playingFile`.

## Versions (keep aligned)

These should match for releases and for sane updater behavior:

- `package.json` â†’ `version`
- `src-tauri/tauri.conf.json` â†’ `version`
- `src-tauri/Cargo.toml` â†’ `[package] version` (and `Cargo.lock` updates when the crate version changes)

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

## Dynamic Island (architecture & usability)

Canonical doc: **`src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`**.

Before changing `ActivityIsland`, `DynamicIsland`, island motion/expand behavior, playback bridge wiring for the island, or onboarding that targets the island: **read that file first**. If the task would add island animation rules, state-machine notes, z-index/layout constraints, or onboarding integration guidance to this file or to comments, **put it in that doc instead** and keep `AGENTS.md` to this pointer.

## Auto-updater (Tauri plugin-updater)

- Config: `src-tauri/tauri.conf.json` â†’ `plugins.updater` (`endpoints`, `pubkey`). Bundles: `"createUpdaterArtifacts": true`.
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

## Onboarding contract

In-app walkthrough for features the user has not been shown yet. Separate from post-update What's New (`UpdaterPostInstallStack` / `updatePostInstall.ts`, one-shot after install via `ruforge.postInstallPayload.v1`).

Steps that highlight or drive the activity island: read **`src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`** first (portal, expand morph, `shellBlocked`, z-index). Append new island onboarding rules there if needed.

**Version gate:** Each step carries `introducedIn: "<semver>"` (same triplet as `package.json`). Flat LS key `ruforge-onboarding-last-seen-version` stores the highest version the user completed. On launch, run steps where `introducedIn` is greater than last-seen (semver compare), then bump last-seen to the max `introducedIn` among steps shown. Patch releases with no new registry entries fire nothing.

**Order:** Post-install What's New dismisses first; onboarding chains after (install already restarted the app). Reuse the `postInstall` shell-block pattern in `App.tsx` so the two surfaces do not stack.

**Welcome step:** Pure intro. No fields, no path confirm, no new LS keys for identity. Welcome card reuses the website hero title animation (`AnimatedText` / `HeroAnimatedTitle`, Framer Motion SVG underline draw, procedural so near-zero asset weight). Port target `src/components/onboarding/` or shared `src/components/ui/`; requires adding Patrick Hand woff2 + `@font-face` to the desktop CSS (the app has no `font-hand` token today). Remap website tokens (`text-rf-accent` etc) to the app's `--accent` / `--text`.

**Feature steps:** Media-first (16:9 slot for screenshot or gif). Each step may set `settingsGate` to a `RuforgeSettings` boolean key. Skip the step when that setting is falsy (feature toggled off). Use existing keys only: `sponsorBlockEnabled`, `autoDownloadPlayingSongs`, `hideAudioFromMainLibrary`, `downloadSubtitles`, `autoDownloadScrubberPreviews`, `downloadAudioOnly`, `audioAutoAdvanceFolder`, `audioPrefetchNext`, `skipDuplicatesAutomatically`, `launchAtStartup`, `minimizeToTray`, `hardwareAcceleration`, `showDebuggingSettings`. Do not invent settings.

**Dev:** `import.meta.env.DEV` ignores last-seen and replays the full curated registry every launch. Also ship **Replay onboarding** under Settings > Debugging (visible when `showDebuggingSettings` is on).

**Where code lives (not built yet until authorized):**

- Step registry: `src/lib/onboardingSteps.ts` (ordered list + types). Only steps Angel authors go here.
- LS read/write: `src/lib/onboardingStorage.ts` (`ruforge-onboarding-last-seen-version`).
- UI: `src/components/onboarding/` (overlay/stack), wired from `App.tsx` after `postInstall` clears.
- Media is per-card and optional. A card declares its own media as one of: none, image (webp/png/gif), or video (mp4/webm). Folder stays `src/assets/onboarding/`, referenced by Vite import (same as `@/assets/neotubeIcon.png`). Renderer picks `<img>` for image/gif, `<video autoPlay loop muted playsInline>` for video. Do NOT use `convertFileSrc` for bundled step media (that's for user filesystem paths). Keep step videos short and compressed: video bytes ship in the installer.

**Release gate (step 1 of Release ritual, same pass as PATCH/MINOR):** After reading the `(unreleased)` Shipped log block, scan it for new user-facing features that need a walkthrough step. Bug fixes, polish, refactors: no step. If a feature warrants onboarding and no registry row exists with `introducedIn` set to the release version, stop and ask Angel: does this need a step, what is the copy, and what file goes under `src/assets/onboarding/`? Do not ship when Angel said yes and the step is missing. Same zero-distance rule as the Shipped log.

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


### v0.1.12 (unreleased)

- **Downloads**: manual queue removal no longer evicts localStorage job metadata cache; hero paste after explorer toggle-off reuses cache; idle eviction after download finish + LRU cap (`downloadQueueSlice.ts`, `downloadQueueMetadataCache.ts`).
- **Downloads**: hero metadata effect restores in-memory queue from sessionStorage when empty before job/cache lookup (`downloadQueue.ts`, `downloadQueueSlice.ts`, `useDownloaderView.ts`).
- **Downloads**: `get_video_info` in-flight dedup keys use `normalizeYouTubeUrlForCompare` (same base as metadata cache) so tracking-param URL variants share one slot per lane (`downloadVideoInfoFetch.ts`).
- **Downloads**: queue-row metadata hydration uses display-only `get_video_info` (one simulate, no dual-size merge); hero paste path unchanged (`downloadVideoInfoFetch.ts`, `downloadQueueSlice.ts`, `downloader.rs`).
- **Downloads**: queue metadata hydration capped at 2 concurrent `get_video_info` invokes via `downloadQueueHydrationPool`; cache hits bypass the pool (`downloadQueueHydrationPool.ts`, `downloadQueueSlice.ts`).
- **Downloads**: playlist batch enqueue copies hero per-item thumb/title/duration into job snapshots via `downloadJobSnapshotFromPlaylistItems` (same URL key as `buildPlaylistEnqueuePlan`); rows with item thumbs skip queue hydration (`playlistDownloadPlan.ts`, `useDownloaderView.ts`).
- **Scrub previews**: per-video ffmpeg lock keys normalized via `normalize_media_key` (TS `mediaPathsMatch` contract) at map insert and cancel lookup so mixed slash/casing and delete-path seeding share one slot (`media.rs`).
- **Scrub previews**: `media.ffmpeg` debug category in Settings tree; fleet release log fires on Drop so error/cancel paths log released too (`debugCategories.ts`, `media.rs`).
- **Scrub previews**: global ffmpeg fleet semaphore (max(1, cores/2) permits per spawn) and `-threads 1` on every RuForge sidecar invoke; acquire/release logged under `media.ffmpeg` (`media.rs`).
- **Scrub previews**: tail patch fills every blank trailing cell from last grid sample through floor(duration/5), seeked per cell; patch errors logged (`media.rs`).
- **Scrub previews**: sprite recipe uses `-skip_frame nokey` + `-vsync passthrough` (method A); tail cell at `floor(duration/5)` patched from end-of-file frame so hover reaches duration (`media.rs`).
- **Downloads**: post-download scrub batch spawns on job termination only (`scrub_spawned` latch); post-process stdout no longer preempts before the muxed file exists (`downloader.rs`).
- **Telemetry**: `main.rs` sets shared Tokio runtime before Aptabase plugin init so `npm run tauri dev` no longer panics on startup (`main.rs`).
- **Crash recovery**: root React error boundary wraps every window from `main.tsx`; friendly fallback, reload, collapsible error details (`RootErrorBoundary.tsx`).
- **Scrub previews**: hover thumb uses `<img>` instead of CSS `background-image` so `#` in item folder paths does not break asset URLs (`scrubSpritePreview.tsx`).
- **Scrub previews**: Windows thumb subdirs strip trailing dots from yt-dlp stems (`...webm`); ffmpeg output paths now use the same sanitized name so sprite sheets write successfully (`utils.rs`, `media.rs`, `gallery.rs`).
- **Scrub previews**: ffmpeg sidecar uses `output()` (not spawn event loop) so sprite jobs complete; `-nostdin` added; library PREVIEWS badge driven by Rust started/finished events only (`media.rs`, `scrubSpriteBackfill.ts`, `ruforgeStore.ts`).
- **Windows taskbar icon**: dev builds use `com.attic.ruforge.dev` AppUserModelID and call `set_icon` on HWND so the shell stops showing a stale cached icon while `target/debug/ruforge.exe` runs (`windows_audio_brand.rs`, `lib.rs`, `player.rs`).
- **Comments panel**: thin fixed top scroll vignette on header (no slide-in) when threads scroll up (`CommentsPanel.tsx`, `index.css`).
- **Window chrome**: Win11 snap layout flyout on main maximize hover via `tauri-plugin-decorum` (`App.tsx`, `lib.rs`, `capabilities/default.json`).
- **Authorize Cleanup**: audio tracks use listen-snapshot % (musicListenStats) instead of playbackStorage; video path unchanged (`cleanupCandidates.ts`).
- **Authorize Cleanup**: header tallies selected items (N / goal items + bytes); progress bar empty stone when none selected, fills toward goal; byte goal only when library is >=50% of cap (`AuthorizeCleanupModal.tsx`, `cleanupCandidates.ts`).
- **Storage**: sidebar glyph and music storage strip warn at 50% cap usage (was 80%) (`StorageGlyph.tsx`, `MusicStorageStrip.tsx`).
- **Video Library**: scroll bulge only (no compact title); per-tab active pill hidden while scroll bulge is up to avoid double pills (`App.tsx`).
- **Explorer**: YouTube webview host fills `rf-main-content-shell` (`absolute inset-0`) instead of stale `fixed top-10` cutout; bottom stays flush (no rounded-window height shrink) (`App.tsx`, `explorerBoundsSync.ts`).
- **SponsorBlock**: skip button vertical anchor tracks player chrome via `.rf-sb-skip-btn` CSS (no longer jumps to bottom edge when controls hide) (`SponsorBlockSkipButton.tsx`, `index.css`).
- **Downloads**: stranded yt-dlp `.temp.mp4` files hard-skipped from gallery scan and swept on cleanup (post-download + manual), fixing phantom 2-item playlists with a dead 0:00 entry (`gallery.rs`, `downloader.rs`).
- **Scrub hover**: windowed sprite sheet preload (current ±1, direction-ahead on long videos; full preload when ≤2 sheets); wired to same hover time as thumb (`useScrubberThumbs.ts`, `PlayerView.tsx`, `MiniPlayer.tsx`).
- **Scrub hover**: rAF-throttled hover state, scan-time sprite path cache, sheet preload, CSS background-position previews, defer library backfill during playback (`useScrubberHover.ts`, `useScrubberThumbs.ts`, `gallery.rs`, `ruforgeStore.ts`).
- **Scrub previews**: player/mini load sprites read-only (no ffmpeg lock wait); list path skips lock; gallery refresh only after generation (`media.rs`, `PlayerView.tsx`).
- **Scrub previews**: faster ffmpeg sprite generation (parallel jobs, skip audio/sub decode); library backfill when auto mode is on; per-card spinner via Rust events (`media.rs`, `scrubSpriteBackfill.ts`).
- **Media chrome**: tab bulge SVG fillets and clip insets track `--rf-titlebar-h` again on Video Library and Settings tabs (`App.tsx`, `index.css`).
- **Settings tabs**: scroll morph uses `RF_TITLEBAR_H_PX`; bulge fillets at scroll rest only (no strip clip).

## Release ritual

**Why this exists:** "Push and commit everything" is ambiguous to an agent. The failure mode (observed): Chad invented a feature branch, committed there, and stranded `updater.json` off `main`. Then produced a flawless postmortem of the problem it had just caused. Chad's knowledge was never the gap. The gap was no defined, ordered, verified sequence. This is that sequence.

**Trigger:** Angel says ship / release / push it out. Run these steps **in order, top to bottom.** Do not reorder, do not skip, do not parallelize.

**Angel vs agent (default):** See **Release handoff** under **Who does what**. Angel runs the signed build only; the agent owns GitHub (`gh`), commits, tags, and release copy.

**Hard rule (branching):** RuForge is a solo-dev repo. **All release commits go directly to `main`.** Do **not** create, switch to, or commit on any branch for a release. If you are not on `main`, stop and say so. Do not "fix" it with git surgery on a possibly-dirty tree; ask Angel.

1. **Drain the Shipped log â†’ version bump decision (+ onboarding gate).** Read the entire `### vX.Y.Z (unreleased)` block. Decide PATCH vs MINOR from its contents (behavior change = at least PATCH; new feature / new persisted setting / new command = MINOR). State the chosen version and why, one line. Then run the **Onboarding contract** release gate on the same block: any new user-facing feature that needs a walkthrough must have a row in `src/lib/onboardingSteps.ts` with `introducedIn` matching the release version and art under `src/assets/onboarding/` if Angel provided it. If warranted and missing, ask Angel before continuing. Bug-fix-only releases add no steps.
2. **Bump all three version files together:** `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package] version`. A mismatch here is a known past failure. Confirm all three match.
3. **Prep `updater.json` notes (agent, before build).** Write structured JSON in `notes`: markdown **teaser** (header + three bullets for the pre-download card; full markdown supported), plus `additions` and `fixes` arrays for post-install. Set `version`, `url` (`.../releases/download/v<semver>/RuForge_<semver>_x64-setup.exe`), leave `signature` empty until step 5.
4. **Signed build (Angel only).** Angel runs `Build-signed-windows.bat` or `npm run build:signed`. Agent then reads NSIS `RuForge_<semver>_x64-setup.exe.sig` under `src-tauri/target/release/bundle/nsis/` (do not ask Angel to paste base64 unless the file is missing).
5. **Finish `updater.json` (agent).** Paste `.sig` base64 into `signature`, set `pub_date` from the build time or minisign timestamp. The `signature` value is the literal base64 CONTENTS of the `.sig` file, never a path or URL. That mistake breaks every install silently.
5b. **Sync website release assets (agent).** Run `npm run prep:website-release` from repo root (requires signed NSIS at `src-tauri/target/release/bundle/nsis/`). Commits: generated `website/src/content/releases/v0-1-x.md`. Site version comes from root `package.json` at Astro build time; no `site.ts` edit. Include the generated changelog in the release commit. Cloudflare Pages redeploys on push. Same-origin installer streaming needs the copied exe in the deploy artifact (gitignored; GitHub fallback works without it). Use `npm run prep:website-release:changelog-only` if the signed build is not ready yet.
6. **Commit + push to `main` (agent).** Confirm current branch is `main`. Write a clear commit message (version + one-line summary). The commit MUST include `updater.json`, all three version files, generated website changelog when applicable, and any unreleased code. Push to `origin main`. State the pushed commit hash.
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

8. **Drain Shipped log â†’ graph surfaces AND roll STATE.md (scoped, this
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
   done. (Same principle as the session lesson: code present â‰  running on
   the path that matters. Committed â‰  live on `main`.)
10. **Report.** One block: chosen version + rationale, pushed commit hash, GitHub Release URL, the live `version` string you actually fetched in step 9, and confirmation the Release asset matches `updater.json` `url` (`.sig` only in `updater.json`).

**If any step fails, stop at that step and report the failure plainly. Do not continue and do not claim partial success as success.**
