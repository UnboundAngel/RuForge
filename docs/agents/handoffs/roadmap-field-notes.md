# Roadmap Field Notes — handoff

> **ARCHIVED / STALE — do not use for project state.** Read `STATE.md` then `AGENTS.md`. Code wins on conflict. Kept for history only.

Brief context for the next Cursor chat. Data layer and mobile are done. **Next up: desktop visual refinement only** on `/roadmap`.

---

## Handdown (copy for next chat)

```
Handoff doc updated at `docs/agents/handoffs/roadmap-field-notes.md`. Short version:

### What we did (already shipped)
- Field Notes layout on desktop `/roadmap` and mobile `/m/roadmap` against `Roadmap.dc.html` Concept C
- Unified data: `roadmap.json` + `roadmapFieldNotes.ts` + `RoadmapFieldNotes.tsx`
- Desktop: hero + ambient glow, three sections, priority gauges, hover tooltips, responsive grids
- Mobile: compact hero, haptics, inline priority reveal, collapsible shipped + pagination (do not touch in this pass)

### Files in scope (desktop visuals only)
- `website/src/pages/roadmap.astro` — hero markup only
- `website/src/components/RoadmapFieldNotes.tsx` — markup/class hooks only; no data or mobile behavior changes
- `website/src/styles/global.css` — `.rf-roadmap-*` rules (not `.rf-roadmap--mobile`)

Data layer untouched: `roadmapFieldNotes.ts`, `roadmap.json`.

### Next: desktop visual polish (this chat)
Compare live `/roadmap` side-by-side with the reference HTML. Close remaining gaps in spacing, type scale, hover states, section rhythm, tooltip chip, hero offset under site header. Filter bar / concept switcher in reference are **not** in scope.

Intentional deltas from reference (do not revert unless Angel asks):
- In-progress lead icon is the **priority arc gauge** (not the reference pulse-ring dot)
- Progress meta row is **area label only** (gauge is the lead icon, not duplicated in meta)

**Jim:** CSS/markup polish in the three files above. Match reference feel; respect design-style rules (no dividers except existing planned/shipped row borders, no glows, tonal layers).
**Chad:** only if a markup hook is missing for a visual fix. Do not change `touchTooltips`, mobile shipped logic, or data loading.

Preview: `cd website && npm run dev` → `http://localhost:4321/roadmap`
After `global.css` edits, restart dev server if styles look unstyled (Vite/Tailwind HMR can serve partial CSS).

Reference: `.cursor/imports/RuForge roadmap redesign/Roadmap.dc.html` (Concept C section, ~line 350+)
```

---

## What we did (desktop baseline)

Visual pass on `/roadmap` against `.cursor/imports/RuForge roadmap redesign/Roadmap.dc.html` (Concept C: Field Notes).

- **Hero** — eyebrow, H1 + hand squiggle, body copy, ghost CTA, ambient glow layer (`rf-roadmap-ambient`)
- **Section layout** — Brewing now (warm wash, 2-col), On the horizon (3-col), Shipped (2-col). Responsive breakpoints at 960 / 720 / 480px
- **In-progress rows** — lead icon is the **priority arc gauge** (size 20), color-coded by importance. No separate progress ring. Meta row is area label only
- **Planned / shipped icons** — dashed circle, checkmark fill
- **Priority gauges** — four distinct colors via `@theme` tokens:
  - `--color-rf-priority-essential` (coral)
  - `--color-rf-priority-high` (amber)
  - `--color-rf-priority-medium` (sky)
  - `--color-rf-priority-low` (stone)
- **Tooltips** — solid chip (not glassy), priority-colored text + border, uppercase tracked label, two-layer caret
- **Alignment** — progress-row gauges vertically centered against title + area block

## What we did (mobile migration)

`/m/roadmap` uses the same Field Notes UI. **Out of scope for desktop visual pass.**

- **Data** — `loadRoadmapEntries` + `transformRoadmapItems` from `roadmapFieldNotes.ts`
- **Component** — `RoadmapFieldNotes` with `touchTooltips` prop (mobile-only behavior)
- **Layout** — `.rf-roadmap--mobile` wrapper; single-column grids, compact hero
- **Haptics** — `useHaptic` on priority reveal, shipped expand, see more
- **Priority on tap** — area label crossfades to priority-colored label for 2s (no hover tooltip)
- **Shipped (mobile)** — collapsed by default; stagger-fade expand; 10 per batch + See more

## Next up: desktop visual polish (planned)

Side-by-side pass: live `/roadmap` vs reference Concept C. Likely tuning areas:

| Area | Reference notes | Live state |
|------|-----------------|------------|
| Hero top spacing | `padding-top: 152px` under fixed header mock | Under `BaseLayout` site header; may need offset tweak |
| Section headings | 34px Cabinet Grotesk | ~34px via `.rf-roadmap-heading`; verify weight/color per section |
| Brewing wash | `padding: 28px`, negative horizontal margin | `.rf-roadmap-brewing` approximates; verify rhythm |
| Row hover | `.nitem:hover { opacity: .82 }` | Partial on progress/planned; verify shipped |
| Tooltips | `#2c221e` chip, simpler caret | `#231916` + two-layer caret; may need color/spacing match |
| Planned/shipped rows | `border-top` on grid cells, specific padding | Present; verify 3-col planned gap feel |
| Progress layout | Reference uses pulse dot + gauge in meta | **Intentional:** gauge is lead icon only |

**Not in scope:** filter bar, area/status filters, concept switcher, mobile (`/m/roadmap`, `.rf-roadmap--mobile`, `touchTooltips`).

## Files touched (cumulative)

| File | Role |
|------|------|
| `website/src/pages/roadmap.astro` | Desktop hero + ambient glow |
| `website/src/pages/m/roadmap.astro` | Mobile page shell (leave alone) |
| `website/src/components/RoadmapFieldNotes.tsx` | Shared island; mobile gated by `touchTooltips` |
| `website/src/styles/global.css` | `.rf-roadmap-*` + `.rf-roadmap--mobile` overrides |

**Not touched (still valid):**

- `website/src/lib/roadmapFieldNotes.ts`
- `website/src/content/roadmap.json`
- `website/src/content/config.ts`

**Legacy (unused):**

- `website/src/lib/roadmapBadges.ts`
- `website/src/components/ui/icon-pill-tooltip.tsx` (roadmap uses inline CSS tooltips)

## Preview

From `website/`:

```bash
npm run dev
```

Desktop (this pass): `http://localhost:4321/roadmap`  
Mobile (frozen): `http://localhost:4321/m/roadmap`  
After `roadmap.json` edits, restart dev server.  
After large `global.css` edits, restart dev server if styles drop (HMR quirk).

## Reference

Visual source of truth:  
`c:\Random things i dont want deleted\Utils\neotube\.cursor\imports\RuForge roadmap redesign\Roadmap.dc.html`  
Concept C field notes body starts ~line 350. Filter bar / concept switcher are reference-only, not shipped.

## Design tokens (roadmap-specific)

In `website/src/styles/global.css` `@theme`:

```css
--color-rf-priority-essential: #d96a62;
--color-rf-priority-high: #ddb24f;
--color-rf-priority-medium: #5da9c9;
--color-rf-priority-low: #8e8578;
```

Plus existing `--font-display`, `--font-hand`, `--font-sans`, `--color-rf-bg`, `--color-rf-text`, `--color-rf-text-muted`.
