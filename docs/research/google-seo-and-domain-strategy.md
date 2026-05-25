# Google SEO and Domain Strategy for RuForge

Research completed May 2026. Covers SEO optimization for the Astro 5 static site
and domain/hosting decisions for RuForge (desktop YouTube downloader, Tauri v2, Windows).

---

## AREA 1: Google SEO Optimization

### 1. Technical SEO for Astro Static Sites

#### Must-haves (implement first)

**1a. Set `site` in astro.config.mjs**

Every URL Astro generates (canonical, sitemap, OG tags) depends on this value.
Without it, sitemaps contain relative URLs and canonicals break.

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ruforge.app', // or whatever domain you register
  integrations: [sitemap()],
});
```

**1b. XML Sitemap via @astrojs/sitemap**

Install: `pnpm add @astrojs/sitemap`

Generates `sitemap-index.xml` at build time. All static and dynamic routes included
automatically. Submit this URL to Google Search Console after deployment.

**1c. robots.txt**

Place in `public/robots.txt` or generate dynamically at `src/pages/robots.txt.ts`:

```
User-agent: *
Allow: /
Disallow: /404

Sitemap: https://ruforge.app/sitemap-index.xml
```

Notes:
- `Disallow` prevents crawling, not indexing. For pages you want out of the index
  entirely, use `<meta name="robots" content="noindex">` on the page itself.
- Do not block `/api/` or staging paths unless they exist in production.
- AI crawlers (GPTBot, Claude-Web, etc.) default to allowed under `User-agent: *`.
  Block explicitly only if you want to opt out of AI training.

**1d. Canonical URLs**

Every indexable page needs a self-referencing canonical in `<head>`:

```html
<link rel="canonical" href="https://ruforge.app/download" />
```

In your Astro base layout:

```astro
---
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
---
<link rel="canonical" href={canonicalURL.href} />
```

Omit canonical on pages with `noindex` (Google recommendation).

**1e. Core Web Vitals / Page Speed**

Astro ships static HTML by default with zero client JS unless you opt in. This
gives near-perfect Lighthouse scores out of the box. Key items:

- Images: already using Astro `<Image>` with WebP. Confirm `loading="lazy"` on
  below-fold images and `fetchpriority="high"` on the hero/LCP image.
- Fonts: preload critical font files, use `font-display: swap`.
- No layout shift: set explicit width/height on images and embeds.
- Keep JS islands minimal. Each `client:load` directive adds to TBT.

#### Nice-to-haves (implement later)

- `lastmod` dates on sitemap entries (use git commit dates via `serialize` option).
- Per-collection sitemaps (`sitemap-posts-0.xml`, `sitemap-pages-0.xml`) for easier
  debugging in Search Console.
- IndexNow integration for instant re-crawl on deploy (Bing, Yandex, others).
- `llms.txt` at site root describing site purpose for AI crawlers.
- Open Graph images auto-generated via satori + sharp for social sharing.

---

### 2. On-Page SEO

#### Title tags

- Unique per page. Front-load the primary keyword.
- Format: `{Page Topic} | RuForge` or `{Page Topic} - Free YouTube Downloader for Windows`
- Keep under 60 characters to avoid truncation in SERPs.

Templates by page type:

| Page | Title |
|------|-------|
| Home | RuForge - Free YouTube Downloader for Windows |
| Download | Download RuForge - YouTube Video Downloader for Windows |
| Features/Downloader | YouTube Downloader with Playlists and Audio - RuForge |
| Features/Player | Built-in Media Player - RuForge |
| Docs index | Documentation - RuForge |
| Changelog | Changelog - RuForge |
| Legal/Privacy | Privacy Policy - RuForge |

#### Meta descriptions

- Unique per page. 120-155 characters. Include primary keyword and a call to action.
- Example for /download: "Download RuForge free for Windows. Save YouTube videos in
  HD with playlist support, audio extraction, and a built-in media player. No ads."

In your base layout:

```astro
---
interface Props {
  title: string;
  description: string;
  noindex?: boolean;
}
const { title, description, noindex } = Astro.props;
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
---
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <meta name="description" content={description} />
  {noindex ? (
    <meta name="robots" content="noindex, nofollow" />
  ) : (
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  )}
  <link rel="canonical" href={canonicalURL.href} />
