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

### v0.1.9 (unreleased)

- **Website /m/ bugfixes**: MobileFooter and MobileFullscreenNav internal links stay on `/m/` (no desktop redirect round-trip). Sitemap filter excludes `/m/` URLs. Desktop `BaseLayout` adds `rel="alternate"` for mobile pairing. `MobileFooter.astro`, `MobileFullscreenNav.tsx`, `astro.config.mjs`, `BaseLayout.astro`.
- **Website pages.dev redirect**: Client-side redirect from `*.pages.dev` preview hosts to `ruforge.app` in `BaseLayout` and `MobileShell`. `BaseLayout.astro`, `MobileShell.astro`.
- **Website mobile polish (4 fixes)**: OS-detect CTA labels on mobile landing hero and fullscreen nav overlay (reuses `detectPlatform.ts`); Patrick Hand font preload in `BaseLayout.astro` and `MobileShell.astro` with `font-display: optional` to prevent wordmark FOIT/FOUT; fullscreen nav viewport fix (removed inline `100vw`/`100dvh`, relies on `fixed inset-0` for correct mobile browser chrome coverage); hamburger-to-X morph animation via CSS `transform` on 3 SVG lines (~200ms, no library). `MobileHeader.tsx`, `MobileFullscreenNav.tsx`, `m/index.astro`, `fonts.css`, `BaseLayout.astro`, `MobileShell.astro`.
- **Mobile shell full-site coverage**: Built 3 mobile templates (`MobileContentPage`, `MobileSectionIndex`, `MobileDocsPage`) and created `/m/` routes for every desktop page: dynamic `[section]/[slug]`, `docs/[slug]`, `docs/built-with/[tool]`, `legal/[doc]`, section indexes, plus bespoke pages for `features/index`, `features/[slug]` (6 feature detail pages with shared `featurePageData.ts`), `changelog`, and `roadmap`. Universal mobile redirect injected into `BaseLayout` (UA + viewport gate, derives `/m/` path automatically); removed per-page redirect from `download.astro`. MobileShell now auto-injects `<link rel="canonical">` (pointing to desktop path) and `<meta name="robots" content="noindex,follow">` for all `/m/*` pages. 94 mobile pages total. `MobileShell.astro`, `BaseLayout.astro`, `MobileContentPage.astro`, `MobileSectionIndex.astro`, `MobileDocsPage.astro`, `featurePageData.ts`, `m/[section]/*`, `m/docs/*`, `m/legal/*`, `m/features/*`, `m/changelog.astro`, `m/roadmap.astro`.
- **Mobile `/m/download` page**: Mobile-shell download page at `/m/download` with OS-detect CTA, platform card (Windows Universal link, macOS/Linux coming soon), version meta, release notes and GitHub links. Desktop `/download` page redirects mobile UA + narrow viewport to `/m/download` via client-side script. Landing hero CTA now points to `/m/download`. `m/download.astro`, `download.astro`, `m/index.astro`.
- **Mobile header scroll transition smoothing**: Replaced choppy `transition-all` morph (width, padding, border-radius) with dual-header cross-fade that animates only `opacity` and `transform` via `will-change`. rAF-debounced scroll listener. 60fps on real iOS Safari. `MobileHeader.tsx`.
- **Mobile Material ripple on taps**: Radial circle expanding outward from tap point on `rf-m-btn`, `rf-m-card`, `rf-m-link` via `::after` pseudo-element, CSS `@keyframes rf-ripple-expand`, and JS pointerdown handler that sets `--ripple-x/y/d` custom properties. Subtle `rgb(0 0 0 / 0.07)` on dark surfaces. Respects `prefers-reduced-motion`. `global.css`, `MobileShell.astro`.
- **Mobile nav tree expand (replaces navigate-on-tap)**: Fullscreen nav overlay sections now expand in-place on tap (was: navigate to `/m/features`). Chevron rotates, smooth height animation, one section open at a time. Shows max 3 sub-items per section from `sitePages.ts` with "View all" link to the section page. Sub-items are clickable links to their individual pages. `MobileFullscreenNav.tsx`.
- **Mobile overlay scroll/z-index fix**: Overlay uses `100dvh` (not `100vh`, fixes iOS Safari address bar), `z-[200]` with close button at `z-[210]`, solid `bg-rf-bg` (no transparency bleed), `overflow: hidden` on both `<html>` and `<body>` for scroll lock, `overscroll-contain` on nav area. `MobileFullscreenNav.tsx`, `MobileHeader.tsx`.
- **Mobile haptic feedback + press interactions**: Added `@mxerf/tappt` for iOS Taptic Engine (hidden switch hack, iOS 17.4+) and Android Vibration API haptics on all mobile interactive elements. Claude-style press feedback via `rf-m-btn` (scale 0.97 + brightness dip), `rf-m-card` (scale 0.985 + inset shadow), `rf-m-link` (background flash + scale 0.99) CSS classes with `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`, crisp `focus-visible` outlines, and `prefers-reduced-motion` respect. React components use `useHaptic` hook (lazy-loads tappt); Astro pages use a global `pointerdown` delegate in `MobileShell.astro`. `vite-plugin-qrcode` in Astro Vite config prints scannable QR codes in the terminal on `npm run dev` (dev script now includes `--host`). `useHaptic.ts`, `MobileHeader.tsx`, `MobileFullscreenNav.tsx`, `MobileFeatureAccordion.tsx`, `MobileFooter.astro`, `MobileShell.astro`, `m/index.astro`, `m/[section].astro`, `global.css`, `astro.config.mjs`, `package.json`.
- **Mobile header logo fix**: Header and fullscreen nav logo images now resolve through Astro's `getImage` pipeline via a `logoSrc` prop (was referencing non-existent `/RuForgeLogo.png` in public). `MobileHeader.tsx`, `MobileFullscreenNav.tsx`, `m/index.astro`, `m/[section].astro`.
- **Mobile landing page at `/m/`**: Scroll-aware header (full-width at top, floating pill island on scroll with smooth transition), hamburger to fullscreen nav overlay (five top-level sections, staggered entrance animations, close X), hero with mobile-sized animated squiggly underline title, static tech integrations card (2-column grid replacing desktop marquee), interactive feature accordion (image + name cards, tap to expand description, one-open-at-a-time with height animation), vertically stacked mobile footer (same content as desktop, narrow layout, aged-paper background). Five mobile section index pages at `/m/[section]` pull page lists from `sitePages.ts`. `MobileHeader.tsx`, `MobileFullscreenNav.tsx`, `MobileFeatureAccordion.tsx`, `MobileTechCard.astro`, `MobileFooter.astro`, `MobileShell.astro`, `m/index.astro`, `m/[section].astro`.
- **Website desktop/mobile shell scaffold**: Added `DesktopShell.astro` and `MobileShell.astro` layout shells; mobile entry at `/m/`. Desktop site is the existing page tree. Both shells empty, ready to build independently.
- **Website responsive strip**: Removed all mobile-collapse responsive logic from the public website. Hamburger nav + mobile drawer deleted from `SiteHeaderNav.tsx`; header download button always shows full label; feature rows, testimonial columns, docs sidebar, footer grid, mega-menu panels, and all section/index grids locked to their desktop multi-column layouts. No viewport-based stacking remains. `SiteHeaderNav.tsx`, `SiteHeader.astro`, `HeaderDownloadButton.astro`, `LandingFeaturesSection.astro`, `TestimonialsSection.astro`, `FeaturePageTemplate.astro`, `DocsPageTemplate.astro`, `FeatureStackedCards.tsx`, `navigation-menu.tsx`, `siteNavMenu.ts`, `BaseLayout.astro`, `index.astro`, `SiteFooter.astro`, `BuiltWithPageTemplate.astro`, `ContentPageTemplate.astro`, `BuiltWithIndexTemplate.astro`, `SectionIndexTemplate.astro`, `HeroAnimatedTitle.tsx`, `DownloadOwlHero.tsx`, `docs/index.astro`, `legal/index.astro`, `global.css`.
- **Public website asset audit**: Deleted 118 unused font files (kept 3 variable woff2, saving 5 MB), removed orphan duplicate images from `public/` (testimonials, screenshots, highlight-coffee-beans, ruforge-logo), generated proper multi-size favicon set (389 KB to 14 KB), converted `landing-grain.png` to WebP (2,999 KB to 153 KB), ran SVGO pass on `download-hero-logo.svg` (1,335 KB to 435 KB, gradients preserved), converted 24 `public/tutorials/` PNGs to WebP (5,511 KB to 767 KB). Total static asset weight 22.9 MB to 8.3 MB (64% reduction, deployed payload exceeds 70% savings). `BaseLayout.astro`, `index.astro`, `features/index.astro`, `siteNavMenu.ts`, `design.md`, `fonts.css` paths unchanged.

