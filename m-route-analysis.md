# /m/ Route Analysis

Investigation of the `/m/` mobile route tree in the RuForge public website (`website/`).

---

## 1. What is /m/ used for?

### Where the route is defined

`/m/` is a full Astro page tree at `website/src/pages/m/`. It is not a redirect rule, middleware, or config rewrite. It is 14 Astro page files that map to approximately 94 rendered URLs (via dynamic `[section]/[slug]`, `docs/[slug]`, `docs/built-with/[tool]`, `legal/[doc]`, `features/[slug]` routes plus bespoke pages).

**Files in the tree:**

| File | What it renders |
|------|-----------------|
| `m/index.astro` | Mobile landing page |
| `m/download.astro` | Mobile download page |
| `m/changelog.astro` | Mobile changelog |
| `m/roadmap.astro` | Mobile roadmap |
| `m/features/index.astro` | Features section index |
| `m/features/[slug].astro` | 6 feature detail pages |
| `m/docs/index.astro` | Docs section index |
| `m/docs/[slug].astro` | Individual docs pages |
| `m/docs/built-with/index.astro` | Built-with index |
| `m/docs/built-with/[tool].astro` | 16 built-with tool pages |
| `m/legal/index.astro` | Legal section index |
| `m/legal/[doc].astro` | Privacy, terms, notice |
| `m/[section]/index.astro` | Section index (features, company, resources, help, docs) |
| `m/[section]/[slug].astro` | Content pages within any section |

### What lives under /m/

A fully separate mobile page tree. Every desktop page has a `/m/` counterpart. Each `/m/` page:
- Uses `MobileShell.astro` instead of `BaseLayout.astro`
- Has mobile-specific components (`MobileHeader`, `MobileFullscreenNav`, `MobileFooter`, `MobileFeatureAccordion`, `MobileTechCard`, `MobileContentPage`, `MobileDocsPage`, `MobileSectionIndex`)
- Renders genuinely different HTML structure, not just different CSS

### How users get redirected

**Client-side JavaScript in `BaseLayout.astro` (lines 73-81):**

```javascript
(function() {
  var ua = navigator.userAgent;
  if (/Googlebot|bingbot|Baiduspider|YandexBot|DuckDuckBot|Slurp|OAI-SearchBot|ChatGPT-User|PerplexityBot|ClaudeBot|Applebot/i.test(ua)) return;
  if (!/Mobi|Android|iPhone|iPad|iPod/i.test(ua) || window.innerWidth >= 768) return;
  var p = window.location.pathname.replace(/\/+$/, '') || '/';
  if (p.startsWith('/m/') || p === '/m') return;
  window.location.replace('/m' + p);
})();
```

Logic: on every desktop page load, this inline script runs synchronously in `<head>`. It:
1. Exempts search engine bots and AI crawlers (Googlebot, Bingbot, OAI-SearchBot, etc.)
2. Checks for mobile user agent AND viewport < 768px
3. If both conditions are met, does `window.location.replace('/m' + currentPath)` (no history entry)
4. Already on `/m/`? No-op.

No middleware, no `_redirects` file, no Astro config rewrite. Pure client-side.

### SEO wiring

**`MobileShell.astro` injects two meta tags on every `/m/` page:**

```html
<meta name="robots" content="noindex,follow" />
<link rel="canonical" href="https://ruforge.app/[desktop-path]" />
```

The canonical is computed by stripping `/m/` from the pathname and building a full URL against `SITE.url`. For example, `/m/download` canonicalizes to `https://ruforge.app/download`.

**Sitemap:** The `@astrojs/sitemap` integration in `astro.config.mjs` has **no filter** configured. By default, Astro's sitemap integration includes all pages. Since `/m/` pages are real Astro pages, they are included in the sitemap unless the integration detects `noindex`. The `@astrojs/sitemap` integration respects `<meta name="robots" content="noindex">` and should exclude those pages, but this depends on the version. If it does not, the sitemap contains URLs that search engines are told not to index, which is a mixed signal.

**`robots.txt`:** No `/m/` specific rules. All crawlers see `Allow: /` by default. The `/m/` pages are not disallowed at the crawler level.

---

## 2. Why does /m/ exist?

### Origin from the Shipped log

The AGENTS.md Shipped log tells the story chronologically (v0.1.9 unreleased, reading bottom-up):

