---
name: ruforge-image-editor
description: Edits app screenshots and photos into commercial website imagery (landing rows, feature pages, docs, mobile cards) by cropping, spotlighting, enlarging key UI with loupe zooms, and verifying at real display size. Use when the user uploads screenshots for the website, asks to crop, edit, annotate, highlight, or improve an image, or when an image needs to catch the eye or read at a glance.
---

# RuForge image editor

Website images sell a feature in about one second. Before any edit, answer: **what should the eye hit first, and can it be read at the size the page actually shows it?**

## 1. Measure the display size first

Every decision follows from this. Find the frame the image renders in and do the math.

| Surface | Frame | Shown width | Fit |
|---------|-------|-------------|-----|
| Landing rows (`LandingFeaturesSection.astro`) | 16:10 | ~500px at 1440 | `cover`, center |
| Mobile landing cards (`MobileFeatureAccordion.tsx`) | 16:10 | ~340px | `cover`, top |
| Feature pages (`FeaturePageTemplate.astro`) | 4:3 | ~560px at 1440 | `cover`, center top |

Scale = shown width / source width. A 1024px app screenshot in a 500px frame is shown at **0.49x**, so 12px UI text lands at about 6px: unreadable. Anything the image is about must be **at least 2x** after editing.

Match the frame aspect before editing. A source at a different aspect gets cropped by `cover`, and the edge you lose may be the subject (a 16:10 shot in a 4:3 frame loses ~85px on each side). Either crop the source to the frame aspect yourself, or change the frame only if every image using it still works.

## 2. Pick one story

One subject per image, two at most (a cause and its effect, like a filler segment and the Skip filler button). Write it down in a sentence. Everything else is context and gets pushed back.

## 3. Technique ladder (cheapest first)

Stop at the first rung that passes the glance test.

1. **Crop to the subject.** Cut window chrome, empty panels, and unrelated content. Keep the crop at the frame aspect. Cheapest and often enough (the downloader modal crop).
2. **Spotlight.** Blur and darken everything except the subject, which stays pixel-sharp. Works when the subject is already big enough to read.
3. **Loupe zoom.** Lift the subject out at 2x to 3.5x onto a darkened, blurred backdrop of the same shot, as a rounded panel with a drop shadow. Use this when the subject is small in the source, which is most UI controls. Upscaling 3x is fine because the page shrinks it back to roughly 1.5x of the source pixels.
4. **Crisp re-render.** When zoom would go past ~3.5x, or text must be razor sharp, rebuild the piece in HTML with the app's real classes and tokens, screenshot it with Playwright at `deviceScaleFactor: 3`, and composite it in. It must match the real component exactly (read its source first).
5. **Accents.** Glow rings, arrows, and outlines are seasoning only. They never fix an image on their own: a ring around a tiny button is still a tiny button.

## 4. What catches the eye

- **Scale wins.** The largest element is seen first. Enlarge the subject rather than decorating it.
- **Contrast.** Drop the backdrop to about 30 to 40% brightness so the subject is the brightest thing in the frame.
- **Color isolation.** Desaturate the context (about 0.55) and leave the subject's color intact. The mode accent (Music red, library sand gold, SponsorBlock category colors) should only appear on the subject.
- **Faces pull focus.** A face that is not the subject steals the glance. Blur it into the backdrop.
- **Reading order.** Left to right: context or cause on the left, the action on the right.
- **Negative space.** Leave breathing room around zoom panels. Don't tile the frame edge to edge.
- **Consistency.** Rows on one page share treatment: same backdrop strength, panel radius, shadow, and border.

## 5. Rules learned the hard way

- **Mask feather stays tiny** (0.5 to 1 source px). A wide feather bleeds the blur onto the UI you meant to keep sharp.
- **Translucent UI shows the video through it.** Seek bar tracks, glass, and scrims stay in the dimmed layer, or sharp video patches show through them. Keep only the opaque parts (the played and segment fill) sharp.
- **Crop 1 to 2px inside pill and card edges** when zooming. Edge pixels carry the video behind them and turn into a grey halo when scaled.
- **Keep boxes on flat surfaces show as lighter patches.** Around text on a solid panel, skip the keep box (text stays readable when dimmed) or box the whole panel.
- **Zoom boxes stay inside one surface.** If a box crosses a card edge, the neighbouring surface shows as a strip along the panel side. Leave 6 to 10px of padding inside the surface around the content.
- **When a small element is the subject, dim the big photo next to it.** A bright thumbnail beats a 3px progress bar every time; drop the photo to about 0.4 brightness and keep only the element at full strength.
- **Boost every zoom panel.** Upscaled UI goes soft and low in contrast; contrast 1.15 to 1.22 plus a light unsharp mask restores it. Brightness over 1.0 blows cream buttons to white.
- **Never brighten or darken a box behind text.** It paints a chip that isn't in the app. Use a `threshold` dim so only the glyphs change. That's also how to build hierarchy inside a line (lift the hook stat, drop its neighbours).
- **Backdrop at about 0.4 brightness**, not lower. Below that the viewer can't tell which screen they're looking at.
- **Frame the subject with its container.** Text and buttons alone lose the "this is a dialog" read; the full screen wastes space. Zoom the whole container (dialog, card) to fill about 90% of the frame height.
- **Don't add borders to things that already have a ring** (most RuForge buttons have `ring-white/10`). Keep any added border at 0.08 to 0.13 white alpha.
- **Sample accent colors from the image** with pixel probes. Never guess hex values.
- **Measure boxes, don't eyeball them.** Run `scripts/probe.py` on the region and read the grid.
- **Never invent or recolor product UI.** Edits may emphasize, crop, enlarge, blur, and dim. They may not show a feature, state, or label the app does not have.
- **Privacy pass.** Blur account avatars, usernames, file paths, and notification contents that aren't the subject.
- **Third-party content.** YouTube thumbnails and creator faces are fine as de-emphasized context. If one is the hero of the image, flag it to Angel.

