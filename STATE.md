# RuForge: STATE

> Live cursor. Mint reads this FIRST, then `AGENTS.md`. Update LAST after user-visible app behavior that will ship. If this file and the code disagree, the code wins: fix this file forward. Never git-restore a dirty tree to match it.

Shipping version: 0.6.2 (unreleased)

Last shipped to users: 0.6.1

Last updated: 2026-10-03 (0.6.1 release)

Status: 0.6.1 live on GitHub and updater.json (release https://github.com/UnboundAngel/RuForge/releases/tag/v0.6.1, tag on public snapshot `f1b6f6c`). Version files read 0.6.1. Bundled yt-dlp 2026.08.19. From 0.6.0 on, the app checks `ruforge.app/updater.json` (Cloudflare Pages 302 to the GitHub raw file) with GitHub as the fallback; daily launch counts are in Cloudflare zone analytics filtered by path `/updater.json`. Companion still developer-gated on localhost. Local Vite binds 1430 (HMR 1431) so it does not collide with Finch on 1420. Website Astro is pinned to 4321.

Closed release notes for 0.6.1 and earlier: `docs/agents/release/versions/`. Do not paste them back into this file.

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

0.6.1 shipped (patch: fixes only): bundled yt-dlp 2026.08.19, newer of bundled vs AppData yt-dlp wins with spawns gated on the comparison, one updater.json request per launch (none in dev), telemetry removed. Drained into `docs/agents/release/versions/version-0.6.1.json`; no roadmap entries to flip.
Rust tests the app crate cannot run (`cargo test` crashes with STATUS_ENTRYPOINT_NOT_FOUND) live in `src-tauri/test-harness/`; see its README.
Unlanded July companion work (log.rs, trace_log.rs, routes.rs) was a local stash; backed up to sync branch `backup/companion-stash-2026-07-03`, not merged.
Linux: local `tauri dev` only (asset scopes + `src/platformPaths.ts`). Not a shipped target. Windows dev: `npm run dev:app` (Vite on 1430). Website: `npm run dev` in `website/` (Astro on 4321).

## Open P0 (blocks release)

None.

## Next 3 (priority order)

1. Playlist import Phase 2: CLI entry (roadmap "import playlists with one terminal command", in progress).
2. Download history log in the title bar bell (roadmap "a history of everything you've downloaded").

## Notes (not P0)

- Codex stays out of app implementation by default. Use it for CI, GitHub, Cursor prompts, and review summaries. Codex chats: `docs/agents/codex/AGENTS.md`.
- SponsorBlock is integrated; master toggle on by default.
- Authorize Cleanup is shipped (`AuthorizeCleanupModal` + `delete_media_batch`). Legacy `authorize_cleanup` is unused. Do not list this as broken.
- `docs/changes.html` is not in the repo. Version graph: `docs/agents/release/versioner.html` + `docs/agents/release/versions/`.
- Companion is in tree but dev-gated (`showDebuggingSettings`). V1 is localhost only. Scope: `docs/ruforge/plans/companion-action-plan.md`.
- Release ordering learned on 0.5.0: draft the GitHub Release with the installer before the public snapshot, publish it right after, so the live `updater.json` never points at a missing asset.
