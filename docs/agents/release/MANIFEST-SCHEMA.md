# Version manifest — full field reference

Copy-paste **additive** patterns: **`MANIFEST-EXAMPLE.md`** in this folder.

Implementation lives in **`docs/agents/release/versioner.html`** (`VersionGraphFormat`, `loadManifestDocument`, layout, export). This doc is the **contract** agents should follow.

---

## A. Per-version file: `docs/agents/release/versions/version-<semver>.json`

### A.1 Top-level keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| **`nodes`** | array | yes | Graph rows (tasks/fixes/ledgers). Can be empty `[]`. |
| **`edges`** | array | reserved | Custom edges between arbitrary nodes. **Not consumed** by current `versioner.html` — keep `[]` unless you extend the renderer. |

### A.2 Each object in `nodes[]`

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| **`id`** | string | recommended | Stable unique id for the row. If omitted, the normalizer invents one (avoid for clarity). |
| **`type`** | string | recommended | **`task`** or **`fix`**. Aliases normalized to `task`: `addition`, `feature`. Aliases → `fix`: `bugfix`, `bug`. Default: `task`. |
| **`label`** | string | recommended | Short title; shown on graph (truncated with ellipsis + full string in tooltip when long). |
| **`agent`** | string | recommended | Contributor edge source: **`chad`**, **`jim`**, **`claude`**. Aliases (all → same field): **`contributor`**, **`by`**, **`author`**, **`owner`**. Leading `@` stripped. Default: `chad`. |
| **`details`** | string \| string[] | optional | Bullet text in side panel. String coerced to one-element array. |
| **`description`** | string \| string[] | optional | Merged into details (same as extra narrative lines). |
| **`summary`** | string \| string[] | optional | Merged into details. |
| **`files`** | string[] | optional | Repo-relative paths; shown as chips. Treated as **modified** (not “created”) unless overridden by `fileEdits` for the same path. |
| **`fileEdits`** | object[] | optional | Rich per-path rows (see A.3). Also accepts **`edits`** or **`changedFiles`** as the same array (alias). |
| **`icon`** | string | optional | Iconify slug for the node circle. |

### A.3 Each object in `fileEdits[]`

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| **`path`** | string | one of path keys | Repo-relative file path. |
| **`file`** | string | alias of `path` | Same as `path`. |
| **`src`** | string | alias of `path` | Same as `path`. |
| **`reason`** | string | optional | Tooltip + merged detail line `path: reason`. |
| **`why`**, **`rationale`**, **`note`** | string | aliases of `reason` | First non-empty wins in normalizer. |
| **`action`**, **`kind`**, **`change`** | string | optional | If any normalizes to **create** semantics (`create`, `created`, `new`, `add`, `added`), the path is shown as a **new file**: green chip + `solar:document-add-outline`. Otherwise **modified**. Same path later listed as created upgrades from modified → created. |

Strings in `fileEdits` (instead of objects) are treated as `{ path: "<string>" }` with no reason.

---

### A.4 Versioner canvas (derived nodes — **not authored in JSON**)

**`docs/agents/release/`** may **synthesize extra graph nodes** for layout only:

When a manifest row has **`files` + `fileEdits` combining to ≥2 unique paths**, the renderer **may** add one derived **file-ref** circle per path, linked from the parent by **fork** edges — **only while that parent task/fix is expanded on the canvas** (click the parent node to toggle; version change / background click clears expansions). **`action`/create** semantics ⇒ **green** ring in the diagram; updated files use a **muted** ring.

These nodes **do not** exist in **`version-*.json`**; keep editing paths and reasons **`fileEdits`** as today. Export Markdown still emits the parent row's file lines only.

---

## B. Registry row: `docs/agents/release/` → `changelog-data` → `versions[]`

These entries **do not** contain graph `nodes`; they only **point** at the JSON file.

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| **`id`** | string | yes | Version pill id, e.g. `v0.1.3`. |
| **`label`** | string | yes | Human-readable milestone line (also used in version node details). |
| **`status`** | string | yes | **`finished`** → green ring. **`wip`** or aliases `in_progress`, `in-progress`, `draft`, `progress` → yellow ring. |
| **`manifest`** | string | yes | URL path **relative to `versioner.html`**, e.g. `versions/version-0.1.3.json`. |

**Order:** Newest version **first** in the `versions` array (repo convention).

---

## C. Loader behavior (read-only for agents)

1. **`fetch(manifest)`** when served over HTTP (e.g. `npx --yes serve docs`).
2. If that fails, **`import(url, { with: { type: 'json' } })`** (and legacy `assert` form) for some `file://` setups.
3. If both fail → empty nodes for that version + banner message.

---

## D. Normalizer (`VersionGraphFormat`) summary

- Coerces **`details`** / **`description`** / **`summary`** into a deduped list.
- Merges **`fileEdits`** reasons into detail lines as `path: reason`.
- Builds internal maps **`_fileReasons`** and **`_fileActions`** for the side panel (not authored manually in JSON).

---

## E. Graph chrome (not `changes.html` list colors)

- **`fix`** nodes: red circle border in the canvas.
- **`task`** / **`addition`**: dark blue border.
- Version **`status`**: green vs yellow as above.

---

## F. Export markdown (`Export Release Notes`)

- Uses **selected** version pills.
- Emits headings, status, per-node bullets, file lines; paths marked **created** get `_(created)_` in the markdown line.

---

## G. Base graph (`changelog-data.base` in `versioner.html`)

Not part of per-version JSON. Defines **`user`**, **`claude`**, **`jim`**, **`chad`**, tool nodes, **`ruforge`**, and **`edges`** between them. Agents normally **do not** edit this unless adding a new tool to the diagram.
