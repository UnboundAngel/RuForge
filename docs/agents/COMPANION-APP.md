# Companion app work (agent guide)

Read this when Angel says "companion", "phone app", "iPhone", or names anything under `src-tauri/companion-web-src`. It is the whole brief for that surface.

## What it is

A React PWA served by the Rust axum companion server (`src-tauri/src/companion/`) and opened on an iPhone over Tailscale HTTPS. Source: `src-tauri/companion-web-src`. Build: `npm run companion:build` (output `src-tauri/companion-web`, embedded in the binary). Type check: `npx tsc --noEmit -p src-tauri/companion-web-src`. Test against the real server at `http://localhost:8787/` (pair first); no mock server.

Mode is Music: red `--music-accent` (#ff0033) on black. Do not introduce other palettes.

## Reuse first, rebuild never

Default move for any need on the phone: look in `src/` for the desktop version and import it. Only write phone-local code when the desktop one cannot run in the phone bundle (Tauri IPC, Node, window chrome).

- Motion: `motion.ts` re-exports `src/lib/overlayMotion` (`overlayFadeTransition`, `overlayPanelTransition`, `pageTransition`, ...). Add new shared curves to the desktop file and re-export, not the other way round. Phone-only constants (`SHEET_TRANSITION`, `PRESS_SPRING`) live in `motion.ts`.
- Press feel, easing, durations: reuse the desktop values. Taps on the phone must feel like the desktop player.
- Tooltips/labels: the phone has no hover, so desktop `data-tooltip` becomes `aria-label` plus a visible label where meaning matters. Reuse the same wording.
- Icons: `components/icons.tsx` re-exports lucide and inlines the Iconify bodies the desktop uses, so the phone never fetches from a third party. When desktop adds an icon the phone needs, add its body there.
- Copy, thresholds, helpers (`companionProgressSync`, art color extraction, formatters): import from `src/lib` if it has no Tauri dependency; if it does, split the pure part out in `src/lib` and import that from both sides.
- Types shared with Rust live in `types.ts`; keep them matching `companion/routes.rs`.

Rules for importing across the boundary: relative imports (`../../src/...`), pure modules only (no `@tauri-apps/*`, no `window.__TAURI__`), and check the bundle still builds. If an import drags Tauri in, extract the pure part rather than copying it.

## Layout and taste

Copy the layout of the big apps, then add a small amount of RuForge.

- Structure comes from Spotify / YouTube Music on mobile: bottom tab bar (Home, Search, Library), mini player above it, full-screen player sheet, queue as a draggable sheet, detail pages pushed from cards, filter pills under the header, shelves of square art on Home.
- Video mode follows YouTube: stage on top, title and actions below, related below that.
- RuForge taste, applied sparingly: tonal flat layers (#121212 panel, #1a1a1a card, #262626 chip, #333 pill), one red accent, art colors sampled into the player backdrop, fast physical motion (transform and opacity only), plain-spoken copy.
- Do not copy their branding, green, or wording.

Design rules from `.cursor/rules/design-style*.mdc` apply in full: no dividers, no glows, shadows only as a signal, tiered radii (cards 14-16, media 16-20, pills 999, primary CTA 12-14), no letterboxed media, no accent-bar section labels, no decorative color, no bezels or frames around illustrations. Mint (the main agent) does all visual work; never hand styling to a subagent.

## Onboarding drawers (`intro.ts`, `components/IntroSheet.tsx`, `IntroArt.tsx`, `intro.css`)

- Event-triggered via `requestIntro(id, item?)` (save, install, offline). Never a back-to-back wizard.
- Draggable bottom drawer. Dragging down skips and runs the same commit as the button. No X.
- Height fits content. One unique hero per drawer, drawn directly on the sheet, not inside a framed card.
- Say what is happening in plain words (for example "downloads into RuForge on your phone"). No filler info rows.
- Numbered steps sit in one aligned column.

## Platform facts that bite

- iOS keeps Home Screen app storage separate from Safari. Offline files and the pairing cookie do not carry over, so say "pair again" after install.
- Wi-Fi-only downloads cannot be enforced on iPhone browsers (no connection type). Do not offer the control.
- Sessions are persistent: cookie token hash stored in `companion-devices.json`, 180 days max, 90 idle. Pairing codes are 8 characters.
- `m` components from motion need `LazyMotion` with `domMax` (drag) above them.
- Test with the viewport at 390x844, and check the safe-area insets, landscape, and the tab bar overlapping bottom content.

## Previewing

Screenshots go in `.screenshots/` and are opened for Angel per root `AGENTS.md`. For static drawer/state previews, bundle the real component with esbuild into the scratchpad and drive it with Playwright; wrap in `LazyMotion`, add `box-sizing: border-box` and a button reset, and give the mount node `height: 100%`. Keep that harness out of the repo.

## Done checklist

1. `npx tsc --noEmit -p src-tauri/companion-web-src`
2. `npm run companion:build`
3. Screenshot every changed state at phone width and send them.
4. Do not commit unless asked; when asked, follow the root `AGENTS.md` trigger phrases.
