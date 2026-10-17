# RuForge: STATE

> Live cursor. Mint reads this FIRST, then `AGENTS.md`. Update LAST after user-visible app behavior that will ship. If this file and the code disagree, the code wins: fix this file forward. Never git-restore a dirty tree to match it.

Shipping version: 0.8.0 (unreleased)

Last shipped to users: 0.7.0

Last updated: 2026-10-16 (Unreleased log)

Status: 0.7.0 live on GitHub and updater.json (release https://github.com/UnboundAngel/RuForge/releases/tag/v0.7.0, tag on public snapshot `c3a626b`). Version files read 0.7.0. Bundled yt-dlp 2026.08.19. Installers are built with `RUFORGE_PUBLIC_BUILD=1`, so Games code stays out of public builds. From 0.6.0 on, the app checks `ruforge.app/updater.json` (Cloudflare Pages 302 to the GitHub raw file) with GitHub as the fallback; daily launch counts are in Cloudflare zone analytics filtered by path `/updater.json`. Companion still developer-gated on localhost. Local Vite binds 1430 (HMR 1431) so it does not collide with Finch on 1420. Website Astro is pinned to 4321.

Closed release notes for 0.7.0 and earlier: `docs/agents/release/versions/`. Do not paste them back into this file.

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

0.7.0 shipped: player Description tab, replay graph, section loops and frame zoom, rebindable shortcuts (Ctrl+/), black theme with accent and Compact density, library tags, mini player ghost mode, island filters, Zen cookies, and the reworked Settings panels. Drained into `docs/agents/release/versions/version-0.7.0.json`; roadmap flipped: rebindable shortcuts, consistent popups.
Rust tests the app crate cannot run (`cargo test` crashes with STATUS_ENTRYPOINT_NOT_FOUND) live in `src-tauri/test-harness/`; see its README.
Unlanded July companion work (log.rs, trace_log.rs, routes.rs) was a local stash; backed up to sync branch `backup/companion-stash-2026-07-03`, not merged.
Linux: local `tauri dev` only (asset scopes + `src/platformPaths.ts`). Not a shipped target. Windows dev: `npm run dev:app` (Vite on 1430). Website: `npm run dev` in `website/` (Astro on 4321).

## Open P0 (blocks release)

None.

## Planned for 0.8.0

Nothing open.

## Next 3 (priority order)

1. Playlist import Phase 2: CLI entry (roadmap "import playlists with one terminal command", in progress).
2. Download history log in the title bar bell (roadmap "a history of everything you've downloaded").
3. Window drag bug (Ruforge-priv#10), then clear the 0.7.0 build warnings (unused `NamedCount` re-export, `third_party_browser_args` in `hardware_acceleration.rs`).

## Notes (not P0)

- Now that 0.7.0 shipped: update the winget manifest `AppsAndFeaturesEntries` `Publisher` to `UnboundAngel` (installer `bundle.publisher` now sets it).
- WinGet: `UnboundAngel.RuForge` 0.6.1 is in moderator review at https://github.com/microsoft/winget-pkgs/pull/446178 (CLA signed, validation passed, opened 2026-10-03). Last checked: 2026-10-08 (open, waiting on a moderator; no activity since 2026-10-03). Check at most once every 3 days with `gh pr view 446178 -R microsoft/winget-pkgs --json state,labels,comments`, then update the date. A moderator comment needs Angel to reply. Once it merges, flip the roadmap item "install and update with WinGet" to Finished, update the README install section, and drop this note. Manifest lives on fork branch `UnboundAngel/winget-pkgs:UnboundAngel.RuForge-0.6.1`.

- Codex stays out of app implementation by default. Use it for CI, GitHub, Cursor prompts, and review summaries. Codex chats: `docs/agents/codex/AGENTS.md`.
- SponsorBlock is integrated; master toggle on by default.
- Authorize Cleanup is shipped (`AuthorizeCleanupModal` + `delete_media_batch`). Legacy `authorize_cleanup` is unused. Do not list this as broken.
- `docs/changes.html` is not in the repo. Version graph: `docs/agents/release/versioner.html` + `docs/agents/release/versions/`.
- Companion is in tree but dev-gated (`showDebuggingSettings`). V1 is localhost only. Scope: `docs/ruforge/plans/companion-action-plan.md`.
- Release ordering learned on 0.5.0: draft the GitHub Release with the installer before the public snapshot, publish it right after, so the live `updater.json` never points at a missing asset.
