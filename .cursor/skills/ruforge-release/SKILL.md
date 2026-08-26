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

**PATCH** (`0.M.(N+1)`): bug fixes, polish, refactors, and tweaks on existing public surfaces. Internal command wiring and config migrations that keep the same user workflow also count as patch.

**MINOR** (`0.(M+1).0`, patch 0): any new normal-user surface or workflow, a new user-facing Settings control or persisted key, a new on-disk sidecar users rely on, or a headline public feature (rule of thumb: 3+ distinct public addition bullets, or one headline such as a new mode tab or download UX).

**Developer-gated** unfinished surfaces (`showDebuggingSettings`, not in notes or onboarding): do not count toward public semver.

**MAJOR:** not until 1.0. Do not bump to `1.0.0` without Angel.

Scan Unreleased for **public** MINOR triggers only. If count >= 1, minor and zero patch. Else patch +1. When in doubt on user-visible headline work, choose minor.

Ignore Unreleased lines that are unreleased-only bugfixes folded into a feature. `Fix` in notes means users of the **previous public version** will feel the fix.

**Onboarding:** any new user-facing feature that needs a walkthrough must have a row in `src/lib/onboardingSteps.ts` with `introducedIn` matching the chosen version. Contract: `docs/agents/AGENT-REFERENCE.md`. If warranted and missing, ask Angel. Bug-fix-only releases add no steps.

State the chosen version and why in the step 10 report.

## 2. Bump all three together

`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package] version`. Confirm they match.

## 3. Prep `updater.json` (before build)

Structured `notes`: markdown teaser + `additions` and `fixes` arrays. Set `version`, `url` (`.../releases/download/v<semver>/RuForge_<semver>_x64-setup.exe`). Leave `signature` empty until step 5. Do not paste the whole Unreleased dump into `notes`.

## 4. Signed build (Angel only)

Angel runs `Build-signed-windows.bat` or `npm run build:signed`. Mint reads `RuForge_<semver>_x64-setup.exe.sig` under `src-tauri/target/release/bundle/nsis/`.

## 5. Finish `updater.json`

Paste `.sig` **file contents** (base64) into `signature`. Set `pub_date`. Never put a path or URL in `signature`.

## 5b. Website release assets

`npm run prep:website-release` from repo root (needs signed NSIS). `npm run prep:website-release:changelog-only` if the signed build is not ready.

## 6. Commit + push to main

Confirm branch is `main`. Commit must include `updater.json`, all three version files, generated website changelog when applicable, and unreleased code. Push `origin main`. Record the hash.

## 7. GitHub Release

Tag **`v<semver>`** must match the `updater.json` download path. Upload NSIS `.exe` (required). MSI optional. Do not attach `.sig` files.

## 8. Drain Unreleased → graph + roll STATE

a. Append released changes into `docs/agents/release/versions/version-<semver>.json` (CHANGELOG-AUTHORING.md). Add registry row in `docs/agents/release/versioner.html`.

b. In `STATE.md`: set `Last shipped to users` to the version just released; set `Shipping version` to the next unreleased; refresh Now, Next 3, Open P0; update `Last updated`. Leave `shipped.jsonl` as-is (rows keep their `v`). The next cycle's `shipped:unreleased` follows the new Shipping version, so the list is empty until new `shipped:add` rows.

c. In `website/src/content/roadmap.json`: flip matching entries to `"status": "Finished"`. List every entry flipped or write "No roadmap entries to flip."

Do not keep a second shipped log in AGENTS.md.

## 9. HARD BLOCK: live verify

Fetch `https://raw.githubusercontent.com/UnboundAngel/RuForge/main/updater.json`

- Body parses as JSON.
- Parsed `version` equals the version you just released.
- `platforms.windows-x86_64.signature` is a long base64 string, not a path, URL, or empty.

If any check fails, the release failed. Committed != live on `main`.

## 10. Report

Chosen version + rationale, pushed commit hash, GitHub Release URL, live `version` from step 9, confirmation the Release asset matches `updater.json` `url`.