1. **"Website responsive strip"** (early): All mobile-collapse responsive logic was intentionally removed from the desktop site. Hamburger nav, mobile drawer, responsive stacking for feature rows, testimonial columns, docs sidebar, footer grid, mega-menus. All deleted. The desktop site was locked to its multi-column desktop layouts.

2. **"Website desktop/mobile shell scaffold"**: `DesktopShell.astro` and `MobileShell.astro` created as separate layout shells. Mobile entry at `/m/`.

3. **"Mobile landing page at /m/"** through **"Mobile shell full-site coverage"**: Progressive build-out of the entire mobile page tree, from landing page, to download, to all content/docs/legal/features/changelog/roadmap pages.

### The actual reasoning

The desktop site was designed as a premium, heavily visual experience: 3D perspective hero carousel, infinite marquee tech ticker, three-column testimonial marquee, Radix mega-menu navigation, Framer Motion animations, scroll-reveal effects, perspective transforms, `backdrop-filter` frosted glass, `will-change` layers, and inline `<style>` blocks totaling hundreds of lines per page.

Rather than making that complex desktop layout responsive (which was attempted and then deliberately reversed), the decision was to:
1. Strip all responsive breakpoints from the desktop site
2. Build a separate mobile-first page tree from scratch
3. Redirect mobile users via client-side UA + viewport detection

No commit message or design doc explicitly states "we chose this over responsive design because X." The sequence in the Shipped log implies it was an incremental choice: first the responsive code was removed (possibly because it was fighting the desktop design), then mobile was built separately.

---

## 3. Technical analysis: what /m/ actually does differently

### Genuinely different HTML, not a CSS swap

The desktop landing (`index.astro`, 377 lines including `<style>` and `<script>`) and the mobile landing (`m/index.astro`, 94 lines) share almost no markup. They pull from some of the same data sources (`landingFeatureRows`, `techTickerItems`) but render them through entirely different component trees.

**Desktop landing page loads:**
- `BaseLayout.astro` with `ClientRouter` (Astro view transitions), OG meta, JSON-LD structured data
- `SiteHeader.astro` with `SiteHeaderNav` (Radix `NavigationMenu`, React island, `client:idle`)
- `HeroAnimatedTitle` (React island, Framer Motion `AnimatedText`, `client:load`)
- `HeroCarousel` (multi-image carousel with keyboard nav, progress bar, intersection observer)
- `LandingBackdrop` (layered background with grain texture, gradient zones)
- `LandingFeaturesSection` (alternating copy/screenshot rows, Astro `<Image>`)
- `TestimonialsSection` (3-column marquee, 30 testimonials, continuous CSS animation)
- Highlight card with coffee beans WebP background
- `SiteFooter` (multi-column, aged-paper background)
- Inline `<style>`: 3D perspective transforms, marquee keyframes, scroll-reveal observers, card spotlight tracking
- Inline `<script>`: card spotlight mouse tracking, intersection observer scroll reveal

**Mobile landing page loads:**
- `MobileShell.astro` (minimal `<head>`, no view transitions, no JSON-LD, no OG meta beyond title/description)
- `MobileHeader` (React island, `client:load`, ~137 lines, dual-state scroll header)
- `AnimatedText` (same component, smaller size)
- `MobileTechCard` (static 2-column grid, no marquee, no animation)
- `MobileFeatureAccordion` (React island, `client:visible`, tap-to-expand cards)
- `MobileFooter` (single-column, same aged-paper background)
- `useHaptic` hook (lazy-loads `@mxerf/tappt` for iOS/Android haptic feedback)
- MobileShell inline script: ripple effect delegate + haptic feedback on `pointerdown`

### What mobile skips

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Astro `ClientRouter` view transitions | Yes | No |
| Radix NavigationMenu mega-menus | Yes (full React tree) | No (fullscreen nav overlay) |
| `SiteHeaderNav.tsx` (~326 lines React) | Yes | No |
| Framer Motion (animation library) | Loaded for hero + nav | Not loaded |
| `HeroCarousel` (multi-slide, keyboard, progress) | Yes | No |
| `LandingBackdrop` (grain texture, gradient layers) | Yes | No |
| Testimonials marquee (30 cards, 3 columns) | Yes | No |
| Scroll-reveal intersection observer | Yes | No |
| Card spotlight mouse tracking | Yes | No |
| 3D perspective CSS transforms | Yes | No |
| `backdrop-filter: blur(20px)` on header | Yes (frost effect) | Yes (simpler) |
| OG meta / Twitter cards | Full set | Missing (`MobileShell` has no OG) |
| JSON-LD structured data | Yes (SoftwareApplication, Organization) | Only on `/m/download` |
| `@mxerf/tappt` haptic feedback | No | Yes (lazy-loaded) |
| Material ripple on tap | No | Yes |

