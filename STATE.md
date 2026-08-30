# RuForge: STATE

> Live cursor. Mint reads this FIRST, then `AGENTS.md`. Update LAST after user-visible app behavior that will ship. If this file and the code disagree, the code wins: fix this file forward. Never git-restore a dirty tree to match it.

Shipping version: 0.4.1 (unreleased)

Last shipped to users: 0.4.0

Last updated: 2026-08-30 (shipped 0.4.0)

Status: 0.4.0 live on GitHub and updater.json. Settings popup, download rail dock, virtual playlists, lyrics / Now Playing rail, Discord Rich Presence, accent picker shipped. Companion still developer-gated on localhost.

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

0.4.0 is out. Next focus: storage cap before enqueue, main-app nav restructure, website marketing polish after screenshots.

Linux: local `tauri dev` only (asset scopes + `src/platformPaths.ts`). Not a shipped target. Windows dev: `npm run dev:app`.

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. Storage cap before enqueue (#10). Block when estimate exceeds free disk.
2. Main-app nav restructure: RuForge | Movies & Shows | Music mode switcher + MoviesShowsShell.
3. Website hero / marketing pass (3-slide screenshots already in tree).

## Notes (not P0)

- Codex stays out of app implementation by default. Use it for CI, GitHub, Cursor prompts, and review summaries. Codex chats: `docs/agents/codex/AGENTS.md`.
- P2 mid-download 403 was not reproduced on CLI without cookies. Fix adds yt-dlp retries, resume-on-retry, and clearer 403 copy. Re-test in-app at 720p with cookie mode on https://www.youtube.com/watch?v=rkdzxRaI68g.
- Music Explore: Download Playlist disables only on local `downloadingPlaylist`, not when the queue already has jobs for that playlist. Cosmetic, not a blocker.
- SponsorBlock is integrated; master toggle on by default.
- Authorize Cleanup is shipped (`AuthorizeCleanupModal` + `delete_media_batch`). Legacy `authorize_cleanup` is unused. Do not list this as broken.
- `docs/changes.html` is not in the repo. Version graph: `docs/agents/release/versioner.html` + `docs/agents/release/versions/`.
- Companion is in tree but dev-gated (`showDebuggingSettings`). V1 is localhost only. Scope: `docs/ruforge/plans/companion-action-plan.md`.
