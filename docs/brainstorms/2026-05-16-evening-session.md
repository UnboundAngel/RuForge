# RuForge — Evening session brainstorm brief (2026-05-16)

**Purpose of this file:** Paste or attach for **Claude** (or any external brainstorm). Cursor/Chad implements after you lock scope (~3:30 PM → **10:00 PM** tonight, ~6.5 h build).

**Canonical docs (do not contradict without explicit user override):**

- `AGENTS.md` — product north star, agent roles, stack guardrails
- `docs/RuForge.md` — roadmap, backlog table, P0/P1

---

## 1. North star (from `AGENTS.md`)

**RuForge is downloader-first.**

Reliable **YouTube + local file** handling, **persistent downloads**, resumability/caching where it matters, and **performance**. Player and Media view exist so people can **watch what they already downloaded** — not the competitive wedge. Explorer webview is for **cookie/session flows** yt-dlp needs (age-restricted, members-only) — **not** a general in-app browser.

**Advise against:** Plex-scale library UX, competing with dedicated players/browsers, feature creep, AI features, non-YouTube sources (see Out of Scope in `docs/RuForge.md`).

**Roles tonight:**

| Who | Where | Does |
|-----|--------|------|
| **You + Claude** | Now (~30 min) | Brainstorm, cut scope, pick tonight’s MVP |
| **Chad** | Cursor after 3:30 | Logic, state, Tauri, bugs — no pure styling |
| **Jim** | Gemini later | Visuals only — queue layout, paperclip strip, declutter (#12–14) |

---

## 2. Product core statements (use to avoid building the wrong thing)

Fill or correct the **bold blanks** during brainstorm; defaults are inferred from repo docs.

### Problem

People who save YouTube locally need a **desktop tool that makes grabbing and keeping videos dependable** — queueing, resuming, not re-downloading duplicates, and not silently filling disk — without running a full media server or browser tab farm.

### Who (primary user tonight)

**Default assumption:** Single power user on **Windows**, internal-library mode, batches URLs from clipboard/Explorer/drag-drop, cares about **trust** (progress, storage, cleanup) more than gallery polish.

### Promise (one sentence)

**RuForge gets YouTube videos onto your machine reliably, with control over when downloads run and what happens when storage fills.**

### MVP for *this session* (7 hours, done by 10 PM)

Not v1.0. **Tonight’s MVP** = the smallest set of changes that makes the **downloader + internal storage story feel trustworthy** for the next real download session.

**Locked for tonight (user 2026-05-16):**

| Track | IDs | Plain goal |
|-------|-----|------------|
| **A — First** | **#9** | Smooth **time remaining** during downloads |
| **B — Second** | **#8 + #10** | Full **storage** pass: cleanup when full + “won’t fit” before queue |

**Defer unless time left:**

| ID | Item |
|----|------|
| **11** | Delay between starting multiple downloads (429 / rate limit) |
| **15** | Finish testing mid-download “allow this new URL?” row |
| **12–14** | Jim layout/visual overhaul |
| **19** | Click queue row → hero thumbnail updates (quick test) |

**Explicitly *not* tonight’s MVP unless user overrides:**

- SQLite gallery index (large; library scale, not downloader trust)
- Jim-only layout overhaul (#12–14, #16) — schedule Jim prompt, Chad doesn’t fake it
- Playlist thumbs (#18), multiple indicators (#17)
- New intake surfaces (already shipped in 0.1.4)

### Success criteria (tonight)

By **10 PM**, the user can:

1. _[Brainstorm: one observable downloader flow, e.g. “queue 3 URLs, start batch, see stable ETA and no enqueue when disk can’t fit”]_
2. _[Brainstorm: storage — e.g. “Authorize Cleanup frees space toward ~75% of cap without error”]_
3. _[Optional: “build passes” / smoke test checklist]_

### Non-goals (tonight)

- **No visual overhaul** — queue layout, paperclip strip, declutter, hero crossfade → **Jim later** (#12–14, #16).
- No new product pillars (cloud sync, mobile, AI, non-YouTube).
- No “compete with Plex/VS Code player” scope.
- No drive-by refactors unrelated to chosen backlog IDs.
- No `docs/changes.html` graph/CSS edits (agents append JSON only per `AGENTS.md`).

---

## 3. What already shipped (0.1.4 — do not re-plan)

**Version:** `0.1.4` everywhere (`package.json`, `src-tauri/tauri.conf.json`, `updater.json`).

**Downloader wedge (done):** persisted queue, pause/resume/retry, held/pending approval model, concurrent downloads (settings cap 6), hero bound to `focusedJobId`, duplicate detection, clipboard-on-focus, Explorer menu + titlebar queue, **window URL drag-drop** (`useUrlDropIntake`, `dragDropEnabled: false`), subtitle download langs, yt-dlp updater, coarse storage-full block, tray menu, in-app notify overlay, `useDownloaderView` + `downloader/*` split.

**Open / trust gaps (still real):** backlog #8–11, #15 partial, Jim visuals #12–14.

---

## 4. Codebase map (where tonight’s work likely lives)

| Area | Paths |
|------|--------|
| Downloader UI + logic | `src/components/DownloaderView.tsx`, `src/components/downloader/useDownloaderView.ts`, `DownloadJobQueuePanel.tsx` |
| Queue state | `src/store/downloadQueueSlice.ts`, `src/downloadQueue.ts`, `src/downloadQueueMetadataCache.ts` |
| Drop intake | `src/features/downloader/useUrlDropIntake.ts`, `dropIntake.ts`, `App.tsx` |
| Storage / cleanup | `src/store/ruforgeStore.ts` (`handleAuthorizeCleanup`, `refreshStorageStats`), `src/App.tsx` (storage meter UI) |
| Rust downloader | `src-tauri/src/commands/downloader.rs`, `download_job_manager.rs` |
| Rust cleanup | `src-tauri/src/commands/settings.rs` → `authorize_cleanup` |
| Tray | `src-tauri/src/tray.rs` |
| Explorer inject | `src/explorerInjectScript.ts` |
| Central store | `src/store/ruforgeStore.ts` |
| Agent rules | `AGENTS.md` |
| Roadmap | `docs/RuForge.md` |

**Stack:** React 19, TS, Vite, Tailwind v4, Zustand, Tauri v2, WebView2 (Windows). Mini player = separate webview; cross-window = Tauri events only.

---

## 5. Known bug context (Authorize Cleanup #8)

- UI: **Authorize Cleanup** when internal storage meter shows full (`App.tsx` sidebar).
- Frontend: `invoke("authorize_cleanup", { dir, target_free_bytes })` with **hardcoded 2 GiB** in `ruforgeStore.ts` — not 75% of user’s `storageLimitGB`.
- Rust: `authorize_cleanup(dir, target_free_bytes)` deletes **oldest media files** until **deleted byte count ≥ target** — may not match “free disk until 75% of cap” semantics.
- User report: command error mentioning **`targetFreeBytes`** — verify Tauri invoke camelCase vs snake_case on repro.

**Brainstorm output needed:** exact intended behavior (which files, watched vs unwatched, target free bytes formula).

---

## 6. Suggested time box (user: 3 PM → 10 PM)

| Block | Time | Activity |
|-------|------|----------|
| Brainstorm | 3:00–3:30 | Claude + this doc → pick tonight MVP (3–5 items max) |
| Implement | 3:30–8:30 | Chad in Cursor — logic fixes first (#8, #9, #10) |
| Verify | 8:30–9:15 | Manual smoke: queue, download, storage, cleanup |
| Buffer | 9:15–10:00 | Extra testing, #15/#19 if time — **no Jim layout tonight** |

---

## 7. Human answers (2026-05-16 ~3 PM)

**What hurts most (plain language):** The **download time remaining** jumps around wildly while a video is downloading — that’s what people notice first. Not the storage cap (most users won’t hit it soon).

**Tonight’s two tracks:**

1. **ETA fix (#9)** — priority; smooth the “time left” number during active downloads.
2. **Storage pass (#8 + #10 together)** — one cohesive pass: fix **Authorize Cleanup** when the library is full *and* warn/block before queueing a video that won’t fit (not two separate mini-tasks).

**Layout / visuals tonight:** **Out of scope.** Features/behavior only; **Jim visual overhaul (#12–14, #16) later.**

## 7b. Plain-language glossary (backlog items)

| # | Jargon | What the user actually sees |
|---|--------|----------------------------|
| **9** | ETA smoothing | While downloading, the **“time remaining”** estimate jumps up and down instead of settling smoothly. |
| **8** | Authorize Cleanup | When the app’s **built-in library is full**, a button offers to **delete old videos** to make room. User report: this flow is **broken** (error or wrong amount freed). |
| **10** | Storage before enqueue | Before a download is queued, check **“will this fit?”** — show **red row / clear error** if the file is too big for free space (separate from “library is 100% full”). |
| **12–14** | Jim UI pass | **Look and layout only** — queue on the right, cleaner screen, paperclip strip redesign. **No** download logic changes. Done in **Gemini (Jim)**, not Cursor (Chad). |

## 7c. “Logic only” vs “Jim pass” (what we meant)

- **Logic only (Chad / Cursor):** Behavior works correctly — numbers make sense, buttons do the right thing, errors show when they should. Screen can still look the same as today.
- **Jim pass (Gemini):** **Visual redesign** — spacing, queue position, animations, declutter. Chad should **not** fake this in Cursor; you run a separate Jim prompt with “don’t change how buttons work.”

**Locked:** Tonight = **features only** (ETA + storage pass). Visual overhaul deferred to a later Jim session.

---

## 8. Brainstorm deliverable (Claude → user, end of 30 min)

Produce a short **Tonight scope** section the user can paste back to Cursor:

```markdown
## Tonight scope (locked 2026-05-16)

**MVP one-liner:** …

**In scope (IDs):** …

**Out of scope:** …

**Success checks:** …

**Jim handoff (if any):** file paths + “do not change logic” …
```

Update `docs/RuForge.md` only after work ships — not during brainstorm.

---

*Generated for external brainstorm. Repo: RuForge (neotube workspace).*
