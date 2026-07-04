# RuForge Companion V1 continuation handoff

Use this to start a new Cursor chat in this repo and continue RuForge Companion.

Repo:
`C:\Random things i dont want deleted\Utils\neotube`

## Start the new Cursor chat

Paste this first:

```text
Continue in this repo with RuForge Companion V1.

Do not re-read auto-loaded AGENTS context unless a specific task needs it.
Use docs/ruforge/plans/companion-action-plan.md as the current Companion scope
document. Live code still wins over stale docs.

Do not do manual app-testing tasks. Run code checks when useful. If app-level
validation is needed, end with a short Angel manual-test checklist.
```

## Current state

- `main` is expected to be at `71a8fc6 feat: add ruforge.local same-PC dev experiment` unless Angel commits the current batch before resuming.
- Browser Companion V1 is dev-gated and same-PC only.
- V1 binds localhost / `127.0.0.1` only.
- V1 opens `http://localhost:<port>` and does not use `ruforge.local`.
- `ruforge.local` was tried, manually validated, judged not worth the workflow cost, then removed.
- Progress sync is implemented through authenticated `POST/GET /progress/:id`.
- Companion HTTP uses media IDs only. Rust resolves IDs to trusted desktop paths internally.
- Progress writes/readbacks bridge through Tauri events into `src/playbackStorage.ts`.
- Companion web was split from monolithic HTML into static files:
  - `src-tauri/companion-web/index.html`
  - `src-tauri/companion-web/styles.css`
  - `src-tauri/companion-web/app.js`
- Companion favicon uses `/assets/favicon.png`.

## Current uncommitted batch

Expected dirty files from this pass:

- `AGENTS.md`
- `STATE.md`
- `docs/ruforge/plans/companion-action-plan.md`
- deleted `docs/ruforge/research/ruforge-local-experiment.md`
- `src-tauri/companion-web/index.html`
- new `src-tauri/companion-web/app.js`
- new `src-tauri/companion-web/styles.css`
- new `src-tauri/companion-web/favicon.png`
- `src-tauri/src/companion/commands.rs`
- deleted `src-tauri/src/companion/local_name.rs`
- `src-tauri/src/companion/mod.rs`
- `src-tauri/src/lib.rs`
- `src/components/settings/CompanionSettingsSection.tsx`

Do not assume other dirty files are intentional. Inspect `git status --short`
before committing.

## Verified so far

- `cargo check` passed after removing the `ruforge.local` experiment.
- `npm run build` passed after the Companion split, app.js cleanup, favicon fix,
  and `ruforge.local` removal.
- Angel manually validated the static Companion split and favicon path except for
  any later changes Cursor may make.

## What was deliberately dropped

- No `ruforge.local` V1.
- No hosts-file workflow.
- No mDNS.
- No LAN bind.
- No automatic hosts edits.

Keep localhost as the V1 browser entry point.

## Scope boundaries

Do not add:

- downloader UI in Companion
- URL entry
- remote enqueue
- YouTube UI
- uploads
- delete, move, rename, overwrite, or library mutation
- raw filesystem paths over Companion HTTP
- LAN bind or `0.0.0.0`
- mDNS / DNS-SD
- hosted services, telemetry, dependencies, framework, or bundler
- phone, TV, mobile sync, or away-from-home access

## Next up

Use the action plan. The current remaining Companion V1 items are:

- Decide whether `8787` remains the final V1 localhost default port.
- Add an indexing, cached catalog, pagination, incremental response, or similar
  local-first strategy so Companion does not take 60+ seconds on large libraries.
- Finish Music/Songs and other already-indexed local media type support promised
  by V1.
- Harden playback-startup failures so media errors stay inline when the server
  and session are healthy. Only network/session failures should enter the
  disconnected or session-lost gates.
- Decide whether session behavior after desktop restart is acceptable for public
  V1, or soften restart recovery without weakening auth.
- Review remaining LAN-shaped status fields and stale copy after V1 hardening.

Recommended next Cursor task:

```text
Continue RuForge Companion V1 from docs/ruforge/plans/companion-action-plan.md.

Implement the next scoped V1 item: large-library Companion load performance.

Goal:
Opening Companion on a large existing local library should not block for 60+
seconds. Keep Rust library authority. Optimize reads only.

Start by inspecting:
- src-tauri/src/library/
- src-tauri/src/companion/routes.rs
- src-tauri/companion-web/app.js
- src-tauri/src/companion/mod.rs

Task:
- Find why Companion library load is expensive on large libraries.
- Add or reuse an indexing / cached catalog / pagination / incremental response
  strategy that preserves media ID-only HTTP and does not give Companion scanning
  or mutation authority.
- Keep Videos and Music/Songs in scope.
- Do not add dependencies or change public scope.

Verification:
- Run code checks that are easy and relevant, such as cargo check and npm run
  build if touched.
- Do not perform manual app testing. End with a short Angel manual-test
  checklist if needed.

Final report:
- files changed
- what changed
- checks run
- brief Angel manual-test checklist
```

