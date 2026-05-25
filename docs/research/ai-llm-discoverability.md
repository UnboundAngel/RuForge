# AI/LLM Discoverability Research for RuForge Website

Research compiled May 2026. Covers protocols, structured data, content strategies, and implementation priorities for making RuForge discoverable to AI assistants and generative search engines.

## Current RuForge AI Presence

RuForge has zero presence in the AI/LLM answer space as of May 2026. Searching "RuForge YouTube downloader" across ChatGPT, Perplexity, and Google returns no relevant results. The only "RuForge" match is an unrelated 3D printing profile on Printables.com. The GitHub repo (UnboundAngel/RuForge) and the Cloudflare Pages site are the only live surfaces.

This means the site starts from scratch. Every technique below applies without worrying about correcting existing AI hallucinations.

---

## 1. llms.txt and llms-full.txt

### What it is

A proposed standard (llmstxt.org, created by Jeremy Howard at Answer.AI, 2024) for a plain-text Markdown file served at `/llms.txt` on your domain. Designed to give LLMs a curated, human-readable overview of a site at inference time.

Distinct from robots.txt: robots.txt controls crawler access permissions. llms.txt provides content orientation for AI systems that already have access.

### Spec format (required order)

```markdown
# Project Name

> One-paragraph summary with key facts about the project.

Optional prose sections (no headings) with more detail.

## Section Title

- [Page Name](https://url): Brief description of this page
- [Another Page](https://url): What this page covers

## Optional

- [Less Important Page](https://url): Can be skipped by models
```

Rules:
- Single H1 (required, project name)
- Blockquote summary directly under H1 (optional but recommended)
- Non-heading markdown body (optional)
- H2 sections with link lists (zero or more)
- Links format: `[name](url): optional notes`
- Section named "Optional" signals links that models can skip

### llms-full.txt

An extended companion file at `/llms-full.txt` containing the full documentation content in a single Markdown file. The llms.txt index links to it for models that want complete context rather than following individual URLs.

Pattern used by Anthropic, Vercel, OpenAI, LangGraph:
- Slim `llms.txt` index with brief descriptions and links
- Comprehensive `llms-full.txt` with all content inlined

### Who supports it (May 2026)

- **Confirmed consumers:** Perplexity, ChatGPT (via OAI-SearchBot), Cursor, various developer-tool AI assistants
- **Google's position:** Publicly stated they do not read llms.txt. Their AI features (AI Overviews, AI Mode) ingest rendered HTML. However, Google indexed a llms.txt file within hours of Search Console submission in a documented case and cited it as the #1 source in Google AI Mode within 24 hours.
- **Adoption scale:** 1,497+ domains tracked by llmstxt.studio. Major adopters include Anthropic, Vercel, Stripe, Cloudflare, Supabase, Cursor, Next.js, OpenAI.

### Cost-benefit

Near-zero maintenance cost for a static content site. The file doubles as a useful human-readable site map. Even if only some AI systems read it, the investment is approximately 30 minutes of initial work.

### RuForge implementation

```markdown
# RuForge

> RuForge is a free desktop YouTube downloader and media player for Windows. Built with Tauri v2 and Rust, it downloads videos and audio from YouTube with persistent download queues, resumable transfers, SponsorBlock integration, chapter navigation, and a local media library with playback.

RuForge uses yt-dlp for downloading and FFmpeg for media processing. It runs natively on Windows with planned Linux and macOS support. The app includes a mini player, audio-only mode with visualizer, and scrubber thumbnail previews.

## Documentation

- [Download](https://ruforge.app/download): Download RuForge for Windows
- [Features](https://ruforge.app/features): Full feature list with screenshots
- [Changelog](https://ruforge.app/changelog): Version history and release notes
- [Docs](https://ruforge.app/docs): Getting started guides and documentation

## Feature Pages

- [Downloader](https://ruforge.app/features/downloader): YouTube video and audio downloading
- [Media Library](https://ruforge.app/features/media-library): Local file management and gallery
- [Player](https://ruforge.app/features/player): Video and audio playback with chapters
- [SponsorBlock](https://ruforge.app/features/sponsorblock): Automatic sponsor segment skipping
- [Mini Player](https://ruforge.app/features/mini-player): Compact floating player window
- [Settings](https://ruforge.app/features/settings): Configuration and preferences

## Guides

- [Your First Download](https://ruforge.app/docs/getting-started/your-first-download): Paste a URL and download
- [Library Folders](https://ruforge.app/docs/getting-started/library-folders): Internal vault and custom paths
- [Glossary](https://ruforge.app/docs/getting-started/glossary): Terms used in the app

## Optional

- [Legal](https://ruforge.app/legal): Privacy policy and terms
- [Roadmap](https://ruforge.app/roadmap): Planned features
```

