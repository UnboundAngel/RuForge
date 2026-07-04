# Codex Memory

Appendable memory for Codex when working on RuForge as Angel's audit, prompt,
GitHub, and repo-readback agent.

Memory is not project truth. Always read `STATE.md`, root `AGENTS.md`, routed
repo docs, and live code first. If memory conflicts with repo truth, repo truth
wins and memory should be updated forward.

## Use Rules

- Use this file for prior context, prompt continuity, Codex behavior, branding
  memory, and imported ChatGPT or Claude memory reconciliation.
- Do not use this file instead of `STATE.md`, root `AGENTS.md`, or live code.
- Treat `stale` and `low` entries as historical hints only.
- Add new memory only when Angel explicitly asks or when maintaining this file
  is part of the task.
- Keep additions terse and source-labeled.

## Add Format

Append under `## Memory Log`:

```text
### YYYY-MM-DD

- confidence: high | medium | low | stale
- source: Angel | repo docs | Codex session | imported ChatGPT memory | imported Claude memory
- memory: <one durable fact>
- repo check: <repo file checked, or "not checked">
```

## Current Memory

### Project Shape

- confidence: high
- source: Angel plus repo docs
- memory: Angel is a solo builder who directs AI tools. Cursor is the primary
  implementation agent for logic and code. Jim handles visual-only work. Codex
  is the repo-aware audit, prompt, GitHub hygiene, and readback agent.
- repo check: `AGENTS.md`, `docs/agents/codex/AGENTS.md`

- confidence: high
- source: Angel plus repo docs
- memory: RuForge is a free, open-source, local-first Windows desktop media app
  built around yt-dlp, FFmpeg, Tauri v2, Rust, React, TypeScript, and a local
  media library. The downloader is the wedge.
- repo check: `STATE.md`, `AGENTS.md`

- confidence: high
- source: repo docs
- memory: Player, gallery, music, website, Discord, and Companion support the
  downloader story. Do not re-scope RuForge into Plex, VLC, a hosted downloader,
  a general browser, or a general media server.
- repo check: `AGENTS.md`

### Agent Workflow

- confidence: high
- source: imported Claude memory plus repo docs
- memory: For Cursor prompts, prefer short scoped prompts with read-first docs,
  file or area scope, forbidden scope, verification, and stop conditions. Avoid
  micromanaging implementation unless a real safety boundary exists.
- repo check: `docs/agents/codex/AGENTS.md`

- confidence: high
- source: imported Claude memory plus repo docs
- memory: When auditing Cursor output, evaluate whether it is a green light,
  has holes, or needs planning. Write an audit prompt when needed, not a fix
  prompt that assumes unverified root cause.
- repo check: `docs/agents/codex/AGENTS.md`, `docs/agents/skills/README.md`

- confidence: high
- source: imported Claude memory
- memory: Handoff prompts should include live session state only: completed work,
  open thread, blockers, and immediate next action. Do not restate `STATE.md`,
  root `AGENTS.md`, or stable project instructions.
- repo check: `docs/agents/codex/templates/handoff-template.md`

- confidence: high
- source: imported Claude memory plus repo docs
- memory: Research requests must use the research skill. Produce focused
  Google, Gemini, and Perplexity verification prompts before turning volatile
  external claims into recommendations.
- repo check: `docs/agents/codex/AGENTS.md`, `docs/agents/skills/README.md`

- confidence: high
- source: imported Claude memory plus repo docs
- memory: UI or visual tasks must route through Jim or the design skill. Jim
  must not change logic, state, props contracts, Rust, or data flow.
- repo check: `AGENTS.md`, `docs/agents/skills/README.md`

### Verification Rules

- confidence: high
- source: imported Claude memory plus repo docs
- memory: Code present does not mean code runs on the actual path. Verify the
  runtime path for render, provider, state, download, playback, and updater
  changes.
- repo check: `AGENTS.md`

- confidence: high
- source: imported Claude memory
- memory: `npm run build` does not catch every runtime render-path issue, such
  as provider boundary errors, missing providers, or state paths that never run.
- repo check: not checked this turn

- confidence: medium
- source: imported Claude memory
- memory: `cargo test` has historically been unreliable on Angel's Windows
  machine with `STATUS_ENTRYPOINT_NOT_FOUND`. Prefer targeted `cargo build`,
  direct invocation, or the repo's current verified command when that issue is
  present.
- repo check: not checked this turn

- confidence: high
- source: imported Claude memory plus repo docs
- memory: Root cause before fix. For unknown bugs, ask Cursor to gather evidence
  first. Temporary instrumentation must be removed before shipping the fix.
- repo check: `docs/agents/codex/AGENTS.md`, `docs/agents/skills/README.md`

### RuForge Invariants

- confidence: high
- source: Angel plus repo docs
- memory: Cross-window sync in RuForge must use Tauri emit/listen. Zustand and
  localStorage do not span the app's webviews in a reliable project-approved
  way.
- repo check: `STATE.md`, `AGENTS.md`

- confidence: high
- source: imported Claude memory plus repo docs
- memory: Version bumps must keep `package.json`, `src-tauri/tauri.conf.json`,
  and `src-tauri/Cargo.toml` aligned.
- repo check: `AGENTS.md`, `STATE.md`

- confidence: high
- source: imported Claude memory plus repo docs
- memory: Telemetry must stay gated behind `showDebuggingSettings`. Normal
  sessions should have no telemetry UI, collection, or network behavior unless
  the project explicitly changes that policy.
