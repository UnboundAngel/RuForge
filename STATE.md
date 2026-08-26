# RuForge: STATE

> Live cursor. Mint reads this FIRST, then `AGENTS.md`. Update LAST after user-visible app behavior that will ship. If this file and the code disagree, the code wins: fix this file forward. Never git-restore a dirty tree to match it.

Shipping version: 0.3.1 (unreleased)

Last shipped to users: 0.3.0

Last updated: 2026-08-26 (Unreleased log)

Status: 0.3.0 live on GitHub and updater.json. 0.3.1 in tree: Settings popup, Discord presence (gated 0.4.0 / Debugging), SponsorBlock learning, downloader hero. Companion still developer-gated on localhost.

Closed release notes for 0.3.0 and earlier: `docs/agents/release/versions/`. Do not paste them back into this file.

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

Settings is a centered popup with categorized top tabs and search. Discord Rich Presence is in tree (reload fix landed). Before public Discord ship: staleness guard (Next 1). Companion Browser V1 remains gated. Other priorities: storage cap, main-app nav restructure.

Linux: local `tauri dev` only (asset scopes + `src/platformPaths.ts`). Not a shipped target. Windows dev: `npm run dev:app`.

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. Discord Rich Presence staleness guard: clear presence if no snapshot within N×15s (destroyed main webview can leave a stale card). Land before Discord ships to users.
2. Storage cap before enqueue (#10). Block when estimate exceeds free disk.
3. Main-app nav restructure: RuForge | Movies & Shows | Music mode switcher + MoviesShowsShell.

## Notes (not P0)

- Codex stays out of app implementation by default. Use it for CI, GitHub, Cursor prompts, and review summaries. Codex chats: `docs/agents/codex/AGENTS.md`.
- P2 mid-download 403 was not reproduced on CLI without cookies. Fix adds yt-dlp retries, resume-on-retry, and clearer 403 copy. Re-test in-app at 720p with cookie mode on https://www.youtube.com/watch?v=rkdzxRaI68g.
- Music Explore: Download Playlist disables only on local `downloadingPlaylist`, not when the queue already has jobs for that playlist. Cosmetic, not a blocker.
- SponsorBlock is integrated; master toggle on by default.
- Authorize Cleanup is shipped (`AuthorizeCleanupModal` + `delete_media_batch`). Legacy `authorize_cleanup` is unused. Do not list this as broken.
- `docs/changes.html` is not in the repo. Version graph: `docs/agents/release/versioner.html` + `docs/agents/release/versions/`.
- Companion is in tree but dev-gated (`showDebuggingSettings`). V1 is localhost only. Scope: `docs/ruforge/plans/companion-action-plan.md`.
