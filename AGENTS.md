# RuForge: notes for IDE agents (Cursor and other automation)

Concise guardrails for agents working **inside this repo's IDE workspace**. Not a full architecture audit. Extended detail lives in routed docs (see table below).

## Read first, write last (every agent, every task)

Before any task: open [`STATE.md`](STATE.md) at the repo root. It is the live cursor for current version, unreleased delta, open P0s, and next items. Do not reconstruct project state from the git tree or by asking Angel what was last shipped.

After any task that changed shipped behavior or moved the project: update `STATE.md` last, before you report done. At minimum refresh Now, append one line to the Shipped log in **this file** (see Shipped log section), and mirror it into STATE.md's "What is new since last user release". Do not append per-change lines to STATE.md. Skipping this is the single failure that has cost the most rework in this repo.

If STATE.md and the code disagree, the code wins. Fix STATE.md forward. Never git-restore a dirty tree to "match" it.

## Agent read order

1. **`STATE.md`**: live project cursor (version, Now, Next 3, Open P0).
2. **`AGENTS.md`**: rules, roles, Shipped log, release ritual, **Doc routing** table below.
3. **Task-specific only:** one row from **Doc routing** when trigger words match.

Do not start from `docs/agents/handoffs/`, `docs/ruforge/RuForge.md`, or `docs/ruforge/product-feature-catalogue.md` unless Angel explicitly points you there.

## Codex operating mode

Codex in this repo is for GitHub Actions / CI debugging, GitHub workflow help,
prompt creation, handoff drafting, and review summaries when explicitly
requested. Do not edit app code or implement repo changes from Codex unless
Angel explicitly overrides this boundary in the current chat.

At the start of every RuForge Codex chat, load the Codex memory surface before
work:

- Read `C:\Users\Attic\.codex\memories\memory_summary.md` when it is provided
  in context.
- Read or search `C:\Users\Attic\.codex\memories\MEMORY.md`.
- Read repo `STATE.md` and `AGENTS.md`.
- Read only the task-routed docs from the table below after that.

For Companion work, Codex should usually create a focused Cursor prompt instead
of implementing code. The prompt should force convergence: define the V1 done
line, name the exact files or areas to inspect, ban scope expansion, and require
verification plus a short manual Angel checklist.

Planning is for feature direction, product scope, and cross-chat continuity.
Do not turn normal implementation into a planning exercise. Preserve
auditability with compact handoffs every few messages or before moving to a new
chat, not with status tracking after every message.

## Doc routing (trigger words)

**Every task:** read [`STATE.md`](STATE.md) then this file.

**Then:** if any trigger word matches, read that doc before writing code or suggesting product direction. Live code wins over all docs.

