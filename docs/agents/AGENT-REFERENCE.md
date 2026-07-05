# RuForge: agent reference (read when routed)

Extended context for IDE agents. Not part of the every-task read path. Root [`AGENTS.md`](../../AGENTS.md) routes here when trigger words match.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind v4, Zustand (`src/store/ruforgeStore.ts` + `ruforgePersistStorage.ts`).
- **Desktop:** Tauri v2 (`src-tauri/`), WebView2 on Windows. Two windows: `main` and `mini`; optional `explorer` webview.
- **Cross-window sync:** Zustand does not span webviews. Use Tauri `emit` / `listen` only (`play-media`, `stop-playback`, `send-to-main`, `play-in-mini`, etc.).

## Architecture snapshot

- **Source of truth (main window):** `useRuforgeStore` holds nav, settings, paths, notifications, downloader fields, gallery list (`entries` + loading flags), player file/playlist/volume/loop, sidebar, search, explorer URL, etc. Persisted slice is settings + output paths (`ruforgePersistStorage.ts`: flat `localStorage` keys preserved for MiniPlayer and other readers).
- **`App.tsx`:** Local React state for window chrome / shell only (`isMini`, `isMaximized`). Intentional separation from Zustand.
- **Downloader:** `src/components/DownloaderView.tsx` is the routed shell; `src/components/downloader/` holds `useDownloaderView`, `DownloadJobQueuePanel.tsx`, and helpers. `App.tsx` imports `DownloaderView` only.
- **Gallery:** `MediaView` (from `App.tsx`) is the live surface. `GalleryView.tsx` exists but is not imported; treat as legacy.
- **`MiniPlayer.tsx`:** Own webview. Duplicated playback UI state synced via Tauri events + some `localStorage` keys.
- **`PlayerView`:** Heavy local `useState` for playback UI is normal, not a migration gap.
- **Subtitles (`useSubtitleCueOverlay`):** VTT cues over `<video>`; vertical drag persists in `localStorage`. Layout clamps against scrub strip + player shell. Wired from `PlayerView.tsx` and `MiniPlayer.tsx`.
- **Music mode (`navMode === "music"`):** Shell swap in `App.tsx` to `MusicShell`. Playback in `useMusicPlayback`. Tag metadata via `lofty` in `gallery.rs`; UI under `src/components/music/`.

## Zustand migration

Functionally done for the original intent: central store + persist, main-window concerns off ad-hoc `App` state, mini window event-driven.

Optional follow-ups (gallery caching, `GalleryView.tsx` delete/wire) were never blockers. Prefer `MediaView` + store for gallery work.

**Invariant:** avoid `activeTab === "player"` with `playingFile === null` when subscribers assume a file. Stop-handlers should clear tab + file atomically for mini-driven stops. Player uses outer shell + inner `PlayerViewWithFile` for nullable `playingFile`.

External audit (cite, do not restate): `%USERPROFILE%\.cursor\plans\zustand_migration_audit_53cd5b61.plan.md`

## Code quality guardrails

Three rules. Every agent, every edit.

### 1. Comments: zero narration

Comments are high-friction in this repo. Default to no comments in code files unless the comment is genuinely needed. Comments explain **why**, never **what**. Delete on sight: import/define/return narrators, block headers under 200 lines, commented-out code, AI-voice patterns (`// Now we need to`, `// Step 1:`), future-tense self-talk without a real `// TODO:`.

Allowed: non-obvious constraints, tradeoffs, external references, intent the signature cannot convey. Test: if deleting the comment leaves the code equally clear, delete the comment.

### 2. Component and function extraction

Extract when ANY is true: React component exceeds ~120 rendered lines; helper used by more than one file; hook with state + effects over ~30 lines; inline SVG/animation over ~40 lines; fourth JSX nesting level incoming.

Components go in `components/<feature>/` or `components/ui/`. Hooks next to consumer or in `hooks/`. Shared helpers in `lib/` (website) or `src/lib/` (desktop). Types co-locate with owner; app root `types.ts` for cross-cutting.

Naming: `PascalCase.tsx` components, `camelCase.ts` modules, `use<Name>.ts` hooks.

### 3. Styles in stylesheets or Tailwind, not JS objects

Tailwind classes default. Tokens via `--color-rf-*` / `--font-*` in `global.css`. Inline `style={}` only for dynamic values Tailwind cannot express. No css-in-js. Reused patterns get scoped `.rf-*` classes.

