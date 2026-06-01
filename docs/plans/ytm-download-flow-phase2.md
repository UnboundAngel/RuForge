# YTM Download Flow — Phase 2 Plan

**Date:** 2026-06-01  
**Status:** Research & planning  
**Precondition:** All 16 fixes from `ytm-download-flow-audit.md` are confirmed implemented and verified.

---

## Executive Summary

The 16-fix execution pass closed every Critical, High, and most Medium/Low items from the Phase 1 audit. What remains is:

1. **One explicitly deferred item** (§3.4): Stale `getVideoData()` data on fast song navigation — songs skipped faster than the retry window can resolve can be permanently missed. The root cause is architectural: the player detection pipeline reads state twice (in `tryEmitNowPlaying` and again inside `emitNowPlaying`), and there is no hook into YTM's native player-change events (`yt-player-updated`, `mediaSession`).

2. **One pre-existing architectural gap**: `get_playlist_items_page` (Rust command) never passes cookie/auth arguments to yt-dlp. Private playlists (Liked Songs, personal libraries) silently fail with auth errors in both the BottomBar and the panel.

3. **Two medium correctness bugs** introduced or exposed by the Phase 1 changes: a stale-snapshot cache write in `loadAllRemaining`, and a `ytmusic-playlist-shelf-renderer` DOM selector that can still false-positive on certain YTM page types.

4. **Two low-severity maintenance issues**: duplicated "Pick tracks" button code paths and a fixed 2000ms polling interval that wastes cycles when the user is actively listening.

None of the remaining items cause data loss. The most visible user-facing regression risk is the stale `getVideoData()` issue (fast navigation = missed auto-download).

---

## Research Findings

### RF-1: Post-Phase-1 Implementation Review (All 16 Fixes Confirmed)

Code-walk confirms every fix landed:

| # | Item | File | Status |
|---|------|------|--------|
| 1 | DOM playlist fallback gated behind `kind === "other"` | `explorerProfileScript.ts` L191 | ✅ |
| 2 | Ad-state guard in `readNowPlaying` | `explorerProfileScript.ts` L242 | ✅ |
| 3 | `__rf_last_vid = null` reset on ad-state | `explorerProfileScript.ts` L246 | ✅ |
| 4 | watch+list URL normalized to `/playlist?list=` | `explorerProfileScript.ts` L153 | ✅ |
| 5 | `autoQueuedVideoIdsRef` pruned on job removal | `MusicShell.tsx` L419 | ✅ |
| 6 | `downloadPlaylist` extracts listId for clean URL | `MusicExploreBottomBar.tsx` L119 | ✅ |
| 7 | Panel URL frozen when panel is hidden (`panelUrlRef`) | `MusicShell.tsx` L313 | ✅ |
| 8 | `processNextCelebration` stale closure fixed via ref | `MusicExploreDownloadPanel.tsx` L309 | ✅ |
| 9 | `loadAllRemaining` uses `fetchedCount` not `items.length` | `MusicExploreDownloadPanel.tsx` L574 | ✅ |
| 10 | `doLoad` deps scoped to `{ preferredQuality, browserContext, cookieFile }` | `MusicExploreDownloadPanel.tsx` L400 | ✅ |
| 11 | Post-ad `tryEmitNowPlaying` retry logic (2 × 800ms) | `explorerProfileScript.ts` L301 | ✅ |
| 12 | URL event no longer overwrites richer page context | `MusicShell.tsx` L334 | ✅ |
| 13 | Redundant `setInterval` removed from install scripts | `explorerProfileScript.ts` — no interval in INSTALL scripts | ✅ |
| 14 | Title selector fixed: `.byline` instead of duplicate `.title` | `explorerProfileScript.ts` L281 | ✅ |
| 15 | Duplicate `"si"` removed from `TRACKING_PARAMS` | `youtubeUrl.ts` L79 | ✅ |
| 16 | Idle panel shows hint text instead of spinner | `MusicExploreDownloadPanel.tsx` L842 | ✅ |

---

### RF-2: `tryEmitNowPlaying` Double-Read Architecture Flaw (§3.4 Core Mechanism)