| Path | Purpose | Trigger words |
|------|---------|---------------|
| [`STATE.md`](STATE.md) | Live version, Now, Next 3, Open P0, unreleased delta | always; project state; what shipped; priorities; P0 |
| [`AGENTS.md`](AGENTS.md) | Rules, Shipped log, release ritual, Chad/Jim split, editing guardrails | always; agent rules; shipped log; release ritual; Cursor; agent instructions; context files |
| [`docs/agents/AGENT-REFERENCE.md`](docs/agents/AGENT-REFERENCE.md) | Stack, architecture snapshot, code-quality detail, updater/signing manual, onboarding contract | architecture; Zustand; code quality; onboarding; updater detail; signed build; mini player; playback persistence |
| [`docs/ruforge/plans/companion-action-plan.md`](docs/ruforge/plans/companion-action-plan.md) | Locked Companion V1 scope and open product decisions | Companion action plan; Companion V1; same-PC browser companion; localhost companion; progress sync; no downloader UI; Companion scope |
| [`docs/agents/COMPANION-AND-COMPETITOR-INDEX.md`](docs/agents/COMPANION-AND-COMPETITOR-INDEX.md) | Companion LAN + competitor doc map | companion; LAN; QR; pair; pairing; session cookie; stream-token; signed URL; HMAC; `/pair`; `/library`; `/stream`; companion-web; browser companion; axum companion; phone browser |
| [`docs/agents/skills/README.md`](docs/agents/skills/README.md) | Agent-neutral routing for packaged skills | skills; cursor-audit-router; prompt-master; research-master; angel-design-style; skill package |
| [`docs/ruforge/research/companion-architecture-extraction.md`](docs/ruforge/research/companion-architecture-extraction.md) | Companion v1 target design + upstream server patterns | (after index) Jellyfin; Navidrome; PairDrop; Snapdrop; go2rtc; MediaMTX; range 206; embed SPA; no transcode |
| [`src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`](src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md) | Activity Island motion, portal, playback bridge, onboarding constraints | Activity Island; dynamic island; island onboarding; playback bridge; activityOwner; shellBlocked; island expand |
| [`.cursor/rules/design-style.mdc`](.cursor/rules/design-style.mdc) | House visual taste (tokens, spacing, anti-patterns) | visual; UI polish; card; layout; motion; spacing; tokens; typography; divider; glow |
| [`.cursor/rules/design-style-ruforge-tokens.mdc`](.cursor/rules/design-style-ruforge-tokens.mdc) | RuForge `--color-rf-*` / app token mapping | RuForge tokens; `--accent`; desktop palette |
| [`.cursor/rules/design-style-media-cards.mdc`](.cursor/rules/design-style-media-cards.mdc) | Media card layout rules | media card; thumbnail; library grid; poster |
| [`.cursor/rules/design-style-checklist.mdc`](.cursor/rules/design-style-checklist.mdc) | Pre-ship visual checklist | design review; checklist; Jim handoff QA |
| [`.cursor/rules/design-style-anti-patterns.mdc`](.cursor/rules/design-style-anti-patterns.mdc) | Banned UI patterns | anti-pattern; generic AI UI; flat card |
| [`AGENTS.md` -> Who does what / Handoff rule](AGENTS.md) | Jim vs Chad; copy-paste Jim prompts | Jim; Gemini; visuals only; styling handoff; do not change logic |
| [`docs/agents/handoffs/jim-settings-info-icon.md`](docs/agents/handoffs/jim-settings-info-icon.md) | Stale Jim pass: settings info icons | Jim; settings info icon; SettingItem description toggle |
| [`docs/agents/release/CHANGELOG-AUTHORING.md`](docs/agents/release/CHANGELOG-AUTHORING.md) | Version graph + changelog authoring contract | release; changelog; version graph; versioner; MANIFEST; ship step 8 |
| [`docs/agents/release/versioner.html`](docs/agents/release/versioner.html) + [`docs/agents/release/versions/`](docs/agents/release/versions/) | Interactive version graph (release only) | versioner.html; version JSON; fileEdits; registry row |
| [`AGENTS.md` -> Release ritual](AGENTS.md) | Ordered ship sequence, updater.json, gh release | release; ship; push it out; updater.json; signed build; gh release; WinGet |
| [`docs/ruforge/research/google-seo-and-domain-strategy.md`](docs/ruforge/research/google-seo-and-domain-strategy.md) | SEO framing, competitor pages, DMCA-safe copy | website; SEO; parasite SEO; 4K Video Downloader; comparison page; domain |
| [`docs/ruforge/research/ai-llm-discoverability.md`](docs/ruforge/research/ai-llm-discoverability.md) | llms.txt, IndexNow, AI citation policy | llms.txt; robots; crawler; IndexNow; GPTBot; ClaudeBot; AI discoverability |
| [`website/public/llms.txt`](website/public/llms.txt) | Live site AI index (deploy artifact) | llms.txt content; site root index |
| [`website/public/robots.txt`](website/public/robots.txt) | Live crawler policy | robots.txt; disallow GPTBot |
| [`website/src/pages/**`](website/src/pages/) + [`docs/ruforge/website/design.md`](docs/ruforge/website/design.md) | Public site pages + design tokens | JSON-LD; SoftwareApplication; BaseLayout; meta description; Astro page |
| [`.cursor/rules/roadmap-workflow.mdc`](.cursor/rules/roadmap-workflow.mdc) | When/how to edit roadmap.json | roadmap workflow; new feature idea; mark finished |
| [`website/src/content/roadmap.json`](website/src/content/roadmap.json) | Public roadmap rows | roadmap; roadmap.json; field notes; roadmapStatus |
| [`docs/agents/handoffs/roadmap-field-notes.md`](docs/agents/handoffs/roadmap-field-notes.md) | Stale desktop roadmap polish handoff | field notes; RoadmapFieldNotes; `/roadmap` desktop polish |
| [`docs/ruforge/research/ruforge-competitive-audit.md`](docs/ruforge/research/ruforge-competitive-audit.md) | yt-dlp GUI feature matrix | Parabolic; imsyy; ytdlp-interface; dsymbol; competitive audit |
| [`docs/ruforge/plans/<topic>.plan.md`](docs/ruforge/plans/) | Committed machine plans | plan file named in task; export phase; downloader ETA; music mini player |
| [`docs/ruforge/PROBLEMS.md`](docs/ruforge/PROBLEMS.md) | Report-only bug backlog | known problem; PROBLEMS; bug backlog; P0 update hang |
| [`docs/ruforge/RuForge.md`](docs/ruforge/RuForge.md) | Archived roadmap (stale) | only when Angel explicitly points here |
| [`docs/ruforge/product-feature-catalogue.md`](docs/ruforge/product-feature-catalogue.md) | Stale code inventory (stale) | only when Angel explicitly points here |
| [`docs/agents/handoffs/`](docs/agents/handoffs/) | Stale session handoffs | handoff; pass 1; prior chat context (read banner; do not treat as live state) |

