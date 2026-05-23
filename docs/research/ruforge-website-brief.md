# RuForge public site research brief

**Purpose:** Inform a future introduction + changelog + links site (not an in-app feature wiki).  
**Audience:** Angel (solo maintainer).  
**Scope inferred:** Windows-first desktop app: YouTube downloader, local library, player, mini player, settings, auto-updater.  
**Research date:** 2026-05-21.  
**Method:** Web search and sampled competitor pages. No RuForge codebase audit.

---

## Executive summary

RuForge should launch as a **small marketing hub + changelog**, not a docs product. Indie desktop tools in 2024–2026 (Yaak, Obsidian, Raycast, Motrix) converge on: one strong home/download page, a **reverse-chronological changelog** with **per-release detail pages**, GitHub as the trust anchor, and help/docs only when support load forces it. FreeTube-style full doc sites are the wrong first move for a solo Windows downloader.

**Recommended shape:** 5–8 top-level routes, max **2 clicks** from home to download, changelog entry, GitHub, or privacy policy. Changelog copy should be **richer than the in-app teaser** but **shorter than internal `docs/changes.html`**: mirror GitHub Releases + structured `updater.json` via CI, never hand-maintain three divergent changelogs.

**Visual:** Extend the in-app palette (`#1D1613`, `#271C18`, `#EDD79C` family). Cream-on-brown body text passes WCAG AA/AAA at normal sizes (computed ~12.6:1). Reserve muted browns for secondary UI only; they fail body contrast (~4.3:1).

**Stack:** **Astro** static site on **Cloudflare Pages** or **GitHub Pages**; add **Starlight** only in phase 2 if guides ship. Skip hover link previews in MVP; use static link cards + solid Open Graph tags.

**Phasing:** MVP = home, download, changelog (index + `/changelog/vX.Y.Z`), privacy, GitHub footer. Phase 2 = RSS/Atom, concepts/guides, comparison page. Phase 3 = searchable reference (if ever).

---

## Recommended site map (tree)

```
/                           Home (positioning, 3 pillars, download CTA, screenshot loop)
/download                   Windows installer, version string, checksum note, GitHub Releases fallback
/changelog                  Newest-first index (title, date, 1-line summary, link to detail)
/changelog/v0.1.8           Per-release page (additions, fixes, screenshots optional)
/privacy                    Data collection, local-first, yt-dlp/cookies, no analytics default
/terms                      Optional; short OSS/desktop tool terms if distributing binaries
/security                   Optional phase 2; signing, updater pubkey, supply chain
/github                     Redirect or prominent link only (canonical repo URL)
```

**Header (persistent):** Logo, Download (primary button), Changelog, GitHub icon.  
**Footer:** GitHub · Releases · Issues · Discord/X/sponsor (if used) · Privacy · Terms · “Built with Tauri” only if desired, not dominant.

**Explicitly defer (phase 2+):** `/docs`, `/blog`, `/compare`, `/faq` as standalone only when content exists; early FAQ can be 5–8 accordions on home.

---

## Content inventory checklist

| Page / block | Write now (MVP) | Defer |
|--------------|-----------------|-------|
| One-line positioning | Yes | |
| Who it is for (download + watch local, not browser replacement) | Yes | |
| 3 feature pillars (Downloader, Library, Player) | Yes | |
| Windows download + version + link to GitHub asset | Yes | |
| Screenshot or 15–30s silent WebM loop (dark UI) | Yes | |
| Changelog index + last 3–5 release pages | Yes | Full archive backfill can trail |
| Privacy (local files, optional cookies via explorer, updater endpoint) | Yes | |
| Open source / license pointer | Yes | |
| Sponsor / donate | If active | |
| Discord / X | Footer only | Hero social wall |
| macOS/Linux promises | No (Windows today) | |
| Per-setting reference | No | |
| Explorer/uBlock deep dive | One paragraph max on home or security | |
| SponsorBlock, chapters, visualizer detail | Changelog + L2 guides later | Tooltip wiki |
| Comparison vs Motrix/FreeTube/yt-dlp CLI | Phase 2 | |
| RSS/Atom subscribe | Phase 2 | |
| Newsletter | Skip until list exists | |

