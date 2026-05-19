# RuForge — Changelog & version-graph authoring

You are reading this because the release ritual (AGENTS.md, step 6) sent you
here, or you are extending the version graph. This is authoring detail only.
It is deliberately NOT in AGENTS.md so the per-task agent path stays thin.
Do not read this for normal bug-fix or feature work. Only at release, or when
explicitly changing changes.html / versioner.html / the version JSON schema.

Output law still applies here: no emdashes, no AI filler, in any copy or
template you emit from these instructions.

Three parts below, moved verbatim from AGENTS.md with no content change:
1. Version graph manifests (docs/versioner.html + docs/versions/)
2. Changelog source (docs/changes.html), including the Canvas Architecture
   Workflow and the Category icons (in-app, Iconify) table
3. Structured version block (for agents), including the DOM template

---

## Version graph manifests (`docs/versioner.html` + `docs/versions/`)

**Purpose:** Internal per-release **dependency graph** (not the shipping “What’s new”). **Graph rows** are stored **only** in **`docs/versions/version-<semver>.json`**. **`docs/versioner.html`** keeps a small **`versions`** registry (`id`, `label`, `status`, `manifest`) plus the shared **`base`** agent/tool matrix, and **loads** each manifest at runtime.

**How to create or extend JSON (additive), registry rows, `fileEdits`, created files, preview:**  
→ **`docs/versions/MANIFEST-EXAMPLE.md`**

**Every field, alias, loader rule, and registry key:**  
→ **`docs/versions/MANIFEST-SCHEMA.md`**

**New semver:** Align **`package.json`**, **`src-tauri/tauri.conf.json`**, and **`src-tauri/Cargo.toml`** (`## Versions (keep aligned)` above), add the JSON file under **`docs/versions/`**, add the **`versions`** row in **`versioner.html`** — checklist in **MANIFEST-SCHEMA.md** §B.

**Preview:** `npx --yes serve docs` from repo root, then open **`/versioner.html`**.

**Roles:** **Chad** — manifests, registry, loader, **`VersionGraphFormat`**. **Jim** — CSS-only on **`versioner.html`** (avoid changing **`VersionGraphFormat`** wiring unless coordinated).

**`versioner.html` UX (maintainer/bot notes):**

- Nodes anchor edges to **circle centers** — labels hang below via CSS so Bézier endpoints stay accurate on wide task rows.
- **Detail panel:** scroll body is **`#detail-panel-inner`** (fixed chrome + close button); extend scroll there, not the raw `#detail-panel`.
- **`fileEdits` / multi-path tasks:** manifests still list **`fileEdits` in JSON only** — the canvas **renders synthetic file nodes** when a task/fix has **two or more unique paths**. **Green** ring = **`action` create** semantics (**`MANIFEST-SCHEMA.md`**); **muted cream/stone** = modified. Thin **fork** edges run from parent task/fix to each path; sidebar copy uses **`reason`** when present else a short default. **By default those file nodes are hidden** — **click the parent task/fix on the canvas** to toggle the row (click again to collapse). Changing version pills or clicking empty canvas clears expansions.

- **Graph extent:** Layout is **normalized into a positive bbox** and the SVG **`viewBox`** / `#graph-layer` size follow that bbox so long manifest rows do not clip edge strokes at a fixed 4000×6000 canvas.

## Changelog source (`docs/changes.html`)