</head>
```

#### Heading hierarchy

- One `<h1>` per page. Contains the primary keyword.
- `<h2>` for major sections. `<h3>` for subsections.
- Do not skip levels (h1 then h3 with no h2).
- Docs pages: the page title is h1, each section heading is h2, sub-topics h3.

#### Internal linking

- Every page should be reachable within 3 clicks from the home page.
- Link from feature pages to the download page (conversion path).
- Link from docs pages to related feature pages.
- Use descriptive anchor text, not "click here."
- Add a persistent sidebar or breadcrumb on docs pages for deep linking.

#### Breadcrumbs

Implement on all docs and feature pages:

```html
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/docs">Docs</a></li>
    <li aria-current="page">Your First Download</li>
  </ol>
</nav>
```

Pair with BreadcrumbList JSON-LD (see section 3).

---

### 3. Structured Data / Schema.org (JSON-LD)

#### SoftwareApplication on /download (highest priority)

This is the schema that can trigger Google's rich result for software apps.
Required: `name`, `offers.price`, plus one of `aggregateRating` or `review`.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "RuForge",
  "description": "Free desktop YouTube downloader and media player for Windows. Download videos, playlists, and audio with a built-in library.",
  "operatingSystem": "Windows 10, Windows 11",
  "applicationCategory": "MultimediaApplication",
  "applicationSubCategory": "VideoDownloader",
  "softwareVersion": "0.1.9",
  "datePublished": "2026-05-25",
  "downloadUrl": "https://github.com/UnboundAngel/RuForge/releases/latest",
  "installUrl": "https://ruforge.app/download",
  "fileSize": "25MB",
  "screenshot": "https://ruforge.app/screenshots/downloader.webp",
  "softwareRequirements": "Windows 10 or later, WebView2 runtime",
  "publisher": {
    "@type": "Organization",
    "name": "Unbound Angel",
    "url": "https://github.com/UnboundAngel"
  },
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "12"
  }
}
</script>
```

Notes:
- `applicationCategory` must be from Google's supported list. `MultimediaApplication`
  fits best. `EntertainmentApplication` is an alternative.
- `aggregateRating` requires real reviews. Do not fabricate. If you have GitHub stars
  or real user testimonials with ratings, those count. Otherwise omit until you have
  genuine ratings (Google can issue manual actions for fake review data).
- Update `softwareVersion` and `datePublished` on each release.

#### Organization (site-wide, on home page)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Unbound Angel",
  "url": "https://ruforge.app",
  "logo": "https://ruforge.app/logo.png",
  "sameAs": [
    "https://github.com/UnboundAngel/RuForge"
  ]
}
</script>
```

#### BreadcrumbList (all docs and feature pages)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://ruforge.app/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Docs",
      "item": "https://ruforge.app/docs"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Your First Download",
      "item": "https://ruforge.app/docs/your-first-download"
    }
  ]
}
</script>
```

#### FAQPage (on docs or FAQ sections)

