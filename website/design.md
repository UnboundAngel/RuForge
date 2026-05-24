# RuForge website design system

Canonical reference for the public Astro site in `website/`. Source of truth for tokens is `src/styles/global.css` (`@theme` block). When this doc and the code disagree, the code wins.

## Design intent

Warm dark "forge" aesthetic: deep brown backgrounds, sand-gold foreground, subtle paper grain and ambient glow on the landing page. The site mirrors the desktop app's palette closely but uses its own token names (`rf-*`) and a distinct typography stack (Cabinet Grotesk + Satoshi, not Inter).

---

## Color palette

### Core UI tokens

| Token | Hex / value | Tailwind class | Use |
|-------|-------------|----------------|-----|
| `rf-bg` | `#1d1613` | `bg-rf-bg` | Page background |
| `rf-surface` | `#271c18` | `bg-rf-surface` | Cards, panels, header pill base |
| `rf-text` | `#edd79c` | `text-rf-text` | Primary copy, headings |
| `rf-text-muted` | `#c9b87a` | `text-rf-text-muted` | Body, nav links, secondary copy |
| `rf-accent` | `#edd79c` | `text-rf-accent`, `bg-rf-accent` | Links, CTAs, highlights (same as primary text) |
| `rf-border` | `rgb(237 215 156 / 0.12)` | `border-rf-border` | Hairline borders, dividers |

Accent and primary text share the same gold. Buttons invert: gold fill (`bg-rf-accent`) with dark text (`text-rf-bg`).

### Semantic / changelog / roadmap

| Token | Hex | Tailwind | Use |
|-------|-----|----------|-----|
| `rf-add` | `#9cb86a` | `text-rf-add` | Additions, green badge |
| `rf-add-bg` | `rgb(156 184 106 / 0.12)` | `bg-rf-add-bg` | Addition row background |
| `rf-fix` | `#d49a7a` | `text-rf-fix` | Fixes, warm coral |
| `rf-fix-bg` | `rgb(212 154 122 / 0.12)` | `bg-rf-fix-bg` | Fix row background |
| `rf-todo` | `#e8c06a` | `text-rf-todo` | Roadmap to-do |
| `rf-todo-bg` | `rgb(232 192 106 / 0.1)` | `bg-rf-todo-bg` | To-do badge bg |
| `rf-done` | `#8a9e78` | `text-rf-done` | Roadmap finished |
| `rf-done-bg` | `rgb(138 158 120 / 0.1)` | `bg-rf-done-bg` | Done badge bg |
| `rf-critical` | `#7faa6e` | `text-rf-critical` | High-priority roadmap |
| `rf-critical-bg` | `rgb(94 130 82 / 0.22)` | `bg-rf-critical-bg` | Critical badge bg |
| `rf-high` | `#d4b06a` | `text-rf-high` | Elevated priority |
| `rf-high-bg` | `rgb(212 176 106 / 0.14)` | `bg-rf-high-bg` | High badge bg |

### Derived / layout-only colors

These are not `@theme` tokens but appear in components:

| Value | Where | Use |
|-------|-------|-----|
| `#1a1412` → `#0d0a09` | Code snippet panels | Dark code block gradient |
| `#1d1613` → `#241a16` (multi-stop) | `LandingBackdrop.astro` | Landing vertical gradient zones |
| `rgb(237 215 156 / 0.25)` | `::selection`, scrollbars | Text selection, scrollbar thumb |
| `#000` + white text | `.rf-icon-pill-tooltip` | Docs mega-menu icon tooltips |
| `rgb(163 154 148 / 0.72)` | `.rf-docs-built-with__icon` | Monochrome tech icons at rest |
| `#2c221e` | Tutorial sketch cards | Light panel copy on cream cards |

### Code syntax (Shiki)

Custom theme in `src/lib/ruforgeShikiTheme.ts`:

| Role | Color |
|------|-------|
| Background | `#1a1412` |
| Default text | `#edd79c` |
| Comments | `#8a7355` (italic) |
| Strings | `#d4a373` |
| Keywords | `#c9956a` (bold) |
| Functions | `#e8c078` |
| Types | `#ddb86a` |
| Punctuation | `#c9b87a` |

### Desktop app comparison

The Tauri app (`src/index.css`) uses a related but not identical set:

| App | Website |
|-----|---------|
| `--bg: #1c1512` | `rf-bg: #1d1613` |
| `--accent: #EDCF9B` (user-configurable) | `rf-accent: #edd79c` (fixed) |
| `--text: #fafaf9` | `rf-text: #edd79c` |
| Inter | Satoshi + Cabinet Grotesk |

When designing cross-surface assets, prefer website `rf-*` values for the site and app accent defaults for in-app UI.

---

## Typography

| Role | Family | CSS variable | Weights |
|------|--------|--------------|---------|
| Body / UI | Satoshi | `--font-sans` | 300–900 (variable) |
| Headings / display | Cabinet Grotesk | `--font-display` | 100–900 (variable) |
| Hero underline flourish | Patrick Hand | `--font-hand` | 400 |
| Version badge, code | System mono stack | `--font-mono` | ui-monospace, Cascadia Code, Segoe UI Mono |

Font files live under `website/public/fonts/`. Loaded in `src/styles/fonts.css`.

**Defaults:** `html` uses Satoshi. All `h1`–`h6` use Cabinet Grotesk. Prose and UI components inherit sans unless overridden.

---

## Logo and wordmark

| Asset | Path | Notes |
|-------|------|-------|
| App icon (site) | `src/assets/ruforge-logo.png` | Source: `public/neotubeIcon.png` |
| Wordmark | Text "RuForge" in components | `text-xl font-semibold tracking-tight text-rf-text` |

