# RuForge website

Marketing and docs site for [RuForge](https://github.com/UnboundAngel/RuForge). Astro 5 (pinned to `5.18.2`, ignore the upgrade nag), Tailwind v4, React islands, Astro view transitions (`ClientRouter` with a persisted header).

## Develop

`website/` has its own `package.json`. Run `npm install` here after every pull. Node 22.12 or newer.

```bash
cd website
npm install
npm run dev
```

The dev server runs on port 4321 with `--host` and prints a QR code so you can open the site on a phone over the LAN.

```bash
npm run build
```

Output: `website/dist/`.

## Two page trees

Every desktop route has a mobile twin under `/m/` (`src/pages/m/`). A visible change usually means editing both.

- `BaseLayout`'s inline script sends phone user agents under 768px to `/m/` (crawlers are skipped) and redirects `*.pages.dev` to `ruforge.app`.
- Desktop is canonical. `/m/` is the mobile alternate and is left out of the sitemap.
- Build mobile links with `mobileHref()` (`src/lib/mobileHref.ts`).

## Routes

| Route | Source |
|-------|--------|
| `/` | `index.astro`, hero carousel, landing features |
| `/download` | `download.astro`. `/download?download=demo` runs the download flow without a real file |
| `/features`, `/features/*` | Real files in `src/pages/features/*.astro` take priority over the `[section]` template |
| `/[section]`, `/[section]/[slug]` | Generated from `NAV_SECTIONS` in `src/lib/sitePages.ts` |
| `/docs`, `/docs/[slug]` | `docsTree.ts` + `docsContent.ts` |
| `/docs/built-with`, `/docs/built-with/[tool]` | `builtWithPages.ts` |
| `/changelog` | `src/content/releases/*.md` |
| `/roadmap` | `src/content/roadmap.json` |
| `/legal`, `/legal/privacy`, `/legal/terms`, `/legal/notice` | `docs/ruforge/legal/*.md` via `src/lib/legal.ts` |

Mobile twins live at the same paths under `/m/` (features and legal use `[slug]` / `[doc]` routes there).

## Where copy lives

Most copy is in TypeScript data files under `src/lib/`, not markdown.

- `sitePages.ts`: site structure. Each page in `NAV_SECTIONS` becomes `/[section]/[slug]` through a template that uses `outline` as placeholder headings. `externalHref` skips the build and links out.
- `siteNavMenu.ts`: header mega-menu.
- `docsTree.ts` + `docsContent.ts`: docs. Content is keyed by page slug, then by the exact `outline` heading string. Block types: `paragraphs`, `steps`, `bullets`, `note`, `tip`, `warning`, `table`, `codeBlock`, `image`, `split`, `collapsible`.
- `featurePageData.ts`, `landingFeatures.ts`, `testimonials.ts`, `glossaryTerms.ts`.
- Roadmap rows: `src/content/roadmap.json`.
- Design reference: [`docs/ruforge/website/design.md`](../docs/ruforge/website/design.md).

## Versions

Never hardcode a version.

- Download badge and installer URLs: `astro.config.mjs` reads root `updater.json` (last shipped release) and exposes it as `__APP_VERSION__` (`src/lib/appVersion.ts`).
- Roadmap "next version": `src/lib/roadmapNextVersion.ts` reads `Shipping version:` from root `STATE.md`.

## Changelog

`src/content/releases/*.md` is generated from root `updater.json` structured `notes` by `npm run prep:website-release` (repo root). Never hand-edit it.

## Legal

Legal pages render `docs/ruforge/legal/*.md` at build time (`src/lib/legal.ts`). There is no copy in `website/`.

- The files use escaped markdown with a blank line after every wrapped line. Two or more blank lines mark a real paragraph break.
- Each file needs a `Last updated:` line or the build throws.
- `LEGAL_ITEM_ANCHORS` maps anchor ids to exact phrases in `PRIVACY.md`. The login trust card deep links to them. If a phrase stops matching, the build fails.
- Heading ids are slugified for `#` deep links.
- The mobile render strips the `h1` and rewrites `/legal` links to `/m/legal`.

## Home screenshots (carousel)

Hero carousel screenshots are auto-discovered from `src/assets/screenshots/` and sorted by filename (`discoverScreenshotSlides()` in `src/lib/imageAssets.ts`).

Capture frame in the app (dev only): run `npm run tauri dev`, open DevTools on the main window, then:

```js
await ruforgeScreenshot.frame()
```

See `public/screenshots/README.md` for full steps and `unlock()` when done.

## Cloudflare Pages

1. Pages project connected to `UnboundAngel/RuForge`.
2. Root directory: `website`
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Node version: 22.12 or newer (see `package.json` engines).

`wrangler.toml` sets `pages_build_output_dir = "dist"` for optional Wrangler deploys.

## Constraints

- No analytics or third-party scripts.