**Sleepy / Discord bot:** no repo doc. Discord Rich Presence is a Future line in archived `docs/ruforge/RuForge.md` only.

## Output law (non-negotiable, every agent, every surface)

No emdashes. Anywhere. Not in code comments, commit messages, release notes, updater.json notes, changes.html copy, STATE.md, or chat. Use a period, a comma, a colon, or rewrite the sentence. A hyphen between words is fine (audio-only, cross-window). A spaced emdash as a clause break is not.

No AI tells in any repo-facing or user-facing text. No "delve", no "it is worth noting", no "in conclusion", no rule-of-three padding, no hedging preambles, no "I hope this helps". Write like the maintainer: terse, factual, direct.

This applies hardest to release notes and updater.json notes. That text ships to users.

## Product scope (read before suggesting features)

**North star:** the **downloader** is the wedge: reliable YouTube + local handling, **persistent downloads**, resumability/caching where it matters, and **performance**. Player, gallery, and polish support that story; do not chase general-purpose media apps.

**Mental model:**

- **Inputs:** YouTube URLs and user-provided video files. Rough edges on extensions/casing (e.g. iPhone `*.MP4` vs `*.mp4`) until scan logic is tightened. Fix when touched; do not re-scope around "every container on earth."
- **Player:** watch what you already downloaded; not the competitive wedge.
- **Media view:** convenient local library on downloaded/scanned files. Secondary to downloader quality.
- **Explorer webview:** cookie/session flows for yt-dlp (age-restricted, members-only). Not a casual in-app browser. uBlock payload under `src-tauri` is experimental until verified end-to-end.
- **Explorer chrome (mandatory):** the child webview paints on top of the main-column DOM. Do not put explorer actions on tab bulges or in the content column.
  - **Only valid chrome:** top title band (`h-10`, `z-[100]`), same layer as `WindowControls` in `App.tsx`.
  - **Left cluster:** back/forward/reload via `ExplorerTitlebarNav`, `fixed top-0`, flush at sidebar-to-content seam (`left: 80px` collapsed / `240px` expanded; `transition-[left]` must match sidebar animation). Wired from `App.tsx`.
  - **Right cluster:** `WindowControls` (`fixed top-0 right-0`): download queue, mini player, window controls.

**How to advise:** ground recommendations in what RuForge already is. Avoid feature creep and "compete with X" pivots unless Angel widens scope. Live priorities: `STATE.md` (`Next 3`, `Open P0`) + `website/src/content/roadmap.json`. Archived ideas: `docs/ruforge/RuForge.md` (stale).