- **Download owl page background**: Integrated new canvas silk flow animation component with custom warm gold "owl" color palette, resolved narrow clipping width layout issue on download hero, replaced legacy orbiting particles on mockup download page, updated CTA button with clean focus ring and hover lift interactions, replaced the owl image container with the Obsidian-style logo card component, and cleaned up unused assets. `DownloadOwlHero.tsx`, `silk-background-animation.tsx`, `demo.tsx`.
- **Audio-only hero (redesign)**: Replaced full-canvas LED bar equalizer with vinyl record + album art combo. SVG vinyl disc (grooves, center label with cover art, spindle hole) slides out from behind the album art during playback and spins via JS-driven RAF loop; freezes at current angle on pause and retracts partially behind the art. Audio analyser drives a subtle radial glow around the disc. `AudioHeroStage.tsx`.
- **Public website docs glossary tooltips**: Hover popups on glossary terms show a one-line definition above the cursor. Terms wrapped with `<span class="docs-term" data-term="...">` in content; definitions in `glossaryTerms.ts`; vanilla JS positions a floating tooltip; CSS dashed underline affordance. Data island on every docs page so cross-page term references work. `glossaryTerms.ts`, `docsContent.ts`, `DocsPageTemplate.astro`.
- **Public website docs section images + scan spinner**: Added `image` and `headingWidget` fields to docs content system. Sections reference a filename from `assets/tutorials/docs/`, loaded via `import.meta.glob` and rendered as Astro `<Image>` with responsive widths. Six screenshots wired: Paste a link, Choose format, Watch progress, Find it in your library (first-download), Download directory, Internal vault (library-folders). "Scan behavior" heading shows a Lottie spiral loader (fast/slow phase cycle, 45% opacity, `lottie-react` React island). `docsContent.ts`, `DocsPageTemplate.astro`, `SpiralLoader.tsx`.
- **Public website docs audit (Library folders)**: Replaced fabricated "Custom roots" section with accurate "Internal vault and download path" description matching the real Settings Downloads INTERNAL/CUSTOM toggle. "Case and extensions" uses a split layout (text left, 3-column recognized/unrecognized table right) with a click-to-expand collapsible pill for the uncommon-format explainer. Extension list corrected to match actual Rust `MEDIA_EXTS` (no `.avi`/`.mov`/`.wav`, added `.opus`). Added `layout: 'split'`, `collapsible`, `warning`, and flexible-column `table` block types to the docs content system. Fixed Glossary "Scan root" entry. `docsContent.ts`, `docsTree.ts`, `sitePages.ts`, `DocsPageTemplate.astro`.
- **Public website Getting Started docs**: Four fully written pages (Download and install, Your first download, Library folders, Glossary) with rich content: numbered steps, bullet lists, tip/note callouts, inline code, and keyboard hints. Template system (`docsContent.ts`) renders real content per section when available, falls back to placeholder for unwritten pages. Search indexes actual body content. `docsContent.ts`, `DocsPageTemplate.astro`, `DocsSearch.tsx`.
- **Public website docs search**: Functional sidebar search (React island) indexes page titles, descriptions, headings, and body content with tracked line numbers; snippet-windowed results show faint section/page path, mono line number, and highlighted match substring; fully opaque dropdown (no ghost text bleed); hover and keyboard highlight in `--color-rf-docs-link`; duplicate content lines deduped. `DocsSearch.tsx`, `DocsSidebar.astro`, `global.css`.
- **Public website docs link color**: Replaced Obsidian purple `#c4b5fd` with warm amber `--color-rf-docs-link` (`#d4a574`) on all docs link surfaces; persistent underline on page links; hover-only link-chain icon via CSS mask (absolute, no layout shift). `global.css`, `DocsPageTemplate.astro`, `docs/index.astro`.
- **Copy transcript menu**: Visual polish pass on Copy Transcript inline-expansion menus, aligning button styles, icons, sub-options, container padding, and adding a vertical tree connecting line. `MediaView.tsx`, `PlayerView.tsx`.
- **Public website Obsidian-style docs**: Full `/docs` section with left sidebar tree nav (11 collapsible sections, 40+ pages), "RuForge Docs" branding, search placeholder, "On this page" right sidebar, prev/next page navigation, and section card grid index. Old `docs` section in `sitePages.ts` routes to new system via `externalHref`. `docsTree.ts`, `DocsSidebar.astro`, `DocsPageTemplate.astro`, `docs/index.astro`, `docs/[slug].astro`, `sitePages.ts`.
- **Public website feature pages**: Six detailed `/features/*` pages (downloader, media-library, player, sponsorblock, mini-player, settings) with alternating screenshot/copy layout, card grid index, and `FeaturePageTemplate.astro` reusable component. `features/*.astro`, `FeaturePageTemplate.astro`, `sitePages.ts`.
- **Public website download page (redesign)**: Clickable title, auto-width hero button, and Obsidian-style vertical platform panel with theme tokens. `DownloadLanding.tsx`, `global.css`.
- **Downloader cookies (fix)**: Default browser context is None (not hidden Chrome); legacy `chrome` migrates on settings load; metadata fetch retries without cookies when export fails; humanized errors name Internal vs external browser; Rust ignores legacy `chrome` in yt-dlp args. `types.ts`, `downloadQueue.ts`, `downloader.rs`, `DownloaderView.tsx`, `useDownloaderView.ts`.
- **Public website download hero (fix)**: Restored uncorrupted `RuForgeLogo.svg` export (no SVGO; radial gradients intact) at `website/public/download-hero-logo.svg`; gradient config synced to re-export transforms. `downloadHeroLogoLight.ts`.
- **Public website download hero**: Hero SVG from `public/RuForgeLogo.svg` (SVGO ~55% smaller), fetched at runtime instead of inlined in HTML; gradient IDs remapped for new export. `DownloadHeroMark.tsx`, `downloadHeroLogoLight.ts`, `website/public/download-hero-logo.svg`.
- **Public website download hero**: Inline Figma SVG (`download-hero-logo.svg`) with pointer-driven `gradientTransform` on blade + text radial fills (Obsidian-style); dropped PNG mask overlay and CSS brown plate. `DownloadHeroMark.tsx`, `downloadHeroLogoLight.ts`, `download.astro`, `global.css`.