**File:** `src/explorerProfileScript.ts` lines 301–317

```js
function tryEmitNowPlaying(retries) {
  var np = readNowPlaying();           // READ #1
  if (!np.videoId && retries > 0) {
    setTimeout(function(){ tryEmitNowPlaying(retries - 1); }, 800);
    return;
  }
  if (np.videoId) window.__rf_emitNowPlaying();   // emitNowPlaying calls readNowPlaying() = READ #2
}
```

`emitNowPlaying()` (called via `window.__rf_emitNowPlaying()`) performs its own `readNowPlaying()` internally. Both reads are independent calls to `getVideoData()`. The result from READ #1 is discarded; only READ #2 determines what gets emitted.

**Fast-skip scenario (the §3.4 bug):**

1. Song A playing → `__rf_last_vid = "A"`.
2. User skips to song B. `play` fires on B's audio element.
3. `setTimeout(tryEmitNowPlaying(2), 400ms)`.
4. At 400ms: READ #1 → `getVideoData()` returns song A (stale SPA navigation; `movie_player` not yet updated). `np.videoId = "A"` — non-null, so **no retry is scheduled**.
5. Calls `window.__rf_emitNowPlaying()` → READ #2 → same stale `getVideoData()` returns "A".
6. `emitNowPlaying` checks: `__rf_last_vid ("A") === np.videoId ("A")` → **dedup blocks; song B never emitted.**

The retry logic only activates when `videoId` is `null` (pure ad state or no player found). It does **not** help when `getVideoData()` returns a stale but non-null previous video ID. The ad reset of `__rf_last_vid = null` (fix #3) mitigates this specifically after ads, but normal fast navigation has no such reset.

**Evidence:** This maps exactly to the deferred §3.4 text: *"After navigating to a new song, `getVideoData()` can briefly return the previous song's data. If the user skips songs faster than 1.5s, the intermediate song may be missed."*

---

### RF-3: YTM Event Surface for Post-Navigation Player State

YTM fires several custom events when the player's video changes:

| Event | When fires | Reliability |
|---|---|---|
| `yt-navigate-finish` | SPA page navigation completes | Good; already hooked |
| `yt-player-updated` | Player component processes new video data (including mid-playlist skips) | Excellent for song changes |
| `yt-page-data-updated` | Full page data refresh | Too broad; fires on layout changes too |
| `play` (DOM, capture) | Audio/video element starts playing | Currently used; fires on ads too |

`yt-player-updated` is the correct hook for detecting actual song changes. It fires synchronously after `movie_player.setVideoData()` is called internally, meaning `getVideoData()` is guaranteed fresh immediately in its handler. No retry window is needed.

**`mediaSession` as an alternative:** `navigator.mediaSession.metadata` is updated by YTM after the player signals a real song (not ads). Hooking the `MediaMetadata.prototype` setter via `Object.defineProperty` is feasible but intrusive; `yt-player-updated` is preferable because it's a native YTM contract.

**Evidence from YTM internals:** YTM's `ytmusic-player` Polymer element dispatches `yt-player-updated` on `_playerUpdated(state)`. When an ad ends and a song begins, `yt-player-updated` fires with the real song's data. The current `play` event listener is fired by the raw audio element — which fires for ads, mid-roll transitions, and preloads. `yt-player-updated` fires only when the YTM player component itself processes a video change.

---

### RF-4: `loadAllRemaining` Cache Staleness

**File:** `src/components/music/MusicExploreDownloadPanel.tsx` lines 572–617

```tsx
const loadAllRemaining = useCallback(async () => {
  const { playlistUrl, playlistTitle, fetchedCount, items: snapshotItems, total: startTotal } = phase;
  // ... async fetch loop ...
  const cacheItems = [...snapshotItems, ...newItems];   // BUG: snapshotItems is stale
  setCachedMusicExplorePlaylist(playlistUrl, { ..., items: cacheItems, ... });
}, [phase]);
```

`snapshotItems` is captured at the moment `loadAllRemaining` is called. If downloads complete (and remove tracks) during the async `while (hasMore)` loop, `snapshotItems` is out of date by the time the cache is written. The live `setPhase` functional update at line 594 uses `p.items` (correct, always current state), but the `setCachedMusicExplorePlaylist` call at line 608 uses the stale `snapshotItems`. Result: the cache contains tracks that were already removed from the UI, causing them to reappear if the panel is closed and reopened.

**Severity:** Medium. Reproducible when: a large playlist (>50 tracks) is open, downloads are running, and the user clicks "Load all remaining" while downloads are actively completing.

---

### RF-5: `ytmusic-playlist-shelf-renderer` False-Positive Risk

**File:** `src/explorerProfileScript.ts` lines 184–189

```js
if (document.querySelector(
  '[page-type="MUSIC_PAGE_TYPE_PLAYLIST"], ytmusic-playlist-header-renderer, ytmusic-playlist-shelf-renderer'
)) {
  kind = "playlist";
  isPlaylistPage = true;
}
```

This block runs **before** the `kind === "other"` gated DOM fallback. `ytmusic-playlist-shelf-renderer` is the playlist shelf component used on artist pages, album pages, and certain home page "Mixes" sections. On an artist page (`/@artist`), path-based detection correctly sets `kind = "artist"`, but if the artist page has playlist shelves in the DOM, this selector immediately overrides `kind` back to `"playlist"`.

**`page-type="MUSIC_PAGE_TYPE_PLAYLIST"`** and **`ytmusic-playlist-header-renderer`** are reliably playlist-specific. The only risky selector is `ytmusic-playlist-shelf-renderer`.

**Severity:** Medium. Symptoms: on an artist's page, the bottom bar shows "Download playlist?" with an action URL derived from the first shelf — not the artist's album list. Regression risk exists because artist pages are common exploration paths.

**Fix:** Remove `ytmusic-playlist-shelf-renderer` from this selector, or require at least one of the other two to also match.

---

### RF-6: `get_playlist_items_page` Has No Cookie Support

**File:** `src-tauri/src/commands/downloader.rs` lines 1861–1930

```rust
pub async fn get_playlist_items_page(
    app: AppHandle,
    url: String,
    offset: u32,
    limit: u32,
) -> Result<MusicPlaylistPage, String> {
    // runs yt-dlp with --flat-playlist -J, NO --cookies or --cookies-from-browser args
}
```

Both `MusicExploreBottomBar.downloadPlaylist` and `MusicExploreDownloadPanel.doLoad` call this command without cookie parameters, because the command doesn't accept them. Playlists that require authentication (user's Liked Songs, private playlists, age-restricted content) will fail with a yt-dlp auth error at the metadata fetch stage.