`Logo.astro` renders the PNG (rounded-md) with optional wordmark. Header uses logo only (no wordmark); footer and hero may show both.

---

## Icons

### UI icons (inline SVG)

Defined in `src/components/Icon.astro`, typed in `src/lib/icons.ts`.

| Name | Style | Typical use |
|------|-------|-------------|
| `github` | Fill | Header, footer, changelog |
| `download` | Stroke 1.75 | Download CTAs |
| `message` | Stroke 1.75 | Discussions / feedback |
| `shield` | Stroke 1.75 | Privacy |
| `scale` | Stroke 1.75 | Terms |
| `file` | Stroke 1.75 | Legal notice |
| `plus` | Stroke 2 | Changelog additions |
| `wrench` | Stroke 1.75 | Changelog fixes |
| `map` | Stroke 1.75 | Roadmap |
| `list` | Stroke 1.75 | Changelog index |
| `check` | Stroke 2 | Roadmap done |
| `circle` | Stroke 1.75 | Roadmap to-do |
| `star` | Stroke 1.75 | Priority, highlights |
| `external` | Stroke 1.75 | Outbound links |
| `chevron-left`, `chevron-right` | Stroke 1.75 | Hero carousel |
| `pause`, `play` | Stroke 1.75 | Hero carousel |

**Convention:** stroke icons use `currentColor`, `stroke-width: 1.75` (2 for plus/check), round caps. Color comes from parent (`text-rf-accent`, `text-rf-add`, etc.). GitHub is filled, not stroked.

### Tech / brand icons

**Landing ticker (8 items):** brand colors on home marquee via `techTickerBrandColors` in `src/lib/techTickerIcons.ts`:

- YouTube `#FF0000`, Tauri `#24C8DB`, Rust `#F74C00`, React `#61DAFB`, FFmpeg `#3B8033`
- yt-dlp, SponsorBlock, Zustand: SVG files under `public/icons/tech/`

**Docs mega-menu (16 items):** monochrome treatment. Simple Icons paths inline; file-based marks for yt-dlp, Zustand, SponsorBlock. Resting color `rgb(163 154 148 / 0.72)`, hover `rgb(237 215 156 / 0.88)`. Image marks get a CSS filter to match.

**Built-with pages:** `BuiltWithTechIcon.astro` (sizes sm 16px, md 20px, lg 22px).

### OS download button

`HeaderDownloadButton.astro` picks Windows (Simple Icons path), Linux (Simple Icons), or generic download stroke for macOS based on `navigator.userAgent`.

### Optional assets

See `docs/ICON-WISHLIST.md` for swap-in files and unused marks (SponsorBlock SVG in app repo, etc.).

---

## Component primitives

CSS classes in `global.css` `@layer components`:

| Class | Purpose |
|-------|---------|
| `rf-container` | `max-w-5xl` centered content |
| `rf-surface` | Rounded surface card |
| `rf-btn` | Primary CTA (gold fill, dark text, glow on hover) |
| `rf-btn-ghost` | Secondary outline button |
| `rf-link-card` | Linked card row |
| `rf-badge` + `rf-badge-*` | Pill badges (add/fix/todo/done/critical/high) |
| `rf-section-label` + variants | Changelog section eyebrows |
| `rf-prose` | Markdown/legal content |
| `rf-inline-code` | Inline backtick pills |
| `rf-code-panel` | Collapsible Shiki snippet (built-with docs) |
| `rf-scrollbar` | 7px accent thumb, no arrow buttons |
| `rf-header-nav-trigger`, `rf-mega-menu-link` | Header nav (opacity hover override) |
| `rf-nav-viewport` | Frosted mega-menu panel (`backdrop-filter: blur(24px)`) |

**Border radius:** buttons/cards `rounded-lg` / `rounded-xl`; badges and tooltips `rounded-full`; logo `rounded-md`.

**Motion:** mega-menu and built-with transitions use `cubic-bezier(0.16, 1, 0.3, 1)` at 280ms. Reduced motion falls back to fade-only.

---

## Landing page atmosphere

`LandingBackdrop.astro` layers:

1. Multi-stop vertical gradient (`#1d1613` family)
2. Optional paper grain tile (`src/assets/landing-grain.png`) at ~5.5% opacity
3. CSS or image hero ember wash (gold radial at top)
4. Five soft `bg-rf-accent/[0.02–0.055]` blurred orbs (ambient breathing)
5. Optional features grid at 1.5% opacity

Testimonial cards use rotating rim hues derived from avatar sets; default rim falls back to accent gold.

---

## File map

| Concern | File |
|---------|------|
| Design tokens | `src/styles/global.css` |
| Fonts | `src/styles/fonts.css`, `public/fonts/` |
| UI icons | `src/components/Icon.astro`, `src/lib/icons.ts` |
| Tech icons | `src/lib/techTickerIcons.ts`, `public/icons/tech/` |
| Logo | `src/components/Logo.astro`, `src/assets/ruforge-logo.png` |
| Code colors | `src/lib/ruforgeShikiTheme.ts` |
| Icon wishlist | `docs/ICON-WISHLIST.md` |

---

## Usage notes for designers and agents

1. Add new colors to `@theme` in `global.css` first, then reference here.
2. Prefer existing `rf-*` Tailwind classes over hardcoded hex in components.
3. New UI icons: add to `icons.ts` + `Icon.astro` (stroke style matches Lucide-like 24×24 grid).
4. New third-party marks: Simple Icons path in `techTickerIcons.ts`, or SVG in `public/icons/tech/`.
5. Do not use em dashes in user-facing copy (repo rule).