### What mobile adds

Mobile has features desktop does not:
- **Haptic feedback** (`useHaptic` hook, lazy-loads `@mxerf/tappt` for iOS Taptic Engine / Android Vibration API)
- **Material Design ripple effect** on tap targets (CSS `@keyframes rf-ripple-expand` + JS `pointerdown` delegate)
- **Touch-optimized interaction patterns**: large 44px tap targets, `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`
- **Fullscreen nav overlay** with staggered entrance animations and one-section-at-a-time accordion
- **OS-detect download CTA** that adapts label and disables button if platform is not Windows

### Payload difference

**Desktop landing page bundle includes:**
- React 19
- Framer Motion (`framer-motion`, ~150KB min+gz typically)
- Radix UI NavigationMenu (`@radix-ui/react-navigation-menu`)
- Multiple Astro `<Image>` components (carousel screenshots, testimonial avatars, feature screenshots, coffee beans, grain texture, footer doodles)
- `SiteHeaderNav.tsx` (326+ lines of React)
- `HeroCarousel` (400+ lines including JS)
- Testimonials system (30 quotes across 3 animated columns)

**Mobile landing page bundle includes:**
- React 19 (same)
- `MobileHeader.tsx` (~137 lines)
- `MobileFullscreenNav.tsx` (~215 lines)
- `MobileFeatureAccordion.tsx` (~107 lines)
- `useHaptic.ts` (~41 lines, lazy-loads `@mxerf/tappt`)
- `AnimatedText` (shared, small)
- Feature images (same source, but `width: 640` vs desktop full-width)
- Footer doodle image

Mobile does not load Framer Motion or Radix UI at all. The JavaScript payload is meaningfully smaller. The HTML is simpler (no layered backdrop, no carousel, no testimonials, no scroll-reveal). Image count is lower (no carousel screenshots, no testimonial avatars, no grain texture overlay).

A rough estimate: desktop JS bundle is likely 200-300KB larger (Framer Motion alone is ~150KB min), and HTML/CSS is significantly less complex on mobile.

### Component reuse between desktop and mobile

Shared:
- `AnimatedText` (hero underline animation)
- `TechTickerIcon` (renders the same SVG icons)
- `landingFeatureRows`, `techTickerItems`, `docsContent`, `sitePages`, `docsTree` (data/content sources)
- `ReleaseList` (changelog rendering, used with `compact` prop on mobile)
- `SpiralLoader` (docs page widget)
- `GLOSSARY_TERMS` (docs tooltip data)
- `detectPlatform.ts` (OS detection for download CTA)

Not shared (mobile-only):
- `MobileHeader`, `MobileFullscreenNav`, `MobileFooter`, `MobileFeatureAccordion`, `MobileTechCard`, `MobileContentPage`, `MobileDocsPage`, `MobileSectionIndex`, `useHaptic`

Not shared (desktop-only):
- `SiteHeader`, `SiteHeaderNav`, `SiteFooter`, `HeroCarousel`, `LandingBackdrop`, `LandingFeaturesSection`, `TestimonialsSection`, `HeroAnimatedTitle`, `navigation-menu`, `icon-pill-tooltip`, `EtheralShadow`, `CodeSnippetPanel`, `DocsSidebar`, `DocsSearch`, and many more

---

## 4. Trade-offs and risks

### SEO: the canonical/noindex situation

**Current state:**
- Every `/m/` page has `<meta name="robots" content="noindex,follow">`
- Every `/m/` page has `<link rel="canonical" href="[desktop version]">`

**This is technically correct for a separate mobile URL pattern.** Google's documentation on separate mobile URLs explicitly prescribes this exact setup: `noindex` on the alternate URL, canonical pointing to the desktop version. The signals are consistent.

**However, there are problems:**

