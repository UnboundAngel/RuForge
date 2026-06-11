# RuForge website

Static marketing site (Astro 5, Tailwind v4) for [RuForge](https://github.com/UnboundAngel/RuForge).

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Home, download CTA, pillars, latest release |
| `/changelog` | Release history from `src/content/releases/*.md` |
| `/roadmap` | Public tracker from `src/content/roadmap.json` |
| `/legal` | Links to privacy, terms, notice (renders `../docs/legal/*.md` at build time) |

## Develop

```bash
cd website
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output: `website/dist/`

## Cloudflare Pages

1. Create a Pages project connected to `UnboundAngel/RuForge`.
2. **Root directory:** `website`
3. **Build command:** `npm run build`
4. **Build output directory:** `dist`
5. **Node version:** 22 or newer (see `package.json` engines).

`wrangler.toml` sets `pages_build_output_dir = "dist"` for optional Wrangler deploys.

## Content

- **Releases:** generated from root `updater.json` structured `notes` via `npm run prep:website-release` (writes `src/content/releases/v0-1-x.md` with frontmatter `version`, `date`, `additions`, `fixes`). Do not hand-author release markdown at ship time.
- **Roadmap:** edit `src/content/roadmap.json`, then rebuild.
- **Legal:** edit files under repo `docs/legal/`; no copy in `website/`.

## Home screenshots (carousel)

Put one or more images in **`public/screenshots/`** (sorted by filename). The hero crossfades between them with a progress bar underneath. A single legacy file `public/screenshot.webp` still works if the folder is empty.

**Capture frame in the app (dev only):** run `npm run tauri dev`, open DevTools on the main window, then:

```js
await ruforgeScreenshot.frame()
```

See `public/screenshots/README.md` for full steps and `unlock()` when done.

## Constraints

- No analytics or third-party scripts.
- Client JS only on `/roadmap` (status and app-area filters).