**Nesting:** max 3 authored JSX wrapper levels; early returns over deep conditionals; no ternary chains.

## Auto-updater (detail)

- Config: `src-tauri/tauri.conf.json` -> `plugins.updater` (`endpoints`, `pubkey`). Bundles: `"createUpdaterArtifacts": true`.
- Permissions: `src-tauri/capabilities/default.json` includes `updater:allow-check` and `updater:allow-download-and-install`.
- Runtime: `src/App.tsx` calls `check()` on startup; UI uses `downloadAndInstall()` from the returned `Update` object.
- Copy lives in `updater.json` `notes` and GitHub Releases. On each `check()`, the plugin fetches live `updater.json`; users see whatever `notes` says at check time. GitHub Release body is not read automatically.
- **Two UI surfaces:** (1) `UpdaterMainOverlays`: teaser, `line-clamp-3`. (2) `UpdaterPostInstallStack`: full "What's new". Use `src/updatePostInstall.ts`; structured JSON `{"notes","additions","fixes"}`; teaser uses inner `"notes"` via `teaserNotesFromUpdaterBody`. Do not paste long changelog blobs into `updater.json`.
- `check()` returns `null` unless `updater.json` version is greater than the running app. Same version on `main` means no update prompt; that is expected.
- GitHub `url` path after `releases/download/` must match the exact release tag (including leading `v`).

### Signed Windows build

Keys under `%USERPROFILE%\.tauri\` (`ruforge.key` private, `ruforge.key.pub` public). Never commit the private key.

Before building: confirm `plugins.updater.pubkey` in `tauri.conf.json` matches the public key (minisign format).

```powershell
Get-Content "$env:USERPROFILE\.tauri\ruforge.key.pub" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$HOME\.tauri\ruforge.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password-if-encrypted>"
npm run tauri build
```

One-click: `Build-signed-windows.bat` or `npm run build:signed`. Optional `.tauri-signing-password` (gitignored). Desktop shortcut: `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/create-desktop-shortcut.ps1`.

**Angel only** runs release signing. Agents prep notes and version bumps, then read NSIS `.sig` from `src-tauri/target/release/bundle/nsis/` after the build.

`.sig` files sit next to installers (msi + nsis). Paste base64 **contents** into `updater.json`, not a path or URL.

Minisign (updater) and Authenticode (installer SmartScreen) are independent. Do not recommend EV certs for SmartScreen bypass; see website SEO research doc for signing context.

## Product / UX pointers

- **Playback persistence:** `src/playbackStorage.ts` for furthest position + stored duration; thumbnail bars via `getPlaybackThumbnailBar`.
- **Mini player:** transparent undecorated window; "back to app" should focus `main` before closing mini.
- **Player:** opacity dip + no remounting `key` on `<video>` when auto-advancing; folder queue first, then library sorted list when settings allow.

## Onboarding contract

In-app walkthrough for features not yet shown. Separate from post-update What's New (`UpdaterPostInstallStack` / `updatePostInstall.ts`).

Island steps: read `src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md` first.

- **Version gate:** each step has `introducedIn: "<semver>"`. LS key `ruforge-onboarding-last-seen-version` stores highest completed version. Run steps where `introducedIn` > last-seen; bump last-seen to max shown.
- **Order:** post-install What's New dismisses first; onboarding chains after. Reuse `postInstall` shell-block in `App.tsx`.
- **Welcome step:** intro only; reuses website hero animation; port to `src/components/onboarding/` or `src/components/ui/`.
- **Feature steps:** 16:9 media slot; optional `settingsGate` on existing `RuforgeSettings` booleans only. Do not invent settings keys.
- **Dev:** `import.meta.env.DEV` replays full registry; Settings > Debugging has Replay onboarding when `showDebuggingSettings` is on.
- **Code (when authorized):** `src/lib/onboardingSteps.ts`, `src/lib/onboardingStorage.ts`, `src/components/onboarding/`, media under `src/assets/onboarding/` via Vite import (not `convertFileSrc`).
- **Release gate:** scan unreleased Shipped log for user-facing features needing a walkthrough; ask Angel before ship if a step is warranted but missing.

## When unsure

Prefer reading `ruforgeStore.ts`, `App.tsx`, `MiniPlayer.tsx`, and `tauri.conf.json` before large refactors. For updater/signing, trust current Tauri v2 + plugin-updater docs over memory.