1. **No `rel="alternate"` on the desktop pages.** Google's separate-URL mobile spec says desktop pages should include `<link rel="alternate" media="only screen and (max-width: 768px)" href="[mobile URL]">` so Googlebot can discover the mobile versions and understand the relationship. This is missing entirely. Without it, Google only sees the `/m/` pages if it follows internal links or the sitemap, and it has to infer the relationship from the canonical alone.

2. **Sitemap inclusion is ambiguous.** The `@astrojs/sitemap` integration has no `filter` configured to exclude `/m/` paths. If `/m/` URLs appear in the sitemap alongside their desktop counterparts, Google receives contradictory signals: "here is a URL in my sitemap (implying I want it indexed)" alongside "do not index this URL." Modern Googlebot handles this fine (the `noindex` wins), but it wastes crawl budget and can slow index coverage for the desktop versions.

3. **Client-side redirect means Googlebot sees the desktop page.** The redirect script explicitly exempts bots. This is intentional and correct. Googlebot will crawl and index the desktop HTML. Mobile Googlebot (which uses a mobile UA) is also exempted, so it sees the desktop page too. **This means Google indexes the desktop version for both mobile and desktop results.** Since the desktop version has no responsive breakpoints (they were deliberately removed), Google's mobile-friendliness assessment will flag it. The desktop page will fail mobile usability in Search Console because it is not responsive, and the mobile version that IS friendly is marked `noindex`.

4. **Missing OG meta on MobileShell.** If someone shares a `/m/` URL on social media (unlikely but possible), there are no OpenGraph tags. The canonical tag does not propagate OG data.

### The Lighthouse "blocked from indexing" flag

If Lighthouse flagged `/m/` pages as "blocked from indexing" with bad canonical, that is Lighthouse **correctly** detecting the `noindex` + canonical combo. This is not a bug, it is working as designed. The question is whether the design is right.

For a site with meaningful mobile traffic where you want mobile pages to contribute to search rankings, `noindex` on the mobile version is a problem. For RuForge's situation (a Windows desktop app where the mobile site is informational/download-oriented, and the primary audience arrives via desktop or via direct links), it is likely fine. The desktop versions carry the SEO weight.

### The fundamental trade-off

**What the separate tree buys:**
- Genuinely different component architecture (no Framer Motion, no Radix, no carousel, no 3D transforms)
- Lower JS payload on mobile (estimated 200KB+ savings from skipping Framer Motion alone)
- Touch-native interactions (haptics, ripples, large tap targets) that would be dead weight on desktop
- Simpler HTML (no layered backdrops, fewer DOM nodes)
- Full design control without fighting desktop layout assumptions

**What it costs:**
- 14 page files + 9 components to maintain in parallel with desktop
- Every new page needs a mobile counterpart
- Bug fixes to shared data/content need testing in both trees
- Internal links in `MobileFooter.astro` currently point to desktop paths (`/features`, `/legal/privacy`, etc.) instead of `/m/` paths, which will redirect mobile users back through the JS redirect. Same issue in `MobileFullscreenNav.tsx` sub-item links that use `pageHref()` without the `/m/` prefix.
- SEO complexity (separate URL pattern, canonical/alternate wiring, sitemap management)
- The redirect is client-side only, so there is a brief flash of desktop content on mobile before the redirect fires

### Bugs found during this investigation

1. **`MobileFooter.astro` links point to desktop paths.** Lines 9-14 (`productLinks`) and lines 23-27 (`legalLinks`) use `/features`, `/docs`, `/changelog`, `/roadmap`, `/legal/privacy`, etc. These are desktop URLs. A mobile user tapping them will load the desktop page, which will fire the redirect script back to `/m/`. This adds a full extra page load on every footer navigation.

2. **`MobileFullscreenNav.tsx` sub-item links** at line 93 use `page.externalHref ?? pageHref(section.id, page.slug)`. The `pageHref` function returns desktop paths (e.g. `/features/downloader`). Only the "View all" link at line 102 correctly uses `/m/${section.id}`.

3. **No sitemap filter for `/m/` pages.** The `astro.config.mjs` sitemap integration has no `filter` callback. If the `@astrojs/sitemap` integration does not automatically respect `noindex` meta tags (it processes routes, not rendered HTML), all 94 `/m/` URLs appear in the sitemap alongside their `noindex` directive. This should be verified by building the site and checking the generated sitemap.

### Should /m/ be kept or killed?

