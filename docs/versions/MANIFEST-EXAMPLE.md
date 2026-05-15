# Version manifest — quick examples for agents

For **every key and alias**, read **`MANIFEST-SCHEMA.md`** in this folder. Below is **additive** workflow only.

---

## 1. Add a new task row to an existing `version-X.Y.Z.json`

Open `docs/versions/version-0.1.3.json` (or the semver you are working on). Inside the top-level `"nodes": [ ... ]` array, **add a new object** after the last entry (keep prior entries):

```json
{
  "id": "t-example-feature",
  "type": "task",
  "label": "Short title (graph truncates long labels)",
  "agent": "chad",
  "details": [
    "One bullet explaining the outcome.",
    "Optional second bullet."
  ],
  "files": ["src/App.tsx", "src/store/ruforgeStore.ts"]
}
```

Use a **new, unique `id`** string per row (stable over time). **`agent`** should be one of: `chad`, `jim`, `claude` (matches the base graph in `versioner.html`).

---

## 2. Prefer `fileEdits` when you want “why” per path (still additive)

You can keep `files` **or** use only `fileEdits`. To **add** reasons without removing old rows, append a new node or extend an existing node’s `fileEdits` array with more objects:

```json
"fileEdits": [
  {
    "path": "docs/versioner.html",
    "reason": "Tweaked loader so manifests are the single source of truth."
  },
  {
    "path": "src/components/NewThing.tsx",
    "reason": "New surface for …",
    "action": "created"
  }
]
```

**`"action": "created"`** (or `kind` / `new` / `add` — see schema) marks a **new file**: green chip + document icon in the graph UI. Omit `action` for normal edits.

---

## 3. “Strict ledger” turn (one extra node, many paths)

To log everything you touched in one session without spamming many tasks, **append one node** whose `fileEdits` lists each path once:

```json
{
  "id": "ledger-2026-05-15-chad",
  "type": "task",
  "label": "Session ledger — settings + store",
  "agent": "chad",
  "details": ["Single node for this turn; paths carry reasons."],
  "fileEdits": [
    { "path": "src/components/SettingsView.tsx", "reason": "Toggle wiring" },
    { "path": "src/store/ruforgeStore.ts", "reason": "Persisted new key" }
  ]
}
```

---

## 4. Log a fix (red border in graph)

Same as a task, but **`"type": "fix"`**:

```json
{
  "id": "f-example-bug",
  "type": "fix",
  "label": "Mini player focus on restore",
  "agent": "chad",
  "details": ["Main window did not focus before closing mini; now emits focus first."],
  "files": ["src/MiniPlayer.tsx"]
}
```

---

## 5. New app version (new JSON file + registry row)

1. Align **`package.json`**, **`src-tauri/tauri.conf.json`**, **`src-tauri/Cargo.toml`** with the new triplet.
2. Create **`docs/versions/version-X.Y.Z.json`** with `{ "nodes": [], "edges": [] }`, then add `nodes` as above.
3. In **`docs/versioner.html`**, inside `<script id="changelog-data">` → **`versions`**, add a **new first element** (newest on top):

```json
{
  "id": "v0.1.4",
  "label": "v0.1.4 — Your milestone title",
  "status": "wip",
  "manifest": "versions/version-0.1.4.json"
}
```

**`manifest`** is relative to **`docs/versioner.html`**. You do **not** copy `nodes` into HTML — the page loads the JSON file.

---

## 6. Preview locally

From repo root:

```bash
npx --yes serve docs
```

Open the printed URL with **`/versioner.html`**. Opening the HTML file directly from disk often fails to load manifests; the in-page banner explains that.

---

**Full field / alias reference:** **`MANIFEST-SCHEMA.md`**