## Website SEO and AI discoverability

Before any website SEO, structured data, copy, or distribution change: read [`docs/ruforge/research/google-seo-and-domain-strategy.md`](docs/ruforge/research/google-seo-and-domain-strategy.md) and [`docs/ruforge/research/ai-llm-discoverability.md`](docs/ruforge/research/ai-llm-discoverability.md). Live artifacts: `website/public/robots.txt`, `website/public/llms.txt`, page JSON-LD in `website/src/pages/`.

**Forbidden language** on the public website, JSON-LD, meta tags, README, or release notes: "bypass", "rolling cipher", "circumvention", "DRM", "rip", "stream-rip", "unlock content", "any video any site". Use instead: "download for offline viewing", "local media library", "personal archive", "yt-dlp frontend".

**Framing:** lead with "open-source media library", "yt-dlp GUI", "Tauri desktop app", not "YouTube downloader" as the primary noun. Never fabricate `aggregateRating` in SoftwareApplication JSON-LD.

## Planning pointers

- **Shipped log (this file, bottom):** mandatory capture for every behavior change. See Shipped log section.
- **Companion:** `docs/ruforge/plans/companion-action-plan.md` + `docs/agents/COMPANION-AND-COMPETITOR-INDEX.md`.
- **Version graph:** `docs/agents/release/versioner.html` + `docs/agents/release/versions/version-<semver>.json`. Drained at release only (step 8). `docs/changes.html` is not in the repo.
- **Dynamic Island:** `src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`. Extend that file; do not duplicate island rules here.
- **Machine plans:** `docs/ruforge/plans/`. Optional local plans under `%USERPROFILE%\.cursor\plans\` are not repo truth.

## Who does what (this workspace vs elsewhere)

| Role | Environment | Scope |
|------|-------------|--------|
| **Chad** (default agent in Cursor) | Cursor, this workspace | **Logic only:** TypeScript / React behavior, state, Tauri wiring, bug fixes, refactors. Small `.ts` / `.tsx` edits in scope when they touch behavior, types, or data flow. Not pure styling passes. |
| **Jim** (Gemini) | Your CLI or Antigravity. **Not** Cursor | **Visuals only:** layout, typography, color, motion, component styling. **No** business logic, state machines, or store changes. |

**Chad/Jim** are Cursor/Gemini nicknames. Other agents use the same logic-vs-visuals split.

**Handoff rule:** If something needs Jim's pass (pure UI polish), Chad ends with a **short, copy-paste prompt for Jim's environment** (file paths, desired look, explicit "do not change logic or props contracts").

**Release handoff (Angel vs agent):** On ship / release / push it out, **Angel runs the signed Windows build only** (`Build-signed-windows.bat` or `npm run build:signed`); the private key must not leave the machine. The agent does everything else: version bumps, `updater.json`, commit + push to `main`, `gh release create`, Shipped log / STATE.md / graph surfaces, live `updater.json` verification. Do not ask Angel to create the GitHub Release, write release copy, tag, or push unless `gh` auth is missing or push fails.

## Agent editing guardrails (mandatory)

**Edit source in place. Never "patch via script."**

- Do not create or run ad-hoc Python, Node, or shell scripts to search/replace repo source. Use normal edit tools on the real file in small, reviewable hunks.
- `scripts/` is for intentional maintainer tooling only. Do not add agent-generated patch scripts there.
- Do not run `git checkout` / `git restore` on source files when the user may have uncommitted work. Repair forward; ask Angel before any git operation that discards working-tree content.

## Code quality (summary)

High-priority code style: avoid comments in code files unless they are genuinely needed. Comments must explain why, never what. Delete narrator comments, commented-out code, block headers for obvious code, step markers, and AI-voice patterns. Prefer names, structure, extraction, and tests over comments. Then apply the usual thresholds: extract components/hooks/helpers before files become monoliths (~120 JSX lines, shared helpers, deep nesting); Tailwind + CSS tokens in `global.css`; no css-in-js; inline `style={}` only for dynamic values.

Full thresholds and examples: [`docs/agents/AGENT-REFERENCE.md`](docs/agents/AGENT-REFERENCE.md). Visual rules: `.cursor/rules/design-style*.mdc`.

## Stack, versions, builds

- **Stack:** Tauri v2, Rust, React 19, TypeScript, Zustand, yt-dlp, Tailwind v4. Two webviews (main + mini); Zustand does not span webviews; cross-window sync is Tauri emit/listen only.
- **Versions (must match on every bump):** `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package] version` (+ `Cargo.lock` when crate version changes). Past failure: `Cargo.toml` behind JS/Tauri version.
- **Builds:** `npm run build` (web); `npm run tauri build` (desktop installer).
- **Dev loop (normal entry point):** `npm run dev:app`. Runs the Companion asset watcher plus `tauri dev` and shuts both down on exit. `npm run tauri dev` still works unchanged when the Companion watcher is not wanted. Companion assets are read from disk in debug builds, so a Companion edit plus browser refresh needs no Rust rebuild.
- **Dev maintenance:** `npm run dev:disk` (read-only size report), `npm run dev:clean:safe` (dry run unless `-Apply`; switches `-Incremental`, `-WebsiteDist`, `-NpmCache`), `npm run dev:rust-recover` (one non-incremental build; use when Rust leaf rebuilds roughly double because the ReFS Dev Drive incremental session stops finalizing, see rust-lang/rust#151181). Full symbols on demand: `cargo build --profile debugging`.
- **Large binaries:** do not commit `src-tauri/binaries/ffmpeg-*` / `ffprobe-*` unless LFS policy exists. Typical junk: `.cursor/`, ad-hoc archives like `ffmpeg.7z`.

## Auto-updater (essentials)

Release-blocking rules only. Full detail: [`docs/agents/AGENT-REFERENCE.md`](docs/agents/AGENT-REFERENCE.md).

- Users receive updates when live `updater.json` on `main` has a **higher version** than the running app.
- `signature` in `updater.json` must be the **base64 contents** of the `.sig` file, never a path or URL. Wrong value breaks every install silently.
- GitHub download `url` tag segment must match the exact release tag (e.g. `v0.2.1`).
- Copy: short teaser in `UpdaterMainOverlays`; fuller post-install via structured `notes` JSON. Do not paste long changelog blobs into `updater.json`.
- **Angel only** runs signed release builds. Agents read `.sig` from `src-tauri/target/release/bundle/nsis/` after the build.

Changelog / version-graph authoring: [`docs/agents/release/CHANGELOG-AUTHORING.md`](docs/agents/release/CHANGELOG-AUTHORING.md) (release ritual step 8 only).

## Shipped log

**Why this exists:** Updates were getting lost because the only places to record them lived in `docs/`. Files Chad has no reason to open during a bug fix. This log lives **here, in the file you already read every task**, so there is zero distance between finishing work and recording it. Distance is what kills logging, not effort.

**The rule (non-negotiable):**

- **Any change to shipped runtime behavior gets ONE appended line under the current `### vX.Y.Z (unreleased)` block, before the task is considered done.** Not after release. Not "I'll batch it." Now, as the last action of the change.
- **Vague input is not an excuse to skip.** "Log that we fixed the sidecar thing" means you append one line under the current version. There is nothing to decide: no schema, no file to create, no format. Append. Done. If you find yourself thinking "what format / where / does this need fields", stop. That hesitation is the bug; it is one sentence appended here.
- **Format per line:** `- **Area**: what changed, plainly. `relevant.ts` / `file.rs` if useful.` Past tense, user-or-dev-visible, one sentence. Mirror the density of the Finch log if you've seen it: terse, factual, no marketing.
- **Newest version block on top, inside this section.** Newest line on top within a block.
- **Do NOT create per-change files or per-version folders.** That reintroduces the exact distance/ceremony this section deletes. The flat block IS the system. Editing this file every time is fine. Finch does exactly this and never misses; editing was never the friction, distance was.
- **`### vX.Y.Z (unreleased)`** is the live block during a cycle. At release, the ritual (below) drains it to graph surfaces, then **deletes** it from this file and opens a fresh empty `(unreleased)` block.
- **Do NOT keep `(shipped)` blocks here.** After release ritual step 8, shipped history lives only in `docs/agents/release/versions/version-<semver>.json` and `docs/agents/release/versioner.html`. Keeping old blocks bloats every agent read for no benefit.