**Case for keeping /m/:**
- The desktop site deliberately has no responsive design. It would need a significant rework to become responsive.
- The desktop page tree is heavy: Framer Motion, Radix, 3D transforms, multi-column marquees, frosted glass effects. Making all of that responsive while keeping it performant on mobile would be a larger effort than maintaining the separate tree.
- The mobile tree is already built and covers all pages. The maintenance cost going forward is incremental (new pages need a mobile counterpart).
- Touch interactions (haptics, ripples) are genuinely mobile-only features that would be dead code on a responsive desktop site.

**Case for killing /m/ and going responsive:**
- 14 page files + 9 components is real maintenance surface area. Every content change needs two edits.
- The internal link bugs (footer, nav) show the fragility of parallel trees: it is easy to forget the `/m/` prefix.
- Client-side redirect has a flash-of-wrong-content problem. Server-side detection (Astro middleware or Cloudflare Worker) would fix this but adds more complexity.
- The mobile content pages (`MobileContentPage.astro`) are mostly placeholder ("Content for this page is coming soon"), meaning the mobile tree is ~94 pages wide but shallow on actual content. Many pages show section headings with "Full write-up coming soon" text.
- Modern Tailwind responsive utilities can conditionally hide/show entire component trees without shipping unused JS. A `hidden lg:block` on the carousel and a `lg:hidden` on a simpler mobile component would achieve the same split without a separate URL tree.
- The SEO setup (separate URLs, canonical, noindex, missing alternate link) is more complex than responsive design (single URL, single canonical, one HTML document that Google renders at any viewport).

**Honest assessment:**

The `/m/` tree is well-built for what it is. The mobile landing page is genuinely lighter and better designed for touch than a responsive version of the desktop page would be. The haptic feedback, ripple effects, and accordion patterns are thoughtful mobile-native choices.

But the architecture is overengineered for a marketing website for a Windows desktop app. The primary audience (yt-dlp CLI users, DataHoarder/selfhosted crowd, Tauri developers) skews heavily desktop. The mobile site exists to serve a secondary audience (someone who sees a Reddit post on their phone and wants to learn what RuForge is). For that use case, a responsive version of the desktop site with conditionally rendered components would be sufficient and dramatically simpler to maintain.

The "separate mobile tree" pattern is a legitimate architecture (Google documents it, major sites use it). But it is typically justified when the mobile experience needs to be fundamentally different from desktop (e.g. a web app with different workflows on mobile vs desktop). For a static marketing site, the maintenance overhead and SEO complexity outweigh the performance benefits, which could be achieved through simpler means (conditional component rendering, code splitting, responsive Tailwind classes).

### What would break if /m/ were removed entirely?

1. Mobile users would see the unresponsive desktop site (multi-column layouts that overflow on narrow viewports, mega-menu navigation that requires hover, tiny text, horizontal scrolling).
2. Any bookmarked or shared `/m/` URLs would 404 unless redirects were added.
3. The haptic feedback and ripple effects would be lost (minor).
4. Mobile download page with OS detection would be lost (could be moved to the desktop download page).

Removing `/m/` without also restoring responsive design to the desktop site would break the mobile experience. The two are coupled: `/m/` exists because responsive was removed, and responsive was removed because `/m/` was built.

---

## Summary

| Aspect | Finding |
|--------|---------|
| **What it is** | A parallel page tree of 14 Astro files generating ~94 mobile-specific URLs |
| **How users reach it** | Client-side JS redirect (UA + viewport check, bot-exempted) |
| **SEO setup** | `noindex,follow` + canonical to desktop. Correct per Google spec but missing `rel="alternate"` on desktop pages and possibly leaking into sitemap |
| **Genuine technical advantage** | Skips Framer Motion, Radix, carousel, testimonials, 3D transforms. Adds haptics, ripples, touch-optimized layout. Estimated 200KB+ JS savings |
| **Content depth** | Landing, download, and docs pages are rich. Generic content pages are mostly placeholder |
| **Maintenance cost** | Real. Parallel trees, two sets of links (with bugs), two sets of components |
| **Is it "powerful"?** | It delivers a measurably lighter, touch-native mobile experience. Whether that justifies the architecture depends on how much mobile traffic the site gets and how much maintenance the parallel tree costs |
| **Recommendation** | Defensible as-is if mobile traffic is significant. If mobile is < 20% of traffic, a responsive rework would be simpler to maintain long-term. Fix the internal link bugs either way. |