By contrast, actual download jobs use `push_ytdlp_download_cookie_args` which correctly applies the user's configured cookie source. The metadata-only playlist page command is unintentionally unauthenticated.

**Severity:** Medium-High. Affects every user with private playlists. "Liked Songs" is the most common use case — many users' first action.

**Fix:** Add `browser_cookies: Option<String>` and `cookie_file: Option<String>` params to `get_playlist_items_page`, pass them from both TS call sites (using `cookieContextFromSettings(settings)`).

---

### RF-7: Duplicate "Pick Tracks" Code Paths in BottomBar

**File:** `src/components/music/MusicExploreBottomBar.tsx` lines 194–195, 335–345, 347–357

```tsx
// Path 1: non-playlist pages
const showPickTracks = pageContext.canPickTracks && pageContext.kind !== "playlist";

// Path 2: playlist pages with downloadable listId
{pageContext.kind === "playlist" && pageContext.canDownloadPlaylist && (
  <button onClick={onPickTracks}>Pick tracks</button>
)}
```

Both paths render the same `onPickTracks` action with identical UI. They are mutually exclusive (Path 1 only fires on non-playlist, Path 2 only on playlist+downloadable), so no visual duplication occurs currently. However, if the button label or tooltip is ever updated in one path and not the other, they'll diverge silently. Low maintenance risk.

---

## Remaining Bugs / Gaps

| ID | Severity | Description | File | Line(s) |
|----|----------|-------------|------|---------|
| G1 | **High** | `getVideoData()` stale data on fast song navigation — `yt-player-updated` not hooked | `explorerProfileScript.ts` | MUSIC_EXPLORE_NOW_PLAYING_INSTALL |
| G2 | **High** | `get_playlist_items_page` lacks cookie params — private playlists always fail | `downloader.rs` + callers | 1861, BottomBar L134, Panel L447 |
| G3 | **Medium** | `tryEmitNowPlaying` double-reads player state; discards first read result | `explorerProfileScript.ts` | L301–308 |
| G4 | **Medium** | `loadAllRemaining` cache write uses stale `snapshotItems` (pre-completion snapshot) | `MusicExploreDownloadPanel.tsx` | L606 |
| G5 | **Medium** | `ytmusic-playlist-shelf-renderer` can false-positive on artist pages | `explorerProfileScript.ts` | L185 |
| G6 | Low | Duplicate "Pick tracks" code paths — divergence risk on future edits | `MusicExploreBottomBar.tsx` | L335, L347 |
| G7 | Low | 2000ms fixed polling tick regardless of user activity | `explorerProfileScript.ts` | MUSIC_EXPLORE_INIT_SCRIPT L338 |

---

## Proposed Implementation

### Phase A — Player Detection (G1, G3) — ~1 day

**Goal:** Make song detection reliable for sub-400ms song skips without relying solely on `play` events.

**A.1 — Hook `yt-player-updated`** (`explorerProfileScript.ts`, `MUSIC_EXPLORE_NOW_PLAYING_INSTALL`)

Add an event listener alongside the existing `play` listener:

```js
if (!window.__rf_np_ready) {
  window.__rf_np_ready = true;
  window.addEventListener("yt-navigate-finish", function(){ window.__rf_emitNowPlaying(); });
  window.addEventListener("yt-player-updated", function(){
    // Player state is fresh here — no retry needed, no stale data
    setTimeout(function(){ window.__rf_emitNowPlaying(); }, 100);
  });
  document.addEventListener("play", function(){
    setTimeout(function(){ tryEmitNowPlaying(2); }, 400);
  }, true);
}
```

The 100ms delay on `yt-player-updated` gives the player component one tick to finalize its state properties.

**A.2 — Pass read result through `tryEmitNowPlaying`** (G3)

Eliminate the double-read by passing the already-read `np` into `emitNowPlaying`:

```js
function emitNowPlayingWith(np) {
  if (!window.__TAURI__ || !window.__TAURI__.event) return;
  try {
    if (!np.videoId) return;
    if (window.__rf_last_vid === np.videoId) return;
    window.__rf_last_vid = np.videoId;
    window.__TAURI__.event.emit("music-explore-now-playing", np);
  } catch (e) {}
}
function tryEmitNowPlaying(retries) {
  var np = readNowPlaying();
  if (!np.videoId && retries > 0) {
    setTimeout(function(){ tryEmitNowPlaying(retries - 1); }, 800);
    return;
  }
  if (np.videoId) emitNowPlayingWith(np);
}
function emitNowPlaying() {
  try { emitNowPlayingWith(readNowPlaying()); } catch (e) {}
}
window.__rf_emitNowPlaying = emitNowPlaying;
```

This ensures `tryEmitNowPlaying` emits exactly what it read — no interleaved second call to `getVideoData()`.

**A.3 — Reset `__rf_last_vid` on navigation** 

`yt-navigate-finish` already calls `emitNowPlaying`. But to handle fast skips within the same page (queue navigation without full SPA nav), also reset `__rf_last_vid` on `yt-navigate-finish` before calling `emitNowPlaying`:

```js
window.addEventListener("yt-navigate-finish", function(){
  window.__rf_last_vid = null;  // clear so same song ID after navigation re-emits
  window.__rf_emitNowPlaying();
});
```

This prevents the dedup guard from blocking re-emission of the same song in a new playlist context.

---

### Phase B — Private Playlist Auth (G2) — ~0.5 day

**Goal:** Allow authenticated yt-dlp calls for private playlists in both the panel and BottomBar.

**B.1 — Add cookie params to Rust command** (`downloader.rs`)

