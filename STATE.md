# RuForge: STATE

> Live cursor. Mint reads this FIRST, then `AGENTS.md`. Update LAST after user-visible app behavior that will ship. If this file and the code disagree, the code wins: fix this file forward. Never git-restore a dirty tree to match it.

Shipping version: 0.5.0 (unreleased)

Last shipped to users: 0.4.0

Last updated: 2026-10-02 (Unreleased log)

Status: 0.4.0 live on GitHub and updater.json. 0.5.0 staged on sync main: version files bumped (package.json, package-lock.json, tauri.conf.json, Cargo.toml, Cargo.lock), notes drafted, not released. Companion still developer-gated on localhost. Local Vite binds 1430 (HMR 1431) so it does not collide with Finch on 1420. Website Astro is pinned to 4321.

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

v0.5.0 release prep. The v0.5 download-lifecycle audit sweep is done: fix passes 1 to 4 plus the pre-release job-lifetime check are on sync main (D1 to D7, M1 to M4, O1, rehydration failed state, push trigger messages, companion remux). Version is bumped to 0.5.0 everywhere and the release notes are drafted in `docs/agents/release/notes-0.5.0.json` (updater.json `notes` shape: teaser + additions + fixes). Unreleased log has 59 entries.
Channel watchlist + notification center, library home rework, music playlists and playlist import are merged to main and ship in 0.5.0.
Rust tests the app crate cannot run (`cargo test` crashes with STATUS_ENTRYPOINT_NOT_FOUND) live in `src-tauri/test-harness/`; see its README.
Unlanded July companion work (log.rs, trace_log.rs, routes.rs) was a local stash; backed up to sync branch `backup/companion-stash-2026-07-03`, not merged.
Linux: local `tauri dev` only (asset scopes + `src/platformPaths.ts`). Not a shipped target. Windows dev: `npm run dev:app` (Vite on 1430). Website: `npm run dev` in `website/` (Astro on 4321).

## Open P0 (blocks release)

None. The 0.5.0 onboarding gate is closed: `follow-creators` and `playlist-import` island tips in `src/lib/onboardingSteps.ts` (contextual `showWhen`, per-step done set alongside the version marker).

## Next 3 (priority order)

1. Finish the 0.5.0 release in the order under **Release sequence (0.5.0)** below. Not started.
2. After release: drain into `docs/agents/release/versions/version-0.5.0.json`, roll STATE, flip roadmap entries.
3. Playlist import Phase 2: CLI entry.

## Release sequence (0.5.0)

Skill: `.cursor/skills/ruforge-release/SKILL.md`. Steps 1 and 2 (version pick, bump) are done. The signing key never leaves the desktop. Stop and report on any failure.

**Angel, on the desktop**

1. `git fetch sync && git checkout main && git pull sync main`. Confirm HEAD matches `sync/main` and the tree is clean.
2. `npm install` (the 0.5.0 bump touched `package-lock.json`).
3. `Build-signed-windows.bat` (or `npm run build:signed`).
4. Confirm both exist under `src-tauri/target/release/bundle/nsis/`: `RuForge_0.5.0_x64-setup.exe` and `RuForge_0.5.0_x64-setup.exe.sig`. If Mint finishes on another machine, copy those two files over. They are not secret; the key stays put.

**Mint, after the build (on `main`, push to `sync` only until step 9)**

5. `updater.json`: `version` `0.5.0`; `notes` = `docs/agents/release/notes-0.5.0.json` (teaser string + `additions` + `fixes`); `url` `https://github.com/UnboundAngel/RuForge/releases/download/v0.5.0/RuForge_0.5.0_x64-setup.exe`; `signature` = the `.sig` file contents (base64, never a path); `pub_date` = now, UTC ISO.
6. `npm run prep:website-release` (needs the signed NSIS on the same machine; else `npm run prep:website-release:changelog-only`).
7. Commit `updater.json` + website release output with `node scripts/triggers/run.mjs "commit and push" -m "Release: v0.5.0"`. Confirm `sync/main` HEAD.
8. Draft the GitHub Release on `UnboundAngel/RuForge`: `gh release create v0.5.0 --repo UnboundAngel/RuForge --draft --title "RuForge 0.5.0" --notes-file <notes md>` with `RuForge_0.5.0_x64-setup.exe` attached (no `.sig`). Draft first so the installer is uploaded before the live `updater.json` points at it.
9. Public snapshot: `node scripts/setup-git-remotes.mjs`, `git fetch sync main`, `git fetch public main`, dry-run, then `RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "Release: v0.5.0"`. Record the snapshot hash.
10. Publish the release on that commit: `gh release edit v0.5.0 --repo UnboundAngel/RuForge --target <snapshot hash> --draft=false`. Confirm tag `v0.5.0` and the asset name match the `updater.json` `url`.
11. Live verify (hard block): `https://raw.githubusercontent.com/UnboundAngel/RuForge/main/updater.json` parses, `version` is `0.5.0`, and the signature is long base64. Download the release asset URL once to confirm it resolves.
12. Drain: `docs/agents/release/versions/version-0.5.0.json` + `versioner.html` row, roll STATE (`Last shipped to users` 0.5.0, `Shipping version` 0.5.1), flip finished `website/src/content/roadmap.json` entries. Commit and push to `sync`.

## Notes (not P0)

- Codex stays out of app implementation by default. Use it for CI, GitHub, Cursor prompts, and review summaries. Codex chats: `docs/agents/codex/AGENTS.md`.
- SponsorBlock is integrated; master toggle on by default.
- Authorize Cleanup is shipped (`AuthorizeCleanupModal` + `delete_media_batch`). Legacy `authorize_cleanup` is unused. Do not list this as broken.
- `docs/changes.html` is not in the repo. Version graph: `docs/agents/release/versioner.html` + `docs/agents/release/versions/`.
- Companion is in tree but dev-gated (`showDebuggingSettings`). V1 is localhost only. Scope: `docs/ruforge/plans/companion-action-plan.md`.