## 5b. Commercial review (run on every edit before handing off)

- **Does it sell RuForge or just show an app?** Generic features (Play all, Shuffle) belong in supporting shots. Hero spots go to things only RuForge does: progress on downloaded files, SponsorBlock offline, "in your library" counts, follow-to-library.
- **Anything that looks like a bug?** Truncated labels (`MANU...`), half-cut controls, and loading states read as broken in marketing. Crop them out.
- **Who is the hero?** If a real person's face or a news headline is the loudest thing in the frame, dim it or reshoot with neutral content.
- **Is the screen identifiable?** If the backdrop is too dark to tell which view it is, lighten it.
- **Too tight or too loose?** Text and buttons alone lose the context. The full window wastes the frame. The container (dialog, card, row) at about 90% of the frame height is usually right.
- **Source resolution.** Zooms of 2x and up on 1024px captures go soft at full width. Ask for captures at 150% display scale when an image will be shown large.
- **Offer one pick per story.** Make variants while exploring, then delete the losers so the handoff folder only holds the picks.

## 6. Tooling

PIL (Python 3, Pillow 12) is installed and covers almost everything: crop, resize (LANCZOS for photos, NEAREST for probes), Gaussian blur, brightness and saturation, rounded masks, composites, drop shadows, glows, gradients and vignettes, and text with Windows fonts (`C:/Windows/Fonts/segoeui.ttf`, `seguisb.ttf`). Draw at 2x and downscale for clean anti-aliased edges. `sharp` is available from `website/` for format checks.

Playwright (`playwright-core` plus the cached Chromium under `%LOCALAPPDATA%/ms-playwright/`) renders crisp HTML pieces for rung 4 and takes the verification shots.

The `GenerateImage` tool is for backgrounds, textures, and decorative art only. Never use it for product UI.

### scripts/edit.py (run it)

```bash
python .cursor/skills/ruforge-image-editor/scripts/edit.py spec.json
```

Spec fields. All boxes are `[x0, y0, x1, y1]` in source pixels, measured after `crop`:

| Field | Meaning |
|-------|---------|
| `src`, `out` | Input path; output path (`.webp`) |
| `scale` | Supersample factor, default 2 |
| `crop` | Optional first crop (match the frame aspect) |
| `keep` | `[{box, radius}]` regions that stay sharp (spotlight) |
| `keepDim` | Softening around kept regions, default `{blur 3, brightness 0.55, saturation 0.55}` |
| `feather` | Mask feather in source px, default 0.8 |
| `dims` | `[{box, radius, brightness, blur}]` darken a region (a loud thumbnail). With `threshold` and `gain` instead, only pixels brighter than the threshold are scaled: text and icons get brighter (`gain` > 1) or dimmer (< 1) while the surface behind them stays put |
| `background` | `{blur, brightness, saturation}`. Turns the whole frame into a backdrop for zooms |
| `zooms` | `[{box, zoom, at, radius, border, contrast, brightness, sharpen}]` loupe panels cut from the spotlight layer. Default boost: `contrast 1.15 to 1.22`, `sharpen 60`; keep `brightness` at 1.0 when the panel holds cream or white fills |
| `rings` | `[{box, radius, color}]` glow outlines (accent only) |
| `resize`, `quality` | Output size (default source size), WebP quality (default 92) |

Worked example: [examples/skip-filler.json](examples/skip-filler.json) (spotlight plus two loupes, used on the landing SponsorBlock row). Keep new specs in `%TEMP%`, not in the repo.

### scripts/probe.py (run it)

```bash
python .cursor/skills/ruforge-image-editor/scripts/probe.py SRC X0 Y0 X1 Y1 OUT.png [ZOOM] [STEP]
```

Saves a magnified crop with a labeled pixel grid. Read `OUT.png` to measure exact box edges.

## 7. Workflow

```
- [ ] Find the frame: aspect, shown width, object-fit and position (desktop and mobile)
- [ ] Write the one-sentence story and name the subject
- [ ] Probe the subject's exact bounds
- [ ] Climb the technique ladder; stop at the first rung that passes
- [ ] Output WebP at source resolution to website/src/assets/screenshots/<page>-<subject>.webp
- [ ] Update the image import and the alt text to describe the new image
- [ ] Screenshot the real page at desktop and 390px mobile, cropped to the element
- [ ] Glance test: at that size, is the subject obvious in one second and its text readable?
- [ ] Fix and repeat; then link the shots from .screenshots/ to Angel
```

Never upscale the whole image beyond its source resolution. Astro's `<Image>` generates the responsive widths. Images stay non-draggable per the site's global `img` rule.
