# Roadmap Field Notes — handoff

Brief context for the next Cursor chat. Desktop and mobile Field Notes layouts share the same data path and component.

## What we did (desktop polish)

Visual pass on `/roadmap` against `.cursor/imports/RuForge roadmap redesign/Roadmap.dc.html` (Concept C: Field Notes).

- **Hero** — eyebrow, H1 + hand squiggle, body copy, ghost CTA, ambient glow layer (`rf-roadmap-ambient`)
- **Section layout** — Brewing now (warm wash, 2-col), On the horizon (3-col), Shipped (2-col). Responsive breakpoints at 960 / 720 / 480px
- **In-progress rows** — lead icon is the **priority arc gauge** (size 20), color-coded by importance. No separate progress ring. Meta row is area label only
- **Planned / shipped icons** — unchanged (dashed circle, checkmark fill)
- **Priority gauges** — four distinct colors via `@theme` tokens:
  - `--color-rf-priority-essential` (coral)
  - `--color-rf-priority-high` (amber)
  - `--color-rf-priority-medium` (sky)
  - `--color-rf-priority-low` (stone)
- **Tooltips** — solid chip (not glassy), priority-colored text + border, uppercase tracked label, two-layer caret so the pointer outline matches the box
- **Alignment** — progress-row gauges vertically centered against title + area block

## What we did (mobile migration)

`/m/roadmap` now uses the same Field Notes UI as desktop.

- **Data** — `loadRoadmapEntries` + `transformRoadmapItems` from `roadmapFieldNotes.ts` (same as `/roadmap`)
- **Component** — `RoadmapFieldNotes` with `touchTooltips` prop (mobile mode)
- **Layout** — `.rf-roadmap--mobile` wrapper on `<main>`; single-column grids, compact section spacing, short hero (back link + title + copy + ghost CTA). No ambient glow or hand squiggle
- **Haptics** — `useHaptic` on priority reveal (`select`), shipped expand (`select`), see more (`tap`)
- **Priority on tap** — no tooltip popup; area label crossfades to priority-colored label for 2s (tap title or gauge)
- **Shipped (mobile)** — starts collapsed; tap header to expand; items stagger-fade in (10 per batch, "See more" for next 10)
- **Legacy table** — removed (`getCollection('roadmap')`, status/area filters, inline filter script)

## Files touched

| File | Changes |
|------|---------|
| `website/src/pages/roadmap.astro` | Hero markup, ambient glow wrapper, ghost CTA class |
| `website/src/pages/m/roadmap.astro` | Field Notes migration; unified data loader; mobile hero |
| `website/src/components/RoadmapFieldNotes.tsx` | Priority gauge as in-progress lead icon; `touchTooltips` tap toggle |
| `website/src/styles/global.css` | All `.rf-roadmap-*` rules, `.rf-roadmap--mobile` overrides, touch tooltip CSS |

**Not touched (still valid as-is):**

- `website/src/lib/roadmapFieldNotes.ts`
- `website/src/content/roadmap.json`
- `website/src/content/config.ts`

**Legacy (unused by roadmap pages):**

- `website/src/lib/roadmapBadges.ts` — old table helpers only
- `website/src/components/ui/icon-pill-tooltip.tsx` — roadmap uses inline CSS tooltips

## Preview

From `website/`:

```bash
npm run dev
```

Desktop: `http://localhost:4321/roadmap`  
Mobile: `http://localhost:4321/m/roadmap` (or open `/roadmap` on a mobile UA for auto-redirect)  
After `roadmap.json` edits, restart dev server.

## Reference

Visual source of truth:  
`c:\Random things i dont want deleted\Utils\neotube\.cursor\imports\RuForge roadmap redesign\Roadmap.dc.html`  
(Concept C = Field Notes; filter bar / concept switcher in reference are not shipped on the live page.)

## Design tokens (roadmap-specific)

In `website/src/styles/global.css` `@theme`:

```css
--color-rf-priority-essential: #d96a62;
--color-rf-priority-high: #ddb24f;
--color-rf-priority-medium: #5da9c9;
--color-rf-priority-low: #8e8578;
```

Plus existing `--font-display`, `--font-hand`, `--font-sans`, `--color-rf-bg`, `--color-rf-text`, `--color-rf-text-muted`.