- **Audience:** This file is **internal only** — for **you and IDE agents** (structure, copy, release hygiene). **End users do not browse this HTML.** The shipping **“What’s new” / updater** experience is built **in the app** (React + **Iconify** icons, RuForge palette). Keep `docs/changes.html` aligned with what you ship so agents can diff and port content into UI later.
- **Canonical in-repo history** of notable changes, **one block per shipped app version** (same triplet as `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`).
- **Format is HTML only — not Markdown.** Use the structured layout in **`### Structured version block`** below. Inline SVGs in the template are **layout stand-ins**; production UI should use the **Iconify** slugs the maintainer chooses (see **Category icons (in-app)** below).
- **Why HTML:** Easier for agents to emit consistent, parseable trees than Markdown dialects — still **not** the user-facing surface.
- **Order:** **Newest version first** inside `<main>`.
- **Workflow:** **Jim (Gemini)** may own the **first visual pass** on `docs/changes.html` (spacing, typography, faded rules, cream-on-brown harmony) **without changing the DOM contract** (`rf-*` classes, `data-version`, section nesting). **Chad / agents** then **fill and maintain** list rows, counts, and copy when code changes land. On release, distill for `updater.json` `notes` / GitHub Release as needed.
- **Divider lines (agents + Jim):** **Avoid** flat, full-width, low-contrast gray rules that “cut” the panel (they read cheap and fight the warm brown shell). **Prefer** the same language as the **Video Library** date headers: **rules that fade out** toward the edges, **muted cream / gold** (`#EDD79C`-family) with soft alpha — see `docs/changes.html` gradients. If a separator does not fade and harmonize with the brown shell, **do not add it**; use whitespace instead.
- **Policy:** Do not replace this workflow with a Markdown twin unless the maintainer updates this section of `AGENTS.md`.

**[NEW: Canvas Architecture Workflow — `docs/changes.html` only]**
- **Architecture (Canvas Graph):** The **changes.html** changelog UI uses an interactive dependency graph on a canvas; the underlying data remains LLM-readable JSON inside that file.
- **Source of Truth (LLM-Readable):** The changelog data lives in a structured JSON block inside a `<script type="application/json" id="changelog-data">` tag **within `docs/changes.html`**.
- **Workflow for Agents:**
  - **NEVER** attempt to edit the JavaScript rendering logic or the CSS styles for the **changes.html** graph.
  - When adding new version notes, you **ONLY** append to the `versions` array inside the `<script id="changelog-data">` JSON block.
  - Create nodes for tasks (`"type": "task"`) or fixes (`"type": "fix"`), add `details` and modified `files` to those nodes, and create `"edges"` connecting the agent(s) who did the work to the task, and the task to the `ruforge` core node.
- **Exporting for Release:** The HTML UI includes an "Export Release Notes" button. When clicked, the JavaScript parses the JSON graph and generates a cleanly formatted Markdown summary of the selected version, ready to be copied into `updater.json` or GitHub Releases.

**Related internal graph (`docs/versioner.html`):** Authoring rules and examples live in **`docs/versions/MANIFEST-EXAMPLE.md`** and **`docs/versions/MANIFEST-SCHEMA.md`** (see **`## Version graph manifests`**). Do not assume the same editing rules as **changes.html**.

### Category icons (in-app, Iconify)

Maintainer-provided slug set for **category** glyphs (compare contrast on `#1D1613` / `#271C18` with muted cream strokes):

| Role | Iconify slug | Notes |
|------|----------------|-------|
| **Additions** | `material-symbols:add-ad` | “Window + plus” — reads as **new surface / feature**; pairs visually with the wrench family because both use a **frame**, but the **corner glyph differs** (plus vs wrench). |
| **Fixes (wrench family)** | `fluent:window-wrench-24-regular` or `fluent:window-wrench-32-filled` | **Tool on window** — clear **repair / maintenance** story; **filled** pops slightly more on dark brown at small sizes. |
| **Fixes (alternate)** | `material-symbols:reset-wrench-rounded` | Emphasizes **repair / reset** — still wrench-adjacent; distinct silhouette from `add-ad` if both are rounded. |
| **Fixes (semantic bug)** | `mdi:bug-check-outline` | **Most semantically “fixes”** and **least confusable** with “add” (different metaphor entirely). Strong candidate if you want zero chance users mix “new” vs “fixed.” |

**Opinion (for RuForge’s brown + muted cream):** At small sizes, render these icons in **muted cream** (`stone-200` / `#EDD79C` tint) or **slightly warmed white**, not pure `#fff`, so they match the library UI. **`mdi:bug-check-outline`** is the safest **distinct** choice for fixes next to **`material-symbols:add-ad`**. If you prefer a **unified “window chrome”** language, pair **`add-ad`** + **`fluent:window-wrench-24-regular`** and rely on **plus vs wrench** in the same corner — works if both icons stay **large enough** in the UI; if they shrink below ~18px, prefer **bug-check** for fixes.