```rust
pub async fn get_playlist_items_page(
    app: AppHandle,
    url: String,
    offset: u32,
    limit: u32,
    browser_cookies: Option<String>,
    cookie_file: Option<String>,
) -> Result<MusicPlaylistPage, String> {
    // ...
    let mut args = vec![...];
    ytdlp_push_cookie_cli_args(
        &app, &mut args,
        cookie_file.as_deref(),
        browser_cookies.as_deref(),
    )?;
    // ...
}
```

Register the new param signature in `lib.rs` `invoke_handler`.

**B.2 — Pass cookies from TS call sites**

`MusicExploreDownloadPanel.tsx` (`doLoad`, `openPlaylist`, `loadAllRemaining`):
```tsx
const { browserContext, cookieFile } = settings;
// in each invoke("get_playlist_items_page", ...)
{
  url: canonical,
  offset: 0,
  limit: INITIAL_PLAYLIST_BATCH,
  browserCookies: browserContext ?? null,
  cookieFile: cookieFile ?? null,
}
```

`MusicExploreBottomBar.tsx` (`downloadPlaylist`):
```tsx
const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
  url: canonical,
  offset,
  limit: 50,
  browserCookies: settings.browserContext ?? null,
  cookieFile: settings.cookieFile ?? null,
});
```

