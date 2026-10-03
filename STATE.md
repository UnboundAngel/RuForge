# RuForge: STATE

> Live cursor. Mint reads this FIRST, then `AGENTS.md`. Update LAST after user-visible app behavior that will ship. If this file and the code disagree, the code wins: fix this file forward. Never git-restore a dirty tree to match it.

Shipping version: 0.5.1 (unreleased)

Last shipped to users: 0.5.0

Last updated: 2026-10-02 (Unreleased log)

Status: 0.5.0 live on GitHub and updater.json (release https://github.com/UnboundAngel/RuForge/releases/tag/v0.5.0, tag on public snapshot `988e34c`). Version files still read 0.5.0; bump at the next release. Companion still developer-gated on localhost. Local Vite binds 1430 (HMR 1431) so it does not collide with Finch on 1420. Website Astro is pinned to 4321.

Closed release notes for 0.5.0 and earlier: `docs/agents/release/versions/`. Do not paste them back into this file.

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

0.5.0 shipped: library home and creator pages, follow + notification center, music playlists, recommendations and screenshot import, desktop island, download lifecycle hardening, and the follow-creators and playlist-import onboarding tips (every tip dismissible). Drained into `docs/agents/release/versions/version-0.5.0.json`; roadmap `unreleased` rows flipped to shipped on sync (public website picks them up at the next website publish).
Rust tests the app crate cannot run (`cargo test` crashes with STATUS_ENTRYPOINT_NOT_FOUND) live in `src-tauri/test-harness/`; see its README.
Unlanded July companion work (log.rs, trace_log.rs, routes.rs) was a local stash; backed up to sync branch `backup/companion-stash-2026-07-03`, not merged.
Linux: local `tauri dev` only (asset scopes + `src/platformPaths.ts`). Not a shipped target. Windows dev: `npm run dev:app` (Vite on 1430). Website: `npm run dev` in `website/` (Astro on 4321).

## Open P0 (blocks release)

None.

## Next 3 (priority order)

1. Playlist import Phase 2: CLI entry (roadmap "import playlists with one terminal command", in progress).
2. Download history log in the title bar bell (roadmap "a history of everything you've downloaded").
3. Opt-in crash reports.

## Notes (not P0)

- Codex stays out of app implementation by default. Use it for CI, GitHub, Cursor prompts, and review summaries. Codex chats: `docs/agents/codex/AGENTS.md`.
- SponsorBlock is integrated; master toggle on by default.
- Authorize Cleanup is shipped (`AuthorizeCleanupModal` + `delete_media_batch`). Legacy `authorize_cleanup` is unused. Do not list this as broken.
- `docs/changes.html` is not in the repo. Version graph: `docs/agents/release/versioner.html` + `docs/agents/release/versions/`.
- Companion is in tree but dev-gated (`showDebuggingSettings`). V1 is localhost only. Scope: `docs/ruforge/plans/companion-action-plan.md`.
- Release ordering learned on 0.5.0: draft the GitHub Release with the installer before the public snapshot, publish it right after, so the live `updater.json` never points at a missing asset.
