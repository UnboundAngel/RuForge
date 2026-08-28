# Restrictions

Copy this block when locking a new pattern:

```
## Name (draft | locked)

Where: which mode / surface.

Do:

Don't:

Tokens / classes:

Code:
```

Empty headings below are placeholders. Fill them from the live app. Do not delete a heading to "clean up."

---

## Bezel + well (locked)

Where: Default nav (one bezel, one well). Music mode (one bezel, **split wells**: sidebar panel + main panel).

The lighter surround is the **bezel** (app chrome). The darker inset pocket is the **well** (content). Repeat this nesting on purpose. Depth is tonal, not a card drop-shadow.

Do:

- Default: bezel is `#271C18` and includes the left sidebar plus the title band. Well is `#1D1613` in the main column, `rounded-tl-[32px]`, reads as carved into the bezel.
- Music: bezel wraps the whole window (`var(--music-bg, #0a0a0a)` on the shell). Sidebar and main are sibling wells with a gap, thin light stroke, matching corner radius.
- Keep the well darker than the bezel. Keep the well's top-left (or all-around, in Music) radius large.
- Depth between bezel and well is **fill contrast** (lighter surround, darker pocket). Do not fake that nest with engraved inset lips on every nested control.

Don't:

- Flatten bezel and well into one fill.
- Put explorer actions in the well. Explorer chrome stays on the title band (see root AGENTS.md).
- Treat the bezel as a decorative border you can skip on a new full-screen surface. New primary surfaces nest the same way.
- Engrave chips/buttons into a plate with dual-lip inset shadows. That is not bezel/well nesting.

Tokens / classes:

- Bezel fill Default: `#271C18` (`rf-chrome-column`, window shell when not Music)
- Well fill: `#1D1613` (`rf-main-content-shell`)
- Well radius Default: `rounded-tl-[32px]`
- Window outer: `rf-main-window-shell--rounded` / `--maximized` (`src/index.css`)

Code: `src/App.tsx` (shell, chrome column, `rf-main-content-shell`). `src/index.css` (`.rf-main-window-shell--rounded`).

---

## Scrollbars (locked)

Where: every overflowing well, list, modal body, Settings, Music, comments, mini player. Not island version menus or horizontal carousels (those stay `scrollbar-none`).

Do:

- One class: `rf-scrollbar` on the scroller. Native bars are hidden. `RfScrollbarHost` paints a single overlay thumb (`.rf-scrollbar-thumb`) so WebView2 cannot override it.
- No arrow buttons.
- Transparent track (there is no track). Slim accent thumb, 5px, inset 3px from the well edge. Rest mix of `--accent` (Music: `--music-accent`).
- Scroll **inside the well**. The well keeps `overflow: hidden` and its radius so the thumb clips under the curve. The bar is content of the well, not chrome on the bezel.
- Hide with `scrollbar-none` only for carousels / pickers that must not show a gutter.

Don't:

- Native Windows / WebView2 scrollbars.
- Styling `::-webkit-scrollbar` and hoping Chromium hides the OS bar. It will not, on Windows.
- Per-view `scrollbarColor` / extra `::-webkit-scrollbar` blocks (comments used to).
- Put `overflow-y: auto` on the bezel.
- Full accent thumb at rest.

Tokens / classes:

- `.rf-scrollbar` / `.rf-scrollbar-thumb` in `src/index.css`
- Host: `src/components/ui/RfScrollbarHost.tsx`

Code: `src/index.css` (hide native). `src/components/ui/RfScrollbarHost.tsx` (overlay). Wells keep class `rf-scrollbar`.

---

## Titleband bezels (draft)

Where: Default gallery (media tab). Bezel-colored drops hanging from the title band into the well. Left: All / In Progress / Watched. Right: search, recently deleted, settings.

Do:

- Fill is the bezel (`#271C18`), not a well card. Box is `--rf-tab-strip-h` from chrome-column `top-0`. Clip the titlebar (`clip-path: inset(var(--rf-titlebar-h) -100px -100px -100px)`) so only the drop into the well paints. 16px concave SVGs sit on the seam (`top-[var(--rf-titlebar-h)]`, outside left/right). Bottom radius 24–28px. Inset `left-6` / `right-6`.
- Left: the active filter carries the drop (`layoutId="galleryTabShape"`). Labels are uppercase 10px tracking. After library scroll, one drop covers the whole filter row (`galleryScrollChrome`).
- Right: one drop for the icon cluster. Search width-animates open to the left (240px). Icons stay on the right edge of that drop.

Don't:

- Put the chrome row inside the titlebar (window controls / island).
- Float a disconnected pill in the well with no concave join to the title band.
- Invent a second drop language on other surfaces. Copy this.

Tokens / classes:

- `--rf-titlebar-h` 48px, `--rf-tab-chrome-h` 40px, `--rf-tab-strip-h`, bezel `#271C18`

Code: `src/App.tsx` (gallery tab strip + search/settings bulge)

---

## Motion (draft)

Where: Music sidebar collapse, Alt radial nav, Default tab changes (Downloader ↔ Library and siblings). Copy this feel on new surfaces. House taste (`design-style.mdc` §7) still applies for micro-interactions; this block is the live chrome.

Do:

- **Music left nav:** width eases between `--music-sidebar-width` (256px) and `--music-sidebar-collapsed-width` (56px). `transition-[width] duration-200 ease-out` on the L-column and `MusicNav`. Labels fade/clip with the same 200ms (`max-w` + opacity), they do not pop. Right queue panel: `width` 0.22s, ease `[0.4, 0, 0.2, 1]`. Bottom now-playing strip: height 0.28s that same ease, inner fade 0.2s.
- **Alt radial:** hold Alt opens at the pointer, release closes. Menu is opacity + scale `0.92 → 1`, spring `stiffness: 620, damping: 34, mass: 0.82`. Center mode flash is 0.2s scale. Do not hard-cut the wheel in.
- **Page changes:** `AnimatePresence mode="wait"` so the outgoing view exits before the incoming one. Library: opacity + `y: 12` in, `y: -12` out (`MediaView`). Downloader uses the same. Explorer fades the cutout. Music Home/Library/Explore/detail: opacity only, 0.15s. Audio player: opacity fade. Default ↔ Music: opacity wait on the shell. Settings tabs: opacity + `y: 8` wait (search uses one key so typing does not retrigger).
- **Modals:** overlay fade 0.2s, panel opacity + `y: 12` + scale 0.98, 0.22s, ease `[0.16, 1, 0.3, 1]`. Settings, confirm, companion pairing, annotate, `SettingsModalShell`. No snap.

Don't:

- Swap primary views with no enter/exit (instant replace).
- Snap the Music sidebar open/closed.
- A second radial language (fade-only, slide from an edge, etc.).
- Slow cinematic page wipes. Fast and physical.

Tokens / classes:

- Music: `--music-sidebar-width`, `--music-sidebar-collapsed-width`, `duration-200 ease-out`, `sidebarEase [0.4, 0, 0.2, 1]`
- Radial: `menuTransition` spring in `src/components/ui/radial-menu.tsx`
- Pages: `AnimatePresence mode="wait"` in `src/App.tsx` and `MusicShell`

Code: `src/components/music/MusicShell.tsx`, `MusicNav.tsx`, `MusicNavBackCell.tsx`, `MusicRightPanel.tsx`. `src/hooks/useAltRadialNav.ts`, `src/components/ui/radial-menu.tsx`. `src/App.tsx` (main wait). `src/components/MediaView.tsx`.

---

## Popups / dialogs (draft)

Where: Shared modal chrome (`SettingsModalShell`). Delete confirm, Recently Deleted, export, migrate, regroup, music meta. Not the Settings window itself (different shell).

Do:

- Centered over `bg-black/80`, portaled to `document.body` so the scrim covers island, window controls, and titleband chrome (not trapped under a lower stacking context).
- Hierarchy: title `text-base font-semibold text-stone-100` top-left. Optional eyebrow above (confirms omit it). Body copy `text-[12px] text-stone-500`. Footer right-aligned.
- Close X is a bare icon, `text-stone-500`, lightens on hover (`hover:text-stone-200`). No circle, no fill, no border.
- Enter: overlay fades 0.2s, panel opacity + `y: 12` + scale `0.98 → 1` in 0.22s, ease `[0.16, 1, 0.3, 1]`. Exit is the reverse, slightly less Y. No snap. Honor reduced motion (duration 0).
- Ghost / secondary footer actions are text-only. No engraved inset plate behind Back/Cancel.

Don't:

- A second overlay language (frosted card, yellow banner, window-chrome X in a circle).
- Snap the panel in or out.
- Divider lines under the title.
- Hard-corner recessed Ghost buttons (`inset` shadow plates).

Tokens / classes:

- `--radius-modal` 24px, `--radius-input` 12px, overlay `bg-black/80`, panel `#1D1613`, portal `document.body`

Code: `src/components/settings/SettingsModalShell.tsx`

---

## Warnings (draft)

Where: **Heavy warning** = delete / destructive confirm (`askConfirm` with red primary). Canonical: Library "Delete video". Not the yellow/amber toast warning (still uncaptured).

Do:

- Same popup shell as above. No Settings eyebrow. Title names the act ("Delete video"). Copy says what happens (Recycle Bin, Recently Deleted).
- Show the thing: 16:9 thumb, `object-cover`, rounded `--radius-input`, blurred twin behind it. Meta under it in `SettingsModalSurface` (`#261d18`, 11px stone-500): `size • title`.
- Footer: CANCEL is text-only uppercase tracking, muted. DELETE is the primary CTA, `rounded-[var(--radius-input)]`, `bg-red-500/90 text-stone-100`, not accent gold.
- Aggressive because of the red confirm and the media proof. The rest of the chrome stays quiet.

Don't:

- Yellow/amber treatment on this tone. That is a different warning.
- Circle around the X.
- Confirm as a gold accent button.
- Skip the thumb when a preview path exists.

Tokens / classes:

- Danger primary: `bg-red-500/90 text-stone-100 hover:brightness-110`
- Meta: `SettingsModalSurface`, `text-[11px] text-stone-500`

Code: `src/components/ConfirmDialog.tsx`, `src/components/MediaView.tsx` (`handleDelete`)

---

## Errors (draft)

Where:

Do:

Don't:

Tokens / classes:

Code:

---

## Toasts (draft)

Where:

Do:

Don't:

Tokens / classes:

Code:
