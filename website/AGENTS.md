# Website agent rules

Applies when working under `website/`. Root [`AGENTS.md`](../AGENTS.md) still applies.

## After visual changes

Screenshot at two sizes: desktop and mobile (390px wide; the `/m/` route when one exists). Crop each shot to the region you changed (element screenshot by selector), look at both yourself for visible issues before reporting, and give Angel both as markdown file links. Cursor chat does not render image attachments. Copy shots into `.screenshots/` at the repo root (gitignored) and link by workspace-relative path with forward slashes; links into `%TEMP%` do not open.

Angel keeps desktop and `/m/` tabs open in the Cursor browser: note each tab's URL before you touch it, shoot mobile in a tab you opened yourself where possible, and when done clear any device emulation and navigate every tab you used back to the URL it had before. Never leave a desktop tab on an `/m/` page or in mobile emulation.

## Links and images

Every inline text link uses `.rf-inline-link` from `global.css` (docs link look: underline, text slides right and a link glyph fades in on hover). Prefer linking to a page on the site over GitHub when one covers it. Images are never draggable (global `img` rule; add `draggable="false"` on big decorative photos).

Any link or button that scrolls to another spot on the same page uses `src/lib/smoothAnchors.ts`; rules in [`docs/ruforge/website/design.md`](../docs/ruforge/website/design.md) under "Scrolling within a page".

## Mobile (`/m/`)

Every pressable gets shared press feedback by class, never a bespoke handler: `rf-m-btn` (buttons, light impact), `rf-m-card` (cards, selection), `rf-m-link` (links and tappable rows, selection). `MobileShell.astro` fires the haptic and ripple on pointerdown, so do not also call `useHaptic()` in the same element's `onClick` (it double-fires). Call `useHaptic()` directly only for pressables that cannot carry the class. Height expand (`MobileFeatureAccordion`) is only for elements that actually reveal more content below.

## Layout calls from Angel

- Wide screens: do not hang everything off one left edge. Split the header (title left, secondary note right) and lay peer items side by side in cards with matching heights.
- Leave clear safe space between the fixed top nav and the first content on every page.
- Mobile: keep sections short. Headline and key line; longer explanation behind tap-to-expand (grid-rows `0fr` to `1fr`, `inert` while closed).
- Mobile lists of pages (legal, docs indexes): tappable rows with title, one meta line and a chevron. No summaries, icon tiles or emoji. Use `MobilePageHeader.astro` + `MobileRow.astro`; grouped lists and "read more" toggles use `Disclosure.astro` (desktop too; never a native `<details>`).
- Solid surfaces. No faded outline with a see-through fill on cards, callouts, tables or toggles. Glass is only for the nav bar and the menus that drop from it.
- A toggle's content opens inside the thing you clicked, as one card that grows downward, never as loose text under a separate button.
- Only change what Angel asked for. A spacing request is not permission to restyle the element.
- Transitions between two states of the same thing morph (clip-path and transforms), never crossfade two copies. The mobile header bar morphs into the pill (`MobileHeader.tsx`).
- Every big card needs a visual anchor (photo, stamp, art). The login trust card uses the coffee paper photo plus `InkStamp.astro` on both desktop and mobile.
- Legal pages read like documents: big display title, "Last updated" as a small label under it, typographic section heads, bold defined terms. Every claim is checked against the code before the date changes.

## Copy and SEO

If the task is SEO, `llms.txt`, robots, JSON-LD, or public site copy: read the website rows in [`docs/agents/DOC-ROUTING.md`](../docs/agents/DOC-ROUTING.md) first. Never use bypass / circumvention / DRM / rip / "any video any site". Lead with open-source media library / yt-dlp GUI / Tauri app. Never fabricate `aggregateRating`.

If `VOICE.local.md` exists at the repo root, it sets the voice for visible website copy (headings, cards, roadmap, buttons, empty states). Do not commit it. Write for someone who has never heard of RuForge or yt-dlp: say plainly what the feature does for them. Sound smart and relaxed, not corporate and not cute. No idioms or slogans ("heavy lifting", "no strings attached", "before you commit", "what you actually get"), no paired tagline headlines, no forced German or slang, no internal terms (sidecar, sprite sheet, queue job, Deno). Keep product and brand names cased, check every claim against the code, and leave SEO metadata (`<title>`, meta descriptions, JSON-LD, `llms.txt`) in plain sentence case.