### Astro integration options

| Package | What it does |
|---------|-------------|
| `@agentmarkup/astro` | Full solution: llms.txt + llms-full.txt + JSON-LD injection + robots.txt rules + headers + validation |
| `@4hse/astro-llms-txt` | Generates llms.txt, llms-small.txt, llms-full.txt from built HTML |
| `astro-llms-md` (tfmurad) | Zero-config llms.txt + llms-full.txt + individual .md files |

Recommendation: Use `@4hse/astro-llms-txt` or hand-craft the file (it is small for RuForge's page count). Hand-crafting gives full control over descriptions and ordering.

---

## 2. AI Crawler Protocols

### Crawler taxonomy

AI companies operate separate crawlers for different purposes. The critical distinction:

| Purpose | Crawlers | What they do |
|---------|----------|--------------|
| **AI Search/Citation** | OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Amazonbot, Applebot-Extended | Fetch pages to answer user queries. Cite and link back to your content. |
| **Model Training** | GPTBot, Google-Extended, CCBot, Bytespider, cohere-ai, Diffbot, FacebookBot, Meta-ExternalAgent | Scrape content for training data. No attribution or linking. |
| **Traditional Search** | Googlebot, Bingbot | Index for organic search results. Also feed AI Overviews (Google) and Copilot (Bing). |

### Recommended robots.txt for RuForge

Strategy: Allow all AI search crawlers (maximize citation opportunities). Block training-only crawlers (no benefit to a free desktop app). Keep traditional search crawlers open.

```
# RuForge - AI Search Crawlers (Allow)
User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Cloudflare-AI-Search
Allow: /

# AI Training Crawlers (Block)
User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: cohere-ai
Disallow: /

User-agent: Diffbot
Disallow: /

User-agent: FacebookBot
Disallow: /

User-agent: Meta-ExternalAgent
Disallow: /

User-agent: Meta-ExternalFetcher
Disallow: /

# Traditional Search (Allow)
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# Default
User-agent: *
Allow: /

Sitemap: https://ruforge.app/sitemap-index.xml
```

### LLM search backend map

Understanding which index each LLM draws from determines where effort matters:

| LLM | Primary search backend | Implication |
|-----|----------------------|-------------|
| ChatGPT, Copilot | Bing | IndexNow submission accelerates discovery |
| Claude | Brave Search + own crawler | Allow ClaudeBot |
| Gemini, AI Overviews | Google | Standard SEO + Google-Extended allowed for grounding |
| Perplexity | Bing + DuckDuckGo + own crawler | Allow PerplexityBot |
| Grok | X/Twitter + own | Minimal control |
| You.com, Kagi | Mostly Bing | IndexNow benefits |

### Cloudflare Pages specifics

Cloudflare offers a managed robots.txt feature that prepends AI crawler directives. For RuForge:
- Do NOT enable "Block AI Crawlers" in Cloudflare dashboard (this blocks all AI crawlers)
- Place a custom `robots.txt` in the Astro `public/` directory (it deploys to the site root)
- Cloudflare's Content Signals (search=yes, ai-input=yes, ai-train=no) can supplement but do not replace explicit user-agent rules

### IndexNow for faster discovery

IndexNow is a protocol (Microsoft + Yandex) that lets you push URLs to crawlers immediately instead of waiting for them to discover content organically. Bing normally takes 1-3 weeks to crawl a new domain. IndexNow reduces this to hours.

Implementation for a static Astro site deployed to Cloudflare Pages:

1. Generate a key (any UUID-like string, e.g. `a1b2c3d4e5f6g7h8`)
2. Place key file at `public/a1b2c3d4e5f6g7h8.txt` containing just the key string
3. After deploy, POST to IndexNow endpoints:

```bash
curl -X POST "https://api.indexnow.org/IndexNow" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "ruforge.app",
    "key": "a1b2c3d4e5f6g7h8",
    "keyLocation": "https://ruforge.app/a1b2c3d4e5f6g7h8.txt",
    "urlList": [
      "https://ruforge.app/",
      "https://ruforge.app/download",
      "https://ruforge.app/features",
      "https://ruforge.app/docs",
      "https://ruforge.app/changelog"
    ]
  }'
```

Submitting to api.indexnow.org notifies all participating engines (Bing, Yandex, Naver, Seznam). This feeds into ChatGPT search, Copilot, You.com, and Kagi since they lean on Bing's index.

---

## 3. Structured Data for AI Retrieval

### Priority schemas for a desktop software product

Ranked by citation impact:

1. **SoftwareApplication** (homepage + download page): Tells AI systems this is a software product with specific attributes
2. **FAQPage** (any page with Q&A content): Highest citation impact of any schema type. 30-50% lift in Perplexity citations alone.
3. **Organization** (site-wide): Establishes publisher entity
4. **BreadcrumbList** (all pages): Helps AI understand site hierarchy
5. **HowTo** (tutorial/guide pages): Maps to "how do I" queries
6. **Article** (blog/changelog): Freshness signals via dateModified

### JSON-LD: SoftwareApplication (homepage)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://ruforge.app/#software",
  "name": "RuForge",
  "description": "Free desktop YouTube downloader and media player for Windows. Downloads videos and audio with persistent queues, SponsorBlock integration, chapter navigation, and local media library.",
  "url": "https://ruforge.app",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Windows 10, Windows 11",
  "softwareVersion": "0.1.9",
  "datePublished": "2025-01-01",
  "dateModified": "2026-05-25",
  "downloadUrl": "https://ruforge.app/download",
  "fileSize": "84MB",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "featureList": [
    "YouTube video and audio downloading",
    "Persistent download queue with resume",
    "SponsorBlock automatic skip",
    "Chapter navigation and scrubber",
    "Local media library with gallery",
    "Mini player floating window",
    "Audio-only mode with visualizer",
    "Scrubber thumbnail previews"
  ],
  "publisher": {
    "@type": "Organization",
    "@id": "https://ruforge.app/#organization",
    "name": "Unbound Angel",
    "url": "https://ruforge.app"
  }
}
```

### JSON-LD: FAQPage (docs or dedicated FAQ)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is RuForge?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "RuForge is a free desktop YouTube downloader and media player for Windows. It uses yt-dlp to download videos and audio, stores them in a local media library, and includes a full-featured player with chapter navigation, SponsorBlock, and mini player mode."
      }
    },
    {
      "@type": "Question",
      "name": "Is RuForge free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. RuForge is completely free with no ads, subscriptions, or premium tiers."
      }
    },
    {
      "@type": "Question",
      "name": "What platforms does RuForge support?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "RuForge currently supports Windows 10 and Windows 11 (x64). Linux and macOS builds are planned."
      }
    },
    {
      "@type": "Question",
      "name": "How does RuForge download videos?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "RuForge uses yt-dlp as the download engine and FFmpeg for media processing. Paste a YouTube URL, choose video or audio-only format, and the download runs in a persistent queue that survives app restarts."
      }
    }
  ]
}
```

