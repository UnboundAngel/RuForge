---
name: ruforge-design
description: >-
  RuForge live chrome restrictions: bezel and well, nested surfaces, and
  shared widgets (scrollbars, popups, warnings, errors, toasts, motion) as they get
  locked from the running app. Use when building or restyling UI, layout,
  Settings, Music mode, window chrome, sidebar, panels, dialogs, animation,
  page transitions, Alt radial, or when Angel says design file, design taste,
  or capture a pattern from a screenshot.
---

# RuForge design restrictions

Living catalog of **what the running app already does**. Not a mood board. Not Anthropic frontend-design (that is process). House taste still lives in `.cursor/rules/design-style*.mdc`. This skill wins for named chrome patterns once a restriction is **locked**.

Live code wins if this file and the app disagree. Fix the restriction forward.

## When working

1. Read [restrictions.md](restrictions.md) for locked patterns that match the surface.
2. If the surface is not listed, copy the template in that file, fill it from the live UI (screenshot or DOM), mark `draft`. Do not invent a second language. Do not restyle the live app to "match" a restriction you are writing. Capture first. Implement elsewhere only when Angel asks.
3. Do not log docs-only restriction edits to Unreleased.

## How to add a restriction

Angel points at the app. You write one block in [restrictions.md](restrictions.md):

- **Name** in design terms (bezel, well, not "the brown box")
- **Do / don't**
- **Tokens and classes** from live CSS
- **Code** (file + class)
- Status: `draft` until Angel says it is locked

Keep each block short. One pattern per heading.

## Also read

- `.cursor/rules/design-style.mdc` (bans: no dividers, no glow, tonal layers)
- `.cursor/rules/design-style-ruforge-tokens.mdc`
- `.cursor/rules/design-style-media-cards.mdc`
- `.cursor/rules/design-style-anti-patterns.mdc`
