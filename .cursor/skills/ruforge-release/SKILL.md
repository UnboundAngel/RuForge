---
name: ruforge-release
description: >-
  Ordered RuForge public release ritual: version bump, updater.json, signed
  NSIS, commit to main, gh release, drain shipped.jsonl Unreleased, live updater
  verify. Use when Angel says ship, release, push it out, or when work is
  updater.json, gh release, WinGet, or a version bump for users.
---

# RuForge release

Run these steps **in order**. Do not skip, reorder, or parallelize. If a step fails, stop and report. Do not call a partial release a success.

**Branch:** all release commits go to **main**. If you are not on `main`, stop. Do not create a feature branch. Do not git-surgery a dirty tree; ask Angel.

**Angel vs Mint:** Angel runs the signed Windows build only. Mint owns GitHub, version files, `updater.json`, commit, tag, release copy, Unreleased drain, live verify.

Unreleased source of truth is `docs/agents/release/shipped.jsonl`, filtered by `STATE.md` `Shipping version`. Print it with `node scripts/shipped.mjs list`. Do not paste the log into STATE.

Changelog / version-graph field detail: [`docs/agents/release/CHANGELOG-AUTHORING.md`](../../docs/agents/release/CHANGELOG-AUTHORING.md). Read it at step 8 only.

## 1. Drain Unreleased → version bump (+ onboarding)

Run `node scripts/shipped.mjs list` and read that list. **Do not default to patch +1.** Do not open the whole JSONL unless search needs it (`node scripts/shipped.mjs find …`).

Pick the bump with [`.cursor/rules/version-bump.mdc`](../../rules/version-bump.mdc) (SemVer 2.0.0 mapped to RuForge: what counts as patch, minor, major, and what never counts). One public MINOR trigger means minor with patch 0; otherwise patch +1.

**Onboarding:** any new user-facing feature that needs a walkthrough must have a row in `src/lib/onboardingSteps.ts` with `introducedIn` matching the chosen version. Contract: `docs/agents/AGENT-REFERENCE.md`. If warranted and missing, ask Angel. Bug-fix-only releases add no steps.

State the chosen version and why in the step 10 report.

## 2. Bump all three together

`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package] version`. Confirm they match.

## 3. Prep `updater.json` (before build)

Structured `notes`: markdown teaser + `additions` and `fixes` arrays. Set `version`, `url` (`.../releases/download/v<semver>/RuForge_<semver>_x64-setup.exe`). Leave `signature` empty until step 5. Do not paste the whole Unreleased dump into `notes`.

## 3b. Refresh bundled yt-dlp (before build)

Replace `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe` with the latest upstream `yt-dlp.exe` so fresh installs never ship a stale extractor:

```
curl -fL -o src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe --version
```

`--version` must print the tag shown on https://github.com/yt-dlp/yt-dlp/releases/latest. Include the binary in the step 6 commit and state the version in the step 10 report.

## 4. Signed build (Angel only)

Angel runs `Build-signed-windows.bat` or `npm run build:signed`. Mint reads `RuForge_<semver>_x64-setup.exe.sig` under `src-tauri/target/release/bundle/nsis/`.

## 5. Finish `updater.json`

Paste `.sig` **file contents** (base64) into `signature`. Set `pub_date`. Never put a path or URL in `signature`.

## 5b. Website release assets

`npm run prep:website-release` from repo root (needs signed NSIS). `npm run prep:website-release:changelog-only` if the signed build is not ready.

## 6. Commit on sync + snapshot to public main

Confirm release work is on `sync` `main` (private source of truth). Commit must include `updater.json`, all three version files, the refreshed yt-dlp binary, generated website changelog when applicable, and unreleased code. Push that commit to **`sync` `main`** first.

Then publish a downstream snapshot (no private history) onto public:

```
node scripts/setup-git-remotes.mjs
git fetch sync main
git fetch public main
RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "Release: v<semver>"
```

Do not `git push public` of a sync branch. Record the snapshot commit hash from the script output.

## 7. GitHub Release

Create the release on **`UnboundAngel/RuForge`** (public). Tag **`v<semver>`** must match the `updater.json` download path. Upload NSIS `.exe` (required). MSI optional. Do not attach `.sig` files.

## 8. Drain Unreleased → graph + roll STATE

a. Append released changes into `docs/agents/release/versions/version-<semver>.json` (CHANGELOG-AUTHORING.md). Add registry row in `docs/agents/release/versioner.html`.

b. In `STATE.md`: set `Last shipped to users` to the version just released; set `Shipping version` to the next unreleased; refresh Now, Next 3, Open P0; update `Last updated`. Leave `shipped.jsonl` as-is (rows keep their `v`). The next cycle's `shipped:unreleased` follows the new Shipping version, so the list is empty until new `shipped:add` rows.

c. In `website/src/content/roadmap.json`: flip matching entries to `"status": "Finished"`. List every entry flipped or write "No roadmap entries to flip."

d. Republish the website so it picks up a-c. The roadmap's "coming in vX" label reads `STATE.md` `Shipping version` at build time, and the step 6 snapshot went out before the roll. Commit a-c to `sync` `main`, then:

```
git fetch sync main
git fetch public main
node scripts/publish-snapshot.mjs --dry-run
RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs "Release: v<semver> website and roadmap"
```

The dry-run must list only `STATE.md`, `docs/`, and `website/` paths. If app code shows up, stop and ask Angel.

Do not keep a second shipped log in AGENTS.md.

## 9. HARD BLOCK: live verify

Fetch `https://raw.githubusercontent.com/UnboundAngel/RuForge/main/updater.json`

- Body parses as JSON.
- Parsed `version` equals the version you just released.
- `platforms.windows-x86_64.signature` is a long base64 string, not a path, URL, or empty.

Then check the website:

```
node scripts/verify-website-release.mjs --wait 600
```

It must pass every row: `ruforge.app/updater.json`, the header "Latest" badge and JSON-LD version, both download pages' installer name, the changelog entry, and both roadmap pages' entries and next version. It retries for 10 minutes while Cloudflare Pages deploys.

If any check fails, the release failed. Committed != live on `main`.

## 10. Report

Chosen version + rationale, bundled yt-dlp version, pushed commit hash, GitHub Release URL, live `version` from step 9, website check result, confirmation the Release asset matches `updater.json` `url`.
