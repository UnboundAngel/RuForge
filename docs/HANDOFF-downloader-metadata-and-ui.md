# Handoff: Downloader metadata cache + UI parity (Jun 2026)

For the next Cursor agent. Read `STATE.md` and `AGENTS.md` first (Shipped log under v0.1.12 unreleased).

## What we just finished (shipped in this push)

**Problem:** Same YouTube video felt fast when pasted in the hero bar, but slow or blank after Explorer "Add to queue", toggle-off, or re-add. Root cause was metadata cache eviction on manual queue removal plus hero/queue state not sharing the same code path.

**Fix (logic, done):**

1. **`removeDownloadJob` no longer calls `evictDownloadJobMetadataCacheIfOrphaned`.** Manual removal (Explorer toggle-off, trash on queue row, etc.) must not wipe `localStorage` key `ruforge-dl-jobmeta-v1`. Cleanup is LRU cap (36 entries) + `evictDownloadJobMetadataCacheWhenIdle` after a download finishes.
2. **Idle eviction keeps cache when hero still had the URL** — `onDownloadJobFinished` captures `heroUrlBeforeFinish` before `heroClearPatchForUrl` clears the bar.
3. **Hero metadata effect** (`useDownloaderView.ts`) restores in-memory queue from sessionStorage when empty (`restoreDownloadQueueFromSessionIfEmpty`), then tries in order: job snapshot reuse → hero display cache → full cache → wait for queue hydrate → blocking dual-size fetch.
4. **Queue hydrate** uses display-only `get_video_info` (one simulate, ~3–4s cold). Hero paste still uses full fetch for size UI when needed; background fill can run silently.

**Key files:**

| Area | Files |
|------|--------|
| Hero metadata effect | `src/components/downloader/useDownloaderView.ts` |
| Queue slice | `src/store/downloadQueueSlice.ts` |
| Metadata cache | `src/downloadQueueMetadataCache.ts` |
| Fetch / dedup | `src/downloadVideoInfoFetch.ts` |
| Session queue restore | `src/downloadQueue.ts` |
| Explorer add | `src/components/ExplorerWatchQueueButton.tsx` (toggle: second click **removes** job, does not add duplicate) |
| Hero + queue UI | `src/components/DownloaderView.tsx`, `src/components/downloader/DownloadJobQueuePanel.tsx` |

## What Angel is doing next (your lane)

**QOL + visual parity:** Explorer add vs hero link paste should look and behave like the same video, but today they use different store fields.

### Two entry paths (same video, different UI state)

| | **Explorer "Add to queue"** | **Paste link in hero bar** |
|--|--|--|
| Sets `url` in store? | Usually **no** | **yes** (`setDownloaderUrl`) |
| Sets `videoInfo` in hero? | Usually **no** (only job `metadata`) | **yes** (hero effect) |
| Queue row | Created with `approval: "held"` | User clicks Download to stage |
| Hero card data source | Often `idleHero` branch via **`focusedJob.metadata`** when a queue row is focused | `idleHero` branch via **`videoInfo`** |
| URL chrome | `showUrlBubble` false if no `url`/`videoInfo`; `showQueueAddToolbar` true when queue has jobs | `showUrlBubble` true (pill, paperclip, pinned chips) |
| Queue panel | Visible when jobs exist | Same |

**Symptom Angel reported:** Screenshots for the same video differ depending on Explorer vs link — e.g. queue panel vs top-left chip cluster, backdrop/thumb timing, metadata row layout, loading spinner in sidebar. Only the entry path changed.

**Likely direction (not implemented yet):**

- On Explorer enqueue (or when queue row gets metadata), **mirror into hero**: `setDownloaderUrl(canon)` + seed `videoInfo` from job snapshot / cache (same as hero effect paths, no blocking fetch).
- Or unify `idleHero` so job-only and url+videoInfo paths render identical chrome (one source of truth).
- Review `heroClearWhenUrlNotInQueue` — removing a queue row clears hero `url`/`videoInfo` when URL no longer in queue; that is intentional but fights "I still have this link mentally loaded" after toggle-off.
- **`focusedJobId`:** enqueue does not auto-focus new rows; UI may differ until user clicks a queue row. Consider auto-focus on Explorer add.

**Do not break:** cache retention on manual remove; display-only queue hydrate; hero blocking fetch only when cache + job snapshot both miss.

## Small unrelated change in same branch

- `src/scrubSpriteBackfill.ts`: `SCRUB_BACKFILL_TOP_N = 3` caps automatic post-scan scrub sprite generation (newest 3 missing). Older items use manual Generate Previews.

## How to verify metadata fix

1. Explorer add → wait for queue row title/thumb.
2. Explorer toggle-off (add again while in queue).
3. Paste same URL in hero → metadata instant (cache hit), no ~8s spinner.
4. Explorer add again with URL still in bar → still instant.

## Recent commits on main (context)

- Hero reuses queue job snapshot + silent dual-size fill
- Inflight dedup URL normalization
- Display-only queue hydration + 2-wide pool
- This commit: cache survives manual queue remove + session restore + idle eviction guard

## Out of scope unless Angel asks

- Release ritual / version bump (still 0.1.12 unreleased)
- Jim-style pure CSS pass (logic first)

## Open flag: pre-existing TS build error (not re-download feature)

Surfaced during Commit 1 build verify (`npm run build`). Do not fix inside re-download commits; standalone pass later.

```
src/components/DownloaderView.tsx(374,19): error TS2339: Property 'isPlaylist' does not exist on type 'false | { title: string; duration: number; fileSizeBytes: number | null; isPlaylist: boolean; playlistItems: PlaylistItem[] | undefined; }'.
  Property 'isPlaylist' does not exist on type 'false'.
```