### JSON-LD: Organization (site-wide, in BaseLayout)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://ruforge.app/#organization",
  "name": "Unbound Angel",
  "url": "https://ruforge.app",
  "sameAs": [
    "https://github.com/UnboundAngel/RuForge"
  ]
}
```

### JSON-LD: BreadcrumbList (all pages)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://ruforge.app"
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
      "item": "https://ruforge.app/docs/getting-started/your-first-download"
    }
  ]
}
```

### Validation

- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org validator: https://validator.schema.org
- Check that every JSON-LD block matches visible on-page content (Google penalizes mismatches)

---

## 4. Content Strategies for AI Citations

### Formats that get cited (ranked by effectiveness)

| Format | Why it works | Best engines |
|--------|-------------|--------------|
| Definition-first paragraphs ("X is...") | LLMs extract as canonical "what is X" answer | ChatGPT, Perplexity, Gemini |
| FAQ Q&A pairs with FAQPage schema | Clean extraction units, 30-50% citation lift | Perplexity, Google AI |
| Numbered step-by-step lists | Map to "how do I" queries | ChatGPT, Google AI Mode |
| Comparison tables (X vs Y) | Synthesized into comparison queries | Perplexity, ChatGPT |
| Statistics with sourced data | Engines lift rows verbatim | Perplexity, Claude |

