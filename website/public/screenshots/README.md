# Home page screenshots

Drop WebP/PNG captures in **`website/src/assets/screenshots/`** (sorted by filename). The home carousel uses Astro `<Image />` for responsive WebP and srcset at build time.

Optional: keep copies in `website/public/screenshots/` for reference; the build reads **`src/assets/screenshots/`** only.

**Naming:** numeric prefix for sort order, e.g. `01-library.webp`, `02-download-downloading.webp`, `03-music-now-playing.webp`.

**Size:** 1200x675 (16:9) recommended.

## Prep from repo root `public/`

During asset prep you can drop PNG/JPG captures in the **repo root** `public/` (not this folder). Convert with ImageMagick to 1200x675 WebP here as `01-<slug>.webp`, `02-<slug>.webp`, etc. (numeric sort on original names). Remove the root `public/` screenshot originals after conversion; keep `neotubeIcon.png` and other non-screenshot assets.

## Capture size in the app (dev only)

1. Run `npm run tauri dev`.
2. Open the **main** window DevTools (right-click → Inspect).
3. In the **Console**, run:

```js
await ruforgeScreenshot.frame()
```

That sets the window to **1200x675** and locks resize so the frame stays exact. Alternatives:

```js
await ruforgeScreenshot.frameHd()   // 1280x720
await ruforgeScreenshot.frame(1400, 787)  // custom
await ruforgeScreenshot.unlock()  // allow resize again
```

4. Navigate to the screen you want (Downloader, Library, Player).
5. Capture with **Win+Shift+S** or Snipping Tool (window or region).
6. Save into this folder, rebuild or refresh the site.

`ruforgeScreenshot` only exists in **development** builds, not release installers.