**Copy sources to plan (not duplicate manually):**

1. **GitHub Release** body (canonical narrative).  
2. **`updater.json`** on `main` (teaser + `additions` / `fixes` for post-install; good web changelog seed).  
3. **In-app What’s New** = shortest teaser only.  
4. **Internal graph / `docs/changes.html`** = maintainer-only depth; distill for web.

---

## Depth rubric (L1 / L2 / L3)

| Level | Intent | Length | RuForge examples |
|-------|--------|--------|------------------|
| **L1 Teaser** | Orient, convert | 1–3 sentences | Home hero; in-app updater card; changelog index line |
| **L2 Guide** | Complete a workflow | 1–3 screens | “Download a playlist with cookies”; “Replace a library file”; “Enable SponsorBlock” |
| **L3 Reference** | Lookup exact behavior | Tables, flags | yt-dlp format strings, settings keys, keyboard shortcuts, IPC events |

**Rule:** Ship L1 everywhere public. Add L2 only for top 5 support drivers (cookies, queue, library paths, player chapters, updater). Add L3 only when repeated GitHub Issues prove the need.

**Do not document every tooltip.** Settings already carry short descriptions in-app; the web should explain **concepts and workflows** (Diátaxis: favor how-to + explanation; add reference slices incrementally). See [Diátaxis](https://diataxis.fr/).

**RuForge area mapping:**

- **Downloader:** L1 “queue + resume + audio/video”; L2 cookie flow via explorer; L3 format/quality (link yt-dlp docs, do not fork).  
- **Library:** L1 “local gallery, scan paths”; L2 replace/delete/dedupe behavior; L3 file naming sidecars.  
- **Player:** L1 “chapters, SponsorBlock, subtitles”; L2 skip learning + chapter scrubber; L3 sidecar JSON shapes (later).  
- **Mini player:** L1 pop-out + handoff; L2 layout modes; defer L3.  
- **Updater:** L1 signed Windows + What’s New; L2 verify pubkey; L3 `updater.json` schema (dev-facing, optional).

---

## Changelog strategy

### Patterns observed

| Product | Index | Detail | Notes |
|---------|-------|--------|-------|
| [Yaak](https://yaak.app/changelog) | Newest cards | `/changelog/YYYY.M.P` per release | Strong indie dev-tool model |
| [Obsidian](https://obsidian.md/changelog) | Rolling feed on one URL | Linked `/changelog/YYYY-MM-DD-desktop-vX.Y.Z` | Very long index; detail pages for SEO/bookmarking |
| [Raycast](https://www.raycast.com/changelog) | Platform sections | Inline on changelog route | Extension ecosystem noise |
| [Motrix](https://motrix.app/) | Badge → GitHub Releases | External | Minimal marketing site |
| FreeTube | Docs site | Versioned docs | Heavier than RuForge needs now |

**Recommendation for RuForge:**

1. **`/changelog`:** Reverse-chronological list, 10–20 entries per page pagination (or “Load more”) after ~30 releases.  
2. **`/changelog/vX.Y.Z`:** One page per semver; canonical URL for sharing.  
3. **`/changelog/all` (optional):** Single-page archive for Ctrl+F power users (curl moved to per-release pages for this reason: [daniel.haxx.se](https://daniel.haxx.se/blog/2024/07/24/changelog-changes/)).  
4. **Format:** Markdown authoring → static HTML (Astro content collections). Avoid hand-editing HTML long-term.  
5. **Detail level:** Web = GitHub Release markdown + structured bullets; in-app = teaser + categorized post-install; internal graph = full file-level edits (do not expose).  
6. **Feeds (phase 2):**  
   - Subscribe: `https://github.com/UnboundAngel/RuForge/releases.atom` (zero maintenance).  
   - Optional site RSS generated from same release JSON in CI.  
7. **SEO:** Changelog under `/changelog` on apex domain (not `changelog.ruforge...` subdomain) so authority stays on main site ([ReleasePad](https://www.releasepad.io/blog/changelog-seo-how-to-make-your-release-notes-rank-in-google/)).

### Anti-duplication pipeline

```
Ship: AGENTS.md Shipped log (human, every change)
Release: GitHub Release + updater.json (structured)
CI on release tag:
  - changelog-from-release OR releasepost → content/releases/vX.Y.Z.md + index JSON
  - optional: validate updater.json notes match release body
Deploy: Astro build → Cloudflare/GitHub Pages
```

Tools to evaluate: [releasepost](https://github.com/updatecli/releasepost), [changelog-from-release](https://github.com/rhysd/changelog-from-release), [ChangeCast](https://github.com/palmerhq/changecast). For RuForge, **GitHub Release as source of truth** with a thin transform to site markdown and a check that `updater.json` `version` matches tag is enough.

---

## Visual / theme direction

### Design tokens (align with app)

| Token | Suggested value | Use |
|-------|-----------------|-----|
| `--bg-shell` | `#1D1613` | Page background |
| `--bg-elevated` | `#271C18` | Cards, nav |
| `--text-primary` | `#EDD79C` | Headings, body (passes WCAG AAA on shell) |
| `--text-secondary` | `#C9B87A` or desaturated cream | Subheads (~9:1 on shell) |
| `--text-muted` | `#A89888` minimum | Captions only; do not use `#8A7A6A` for body (~4.3:1 fails AA) |
| `--accent-user` | CSS variable placeholder | Show screenshots with user accent; site uses fixed gold default |
| `--border` | `rgba(237, 215, 156, 0.12)` | Dividers |
| `--code-bg` | `#120E0C` | Code blocks |

Contrast checks (computed sRGB, WCAG 2.1): `#EDD79C` on `#1D1613` = **12.58:1**; on `#271C18` = **11.70:1**.

### Do

- Dark warm shell, cream/gold type, one accent highlight per section.  
- Real app screenshots on charcoal; subtle noise or vignette OK.  
- Generous line-height (1.6–1.7) for prose.  
- Monospace for version strings, paths, hashes.  
- Reserve saturated accent for buttons and links only.

### Do not

- Generic SaaS blue/purple gradients.  
- Stock photo “happy downloader” imagery.  
- Light mode as default (optional toggle phase 3).  
- Competing gold + user-accent without hierarchy (site fixed palette; mention in-app customization in copy only).  
- Low-contrast brown-on-brown body text.

### Typography pairs (2025–2026 doc-friendly)

| Prose | Code | Rationale |
|-------|------|-----------|
| **Source Sans 3** | **Source Code Pro** | Adobe superfamily, documentation-native |
| **Inter** | **JetBrains Mono** or **Fira Code** | Default in Astro/Starlight stacks |
| **IBM Plex Sans** | **IBM Plex Mono** | Technical, neutral |

Recommendation: **Source Sans 3 + Source Code Pro** for brand warmth without serif editorial tone. Load variable fonts (~2 files).

### Doc themes to crib (structure only, recolor)

- [Starlight](https://starlight.astro.build/) (Astro): customize `customCss`, dark-first.  
- VitePress default dark (recolor).  
- Avoid out-of-box purple Docusaurus unless heavily themed.

---

## Interaction patterns

### Navigation depth

- **3-click rule (adapted):** Home → Download (1); Home → Changelog → release detail (2); Home → Privacy (2). GitHub opens in same tab from footer (1).  
- **Hub model:** Home is hub; no deep nested docs tree in MVP.  
- **Sticky header:** Logo + Download + Changelog only; avoid 8-item nav.

### Above-the-fold (developer/desktop tool)

| Block | Consumer app | RuForge (dev-tool) |
|-------|--------------|---------------------|
| Hero | Emotional headline + lifestyle | Problem/solution: “Download YouTube. Watch locally.” |
| Proof | Testimonials, logos | Version badge, OSS, Windows, screenshot/video |
| CTA | Free trial | Download + GitHub |
| Scroll | Feature grid + pricing | 3 pillars + “how it works” 3 steps + changelog teaser |

Editorial multi-story heroes ([2026 Webflow trend](https://www.pravinkumar.co/blog/editorial-layouts-replace-hero-sections-webflow-2026)) help **returning** visitors; for **cold** RuForge traffic, keep a **single clear hero** plus a secondary “Latest release” strip.

### Link previews (hover cards)

| Approach | Pros | Cons |
|----------|------|------|
| Hover iframe/card | Fast context on internal links | a11y (hover-only), perf, layout shift; [VitePress still open issue](https://github.com/vuejs/vitepress/issues/3263) |
| Static LinkCard (Starlight) | Predictable, no runtime JS | Manual per page |
| Open Graph only | Great social shares | No on-site hover |

**Recommendation:** MVP = **no hover previews**; use Starlight-style **LinkCard** on hub pages for 3–5 key links. Ensure every page has `og:title`, `og:description`, `og:image` (screenshot 1200×630). Phase 2: [astro-embed LinkPreview](https://astro-embed.netlify.app/components/link-preview) for selected external links (build-time OG fetch, cache images).

---

## Suggested stack + why

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Astro 5** | Zero JS by default; fast changelog + landing |
| Content | **Markdown** content collections | Matches release notes workflow |
| Docs (later) | **@astrojs/starlight** in same repo | Same deploy, search, sidebar when L2 guides appear |
| Styling | **Tailwind v4** or scoped CSS | Matches app stack familiarity |
| Hosting | **Cloudflare Pages** (preferred) or **GitHub Pages** | Free, CDN, easy `ruforge.app` DNS; [Astro on Cloudflare](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/) |
| CI | GitHub Actions on `release` published | Build site + optional RSS |
| Analytics | None or **Plausible/Fathom** optional | Privacy story for downloader users |
| Search | Pagefind (Starlight) when docs > ~20 pages | Static, no server |

**Skip for MVP:** Next.js SSR (no SEO need for dynamic HTML), Docusaurus (heavy), headless CMS (solo overhead).

**Changelog sync sketch:**

```yaml
# on release published
- run: changelog-from-release --repo UnboundAngel/RuForge --tag ${{ github.ref_name }} --out site/src/content/releases/
- run: npm run build
- deploy to Cloudflare Pages
```

Add a lint step: `updater.json` version equals tag.

---

## Phased rollout

### Phase 0 (prep, no public site)

- Pick domain.  
- Draft home L1 copy + privacy.  
- Decide release note template (match `updater.json` JSON shape).

### Phase 1 MVP (1–2 days build)

- Astro landing + download + privacy.  
- Changelog index + auto-generate last release page from GitHub Action.  
- OG tags, favicon from app icon.  
- Footer: GitHub, Issues, Privacy.

### Phase 2 (post-launch)

- Backfill `/changelog/vX.Y.Z` from GitHub Releases.  
- `releases.atom` link in changelog header.  
- Starlight `/docs` with 5–8 L2 guides (cookies, library, player).  
- `/security` (signing, updater pubkey).

### Phase 3 (if warranted)

- Pagefind search, comparison page, sponsor block.  
- Optional hover link cards.  
- macOS/Linux landing stubs only when binaries exist.

---

## Social, trust, and legal (downloader-specific)

### Placement

| Element | Placement | Rationale |
|---------|-----------|-----------|
| GitHub repo | Header icon + footer | Primary trust for OSS |
| Releases / Issues | Footer | Support path |
| Discord / X | Footer | Community; not primary CTA |
| Sponsor | Footer or small home strip | Low pressure |
| Privacy / Terms | Footer | Expected for binaries + updater |
| Download | Header button + hero | Primary conversion |

### Privacy page must state

- **Local-first:** library and downloads stay on disk; no RuForge account.  
- **YouTube / yt-dlp:** third-party terms; user responsible for compliance.  
- **Cookies:** optional, via embedded explorer for restricted content; not uploaded to RuForge servers.  
- **Updater:** checks `updater.json` endpoint (GitHub raw); no telemetry default.  
- **Contact:** GitHub Issues preferred over email unless provided.

### Legal

- Short **Terms of Use** for distributed signed binaries (AS IS, no warranty).  
- **Privacy** separate from marketing copy.  
- Do not overclaim “anonymous” if Discord/GitHub identities are used for support.

Examples of OSS desktop privacy patterns: [GitDock](https://www.gitdock.dev/privacy.html), repo-root `PRIVACY.md` on GitHub.

---

## Engagement and scroll (actionable)

1. **Hero:** headline + subhead + Download + version pill + loop/video.  
2. **Social proof (light):** GitHub stars badge, “Open source”, Windows 11 note. Skip fake testimonials.  
3. **Three pillars:** Downloader, Library, Player (icon + 2 lines each).  
4. **How it works:** Paste URL → queue → watch in library (3 steps).  
5. **Screenshot strip:** 2–4 real UI captures, same theme as app.  
6. **Latest release:** embed last changelog entry with “All releases” link.  
7. **FAQ (inline):** Is it free? Where are files? Cookies? Linux?  
8. **Footer CTA:** repeat Download.

Target scroll depth: one full viewport story before changelog teaser; avoid 12-screen marketing.

---

## Sources cited

- Yaak changelog (index + per-release): https://yaak.app/changelog  
- Obsidian changelog: https://obsidian.md/changelog  
- Obsidian help IA: https://help.obsidian.md/install  
- Obsidian marketing: https://obsidian.md/  
- Raycast changelog: https://www.raycast.com/changelog  
- Raycast home: https://www.raycast.com/  
- Motrix home: https://motrix.app/  
- Motrix GitHub: https://github.com/agalwood/Motrix  
- FreeTube docs: https://docs.freetubeapp.io/about/freetube  
- Diátaxis framework: https://diataxis.fr/  
- Diátaxis how to use: https://diataxis.fr/how-to-use-diataxis/  
- curl changelog pagination lesson: https://daniel.haxx.se/blog/2024/07/24/changelog-changes/  
- Changelog SEO (subfolder, per-entry pages): https://www.releasepad.io/blog/changelog-seo-how-to-make-your-release-notes-rank-in-google/  
- SaaS changelog guide 2026: https://www.changelogdev.com/blog/complete-guide-saas-changelogs  
- GitHub releases Atom: https://github.com/{owner}/{repo}/releases.atom  
- releasepost (static site sync): https://github.com/updatecli/releasepost  
- changelog-from-release: https://github.com/rhysd/changelog-from-release  
- ChangeCast: https://github.com/palmerhq/changecast  
- WebAIM contrast: https://webaim.org/articles/contrast/  
- Astro on Cloudflare Pages: https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/  
- Starlight: https://starlight.astro.build/  
- Starlight Link Cards: https://starlight.astro.build/components/link-cards/  
- VitePress link preview issue: https://github.com/vuejs/vitepress/issues/3263  
- astro-embed LinkPreview: https://astro-embed.netlify.app/components/link-preview/  
- Editorial hero layouts 2026: https://www.pravinkumar.co/blog/editorial-layouts-replace-hero-sections-webflow-2026/  
- Font pairing (dev tools): https://fontalternatives.com/blog/pairing-monospace-fonts-with-sans-serifs/  
- GitDock privacy example: https://www.gitdock.dev/privacy.html  
- PageCrawl GitHub release monitoring: https://pagecrawl.io/blog/monitor-github-releases-changelogs-documentation  

---

*End of brief. Update when RuForge ships macOS/Linux or a public docs scope is chosen.*