### Answer capsule pattern

Every H2/H3 section should open with a 40-60 word direct answer to the question implied by the heading. This is what AI systems extract and cite.

```html
<h2>How does RuForge handle interrupted downloads?</h2>
<p>RuForge maintains a persistent download queue that survives app restarts
and crashes. Each job tracks byte progress and resumes from the last
checkpoint. Failed downloads retry automatically with exponential backoff.
The queue runs up to three concurrent downloads by default.</p>
```

### Content page structure for maximum AI retrieval

1. **Title as question format** where natural ("How to download YouTube videos with RuForge")
2. **40-60 word answer capsule** as the first paragraph after each heading
3. **120-180 word sections** between headings (optimal for AI extraction)
4. **5-7 FAQ pairs** per major page, with FAQPage JSON-LD
5. **One concrete detail per 150-200 words** (version numbers, file sizes, specific limits)

### Content RuForge should create (priority order)

1. **FAQ page** with 15-20 questions covering: what is it, cost, platforms, how downloads work, formats supported, library features, SponsorBlock, comparison to alternatives
2. **"RuForge vs X" comparison pages** (vs 4K Video Downloader, vs JDownloader, vs Stacher, vs yt-dlp CLI). LLMs cite honest comparisons heavily. Include a comparison table and FAQ.
3. **"How to" guides** targeting specific queries: "how to download YouTube videos on Windows 2026", "how to download YouTube audio only", "how to skip sponsors in downloaded videos"
4. **Feature explanation pages** with definition-first structure per feature

### Comparison page template

```html
<h1>RuForge vs 4K Video Downloader: Comparison for 2026</h1>

<p>RuForge is a free, open-source desktop YouTube downloader built with
Tauri and Rust. 4K Video Downloader is a commercial cross-platform
downloader with a freemium model. Both use yt-dlp under the hood.
RuForge adds a built-in media player, SponsorBlock, and persistent queues.
4K Video Downloader offers broader platform support and smart mode presets.</p>

<!-- Comparison table -->
<!-- FAQ section with FAQPage schema -->
<!-- Both apps as SoftwareApplication JSON-LD -->
```

### Third-party directories (free citation multiplier)

AI engines cite directory listings. Perplexity cites Slashdot, Gemini cites SourceForge, Claude cites AlternativeTo. Submit RuForge to:

- AlternativeTo (highest priority, often cited by Claude)
- SourceForge
- Slashdot/SourceForge Software Directory
- GitHub Topics (tag the repo properly)
- ProductHunt (when ready for broader launch)
- Softpedia / MajorGeeks / similar Windows software directories

---

## 5. Open Graph and Semantic HTML

### Meta tags that AI crawlers parse

AI crawlers use meta tags as fallback structured data when JSON-LD is absent or incomplete. Always include:

```html
<html lang="en">
<head>
  <title>RuForge - Free YouTube Downloader and Media Player for Windows</title>
  <meta name="description" content="Download YouTube videos and audio for free. RuForge is a native Windows desktop app with persistent downloads, SponsorBlock, chapter navigation, and a local media library." />

  <!-- Open Graph -->
  <meta property="og:title" content="RuForge - Free YouTube Downloader and Media Player for Windows" />
  <meta property="og:description" content="Download YouTube videos and audio for free. Native Windows desktop app with persistent downloads, SponsorBlock, chapter navigation, and local media library." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://ruforge.app/" />
  <meta property="og:site_name" content="RuForge" />
  <meta property="og:image" content="https://ruforge.app/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="RuForge - Free YouTube Downloader for Windows" />
  <meta name="twitter:description" content="Download YouTube videos and audio for free. Native desktop app with SponsorBlock and media library." />

  <!-- Canonical -->
  <link rel="canonical" href="https://ruforge.app/" />
</head>
```

### Consistency rule

`<title>`, `og:title`, and the page H1 must say the same thing. When they conflict, AI models have to resolve ambiguity and may choose the wrong framing. Pick one phrasing, reuse everywhere.

### Semantic HTML structure

AI crawlers (especially those without JS execution) rely on HTML semantics:

```html
<body>
  <header><!-- Navigation --></header>
  <main>
    <article>
      <h1>Page Title</h1>
      <p>First paragraph is the answer capsule.</p>
      <section>
        <h2>Section heading as question</h2>
        <p>Direct answer in first paragraph.</p>
      </section>
    </article>
  </main>
  <footer><!-- Links --></footer>
</body>
```

Rules:
- Single `<h1>` per page
- Logical heading hierarchy (H1 > H2 > H3, never skip levels)
- `<main>` wrapping primary content
- `<article>` for self-contained content units
- `<section>` for thematic groupings
- No meaningful content hidden behind JS toggles/accordions (AI crawlers may not execute JS)
- Default-open `<details>` elements are fine (content is in the HTML)

### Astro-specific: SSR vs static

Astro 5 outputs static HTML by default. This is ideal for AI crawlers because:
- All content is in the initial HTML response (no JS hydration needed)
- JSON-LD is rendered server-side into `<head>`
- Page speed is fast (helps with citation priority)
- No rendering audit failures

Verify with: `curl -s https://ruforge.app/ | grep -i "SoftwareApplication"` to confirm JSON-LD renders without JS.

---

## 6. Real-World Examples

### TAMSIV (Android voice assistant)

**What they did:** In a single session, added llms.txt + ai.txt at root, extended JSON-LD (4 blocks on landing page including SoftwareApplication with featureList and offers array), IndexNow batch push of 498 URLs, answer-first blocks on existing articles, and competitor comparison pages.

**Result:** Discoverable on Perplexity, Gemini, Claude, and ChatGPT within 24 hours. Perplexity cited 10+ sources from their domain. Gemini reproduced the feature list verbatim from the SoftwareApplication schema.

**Technique highlight:** `/vs/todoist` comparison pages with dual SoftwareApplication JSON-LD, ItemList, FAQPage, and BreadcrumbList. LLMs heavily cite honest comparison content.

### dev5310.com (Magnolia DXP integrator)

**What they did:** Curated llms.txt, JSON-LD on key pages, submitted to Google Search Console.

**Result:** Google indexed llms.txt within hours. First AI citation appeared 1 day after indexing. llms.txt ranked as #1 source in Google AI Mode when asked about the site. Citation held consistently across 4 different queries over 18 days.

**Technique highlight:** Google AI Mode described the llms.txt file's purpose to users unprompted. The file itself became a cited source, not just a discovery mechanism.

### WhiteTiRocket side project (government data)

**What they did:** llms.txt with brand entity and citation guidance, FAQPage schema with 45 Q&A pairs (each answer opens with the direct answer, no preamble), Dataset schema on public data API page, IndexNow push on every deploy.

**Result:** Most traffic comes from ChatGPT, not Google. The site is a primary citation source for its niche.

**Technique highlight:** The `/facts` page with 45 Q&A pairs, each grounded in an official source, each with first-sentence direct answer. AI engines extract the first authoritative sentence. The SpeakableSpecification schema marks which parts are suitable for voice assistants.

