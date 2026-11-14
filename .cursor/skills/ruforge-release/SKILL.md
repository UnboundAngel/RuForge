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

## Held release (cut now, ship later)

When Angel wants a version frozen and signed but not given to users yet (users get a week on the current version first, and main moves on to the next one):

1. Run steps 1-5 on `main` as usual, then push `main` to sync and create `release/<semver>` on sync at that commit. Commit the step 5 signature to `release/<semver>` only.
2. Step 7 as a **draft** GitHub Release (`gh release create v<semver> --draft`) with the installer. Skip step 6's snapshot and the public `updater.json`.
3. On `main`, set `STATE.md` `Shipping version` to the next version and note the held one under Status, so new `shipped.mjs add` rows land on the next version. Leave the version files alone; the next release bumps them.
4. Ship day: on `release/<semver>` (use a `git worktree`, not a checkout of main's tree), refresh `pub_date` and run step 5b, push. Then `RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs --ref release/<semver> "Release: v<semver>"` (dry-run first), and publish the draft right after with `gh release edit v<semver> -R UnboundAngel/RuForge --target <snapshot sha> --draft=false` (a draft has no tag until then), then steps 8-10. Merge `release/<semver>` back into `main` and keep `main`'s `Shipping version`.

Nothing lands on `release/<semver>` except release fixes Angel asks for.

## 1. Drain Unreleased → version bump (+ onboarding)

Run `node scripts/shipped.mjs list` and read that list. **Do not default to patch +1.** Do not open the whole JSONL unless search needs it (`node scripts/shipped.mjs find …`).

Pick the bump with [`.cursor/rules/version-bump.mdc`](../../rules/version-bump.mdc) (SemVer 2.0.0 mapped to RuForge: what counts as patch, minor, major, and what never counts). One public MINOR trigger means minor with patch 0; otherwise patch +1.

**Onboarding:** any new user-facing feature that needs a walkthrough must have a row in `src/lib/onboardingSteps.ts` with `introducedIn` matching the chosen version. Contract: `docs/agents/AGENT-REFERENCE.md`. If warranted and missing, ask Angel. Bug-fix-only releases add no steps.

State the chosen version and why in the step 10 report.

## 2. Bump all three together

`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package] version`. Confirm they match.

## 3. Prep `updater.json` (before build)

Structured `notes`: markdown teaser + `additions` and `fixes` arrays. Set `version`, `url` (`.../releases/download/v<semver>/RuForge_<semver>_x64-setup.exe`). Leave `signature` empty until step 5. Do not paste the whole Unreleased dump into `notes`.

## 3b. Tools are not bundled (no step)

Installers carry no yt-dlp, ffmpeg or Deno: `tauri.conf.json` has no `externalBin`, and the app downloads each tool on first launch (yt-dlp from its latest GitHub release, ffmpeg from `website/public/tools.json`). The copies in `src-tauri/binaries/` are dev-only. Nothing to refresh before the build. Touch `tools.json` only when Angel ships a new ffmpeg build.

## 4. Signed build (Angel only)

Mint starts it for Angel: run `npm run build:signed -- -WithGames` in a Terminal panel tab (`run_in_terminal`, title "signed build") and link that tab, or, when no terminal tool exists, give the command in a `bash` code block so Angel can hit Run. `-WithGames` is required for every public installer; without it the script sets `RUFORGE_PUBLIC_BUILD=1` and strips Games. Angel types the signing password himself; never ask for it, read it, or put it anywhere. Wait for Angel to say it finished, then read `RuForge_<semver>_x64-setup.exe.sig` under `src-tauri/target/release/bundle/nsis/`.

## 5. Finish `updater.json`

Paste `.sig` **file contents** (base64) into `signature`. Set `pub_date`. Never put a path or URL in `signature`.

## 5b. Website release assets

`npm run prep:website-release` from repo root (needs signed NSIS). `npm run prep:website-release:changelog-only` if the signed build is not ready. It does three things, all generated:

- writes `website/src/content/releases/v<x-y-z>.md` from `updater.json` `notes` (additions, fixes) and `pub_date`,
- copies the installer to `website/public/releases/RuForge_<semver>_x64-setup.exe` (`/download` streams it same-origin),
- runs the website build.

The header "Latest" badge, JSON-LD `softwareVersion` and download filenames read `updater.json` at build time (`__APP_VERSION__` in `website/astro.config.mjs`); never hand-edit a version string on the site.

## 6. Commit on sync + snapshot to public main

Confirm release work is on `sync` `main` (private source of truth). Commit must include `updater.json`, all three version files, the step 5b output (release markdown and installer under `website/public/releases/`), and unreleased code. Push that commit to **`sync` `main`** first.

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

Do step 8e before this commit so one republish carries all of it. The dry-run must list only `STATE.md`, `docs/`, and `website/` paths. If app code shows up, stop and ask Angel.

e. Website content pass. The generated files from 5b cover the version, download and changelog only. Everything below is hand-written and goes stale unless updated here. Go through the release's additions and fixes (`version-<semver>.json`) and check each item:

| File | Update when |
| --- | --- |
| `website/src/content/roadmap.json` | Always (8c). Every shipped entry flips to `Finished`; nothing still says "coming" for this version. |
| `website/src/content/features.json` | Any user-facing addition. Add rows under the right area (or a new area for a new mode), set `version` to `<semver>` and `updated` to today. It lists released features only. |
| `website/src/lib/features.ts` (feeds `/features`, `/features/all`, `/features.txt`) and feature pages under `website/src/pages/features/` + `/m/` twins | A new mode or major feature gets its own page or section; existing pages get changed behavior. |
| `website/public/llms.txt` | A new feature page, mode or headline capability. Keep the "Feature pages" list matching the real pages. |
| Home teasers (`website/src/components/*Peek.astro`, `src/pages/index.astro`, `src/pages/m/index.astro`) | A "Sneak peek" or "coming" teaser for something this release ships: turn it into a shipped feature card or remove it. |
| Docs (`website/src/lib/docsContent.ts`, `docsTree.ts`) | A new or changed Setting, shortcut, network call or privacy-relevant behavior. The privacy and network tables must match the code. |
| Built-with pages (`website/src/lib/builtWithPages.ts`, `builtWithCodeExamples.ts`) | The architecture they describe changed (for example tools are downloaded on first launch, not bundled). |
| Compare page, FAQ, `structuredData.ts` `featureList` | A claim there is now wrong or a headline feature is missing. |

Copy rules: `website/AGENTS.md` (Copy and SEO, voice). Visual changes follow that file's screenshot rules. List each file touched in the step 10 report, or write "No website content changes needed" with the reason.

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

Chosen version + rationale, pushed commit hash, website content files touched (8e), GitHub Release URL, live `version` from step 9, website check result, confirmation the Release asset matches `updater.json` `url`.