Only use if you have actual Q&A content on the page (Google checks).

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is RuForge free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. RuForge is free and open source under the MIT license."
      }
    },
    {
      "@type": "Question",
      "name": "Which websites does RuForge support?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "RuForge uses yt-dlp which supports 1000+ websites including YouTube, Vimeo, Twitter, and TikTok."
      }
    }
  ]
}
</script>
```

#### Validation

Test all structured data at: https://search.google.com/test/rich-results

---

### 4. Content Strategy for Search Ranking

#### Target keywords (grouped by intent)

**High-intent download keywords (primary targets):**
- "youtube downloader windows"
- "youtube video downloader free desktop"
- "download youtube videos pc"
- "youtube downloader app windows 10"
- "youtube playlist downloader desktop"
- "youtube to mp3 desktop app"

**Long-tail / comparison keywords (content opportunities):**
- "best free youtube downloader 2026"
- "yt-dlp gui windows"
- "4k video downloader alternative free"
- "youtube downloader no ads no malware"
- "how to download youtube videos on pc without browser"
- "open source youtube downloader windows"
- "youtube downloader with built-in player"
- "download youtube playlist to mp3 windows"
- "youtube downloader that supports playlists"

**Informational / docs keywords:**
- "how to download youtube videos"
- "youtube video formats explained mp4 vs mkv"
- "yt-dlp cookies browser login"
- "sponsorblock skip ads in downloaded videos"

#### Content types that rank

1. **Download/product page** - Targets transactional "youtube downloader" queries.
   Clear CTA, feature bullets, OS requirements, screenshots.

2. **Comparison pages** - "RuForge vs 4K Video Downloader" or "Best YouTube
   Downloaders 2026". These rank for "[competitor] alternative" queries.
   Be factual, include a comparison table.

3. **How-to guides** - Step-by-step tutorials ("How to download a YouTube playlist
   on Windows"). Include screenshots. Target featured snippets with numbered steps.

4. **Feature detail pages** - One page per major feature (downloader, player,
   SponsorBlock, mini player). Each targets its own keyword cluster.

5. **Glossary/FAQ** - Targets "People Also Ask" queries. Each question is a
   potential featured snippet opportunity.

6. **Changelog/release notes** - Signals freshness to Google. Regular updates
   tell crawlers the site is actively maintained.

#### Content structure recommendations

- Put the primary keyword in the first 100 words of each page.
- Use the exact target keyword in the h1 and at least one h2.
- Keep paragraphs short (2-4 sentences). Use bullet lists for scannable content.
- Add alt text to all images with relevant keywords (not keyword stuffing).
- Interlink: every feature page links to download, every tutorial links to the
  relevant feature page.
- Fresh content: publish at least one new docs page or comparison post per month.

---

### 5. Google Search Console

#### Setup (Cloudflare Pages specific)

1. Go to https://search.google.com/search-console
2. Click "Add property" > choose "Domain" type if you own the apex domain,
   or "URL prefix" for a subdomain/pages.dev URL.
3. For DNS verification (fastest for Cloudflare):
   - Google provides a TXT record value like `google-site-verification=abc123...`
   - In Cloudflare dashboard: DNS > Add Record > Type: TXT, Name: @,
     Content: the verification string.
   - TTL: Auto (300s). Usually verifies within 2-5 minutes.
4. Alternative: HTML file upload (add to `public/` in the Astro project).

#### After verification

1. **Submit sitemap:** Settings > Sitemaps > add `sitemap-index.xml`.
2. **Request indexing** for your most important pages (download, home, features).
3. **Monitor weekly:**
   - Index Coverage: check for "Excluded" pages that should be indexed.
   - Performance: impressions, clicks, average position for target keywords.
   - Core Web Vitals: any pages with poor LCP/CLS/INP.
   - Manual Actions: check for any penalties (unlikely but monitor).
4. **URL Inspection tool:** check how Google sees any specific page.
   Verify canonical, mobile usability, and structured data.

#### Key reports to watch

| Report | What to look for |
|--------|-----------------|
| Performance | Which queries drive impressions. CTR below 3% = improve title/description. |
| Coverage | Pages stuck in "Discovered but not indexed." Submit or improve thin pages. |
| Sitemaps | Submitted vs indexed count. Large gap = content quality or crawl issue. |
| Core Web Vitals | All pages should be "Good." Astro static sites usually pass easily. |
| Links | External links pointing to your site. Track growth over time. |

---

### 6. Backlink and Authority Building

#### Realistic strategies for a small open-source project

**Tier 1: Free, high-impact, do immediately**

1. **GitHub repo SEO** - Keyword-rich repo description ("Free YouTube downloader
   for Windows. Desktop app with media player, playlist support, and SponsorBlock.
   Built with Tauri v2 and yt-dlp."). Use all 20 topic tags: `youtube-downloader`,
   `yt-dlp`, `yt-dlp-gui`, `video-downloader`, `tauri`, `tauri-v2`, `rust`,
   `react`, `typescript`, `windows`, `desktop-app`, `media-player`, `sponsorblock`,
   `youtube`, `playlist-downloader`, `open-source`, `free`, `downloader`,
   `youtube-dl`, `ffmpeg`.

2. **AlternativeTo** - Submit RuForge as an alternative to 4K Video Downloader,
   Open Video Downloader, and yt-dlp. Free submission, DR 79 site, approval in
   1-2 days. List as "Free, Open Source (MIT), Windows."

3. **Alternative.me** - Similar to AlternativeTo. Free submission with account.

4. **GitHub awesome-lists** - Submit PRs to:
   - `awesome-yt-dlp` (if exists)
   - `awesome-tauri`
   - `awesome-selfhosted` (if applicable)
   - `awesome-video` or `awesome-media`

5. **Product Hunt** - Free launch. Best on Tuesday-Thursday. Prepare screenshots,
   a short video demo, and a concise tagline.

**Tier 2: Medium effort, good ROI**

6. **Software directories** - Submit to:
   - Softpedia (Windows section)
   - MajorGeeks
   - FileHippo / FileHorse
   - SourceForge (mirrors GitHub releases)
   - FossHub (for FOSS projects)

7. **Dev community posts** - Write a launch post on:
   - r/software, r/DataHoarder, r/youtube (check rules)
   - Hacker News (Show HN)
   - DEV.to article about the tech stack or a tutorial

8. **Tech blog outreach** - Pitch to blogs that cover download tools:
   - TechRadar, MakeUseOf, How-To Geek frequently list "best downloaders."
   - Offer a free license or demo for review (not applicable if fully free,
     but offer exclusive screenshots or quotes).

**Tier 3: Ongoing, compounds over time**

9. **Content marketing** - Comparison articles and tutorials (hosted on your own
   site) that other sites may link to as references.

10. **GitHub activity signals** - Regular releases, responsive issue handling,
    good README with badges. Stars and forks indirectly drive discovery.

11. **IndexNow** - Ping search engines on every deploy. Bing/Yandex pick up
    changes faster. Google does not officially support IndexNow but may honor
    it indirectly.

---

### 7. Competitor Analysis

#### Top competitors for "YouTube downloader desktop app" queries

| Product | Domain | Stack | Pricing | SEO Strength |
|---------|--------|-------|---------|--------------|
| 4K Video Downloader Plus | 4kdownload.com | Qt/C++ | Freemium ($15-60) | Very strong. 10+ years, 62M users claimed, 1000+ awards badges, extensive blog, FAQ schema, review schema with 3500+ ratings. |
| Open Video Downloader | github.com/jely2002/youtube-dl-gui | Tauri + Vue | Free/OSS | 8K GitHub stars. No standalone website. Relies entirely on GitHub SEO. |
| HalalDL | github.com/Asdmir786/HalalDL | Tauri v2 + React | Free/OSS | New (2025-2026). No standalone website. GitHub-only presence. Has winget listing. |
| yt-dlp GUI (imsyy) | github.com/imsyy/yt-dlp-gui | Tauri + Vue | Free/OSS | Very new (March 2026). 38 stars. No website. |
| Alpha Tube | github.com/sahasr-aksha/alpha-tube | Tauri | Free/OSS | New. No website. |
| ARN-DL | github.com/ARN-Inside/ARN-DL | Batch/TUI | Free/OSS | CLI-focused. No website. |
| SnapDownloader | snapdownloader.com | Native | $30-50 | Has a standalone site. Targets "video downloader" broadly. |

#### Key observations

- **4K Video Downloader is the dominant commercial player.** Their SEO is built on
  10 years of content, a blog with regular posts, review aggregation (3500+ reviews
  in schema), product pages per platform, FAQ structured data, and "62M satisfied
  users" social proof.

- **Most open-source Tauri competitors have NO standalone website.** They live
  entirely on GitHub. This is a massive opportunity for RuForge: having a real
  website with proper SEO puts you ahead of every open-source competitor
  immediately.

- **The "yt-dlp GUI" keyword cluster is underserved.** Most results are GitHub
  repos with no dedicated landing page. A well-optimized /features/downloader
  page targeting "yt-dlp gui windows" could rank quickly.

- **Comparison content is sparse.** There are few good "4K Video Downloader
  alternatives 2026" articles from independent sources. Writing your own honest
  comparison page would target this query.

#### What 4kdownload.com does well (learn from)

- Separate landing pages per platform (/video-downloader-windows).
- Blog with regular posts about product updates and format explainers.
- SoftwareApplication schema with aggregate rating.
- FAQ section at the bottom of every product page.
- Clear pricing table with feature comparison.
- Trust badges ("100% virus-free", award logos).
- Tutorials and video guides section.

---

### 8. Security Practices for SEO

#### Direct ranking impact

| Signal | Ranking impact |
|--------|---------------|
| HTTPS (valid TLS certificate) | Confirmed lightweight ranking signal since 2014. Prerequisite in 2026 (96.5% of top-10 results use it). Cloudflare Pages provides this automatically. |
| HSTS (Strict-Transport-Security) | Not a direct ranking factor. Prevents HTTP downgrade attacks. Eliminates redirect latency (minor speed benefit). |
| CSP (Content-Security-Policy) | Not a direct ranking factor. Prevents XSS which could trigger Safe Browsing flags (indirect catastrophic impact if exploited). |
| Mixed content (HTTP resources on HTTPS page) | Causes browser warnings, hurts CLS/UX, blocks modern features. Indirect negative signal. |
| security.txt | No ranking impact. Professional signal for security researchers. |

#### What to implement

**Mandatory:**
- HTTPS: handled by Cloudflare Pages automatically.
- Privacy Policy page at /legal/privacy (Google may require for some rich results).
- Terms of Service at /legal/terms.

**Recommended:**
- `/.well-known/security.txt` with contact info and expiry date:

```
Contact: mailto:security@ruforge.app
Expires: 2027-06-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://ruforge.app/.well-known/security.txt
```

- HSTS header (Cloudflare enables this in SSL/TLS settings > Edge Certificates >
  "Always Use HTTPS" + "HSTS" toggle).
- CSP header via Cloudflare Transform Rules or `_headers` file:

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

For Cloudflare Pages, create a `public/_headers` file with these values.

**For the download page specifically:**
- Display SHA256 checksum of the installer next to the download link.
- Mention that the installer is code-signed (Tauri signing).
- Link to the GitHub Releases page for verification.
- VirusTotal scan link for the latest release (builds trust).

---

## AREA 2: Domain and Hosting Strategy

### Current web presence

As of May 2026, RuForge has:
- GitHub repository at github.com/UnboundAngel/RuForge
- No registered custom domain found in searches
- No standalone website live on a custom domain (site is in development)
- A "RuForge" name exists on Printables.com (3D printing, unrelated person)

### 1. Domain Name Options

#### Recommended: `ruforge.app`

| Domain | Estimated annual cost (Cloudflare) | Pros | Cons |
|--------|-----------------------------------|------|------|
| ruforge.app | ~$11.00/yr | HTTPS enforced (HSTS preloaded by Google), signals "application," broad user comprehension, Google-backed registry, clean and memorable. | None significant. |
| ruforge.dev | ~$12.20/yr | Developer-focused signal, HTTPS enforced, slightly cheaper reputation for dev tools. | Signals "developer tool" more than "user app." RuForge targets end-users. |
| ruforge.io | ~$35-50/yr | Tech/startup credibility, widely recognized. | More expensive, not HTTPS-enforced by default, sovereign territory concerns (British Indian Ocean Territory). |
| ruforge.software | ~$30-35/yr | Descriptive. | Long TLD, less common, not memorable. |
| ruforge.download | ~$30/yr | Descriptive for a downloader. | Niche TLD, may signal spam to some users. |
| getruforge.com | ~$9-10/yr | .com is universally understood. | "get" prefix is generic, longer to type. |
| ruforge.org | ~$10-12/yr | Signals open-source/non-profit. | Does not signal "app" or "software." |

**Verdict:** Register `ruforge.app` as the primary domain. It is short, memorable,
signals that RuForge is an application, enforces HTTPS at the TLD level, and costs
only $11/year at Cloudflare's at-cost pricing.

Consider also registering `ruforge.dev` ($12.20/yr) as a redirect or future
developer docs domain. Total for both: ~$23/year.

#### How to register via Cloudflare

1. Log into Cloudflare dashboard.
2. Go to Domain Registration > Register Domains.
3. Search "ruforge.app" and "ruforge.dev".
4. If available, add to cart and complete purchase.
5. DNS is automatically configured for Cloudflare Pages.

---

### 2. Hosting Comparison

#### Current: Cloudflare Pages (keep it)

| Feature | Cloudflare Pages | Vercel | Netlify | GitHub Pages |
|---------|-----------------|--------|---------|--------------|
| Free bandwidth | **Unlimited** | 100 GB/mo | 100 GB/mo | 100 GB/mo |
| Free builds | 500/mo | 6,000 min/mo | 300 min/mo | 10 builds/hr |
| Custom domains | Yes | Yes | Yes | Yes (1 per repo) |
| HTTPS | Automatic | Automatic | Automatic | Automatic |
| Edge locations | 330+ | ~30 | CDN (undisclosed) | GitHub CDN |
| Average TTFB (static) | ~45ms | ~65ms | ~80ms | ~100ms |
| Analytics | Free (Web Analytics) | $10/mo | $9/mo | None built-in |
| Serverless (if needed later) | Workers ($5/mo paid) | Edge/Serverless | Functions | None |
| Overage behavior | Builds queue, no charge | Charges | Charges | Hard limit |
| Paid tier start | $5/mo (Workers) | $20/user/mo | $19/user/mo | N/A |
| Git integration | GitHub, GitLab | GitHub, GitLab, Bitbucket | GitHub, GitLab, Bitbucket | GitHub only |
| Preview deployments | Yes | Yes | Yes | No |

**Verdict: Stay on Cloudflare Pages.** It has the best free tier for a static site
(unlimited bandwidth), fastest edge network (330+ PoPs), free analytics, and
integrates natively with Cloudflare Registrar for custom domains. You already use
it. No reason to switch.

The only scenario where Vercel wins is if you migrate to Next.js (not planned).
Netlify's form handling is irrelevant for a desktop app site.

---

### 3. Should RuForge Have User Accounts?

**Short answer: No. Not now.**

| Feature | Do similar products have it? | Needed for RuForge? |
|---------|------------------------------|---------------------|
| Download (no login) | 4K Video Downloader: no login for free tier | No. Free open-source app. |
| License keys | 4K Video Downloader: yes (for paid tiers) | No. RuForge is free. |
| Cloud sync (settings, library) | No desktop downloader does this | No. Local-first is a feature, not a limitation. |
| Update notifications | Tauri plugin-updater handles this without accounts | No. Already solved. |
| Bug reporting | GitHub Issues works fine | No. Keep it simple. |
| Community features | Discord/GitHub Discussions | Not on the website. |

Adding authentication means:
- Backend infrastructure (database, auth provider, session management)
- GDPR/privacy compliance burden
- Ongoing maintenance cost
- Attack surface expansion
- User friction for a tool that should "just work"

**When it might make sense (future, if ever):**
- If you add a premium tier with paid features.
- If you add cloud-based playlist sync between devices.
- Neither is on the roadmap.

---

### 4. SSL/Security for Download Sites

#### Already handled

- **Code signing:** Tauri build produces signed installers. The `.sig` file and
  public key verify integrity. This is the strongest trust signal for Windows
  downloads (no SmartScreen warning).

- **HTTPS:** Cloudflare Pages serves everything over TLS. The `.app` TLD enforces
  HTTPS at the browser level via HSTS preload list.

#### Implement on the download page

1. **SHA256 checksum** displayed next to each download link:
   ```
   SHA256: a1b2c3d4e5f6... (RuForge_0.1.9_x64-setup.exe)
   ```
   Generate with `Get-FileHash` in PowerShell or `sha256sum` on Linux.

2. **"Verify your download" section** explaining:
   - The installer is code-signed by Unbound Angel.
   - How to verify the SHA256 checksum.
   - Link to the GitHub Release with matching assets.

3. **VirusTotal link** for the latest release. Builds trust with security-conscious
   users. Run a scan after each release and link to the report.

4. **Cloudflare `_headers` file** for security headers:
   ```
   /*
     Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
     X-Content-Type-Options: nosniff
     X-Frame-Options: SAMEORIGIN
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: camera=(), microphone=(), geolocation=()
   ```

5. **security.txt** at `/.well-known/security.txt` (see section 8 above).

#### What does NOT matter for user trust on this type of site

- Extended Validation (EV) certificates: no measured SEO or trust impact. Standard
  DV certificates (what Cloudflare provides free) are fine.
- Badge images from antivirus vendors: mostly decoration, low trust signal.
- Third-party "secure download" seals: often scammy-looking themselves.

---

### 5. Cost Analysis

#### Minimal setup (recommended to start)

| Item | Annual cost |
|------|-------------|
| ruforge.app domain (Cloudflare) | $11.00 |
| Cloudflare Pages hosting | $0.00 |
| Cloudflare Web Analytics | $0.00 |
| Google Search Console | $0.00 |
| SSL/TLS certificate | $0.00 (Cloudflare auto) |
| GitHub (public repo, releases) | $0.00 |
| **Total** | **$11.00/year** |

#### More complete setup

| Item | Annual cost |
|------|-------------|
| ruforge.app domain (Cloudflare) | $11.00 |
| ruforge.dev domain (redirect/future) | $12.20 |
| Cloudflare Pages hosting | $0.00 |
| Cloudflare Workers (if forms/API needed) | $5.00/mo = $60.00 |
| Plausible Analytics (privacy-focused, optional) | $9.00/mo = $108.00 |
| Email (Cloudflare Email Routing, free) | $0.00 |
| Product Hunt launch | $0.00 |
| **Total** | **$191.20/year** |

#### Reality check

For a solo open-source project, the minimal setup at $11/year is completely
sufficient. Cloudflare's free tier covers everything a static product site needs.
The only mandatory cost is the domain name.

You do not need:
- Paid analytics (Cloudflare Web Analytics is free and privacy-friendly).
- Paid hosting tiers (unlimited bandwidth free).
- Email hosting (Cloudflare Email Routing forwards to your existing inbox free).
- CDN (Cloudflare IS the CDN).

---

## Implementation Priority Order

### Phase 1: Foundation (do this week)

1. Register `ruforge.app` on Cloudflare Registrar.
2. Point Cloudflare Pages deployment to the custom domain.
3. Set `site: 'https://ruforge.app'` in `astro.config.mjs`.
4. Add `@astrojs/sitemap` integration if not already present.
5. Create `public/robots.txt`.
6. Add canonical URL to base layout `<head>`.
7. Verify domain in Google Search Console (DNS TXT method).
8. Submit `sitemap-index.xml` to Search Console.

### Phase 2: On-page SEO (this month)

9. Add unique `<title>` and `<meta name="description">` to every page.
10. Audit heading hierarchy (one h1 per page, logical h2/h3 structure).
11. Add breadcrumb navigation to docs pages.
12. Add JSON-LD: SoftwareApplication on /download, Organization on home,
    BreadcrumbList on docs/feature pages.
13. Add `public/_headers` file with security headers.
14. Create `public/.well-known/security.txt`.

### Phase 3: Content and links (next 1-3 months)

15. Write comparison page: "RuForge vs 4K Video Downloader."
16. Write 2-3 how-to articles targeting long-tail keywords.
17. Submit to AlternativeTo as alternative to 4K Video Downloader.
18. Submit to Alternative.me, Softpedia, FossHub.
19. Optimize GitHub repo (description, 20 topic tags, badges in README).
20. Submit PRs to relevant awesome-lists.
21. Add FAQ section with FAQPage schema to docs index.

### Phase 4: Ongoing (monthly)

22. Monitor Search Console weekly. Fix coverage issues.
23. Publish one new content piece per month (tutorial, comparison, or feature deep-dive).
24. Track keyword positions for primary targets.
25. Update structured data versions on each release.
26. Request indexing for new pages after publishing.

---

## Sources

- Astro sitemap integration docs: https://docs.astro.build/en/guides/integrations-guide/sitemap/
- Google SoftwareApplication schema: https://developers.google.com/search/docs/appearance/structured-data/software-app
- Cloudflare Registrar pricing: https://domainoffer.net/tld/dev/cloudflare
- Cloudflare Pages vs Vercel vs Netlify (2026): https://dev.to/lazydev_oh/vercel-vs-netlify-vs-cloudflare-pages-2026-deep-comparison-with-real-numbers-8pl
- TLD comparison (.io vs .dev vs .app): https://tldfyi.com/guides/choosing-tld/io-vs-dev-vs-app/
- HTTPS as ranking signal (Google): https://developers.google.com/search/blog/2014/08/https-as-ranking-signal
- Security headers and SEO: https://www.datahogo.com/en/blog/seo-security-headers-rankings
- GitHub repo SEO playbook: https://agentkit-seo.github.io/playbooks/github/
- AlternativeTo submission guide: https://launchdirectories.com/directory/alternativeto
- security.txt standard: https://securitytxt.org/
- Astro SEO checklist 2026: https://wumty.com/blog/complete-astro-seo-checklist-2026/