**This block is the single source for release notes and the graph surfaces.** At push time the whole `(unreleased)` block is read once and drained (see Release ritual). That is the only time the version JSON / `versioner.html` registry get touched. Prefer one line per user-visible feature or fix; batch incremental polish passes into one line instead of ten `(fix)` breakpoints.


### v0.2.3 (unreleased)

- **Library**: `get_library_snapshot` serves the published desktop projection when ready (join in-flight, force only on invalidate/dirs/sweep); Companion probe no longer holds `reindex_lock`. `library_state.rs` / `commands.rs` / `ruforgeStore.ts`
- **Library**: Cold Video Library open single-flights the gallery fetch so StrictMode remounts and `library-changed` cannot discard the early desktop snapshot. `galleryColdFetch.ts` / `ruforgeStore.ts` / `App.tsx`
- **Library**: Video Library paints after the disk walk (Companion ffprobe no longer blocks the snapshot); storage cleanup confirm stacks above the fullscreen modal with delete progress and incremental gallery removes (no post-delete full rescan). `library_state.rs` / `AuthorizeCleanupModal.tsx` / `overlayZIndex.ts`
- **Player**: YouTube-style video end flow on main and mini: unwatched-first suggestion cards at T-15s (hover lift + dim), video/audio fade in the last 5s, then a single Up next card with Cancel / Play now. `VideoEndScreen.tsx` / `videoEndScreenSuggestions.ts` / `PlayerView.tsx` / `MiniPlayer.tsx`
- **Player**: Chapter scrubber knob no longer sits left of the pointer (Tailwind `translate` was stacking with the inline `transform`). `ChapterScrubber.tsx`