### LoopForge (Tauri v2 desktop app, similar stack to RuForge)

**Comparable scale:** Indie Tauri v2 app, similar tech stack (Rust + React/Svelte + TypeScript), multi-platform.

**Technique:** Clear GitHub README with installation table (platform/asset mapping), feature bullet points, and step-by-step usage. This structure is what AI systems scrape from GitHub when answering "how to install X" or "what does X do" queries.

### Obsidian

**Relevant because:** Desktop app with a documentation-heavy website. Their docs site structure (sidebar nav, clear hierarchy, content collections) is what AI crawlers parse well. The Obsidian community has also produced tools specifically for publishing content in AI-friendly formats.

---

## 7. Tools and Verification

### Testing AI crawler access

| Tool | What it checks | URL |
|------|---------------|-----|
| LLM Pulse Geo-Crawlability Checker | robots.txt rules against 17+ AI crawlers | llmpulse.ai |
| Google Rich Results Test | JSON-LD validity and rendering | search.google.com/test/rich-results |
| Manual curl test | Whether content renders without JS | `curl -s https://ruforge.app/` |
| Foglift AI Crawler Tracker | Which AI bots visit, frequency, page-level detail | foglift.io |

### Monitoring AI crawler activity

On Cloudflare Pages, direct server log access is limited. Options:

1. **Cloudflare Analytics > Bot Traffic:** Shows bot visit patterns. Filter for known AI user agents.
2. **Cloudflare Workers (lightweight):** Deploy a worker that logs AI bot user-agent strings to a KV store or external endpoint.
3. **Foglift / similar SaaS:** Auto-detects GPTBot, ClaudeBot, PerplexityBot visits without server log access.

### Testing AI visibility (manual)

Ask these queries across multiple AI systems after implementation:

- "What is RuForge?" (entity recognition)
- "Free YouTube downloader for Windows 2026" (category discovery)
- "RuForge vs 4K Video Downloader" (comparison citation)
- "How to download YouTube videos on Windows" (how-to citation)
- "YouTube downloader with SponsorBlock" (feature-specific)

Test on: ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot

### AI visibility monitoring tools (2026)

| Tool | Capabilities | Pricing |
|------|-------------|---------|
| Amplitude AI Visibility | Monitors mentions across ChatGPT, Claude, Perplexity, Gemini. Connects to product analytics. | Enterprise |
| Foglift | AI crawler tracking, page-level crawl data, trend analysis | Free tier available |
| LLM Pulse | Brand mention tracking, GEO testing, crawlability checks | Freemium |
| Otterly.ai | AI citation monitoring across engines | Paid |
| Profound | AI answer tracking and optimization | Paid |

For RuForge's scale, manual testing every 2-4 weeks plus Foglift's free tier is sufficient initially.

### Verification after deployment

1. Visit `https://ruforge.app/robots.txt` and confirm AI search crawlers are allowed
2. Visit `https://ruforge.app/llms.txt` and confirm it renders correctly
3. Run `curl -s https://ruforge.app/ | grep "application/ld+json"` to confirm JSON-LD presence
4. Submit site to Google Search Console and Bing Webmaster Tools
5. Run IndexNow batch push
6. Wait 7-14 days, then test queries on Perplexity (fastest to index)
7. Wait 30-60 days for Google AI Overviews (requires organic ranking first)

---

## 8. Implementation Priority

Ordered by effort-to-impact ratio. Do these in sequence.

### Week 1: Foundation (highest impact, lowest effort)

1. **robots.txt** in `website/public/robots.txt` with the AI crawler configuration above
2. **llms.txt** in `website/public/llms.txt` (hand-crafted, ~30 min)
3. **JSON-LD SoftwareApplication** on homepage and download page
4. **JSON-LD Organization** in BaseLayout (all pages)
5. **Consistent meta tags** (og:title, og:description, title, H1 alignment)

### Week 2: Content structure