Note: `doLoad` in `MusicExploreDownloadPanel` already scopes its `useCallback` deps to `{ preferredQuality, browserContext, cookieFile }` (from Phase 1 fix #10). Adding cookie usage here is consistent and won't widen the dep set.

---

### Phase C — DOM Selector Fix (G5) — ~30 min

**Goal:** Prevent artist pages with playlist shelves from being misclassified as playlists.

**C.1 — Remove `ytmusic-playlist-shelf-renderer` from playlist indicator** (`explorerProfileScript.ts`)

Change lines 184–189 from:
```js
if (document.querySelector(
  '[page-type="MUSIC_PAGE_TYPE_PLAYLIST"], ytmusic-playlist-header-renderer, ytmusic-playlist-shelf-renderer'
)) {
```

To:
```js
if (document.querySelector(
  '[page-type="MUSIC_PAGE_TYPE_PLAYLIST"], ytmusic-playlist-header-renderer'
)) {
```

`page-type="MUSIC_PAGE_TYPE_PLAYLIST"` and `ytmusic-playlist-header-renderer` are specific to actual playlist pages. `ytmusic-playlist-shelf-renderer` is too broad.

---

### Phase D — `loadAllRemaining` Cache Fix (G4) — ~30 min

**Goal:** Cache write in `loadAllRemaining` should use current (live) items, not the stale snapshot.

**D.1 — Use `setPhase` functional update for both state and cache** (`MusicExploreDownloadPanel.tsx`)

Replace the current split pattern (functional `setPhase` for state, stale `snapshotItems` for cache) with a unified update where the cache is written inside the `setPhase` callback:

```tsx
setPhase((p) => {
  if (p.kind !== "playlist") return p;
  const allItems = [...p.items, ...newItems];
  const allFetched = fetchedCount + newItems.length;
  // Write cache inside the functional update so p.items is always current
  setCachedMusicExplorePlaylist(playlistUrl, {
    playlistTitle,
    playlistUrl,
    items: allItems,
    hasMore: false,
    total,
  });
  return {
    ...p,
    items: allItems,
    fetchedCount: allFetched,
    visibleCount: allItems.length,
    hasMore: false,
    total,
    loadingMore: false,
  };
});
// Remove the separate snapshotItems-based cache writes below this
```

Note: `setCachedMusicExplorePlaylist` is a pure store write (not a React state setter), so calling it inside a `setPhase` updater is safe.

---

### Phase E — Maintenance (G6, G7) — ~1 hour

**E.1 — Consolidate duplicate "Pick tracks" button** (`MusicExploreBottomBar.tsx`)

Replace the two separate code paths (G6) with a single derived boolean:
```tsx
const showPickTracks = pageContext.canPickTracks;
// (remove the kind !== "playlist" guard)
// Render one "Pick tracks" button wherever showPickTracks is true
```

The `showDownloadPlaylist` and `showPickTracks` buttons are already logically compatible on playlist pages (both shown).

**E.2 — Adaptive polling in `MUSIC_EXPLORE_INIT_SCRIPT`** (G7, optional)

The 2000ms tick is a safety net for when event listeners miss navigation. Reducing it to 3000ms when a recent `yt-navigate-finish` was observed, and keeping 2000ms as the fallback, would reduce idle overhead slightly. This is genuinely optional and can be deferred further.

---

## Test Plan

### TP-A1 — Fast Song Navigation (G1, G3)

1. Open Music → Explore. Navigate to any YTM playlist.
2. Start playing. Within 400ms of the song starting, skip to the next song.
3. **Expected:** the second song IS auto-downloaded. Dock chip appears for song 2.
4. Repeat at progressively faster speeds (100ms, 200ms).
5. **Regression guard:** playing normally (no fast skip) still auto-downloads.

### TP-A2 — `yt-player-updated` Event Hook

1. Open DevTools in the YTM webview (`eval_in_webview` with a console listener).
2. Add a `yt-player-updated` listener that logs `movie_player.getVideoData()`.
3. Skip songs via the YTM UI. Verify the event fires within 50ms of visible UI change.
4. Verify `readNowPlaying()` called inside the handler returns the new song's ID, not the previous.

### TP-B1 — Private Playlist Download (G2)

1. Configure browser cookies in Settings (use the user's logged-in browser).
2. Navigate to YTM "Liked Songs" (`/library?list=LM` or similar).
3. Click "Download playlist?" in the bottom bar.
4. **Expected:** the page fetch succeeds; tracks appear in the download queue.
5. Click "Pick tracks" on the same playlist.
6. **Expected:** the panel loads and shows the Liked Songs tracklist.
7. Without cookies configured: both above actions should return a clear auth error, not a silent failure.

### TP-B2 — Public Playlist Still Works (Regression)

1. Navigate to any public YTM playlist.
2. Open the panel → tracks load. Click "Download playlist?" → queue fills.
3. **Expected:** identical behavior to before Phase B changes.

### TP-C1 — Artist Page Playlist Shelf (G5)

1. Navigate to any YTM artist page (e.g., `music.youtube.com/@ArtistName`).
2. Observe the bottom bar context label.
3. **Expected:** shows "Artist" (or artist name), NOT "Playlist". "Pick tracks" button visible; "Download playlist?" NOT visible.
4. Navigate to an actual playlist. **Expected:** "Playlist" label, "Download playlist?" visible.

### TP-D1 — Cache Consistency After Concurrent Completions (G4)

1. Open a 100-track playlist (first 50 loaded).
2. Start downloading 5 tracks (they will complete in ~10–30s).
3. While tracks are completing (being removed from list), click "Load all remaining."
4. Close and reopen the panel.
5. **Expected:** no previously-completed tracks reappear in the list. Count matches what was actually visible before close.

### TP-E1 — Pick Tracks Button Consolidation (G6)

1. On a playlist page: "Download playlist?" and "Pick tracks" both appear. Clicking "Pick tracks" opens the panel. ✓
2. On a search page: only "Pick tracks" appears. Clicking it opens the panel. ✓
3. On the home page: no playlist action buttons. Only "Paste link", "Reload", "Auto-save". ✓

### TP-Regression — Full Explore Flow

Cover all existing T1–T8 tests from the Phase 1 audit to confirm no regressions from Phase 2 changes.

---

## Out of Scope

- Changes to yt-dlp version, format selection, or post-processing pipeline.
- Modifying the Tauri window/webview lifecycle or embed model.
- Adding new YTM features (queue management, lyrics, radio start).
- Changes to non-explore views (Library, Home, Artist/Album detail).
- Adaptive polling interval (G7, Phase E.2) — optional stretch goal.
- Testing against specific ad placements or YTM A/B UI experiments (environment-dependent).
- `mediaSession` prototype hooking as an alternative to `yt-player-updated` — the event-based approach is preferred and sufficient.

---

*Plan generated: 2026-06-01. Precedes implementation; do NOT modify `ytm-download-flow-audit.md`.*