## Release ritual

**Why this exists:** "Push and commit everything" is ambiguous to an agent. The failure mode (observed): Chad invented a feature branch, committed there, and stranded `updater.json` off `main`. Then produced a flawless postmortem of the problem it had just caused. Chad's knowledge was never the gap. The gap was no defined, ordered, verified sequence. This is that sequence.

**Trigger:** Angel says ship / release / push it out. Run these steps **in order, top to bottom.** Do not reorder, do not skip, do not parallelize.

**Angel vs agent (default):** See **Release handoff** under **Who does what**. Angel runs the signed build only; the agent owns GitHub (`gh`), commits, tags, and release copy.

**Hard rule (branching):** RuForge is a solo-dev repo. **All release commits go directly to `main`.** Do **not** create, switch to, or commit on any branch for a release. If you are not on `main`, stop and say so. Do not "fix" it with git surgery on a possibly-dirty tree; ask Angel.

1. **Drain the Shipped log -> version bump decision (+ onboarding gate).** Read the entire `### vX.Y.Z (unreleased)` block. **Do not default to patch +1.** Apply the sizing rule below, state the chosen version and why in one line in the release report (step 10), then run the onboarding gate on the same block.

   **Version sizing rule (pre-1.0, semver):**

   - **PATCH** (`0.M.(N+1)`): bug fixes, polish, refactors, and behavior tweaks on existing public surfaces. PATCH may also include internal `#[tauri::command]` wiring, internal persisted config migrations, and backend authority refactors when they preserve an existing normal-user surface (same tab, same workflow, no new headline feature).

   - **MINOR** (`0.(M+1).0`, reset patch to 0): the unreleased block contains **any** of: a new normal-user surface or user-visible workflow, a new user-facing Settings control or persisted key users set themselves, a new on-disk sidecar schema users rely on, or a public feature with release-note headline status (rule of thumb: **3+ distinct public addition bullets**, or **one headline feature** such as a new mode tab, new download UX, or new sidecar type).

   - **Developer-gated unfinished surfaces** (e.g. behind `showDebuggingSettings`, not in release notes or onboarding): do **not** count toward public semver sizing.

   - **MAJOR**: not used until 1.0. Do not bump to `1.0.0` without an explicit Angel decision.

   **How to decide in practice:** Scan the unreleased block for **public** MINOR triggers only. Exclude dev-gated and internal-only rows. If count >= 1, bump minor and zero patch. If count = 0, patch +1. When in doubt between patch and minor for **user-visible** work, choose **minor** for pre-1.0 headline features.

   **Onboarding gate:** Any new user-facing feature that needs a walkthrough must have a row in `src/lib/onboardingSteps.ts` with `introducedIn` matching the chosen release version. Full contract: [`docs/agents/AGENT-REFERENCE.md`](docs/agents/AGENT-REFERENCE.md). If warranted and missing, ask Angel before continuing. Bug-fix-only releases add no steps.