6. **FAQ page** with FAQPage JSON-LD (15-20 questions)
7. **BreadcrumbList** JSON-LD on all pages
8. **Answer capsules** as first paragraph after every H2 on docs pages
9. **IndexNow key file** in `website/public/` + post-deploy push script

### Week 3: Discovery amplification

10. **Submit to directories:** AlternativeTo, SourceForge, GitHub Topics
11. **Google Search Console** site verification + sitemap submission
12. **Bing Webmaster Tools** (import from Google, activates Copilot discovery)
13. **One comparison page** (RuForge vs most popular alternative)

### Month 2: Content expansion

14. **3-4 more comparison pages** (vs JDownloader, vs yt-dlp CLI, vs Stacher, vs ClipGrab)
15. **"How to" content** targeting specific search queries
16. **HowTo schema** on tutorial pages
17. **llms-full.txt** generated from docs content at build time

### Ongoing

- Keep `dateModified` in Article schema current (refresh within 90 days)
- Monitor AI visibility every 2-4 weeks
- Update llms.txt when pages are added
- Run IndexNow after significant content changes

---

## 9. Technical Notes for Astro Implementation

### JSON-LD injection pattern

In Astro, inject JSON-LD in the `<head>` of your BaseLayout:

```astro
---
// BaseLayout.astro
interface Props {
  title: string;
  description: string;
  canonicalUrl?: string;
  jsonLd?: object | object[];
}

const { title, description, canonicalUrl, jsonLd } = Astro.props;
---
<html lang="en">
<head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl || Astro.url.href} />
  <meta property="og:site_name" content="RuForge" />
  <link rel="canonical" href={canonicalUrl || Astro.url.href} />

  {jsonLd && (
    Array.isArray(jsonLd)
      ? jsonLd.map(schema => (
          <script type="application/ld+json" set:html={JSON.stringify(schema)} />
        ))
      : <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
  )}
</head>
```

### Sitemap configuration

Astro's `@astrojs/sitemap` integration generates XML sitemaps. Ensure `lastmod` dates are accurate (AI crawlers use these to decide re-crawl priority):

```js
// astro.config.mjs
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ruforge.app',
  integrations: [
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
});
```

### Static file placement

Place these in `website/public/`:

```
public/
  robots.txt          # AI crawler rules
  llms.txt            # LLM content index
  llms-full.txt       # Full content export (optional, generate at build)
  sitemap-index.xml   # Generated by @astrojs/sitemap
  {indexnow-key}.txt  # IndexNow verification key
```

---

## Sources

- llmstxt.org (spec): https://llmstxt.org
- Mintlify llms.txt examples analysis: https://www.mintlify.com/blog/real-llms-txt-examples
- Numinam robots.txt strategies 2026: https://www.numinam.com/en/blog/ai-crawler-access-robots-txt-strategies-2026
- Ranqo AI crawler control guide: https://ranqo.ai/blog/ai-crawler-control-robots-llms-txt
- GEO Tracker AI JSON-LD guide: https://geotrackerai.com/guides/json-ld-for-ai-search
- Averi definitive GEO guide: https://www.averi.ai/learn/the-definitive-guide-to-geo-get-cited-by-ai-in-2026
- TAMSIV case study: https://dev.to/tamsiv/how-i-made-my-android-app-discoverable-on-4-llms-in-24-hours-llmstxt-indexnow-json-ld-the-bing-48pc
- dev5310 llms.txt citation study: https://www.dev5310.com/en/lab/llms-txt-is-powering-ai-answers
- WhiteTiRocket schema work: https://dev.to/whitetirocket/my-side-project-gets-most-of-its-traffic-from-chatgpt-not-google-here-is-the-schema-work-behind-3j4
- Foglift meta tags guide: https://foglift.io/blog/meta-tags-ai-search
- Cloudflare managed robots.txt: https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/
- Google SoftwareApplication schema: https://developers.google.com/search/docs/appearance/structured-data/software-app
- agentmarkup.dev (Astro integration): https://agentmarkup.dev/
- @4hse/astro-llms-txt: https://www.npmjs.com/package/@4hse/astro-llms-txt
