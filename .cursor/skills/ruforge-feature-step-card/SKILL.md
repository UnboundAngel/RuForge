---
name: ruforge-feature-step-card
description: Frames a RuForge app screenshot inside Angel's hand-drawn step card (colored backing, wobbly outlined well, Step pill) for the website /features hover stacks. Use when a /features hub card shows a raw screenshot without the custom card, when adding or replacing a step image in website/src/pages/features/index.astro, or when a hub has fewer than three step cards.
disable-model-invocation: true
---

# RuForge feature step card

The `/features` hubs (`website/src/pages/features/index.astro`, `hubs` array) fan out up to three cards on hover (`FeatureStackedCards.tsx`, `cards.slice(0, 3)`). Every card image is a 515x749 WebP in `website/public/tutorials/<hub>step<N>.webp` with the frame baked in: colored backing, brown outer border, a hand-drawn dark outline around the screenshot (the well) in the top half, and a blank text panel with a Step pill below. Title and description are overlaid by the component, never baked in.

A raw screenshot in that slot reads as stale next to the framed ones. Every hub should have three framed cards.

## Workflow

```
- [ ] 1. Pick a real screenshot for each missing card
- [ ] 2. Pick templates and a hue
- [ ] 3. Generate with the script, check the preview
- [ ] 4. Wire into the hubs array with verified copy
- [ ] 5. Screenshot /features and report
```

**1. Screenshot.** Ask for the whole RuForge window, chrome included, at 16:10 so it fills the well with no crop. At 125% display scale, 1600x1000 physical pixels gives the app's 1280x800 layout. Resize the window for Angel with Win32 `SetWindowPos` after `SetProcessDpiAwarenessContext(-4)`, sized from `GetDpiForWindow` and centered in the monitor work area. Use real app captures only: `website/src/assets/screenshots/`, `website/src/assets/tutorials/`, `website/public/tutorials/`. The well is landscape (about 480x300), and the shot is cover-fit and center-cropped, so keep the subject centered. Never reuse a shot from another mode (a video playlist is not a Music card). If no fitting shot exists, generate what you can and ask Angel for the missing capture. Do not fake one.

**2. Template and hue.** Use an existing hub's `step1..3` as templates so the hand-drawn outlines differ per card. Step N uses template N, which also matches its pill. Most wells are 482x301 (16:10), but `sponsorstep2.webp` is 422x324 and crops a 16:10 shot at the sides. Use `miniplayerstep2.webp` for Step 2 instead. The script warns when the shot and well ratios differ by more than 5%. Recolor with `--hue` so the hub gets its own backing. Omit `--hue` to keep the template color. Probe the existing backings first so a new hub does not collide:

```bash
node .cursor/skills/ruforge-feature-step-card/scripts/frame-step-card.cjs --probe website/public/tutorials/*step*.webp
```

Backing hues in use (hub: hue): download 22 to 57 (tan/yellow), medialibrary 175 to 225 (blue/teal), mediaplayer 12 to 333 (dusty rose), miniplayer and sponsor 11 to 338 (salmon/pink), music about 90 to 105 (sage, `--hue 110`), settings 29 to 265 (lavender/grey).

**3. Generate.** Run from the repo root (it resolves `sharp` from `website/node_modules`):

```bash
node .cursor/skills/ruforge-feature-step-card/scripts/frame-step-card.cjs \
  --template website/public/tutorials/sponsorstep3.webp \
  --shot path/to/screenshot.webp \
  --out website/public/tutorials/musicstep3.webp \
  --hue 110 --preview "$TEMP/musicstep3.png"
```

Read the preview PNG and check:
- The screenshot fills the well right up to the drawn outline, and no backing color shows between them. If the outline is clipped or backing leaks through, tune `--line` (default 4, the stroke thickness skipped past the first dark pixel).
- The outer border stays brown, with no flecks of the old backing color.
- The Step pill and text panel are recolored cleanly.

The script exits with an error if the detected well is implausibly small. Do not ship around that.

**4. Wire it.** Add a `{ imageSrc: '/tutorials/<hub>step<N>.webp', title, description }` entry to that hub's `cards`. Copy follows `VOICE.local.md` and root `AGENTS.md` website copy rules: plain words, no internal terms (webview, sidecar, filenames). Check every claim against `src/` before writing it. `/m/features` does not render these cards, so there is no mobile twin to update.

**5. Verify.** Load `/features` on the dev server, scroll the hub into view, screenshot it next to its neighbors, copy the shot into `.screenshots/` and link it relatively. Emulating a 390px width in the Cursor browser tab renders the desktop page at the wrong scale. Skip that shot and say why.

## How the script works

Read this only when a new template breaks detection.

- **Well mask:** scans each row and column of the top half from 10px inside the edge inward to the first dark pixel (luminance < 90), then skips `--line` px. A scan that lands more than 12px from the median (a gap in the stroke) falls back to the median.
- **Recolor:** sharp `modulate` hue shift, from the backing hue sampled at (256, 18) to `--hue`, with saturation `--sat` (default 0.85). Within 16px of the edge, pixels that are dark and brown (luminance < 165 and r >= g >= b) are restored from the original, so the border stays brown while pink backing still shifts.

- **Alpha:** templates have transparent rounded corners. The script works in RGB, then re-attaches the template's alpha channel on output. Dropping it (a bare `removeAlpha()` into WebP) paints the corners solid, and the cards look chopped.

Approaches that failed, so do not retry them:
- A diff mask across templates: every outline is hand-drawn differently.
- Flood fill from the backing color: skin tones match the backing and the fill leaks.
- Taking the end of the dark run as the edge: it overshoots into dark UI.
- One fixed hue shift for all cards: each template has a different backing hue.
- Restoring the edge by luminance alone: it keeps pink specks.