- repo check: `AGENTS.md`, `STATE.md`

- confidence: high
- source: imported Claude memory
- memory: yt-dlp progress `done` can happen before the muxed file exists on
  disk. Do not gate ffmpeg, scrub sprites, or file-dependent enrichment on that
  signal alone.
- repo check: not checked this turn

- confidence: high
- source: imported Claude memory
- memory: SponsorBlock fetches can key off video ID early. Scrub-sprite
  generation must wait for mux completion or actual file availability.
- repo check: not checked this turn

- confidence: high
- source: imported Claude memory
- memory: MusicBrainz enrichment must respect roughly one request per second,
  back off on HTTP 503, support cancellation, and avoid fixed-time scheduler
  patterns.
- repo check: not checked this turn

- confidence: medium
- source: imported Claude memory
- memory: aria2c high connection counts and yt-dlp concurrent fragments can
  conflict depending on stream type. Verify the actual stream before combining
  downloader concurrency knobs.
- repo check: not checked this turn

- confidence: high
- source: imported Claude memory
- memory: Do not copy GPL-3.0 code, including Navidrome code, into RuForge.
  Architecture references are fine. Reimplement cleanly.
- repo check: not checked this turn

### Companion

- confidence: high
- source: Angel plus repo docs
- memory: Companion is currently dev-gated. Public V1 scope is same-PC browser
  Companion on localhost only, with Videos and Songs, browser playback, and
  mandatory progress sync as the only write path.
- repo check: `STATE.md`, `docs/ruforge/plans/companion-action-plan.md`

- confidence: high
- source: repo docs
- memory: Current Companion code still has LAN binding and no progress write
  path. Treat that as implementation reconciliation, not shipped V1 permission.
- repo check: `STATE.md`, `docs/ruforge/plans/companion-action-plan.md`

- confidence: stale
- source: imported ChatGPT and Claude memory
- memory: Older Companion memory described LAN-first phone pull clients and TV
  browser/PWA streaming. Current V1 repo truth is localhost same-PC browser
  Companion only. LAN, phone, and TV are later or research-gated.
- repo check: `docs/ruforge/plans/companion-action-plan.md`

### Branding, Copy, And Distribution

- confidence: high
- source: Angel plus repo docs
- memory: Public RuForge copy should prefer safer framing such as
  `open-source media library`, `yt-dlp GUI`, `local-first media tool`,
  `personal media library`, `personal archive`, and `offline viewing`.
- repo check: `AGENTS.md`

- confidence: high
- source: Angel plus repo docs
- memory: Public RuForge copy must avoid DMCA-sensitive wording such as
  `bypass`, `rip`, `circumvention`, `DRM`, `unlock`, `stream-rip`, and broad
  claims like `any video any site`.
- repo check: `AGENTS.md`

- confidence: high
- source: imported Claude memory plus repo docs
- memory: Do not recommend Google Ads on YouTube downloader terms. Distribution
  should favor AlternativeTo, relevant awesome-list PRs, WinGet Releaser, and
  tailored Reddit posts when those moves are authorized.
- repo check: `AGENTS.md`

- confidence: high
- source: imported Claude memory plus repo docs
- memory: EV code signing should not be recommended as a SmartScreen bypass.
  Azure Trusted Signing is the current documented direction in repo guidance,
  but any pricing or eligibility claim must be verified before acting.
- repo check: `AGENTS.md`

- confidence: medium
- source: Angel memory
- memory: For public-facing preview work, Angel has preferred
  `C:\Random things i dont want deleted\Utils\neotube\public\ruforge-face.png`
  as the source image and wants metadata stripped before use.
- repo check: not checked this turn

### Sleepy And External Context

- confidence: medium
- source: imported Claude memory
- memory: Sleepy is a separate Discord bot project under
  `C:\Random things i dont want deleted\Utils\discord_bots\`. For Sleepy tasks,
  read its own context first, keep slash commands only, do not sync commands on
  startup, preserve `load_dotenv(override=True)`, and update Sleepy context last.
- repo check: `docs/agents/codex/context/external/sleepy-discord-bot.md`

- confidence: medium
- source: imported Claude memory
- memory: Sleepy is deployed on an Oracle Cloud Always Free Ubuntu VM with a
  systemd service. Treat IPs, IDs, keys, and private repo details as sensitive
  operational context, not RuForge app truth.
- repo check: `docs/agents/codex/context/external/sleepy-discord-bot.md`

### Stale Imported Snapshots

- confidence: stale
- source: imported ChatGPT memory
- memory: RuForge was remembered around version 0.1.4, with two daily users and
  a stable pre-1.0 core loop.
- repo check: superseded by `STATE.md`

- confidence: low
- source: imported ChatGPT memory
- memory: Older remembered features included built-in browser cookie profile,
  download queue, clipboard URL capture, watch-progress cards, hover scrub
  thumbnails, speed control, draggable subtitles, resume after restart, mini
  player, comments archive, hero art binding, four-state empty states,
  Cloudflare and SEO hardening, website optimization, dev artifact cleanup, and
  Reddit launch planning.
- repo check: not checked as a batch

## Memory Log

### 2026-07-04

- confidence: high
- source: Angel
- memory: Codex should treat this file as the procedural memory surface for
  RuForge-specific Codex context and add to it over time when explicitly asked.
- repo check: this file

- confidence: high
- source: imported Claude memory
- memory: Claude memories were compacted into agent-facing rules and durable
  facts. Filler, stale version state, and duplicated repo-doc facts were removed
  or marked stale.
- repo check: this file