### Structured version block (for agents)

When you add or extend a release in **`docs/changes.html`**, follow this **layout contract** so the same tree is easy to map into the in-app “What’s new” view later.

**Numbered slots (what goes where):**

1. **Contributor (per line)** — A short handle or name in a **left** pill on each change row (`<span class="rf-contrib">…</span>`). This is **credit for who wrote the change** (contributor / maintainer), **not** a “founder” or role badge. Use real handles or `Team` when mixed.
2. **Color coding** — **Do not** use the tired **green = additions / red = fixes** pairing (red for fixes reads as alarm-y and ages poorly). The repo template uses **teal / mint for additions** and **indigo / lavender for fixes** (see `:root` in `docs/changes.html`). If you extend the palette, keep fixes **non-red** unless the maintainer changes this rule.
3. **Category icons (this file)** — Inline SVGs in `docs/changes.html` are **placeholders** for layout only. **Shipping icons** = Iconify in the app (**Category icons (in-app)** table above).
4. **Version label** — Plain **top-right** of the version block header row (`<span class="rf-version">x.y.z</span>` next to the title flex row). **Do not** copy a boxed pill jammed against the title; the template uses a clean right-aligned label (`margin-left: auto`).
5. **Count badges** — In the **category header row**, opposite the icon + title: `<span class="rf-count">N</span>` where **N** equals the number of `<li class="rf-change-row">` entries in that category (keep counts accurate when you edit lists).
6. **Optional scope line** — Centered rule with short text (e.g. `RuForge core`) via `<p class="rf-scope">…</p>` when the release spans multiple areas; omit if unnecessary. Rules **must** use **faded cream gradients** (see `docs/changes.html`), not flat gray hairlines.

**DOM shape to mirror** (classes and nesting are stable API for this repo — extend presentation in the same file’s `<style>` block, respecting divider rules above):

```html
<section class="rf-release" id="v0-1-3" data-version="0.1.3">
  <div class="rf-release-head">
    <h2 class="rf-title">What&apos;s new in RuForge</h2>
    <span class="rf-version" aria-label="Release version">0.1.3</span>
  </div>
  <p class="rf-scope">RuForge core</p>

  <div class="rf-category rf-additions">
    <div class="rf-category-head">
      <div class="rf-category-title">
        <!-- placeholder SVG in docs/changes.html; app: material-symbols:add-ad -->
        <span>Additions</span>
      </div>
      <span class="rf-count">1</span>
    </div>
    <ul class="rf-list">
      <li class="rf-change-row">
        <span class="rf-contrib" title="Contributor">handle</span>
        <span class="rf-change-text">User-visible summary of the change.</span>
      </li>
    </ul>
  </div>

  <div class="rf-category rf-fixes">
    <div class="rf-category-head">
      <div class="rf-category-title">
        <!-- placeholder SVG; app: see Iconify table (e.g. mdi:bug-check-outline) -->
        <span>Fixes</span>
      </div>
      <span class="rf-count">1</span>
    </div>
    <ul class="rf-list">
      <li class="rf-change-row">
        <span class="rf-contrib" title="Contributor">handle</span>
        <span class="rf-change-text">What was wrong and how it behaves now.</span>
      </li>
    </ul>
  </div>

  <footer class="rf-foot">
    <a href="https://github.com/UnboundAngel/RuForge/releases" target="_blank" rel="noopener noreferrer">Full changelog</a>
  </footer>
</section>
```

**Live reference:** Open `docs/changes.html` in a browser — the newest `<section class="rf-release">` is the **full** copy-paste reference. When adding a new version, **duplicate that section**, bump `id` / `data-version`, reset lists, and **recompute** each `.rf-count`.

**Handoff (Jim):** Run a visuals-only pass on `docs/changes.html` (and optionally the future in-app changelog shell) using RuForge **brown + muted cream**; **do not** change class names, `data-version`, or list semantics. Honor **faded dividers**; no harsh full-width gray rules.