### v0.1.8 (shipped)

- **Settings updates**: Downloads tab adds yt-dlp Check & Update (force GitHub check, auto-install user copy); Advanced Check now auto-downloads RuForge when newer. `SettingsView.tsx`, `useYtdlpUpdate.ts`, `ytdlp_update.rs`, `App.tsx`.
- **Public website download page (fix)**: Hero mark uses Obsidian-style card shimmer + sigmoid-mapped moving logo highlights (not static corner spotlight); clickable card. `DownloadHeroMark.tsx`, `global.css`.
- **Public website download page (fix)**: Obsidian-style `/download` layout (header clearance, hero spacing, wide rounded CTA, flat App panel with Linux formats on one row); dropped `flushTop` so icon no longer clips nav. `DownloadLanding.tsx`, `download.astro`, `global.css`.
- **Public website download page**: Obsidian-style `/download` hero (logo, OS-detected CTA, version meta) plus App panel (Windows Universal link, macOS/Linux coming soon in accent yellow, Linux package rows with Simple Icons). macOS uses Lucide monitor icon, not Apple logo. `DownloadLanding.tsx`, `detectPlatform.ts`, `downloadPlatformIcons.ts`, `global.css`.
- **Public website polish (fix)**: Custom pill tooltips on truncated code-snippet paths (no native `title`); `rf-scrollbar` on mobile nav, built-with sidebar, roadmap table, download modal body; mega-menu viewport/featured row clamped to viewport; Resources hero uses WebP not PNG; header nav `client:idle`; download logo via `getImage`; `MegaPanel` memoized; download auto-start effect stable ref.
- **Public website download UX (fix)**: `/download` tries same-origin `/releases/*.exe` then GitHub `fetch`; on failure uses honest browser download from GitHub (CORS), not error modal. `fetchInstaller`, `copy-installer-for-website.ps1`, `public/releases/README.md`.
- **Public website docs (built-with)**: Rewrote all sixteen tool pages with maintainer-tone wiring copy (user action through frontend, Rust, disk); expanded repo snippets to full functions/blocks (2-3 per page, corrected line ranges). `builtWithPages.ts`, `builtWithCodeExamples.ts`.
- **Public website header (fix)**: ClientRouter keeps header via `transition:persist` (no flash or page chrome in the pill); frosted pill `::before` blur restored; view-transition overlay no longer blocks nav clicks. `BaseLayout.astro`, `SiteHeader.astro`, `global.css`.
- **Public website docs (built-with)**: Resend-style code snippet panels (slim mono header, gold path accents, collapsed Shiki peek, smooth expand, no card-button hover wash); line hints use hyphen range. `CodeSnippetPanel.tsx`, `readCodeSnippet.ts`, `global.css`.
- **Public website docs (built-with)**: Astro `ClientRouter` view transitions on built-with index/detail; persisted tool sidebar, directional main-column swoosh from mega-menu order (`data-bw-direction`), fade-only under `prefers-reduced-motion`; short fade on other same-origin pages. `BaseLayout.astro`, `BuiltWithPageTemplate.astro`, `BuiltWithTransitions.astro`, `builtWithPages.ts`, `global.css`.
- **Public website docs (built-with)**: Inline backtick strings render as `rf-inline-code` pills; collapsible Shiki-highlighted repo snippets (16 pages, 2 each) in Resend-style `CodeSnippetPanel` between body and touchpoints. `inlineCode.ts`, `readCodeSnippet.ts`, `highlightCode.ts`, `ruforgeShikiTheme.ts`, `builtWithCodeExamples.ts`, `InlineCodeText.astro`, `CodeSnippetPanel.tsx`, `BuiltWithPageTemplate.astro`, `global.css`.
- **Scrollbars (website + desktop)**: Canonical `rf-scrollbar` slim accent thumb (7px, no native arrow buttons) on `BaseLayout` html and Tauri `index.html`; removed home-only scrollbar and undefined `rf-scrollbar-thin`; desktop lists/modals show custom scrollbar, `scrollbar-none` kept on horizontal carousels only. `global.css`, `index.css`, `BaseLayout.astro`, `App.tsx`, `MediaView.tsx`, `UpdaterLayers.tsx`.
- **Public website docs (built-with)**: Index cards, detail PageHeader, and sidebar sibling links show per-tool tech icons via `BuiltWithTechIcon.astro` (mega-menu monochrome SVG/img paths). `BuiltWithIndexTemplate.astro`, `BuiltWithPageTemplate.astro`, `PageHeader.astro`.
- **Public website nav (fix)**: Mega-menu tab switch uses Resend-style inner swoosh (horizontal slide + blur via Radix data-motion); viewport width/height eases instead of snapping. `navigation-menu.tsx`, `global.css`.
- **Public website nav (fix)**: Docs built-with pill tooltips portaled to body with edge clamping so labels are not clipped by the mega-menu viewport. `icon-pill-tooltip.tsx`, `SiteHeaderNav.tsx`, `global.css`.
- **Public website docs (built-with)**: Sixteen factual tool pages at `/docs/built-with/*` (how RuForge uses each stack item), index, Docs nav entry, mega-menu icons link through. `builtWithPages.ts`, `BuiltWithPageTemplate.astro`, `SiteHeaderNav.tsx`, `sitePages.ts`.
- **Public website nav (fix)**: Docs built-with icons show custom black pill tooltip above on hover (auto-fit label, no native title). `SiteHeaderNav.tsx`, `global.css`.
- **Public website nav (fix)**: Docs mega-menu 4x4 built-with grid (16 icons, eight docs-only from Simple Icons + Lucide); landing ticker unchanged at eight. `techTickerIcons.ts`, `SiteHeaderNav.tsx`.
- **Public website nav (fix)**: Mega-menu grid layout (no featured overlap), Docs icons in right ~40% rail (Resend-style, no nested Built with card), tighter featured image insets. `SiteHeaderNav.tsx`, `siteNavMenu.ts`.
- **Public website nav (fix)**: Mega-menu real `backdrop-filter` blur (frost on viewport `::before`, no transform ancestor, header pill no nested blur). `global.css`, `navigation-menu.tsx`, `SiteHeader.astro`.
- **Public website nav (fix)**: Larger header nav triggers (`h-10`, `text-xs`, `px-4`); caret arrow unchanged. `navigation-menu.tsx`, `SiteHeaderNav.tsx`.
- **Public website nav (fix)**: Mega-menu fixed panel size (no viewport height collapse), glass `backdrop-blur` viewport, uniform featured card height + Features cards in a row. `siteNavMenu.ts`, `navigation-menu.tsx`, `SiteHeaderNav.tsx`.
- **Public website nav (fix)**: Mega-menu links use `rf-mega-menu-link` / `rf-header-nav-trigger` (theme muted to text hover, overrides global `a` opacity); looser Resend-like row spacing. `global.css`, `SiteHeaderNav.tsx`.
- **Public website nav (fix)**: Mega-menu title-only links (#8A8C8D to #7D8284 hover, no trigger bubble); per-section featured cards (Features x2, Company x2, Resources/Help heroes, Docs stack icons). `siteNavMenu.ts`, `SiteHeaderNav.tsx`, `navigation-menu.tsx`.
- **Public website docs IA**: Resend-style header mega-menus (Features, Company, Resources, Help, Docs), 39 template doc pages, 5 section indexes from `sitePages.ts`, Radix `SiteHeaderNav`. `sitePages.ts`, `SiteHeaderNav.tsx`, `[section]/[slug].astro`, `ContentPageTemplate.astro`.
- **Public website landing (fix)**: Features section layout: leading arrows on all rows, no bullet card, wider image column, screenshot frame labels removed. `LandingFeaturesSection.astro`, `landingFeatures.ts`.
- **Public website landing**: Replaced six-card tutorial hub grid with four-row "What you actually get" features section (alternating copy/screenshots, Astro Image WebP). Removed tutorial hub React stack. `LandingFeaturesSection.astro`, `landingFeatures.ts`, `index.astro`.
- **Public website landing (fix)**: Removed faint library screenshot watermark beside tutorial cards (`ghostScreenshot` on `LandingBackdrop`). `LandingBackdrop.astro`, `index.astro`.
- **Public website landing (fix)**: Highlight card drops release teaser footer, Download Latest button, and Interactive Roadmap CTA (header still has download). `index.astro`.
- **Public website header (fix)**: GitHub icon in fixed 2.25rem flex slot; hover pill is absolute and grows left via max-width (nav/download stay put); Legal hides only on rect overlap. `SiteHeader.astro`.
- **Public website header (fix)**: Larger version badge; GitHub hover label absolutely expands left (icon fixed, nav unmoved); Legal link fades out while GitHub label is open. `SiteHeader.astro`.
- **Public website header**: Version badge beside logo; GitHub icon top-right (Unbound Angel label slides left on hover at sm+); hero duplicate CTAs removed. `SiteHeader.astro`, `index.astro`.
- **Public website landing (fix)**: Home uses `BaseLayout` `flushTop` so landing backdrop meets the viewport edge (no dark strip from main top padding). Gradient top stop matches `rf-bg`. `BaseLayout.astro`, `index.astro`, `LandingBackdrop.astro`.
- **Public website landing (fix)**: Tech ticker and testimonial marquees use paired strips with trailing gap padding (no flex gap between duplicates) so -50% loop has no black seam or jolt. `index.astro`, `TestimonialsColumn.astro`, `TestimonialsSection.astro`.
- **Public website landing (fix)**: `LandingBackdrop` takes optional `grain`, `heroEmber`, and `ghostScreenshot` props from `index.astro`; dropped missing `landing-hero-ember.png` import (CSS ember wash fallback). `LandingBackdrop.astro`, `index.astro`.
- **Public website landing**: Premium scroll backgrounds with 5-zone vertical CSS gradient, tiled fine paper grain texture, desaturated media library interface silhouette watermark, and floating section-aligned ambient breathing lights. `LandingBackdrop.astro`, `index.astro`.

- **Public website landing (fix)**: Testimonials section drops Field notes eyebrow and dev filler lead; heading only. `TestimonialsSection.astro`.
- **Public website features (fix)**: Snappier tutorial hub open/close and stack hover springs. `tutorial-hub-expandable.tsx`, `stacked-cards-interaction.tsx`.
- **Public website features (fix)**: Tutorial expand: removed bottom gradient and card pop-in fades; overflow clipped during layout morph; sketch cards keep natural aspect ratio (no stretch scroll glitch). `tutorial-hub-expandable.tsx`, `TutorialHubsGrid.tsx`.
- **Public website features (fix)**: Expanded tutorial modal drops header bar, divider, and close chrome; eyebrow floats above three sketch cards on transparent shell (backdrop/Escape to close). `tutorial-hub-expandable.tsx`.
- **Public website features (fix)**: Removed cover plus affordance; modal close is a plain X (no layoutId morph). `stacked-cards-interaction.tsx`, `tutorial-hub-expandable.tsx`.
- **Public website features**: Tutorial hubs open with ExpandableCard-style layoutId morph (cover card and step 1 image spring into modal; backdrop blur). `tutorial-hub-expandable.tsx`, `stacked-cards-interaction.tsx`.
- **Public website features (fix)**: Stacked tutorial cover copy left-aligned under Step pill (TutorialSketchHub padding rhythm, not vertical center). `tutorial-sketch-copy.tsx`.
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

   **WinGet manifest auto-update.** Once the WinGet Releaser GitHub Action is set up (one-time install per `https://github.com/vedantmgoyal9/winget-releaser`), it watches for new GitHub Releases on `UnboundAngel/RuForge` and automatically opens the winget manifest update PR against `microsoft/winget-pkgs` using Komac. No manual `wingetcreate` invocation needed per release. If the action is not yet installed, set it up before the next release. If a winget PR fails to auto-open for a release, that is a release blocker for the NEXT release, not a hard block on the current one.

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