2. **Bump all three version files together:** `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package] version`. Confirm all three match.

3. **Prep `updater.json` notes (agent, before build).** Structured JSON in `notes`: markdown teaser + `additions` and `fixes` arrays. Set `version`, `url` (`.../releases/download/v<semver>/RuForge_<semver>_x64-setup.exe`), leave `signature` empty until step 5.

4. **Signed build (Angel only).** Angel runs `Build-signed-windows.bat` or `npm run build:signed`. Agent reads NSIS `RuForge_<semver>_x64-setup.exe.sig` under `src-tauri/target/release/bundle/nsis/`.

5. **Finish `updater.json` (agent).** Paste `.sig` base64 into `signature`, set `pub_date`. The `signature` value is the literal base64 CONTENTS of the `.sig` file, never a path or URL. That mistake breaks every install silently.

5b. **Sync website release assets (agent).** Run `npm run prep:website-release` from repo root (requires signed NSIS). Use `npm run prep:website-release:changelog-only` if the signed build is not ready yet.

6. **Commit + push to `main` (agent).** Confirm branch is `main`. Commit MUST include `updater.json`, all three version files, generated website changelog when applicable, and any unreleased code. Push to `origin main`. State the pushed commit hash.

7. **GitHub Release (agent, `gh`).** Tag **`v<semver>`** must match the `updater.json` download path. Upload NSIS `.exe` (required). MSI optional. Do not attach `.sig` files. WinGet Releaser action opens manifest PRs when installed.

8. **Drain Shipped log -> graph surfaces AND roll STATE.md (scoped, this step only).**
   a. Append released changes into `docs/agents/release/versions/version-<semver>.json` (see CHANGELOG-AUTHORING.md). Add registry row in `docs/agents/release/versioner.html`.
   b. In AGENTS.md: drain the `(unreleased)` block, **delete** it, open fresh `### v<next> (unreleased)` block. No `(shipped)` blocks here.
   c. In STATE.md: set `Last shipped to users:` to the version just released; set `Shipping version:` to next unreleased; move shipped lines into closed release section; refresh Now, Next 3, Open P0; update `Last updated:`.
   d. In `website/src/content/roadmap.json`: flip matching entries to `"status": "Finished"`. List every entry flipped or write "No roadmap entries to flip."
   STATE.md and the AGENTS.md Shipped log must agree after this step.

9. **HARD BLOCK: verify live, or it did not ship.** Fetch `https://raw.githubusercontent.com/UnboundAngel/RuForge/main/updater.json`
   - Response body PARSES as JSON.
   - Parsed `version` EQUALS the version you just released.
   - `platforms.windows-x86_64.signature` is a long base64 string, not a path, URL, or empty.
   If any check fails, the release FAILED. Committed != live on `main`.

10. **Report.** Chosen version + rationale, pushed commit hash, GitHub Release URL, live `version` from step 9, confirmation Release asset matches `updater.json` `url`.

**If any step fails, stop at that step and report the failure plainly. Do not continue and do not claim partial success as success.**
