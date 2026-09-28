# RuForge: STATE

> Live cursor. Mint reads this FIRST, then `AGENTS.md`. Update LAST after user-visible app behavior that will ship. If this file and the code disagree, the code wins: fix this file forward. Never git-restore a dirty tree to match it.

Shipping version: 0.4.1 (unreleased)

Last shipped to users: 0.4.0

Last updated: 2026-09-28 (Unreleased log)

Status: 0.4.0 live on GitHub and updater.json. Settings popup, download rail dock, virtual playlists, lyrics / Now Playing rail, Discord Rich Presence, accent picker shipped. Companion still developer-gated on localhost. Local Vite binds 1430 (HMR 1431) so it does not collide with Finch on 1420. Website Astro is pinned to 4321.

Closed release notes for 0.4.0 and earlier: `docs/agents/release/versions/`. Do not paste them back into this file.

## Unreleased

Do not paste bullets here. Log: `docs/agents/release/shipped.jsonl`.

Write `.shipped-entry.txt` (line 1: `Area: sentence.` then optional file lines), then:

```
node scripts/shipped.mjs add
node scripts/shipped.mjs amend
node scripts/shipped.mjs find keyword
node scripts/shipped.mjs list
```

Rules: root `AGENTS.md` → **How to log Unreleased**.

## Now

0.4.0 is out. App work pause-friendly. Website hero / marketing pass done for the 3-slide set. Storage cap before enqueue shipped (#10). Playlist import Phase 1 (prompt + paste JSON, review, save) merged to main; CLI entry is Phase 2. Library home rework landed (YouTube-style sections, Shorts shelves, channel avatars, feed mixed into the grid).
Channel watchlist + notification center is built on `feature/channel-watchlist` (PR #4), awaiting Angel's live QA.
Linux: local `tauri dev` only (asset scopes + `src/platformPaths.ts`). Not a shipped target. Windows dev: `npm run dev:app` (Vite on 1430). Website: `npm run dev` in `website/` (Astro on 4321).

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. Playlist import Phase 2: CLI entry.

## Notes (not P0)

- Codex stays out of app implementation by default. Use it for CI, GitHub, Cursor prompts, and review summaries. Codex chats: `docs/agents/codex/AGENTS.md`.
- SponsorBlock is integrated; master toggle on by default.
- Authorize Cleanup is shipped (`AuthorizeCleanupModal` + `delete_media_batch`). Legacy `authorize_cleanup` is unused. Do not list this as broken.
- `docs/changes.html` is not in the repo. Version graph: `docs/agents/release/versioner.html` + `docs/agents/release/versions/`.
- Companion is in tree but dev-gated (`showDebuggingSettings`). V1 is localhost only. Scope: `docs/ruforge/plans/companion-action-plan.md`.
