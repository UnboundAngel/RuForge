# RuForge Website Asset Audit

**Date:** 2026-05-26
**Scope:** `website/src/`, `website/public/` (Astro project at ruforge.app)
**Current total static asset weight (src + public, excluding dist/):** ~22.9 MB

---

## 1. Heaviest Assets (sorted by size)

### Images

| File | Size (KB) | Format | Where used | Recommended action |
|------|-----------|--------|------------|-------------------|
| `src/assets/landing-grain.png` | 2,999 | PNG | `index.astro` via `LandingBackdrop` (5.5% opacity, `mix-blend-soft-light` tile) | **Convert to WebP, target <100 KB.** CSS SVG noise fallback already exists. NEEDS CONFIRMATION: texture is used at low opacity with blend mode. |
| `public/download-hero-logo.svg` | 1,335 | SVG | `DownloadHeroMark.tsx` (fetched at runtime, pointer-driven gradients) | **Review SVGO settings.** AGENTS.md says it was SVGO-compressed already. May have intentionally verbose gradients. NEEDS REVIEW. |
| `public/tutorials/explorer.png` | 882 | PNG | `siteNavMenu.ts` featured image (raw `<img>` via React) | **Migrate to `src/assets/` import or convert to WebP in public/** |
| `public/tutorials/library.png` | 667 | PNG | `siteNavMenu.ts` featured image (raw `<img>` via React) | **Migrate to `src/assets/` import or convert to WebP in public/** |
| `src/assets/tutorials/download/download2.png` | 526 | PNG | `landingFeatures.ts`, `features/downloader.astro` (Astro `<Image>` optimized) | Astro auto-converts at build. Source is large but output is OK. Low priority. |
| `public/tutorials/download2.png` | 526 | PNG | `siteNavMenu.ts` featured image (raw `<img>`) | **Orphan candidate if migrated to src/assets import** |
| `src/assets/tutorials/docs/pastealink.png` | 462 | PNG | `DocsPageTemplate.astro` via `import.meta.glob` (Astro `<Image>`) | Auto-optimized at build. Low priority. |
| `src/assets/tutorials/docs/watch-progress.png` | 423 | PNG | `DocsPageTemplate.astro` via `import.meta.glob` (Astro `<Image>`) | Auto-optimized at build. Low priority. |
| `public/tutorials/music-mode.png` | 397 | PNG | `siteNavMenu.ts` featured image (raw `<img>`) | **Migrate to `src/assets/` import or convert to WebP** |
| `public/favicon.png` | 389 | PNG | `BaseLayout.astro` `<link rel="icon">` | **Replace with proper favicon set (16x16, 32x32, 180x180). Target <5 KB for .ico.** |
| `public/ruforge-logo.png` | 389 | PNG | **ORPHAN.** Not referenced by any code. `src/assets/ruforge-logo.png` is the actual import used by `Logo.astro` and `SiteFooter.astro`. | **Delete after confirmation.** |
| `src/assets/ruforge-logo.png` | 389 | PNG | `Logo.astro`, `SiteFooter.astro` (Astro `<Image>` optimized) | Auto-optimized at build. Source is large for a logo. Could pre-shrink. |
| `public/tutorials/playlists.png` | 329 | PNG | `siteNavMenu.ts` featured image (raw `<img>`) | **Migrate to `src/assets/` import or convert to WebP** |
| `src/assets/tutorials/docs/library.png` | 329 | PNG | `DocsPageTemplate.astro` via `import.meta.glob` (Astro `<Image>`) | Auto-optimized. Low priority. |

### Fonts (the biggest single category of waste)

| What | Files | Size (KB) | Status |
|------|-------|-----------|--------|
| **Actually loaded by CSS** (3 woff2 variable fonts) | 3 | 106 | **Needed** |
| Unused TTF static weights | 27 | 2,004 | **DELETE** |
| Unused EOT files | 21 | 1,128 | **DELETE** |
| Unused OTF files | 18 | 775 | **DELETE** |
| Unused WOFF files | 24 | 656 | **DELETE** |
| Unused WOFF2 static weights | 21 | 494 | **DELETE** |
| **Total font waste** | **111** | **5,056** | |

The CSS (`fonts.css`) loads exactly three variable-weight woff2 files:
- `CabinetGrotesk-Variable.woff2` (41 KB)
- `Satoshi-Variable.woff2` (42 KB)
- `patrick-hand-latin-400-normal.woff2` (23 KB)

The remaining 111 files are the full font packages (every weight as individual TTF/OTF/EOT/WOFF/WOFF2) that shipped with the downloads but are never referenced by any `@font-face` rule, CSS, or component. All font subsets for Patrick Hand (vietnamese, latin-ext) beyond the latin woff2 are also unused.

---

## 2. Duplicate Assets (public/ vs src/assets/)

Images that exist in BOTH `public/` (served raw, no optimization) AND `src/assets/` (imported through Astro `<Image>`, auto-converted to WebP). The `src/assets/` version is the one actually imported in components.

### Confirmed orphans in public/ (src/assets/ import is the real reference)

| public/ file(s) | Total KB | Reason orphaned |
|-----------------|----------|-----------------|
| `public/testimonials/*.webp` (16 files) | 416 | `imageAssets.ts` globs from `src/assets/testimonials/` |
| `public/screenshots/*.webp` (5 files + README + .gitkeep) | 160 | `imageAssets.ts` globs from `src/assets/screenshots/` |
| `public/highlight-coffee-beans.webp` | 107 | `index.astro` imports from `src/assets/` |
| `public/ruforge-logo.png` | 389 | `Logo.astro` and `SiteFooter.astro` import from `src/assets/` |
| **Subtotal** | **1,072** | |

### public/tutorials/ (NOT simple orphans: some files ARE referenced)

24 files totaling 5,253 KB in `public/tutorials/`. Two code paths reference them via raw string paths:

1. **`siteNavMenu.ts`** uses 6 "hero" images: `download2.png` (526), `library.png` (667), `explorer.png` (882), `music-mode.png` (397), `resources.png` (16), `playlists.png` (329) = **2,817 KB**
2. **`features/index.astro`** uses 18 "step" images via `FeatureHubsGrid` React component: `downloadstep1-3`, `medialibrarystep1-3`, `mediaplayerstep1-3`, `sponsorstep1-3`, `miniplayerstep1-3`, `settingsstep1-3` = **2,436 KB**

These bypass Astro's image optimization pipeline entirely (served as raw uncompressed PNGs). Many of these have equivalent files in `src/assets/tutorials/` already, but with different filenames (e.g., `public/tutorials/downloadstep1.png` vs `src/assets/tutorials/download/downloadStep1.png`).

---

## 3. Raw `<img>` Usage (bypassing Astro optimization)

| Component/File | Count | How images are referenced |
|----------------|-------|--------------------------|
| `FeatureStackedCards` (React, client:load) | 18 images | `imageSrc` string prop pointing to `/tutorials/*.png` |
| `SiteHeaderNav.tsx` (React, mega-menu) | 6 images | `image` field from `siteNavMenu.ts` pointing to `/tutorials/*.png` |
| `DownloadHeroMark.tsx` (React) | 1 SVG | Fetches `/download-hero-logo.svg` at runtime |
| `BaseLayout.astro` | 1 | `<link rel="icon" href="/favicon.png">` |

All of these serve unoptimized PNGs/SVGs directly from `public/`.

---

## 4. Per-Page Payload Breakdown (estimated)

These are the static assets loaded per route (images + fonts, excluding JS/CSS bundles).

| Route | Key assets loaded | Estimated payload (KB) |
|-------|-------------------|----------------------|
| `/` (landing) | landing-grain.png (3,000), highlight-coffee-beans.webp (107), 5 screenshots (~160), 16 testimonial avatars (~416), ruforge-logo (~389), 3 fonts (106) | **~4,178** |
| `/download` | download-hero-logo.svg (1,335), ruforge-logo, 3 fonts | **~1,830** |
| `/features` | 18 tutorial PNGs from public/ (~2,436), 3 fonts | **~2,542** |
| `/features/downloader` | 4 tutorial PNGs via Astro Image (auto-WebP), 3 fonts | **~300** (optimized) |
| `/features/*` (other detail pages) | 3-4 tutorial PNGs via Astro Image, 3 fonts | **~250-400** (optimized) |
| `/docs/*` | 0-2 doc images via Astro Image, 3 fonts | **~130-250** (optimized) |
| `/changelog`, `/roadmap`, `/legal/*` | Text-only + fonts | **~106** |

**The landing page (`/`) is the heaviest route by far**, primarily due to `landing-grain.png`.

Note: All pages load ALL 114 font files from `public/fonts/` because they exist in the public directory and are discoverable by crawlers, even though only 3 are referenced by CSS. The browser only downloads the 3 referenced ones, but the unused files inflate the deployed bundle and CDN storage.

---

## 5. Font Audit Detail

| Font family | CSS @font-face | Files loaded | Files on disk (unused) |
|-------------|---------------|-------------|----------------------|
| Cabinet Grotesk | `CabinetGrotesk-Variable.woff2` (41 KB) | 1 | 17 (8 static weights x TTF/WOFF/WOFF2 + Variable TTF/EOT/WOFF) |
| Satoshi | `Satoshi-Variable.woff2` (42 KB) | 1 | 35 (9 weights + italics x TTF/WOFF/WOFF2/EOT/OTF + Variable italic) |
| Patrick Hand | `patrick-hand-latin-400-normal.woff2` (23 KB) | 1 | 6 (TTF, WOFF, other subsets: vietnamese, latin-ext) |
| **Total** | **106 KB loaded** | **3** | **111 files (5,056 KB)** |

---

## 6. Action Plan (ranked by impact)

### Tier 1: High impact, safe

| # | Action | Savings (KB) | Risk | Notes |
|---|--------|-------------|------|-------|
| 1 | **Delete 111 unused font files** (keep 3 woff2 only) | 5,056 | Safe | CSS only references the 3 variable woff2 files. All others are bundled package artifacts. No code references them. |
| 2 | **Delete confirmed orphan duplicates in public/** (testimonials, screenshots, highlight-coffee-beans, ruforge-logo.png) | 1,072 | Safe | Code imports from `src/assets/`. Public copies are unreferenced. README and .gitkeep kept. |
| 3 | **Generate proper favicon set** from ruforge-logo source | 384 | Safe | Replace 389 KB favicon.png with standard multi-size set (favicon.ico 16+32, apple-touch-icon 180x180, favicon-32x32.png, favicon-16x16.png). Total <10 KB. Update BaseLayout.astro `<link>` tags. |
| **Tier 1 subtotal** | | **~6,512** | | |

### Tier 2: High impact, needs confirmation

| # | Action | Savings (KB) | Risk | Notes |
|---|--------|-------------|------|-------|
| 4 | **Convert landing-grain.png to WebP** | ~2,900 | Needs review | Used at 5.5% opacity with `mix-blend-soft-light`. WebP handles noise textures well but I need your OK since blend mode behavior is critical. CSS SVG noise fallback exists if quality degrades. |
| 5 | **Migrate public/tutorials/ images to src/assets/ imports** for features/index.astro and siteNavMenu.ts, then delete public/tutorials/ | ~5,253 | Needs review | Requires refactoring `FeatureStackedCards` to accept `ImageMetadata` instead of string `imageSrc`, and `SiteHeaderNav.tsx` similarly. The images would then go through Astro's pipeline. This is a code change, not just file ops. |
| 6 | **Optimize download-hero-logo.svg** | ~500-700 | Needs review | Already SVGO-processed per AGENTS.md. May have intentional gradient verbosity for the pointer-driven effect. Worth a second SVGO pass with gradient preservation. |
| **Tier 2 subtotal** | | **~8,600-8,800** | | |

### Tier 3: Lower priority / repo hygiene

| # | Action | Savings (KB) | Risk | Notes |
|---|--------|-------------|------|-------|
| 7 | **Pre-shrink src/assets/ruforge-logo.png** | ~350 | Safe | 389 KB for a logo is large even though Astro optimizes at build. Could resize source to 512x512 and compress. |
| 8 | **Pre-compress tutorial PNGs in src/assets/** | Repo-only | Low | Astro auto-converts at build, so runtime payload is already WebP. But source PNGs inflate git history. Could convert sources to WebP and update imports. |

---

## 7. Projected Savings Summary

| Category | Current (KB) | After fixes (KB) | Saved (KB) |
|----------|-------------|-------------------|------------|
| Fonts | 5,162 | 106 | 5,056 |
| Orphan duplicates | 1,072 | 0 | 1,072 |
| Favicon | 389 | ~5 | 384 |
| landing-grain.png | 2,999 | ~80 | 2,919 |
| public/tutorials/ (if migrated) | 5,253 | 0 | 5,253 |
| download-hero-logo.svg | 1,335 | ~600 | ~735 |
| **Total** | **~16,210** | **~791** | **~15,419** |

**Against total asset weight of 22,900 KB, this is a ~67% reduction from Tier 1+2 fixes alone.**
Adding Tier 3 (source image pre-compression) would push past 70%.

---

## 8. Questions for You

1. **landing-grain.png**: This is a tiling paper grain texture at 5.5% opacity with `mix-blend-soft-light`. Converting to WebP should preserve the grain pattern faithfully, but I want your sign-off since opacity + blend mode interactions can be visually sensitive. The CSS SVG noise fallback already exists as a safety net. OK to convert?

2. **public/tutorials/ migration**: The features index page (`/features`) and mega-menu both use raw `/tutorials/*.png` paths via React components. Migrating them to Astro `<Image>` requires refactoring the React components to accept `ImageMetadata` props instead of string URLs. This is a moderate code change. Do you want me to proceed with this, or keep the current approach and just convert the public PNGs to WebP in-place (simpler, smaller savings)?

3. **download-hero-logo.svg (1,335 KB)**: AGENTS.md indicates it was SVGO-compressed with specific gradient transforms for the pointer-driven effect. Should I attempt a second SVGO pass with `--preserve-gradients`, or leave this one alone?

4. **public/testimonials/ and public/screenshots/**: These appear to be orphaned duplicates of `src/assets/` files. The README files inside them suggest they're the "source of truth" for art assets, with copies in `src/assets/`. Can I delete the `public/` copies and keep only the `src/assets/` versions (which are the ones code actually imports)?

5. **Font package directories**: OK to delete the entire font package directory trees (TTF/, OTF/, all static weight files) and keep only the 3 woff2 files that CSS loads? This is purely dead weight from the downloaded font packages.

---

## Appendix: All Images >100 KB

| Size (KB) | Path (relative to website/) |
|-----------|-----------------------------|
| 2,999 | src/assets/landing-grain.png |
| 882 | public/tutorials/explorer.png |
| 667 | public/tutorials/library.png |
| 526 | src/assets/tutorials/download/download2.png |
| 526 | public/tutorials/download2.png |
| 462 | src/assets/tutorials/docs/pastealink.png |
| 423 | src/assets/tutorials/docs/watch-progress.png |
| 397 | public/tutorials/music-mode.png |
| 397 | src/assets/tutorials/player/player-audio-hero.png |
| 389 | public/ruforge-logo.png |
| 389 | public/favicon.png |
| 389 | src/assets/ruforge-logo.png |
| 329 | public/tutorials/playlists.png |
| 329 | src/assets/tutorials/docs/library.png |
| 258 | src/assets/tutorials/mini/miniStep1.png |
| 258 | public/tutorials/miniplayerstep1.png |
| 256 | src/assets/tutorials/docs/find-in-library.png |
| 244 | src/assets/tutorials/sponsor/sponsorStep1.png |
| 244 | public/tutorials/sponsorstep1.png |
| 223 | public/tutorials/sponsorstep2.png |
| 223 | src/assets/tutorials/sponsor/sponsorStep2.png |
| 208 | src/assets/tutorials/mini/miniStep2.png |
| 208 | public/tutorials/miniplayerstep2.png |
| 198 | src/assets/tutorials/player/playerStep3.png |
| 198 | public/tutorials/mediaplayerstep3.png |
| 197 | src/assets/tutorials/sponsor/sponsor-scrub.png |
| 184 | src/assets/tutorials/download/downloadStep2.png |
| 184 | public/tutorials/downloadstep2.png |
| 162 | src/assets/tutorials/player/playerStep1.png |
| 162 | public/tutorials/mediaplayerstep1.png |
| 161 | src/assets/tutorials/download/downloadStep3.png |
| 158 | public/tutorials/downloadstep3.png |
| 157 | public/tutorials/mediaplayerstep2.png |
| 157 | src/assets/tutorials/player/playerStep2.png |
| 153 | src/assets/tutorials/library/libraryStep1.png |
| 153 | public/tutorials/medialibrarystep1.png |
| 144 | src/assets/tutorials/library/libraryStep3.png |
| 144 | public/tutorials/medialibrarystep3.png |
| 138 | src/assets/tutorials/library/libraryStep2.png |
| 138 | public/tutorials/medialibrarystep2.png |
| 120 | src/assets/tutorials/docs/download-directory.png |
| 110 | src/assets/tutorials/docs/internal-vault.png |
| 107 | src/assets/highlight-coffee-beans.webp |
| 107 | public/highlight-coffee-beans.webp |
| 105 | src/assets/tutorials/docs/choose-format.png |
| 104 | src/assets/tutorials/player/player-chapters.png |
