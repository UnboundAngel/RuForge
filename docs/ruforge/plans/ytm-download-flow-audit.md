# YTM Download / Explore Flow — Audit Report

**Date:** 2026-06-01  
**Scope:** auto-download (now-playing), playlist auto-detect (page-context), ad blocking, race conditions, and improvable logic across the full explore/download pipeline.

---

## Executive Summary

Three root-cause clusters explain the reported regressions:

1. **Playlist auto-detect fires false positives on every non-playlist YTM page.** The DOM fallback in `MUSIC_EXPLORE_PAGE_CONTEXT_INSTALL` runs a `querySelectorAll('a[href*="list="]')` on every page load and overrides the correctly-inferred `kind`. Because YTM always has playlist shortcut links in its sidebar/recommendation shelves, the bottom bar shows "Download playlist?" on home, search, and artist pages — and when clicked it downloads from whatever random playlist link was first in the DOM, not the user's intended content.

2. **Auto-download is silenced during ads.** `readNowPlaying()` calls `movie_player.getVideoData()` unconditionally. When a YTM pre-roll or inter-roll ad is playing, the player is in ad state; `getVideoData()` may return the ad's own video data (or null). Either way no reliable "real song" signal is emitted until after the ad ends. Because the script's `emitNowPlaying()` guard (`__rf_last_vid`) blocks re-emission for the same videoId, if the real song's ID already appeared once during the ad period it can be silently swallowed.

3. **Several medium-severity race conditions and stale closures** exist in the panel lifecycle and queue pump that will surface under normal heavy use (settings changes, concurrent downloads, rapid navigation).

---

## 1. Confirmed Broken Behaviors

### 1.1 Playlist Bottom Bar Shows on Wrong Pages (Critical)

**File:** `src/explorerProfileScript.ts` lines 191–202 (`MUSIC_EXPLORE_PAGE_CONTEXT_INSTALL`)

**Reproduction:**
1. Open Music → Explore.
2. Navigate to YTM Home, Search, or an Artist page.
3. Observe "Download playlist?" appears in the bottom bar — it should only appear when actually on a playlist.
4. Click "Download playlist?" → it enqueues tracks from the first `list=` link found in the page DOM (e.g., "Liked songs" or a sidebar shelf playlist), not the current page content.

**Root cause:**  
The third fallback block unconditionally queries any link containing `list=` and upgrades `kind` to `"playlist"`. This runs **after** the correct path-based and DOM-header checks, overriding them:

```js
// explorerProfileScript.ts ~L191
try {
  var plLinks = document.querySelectorAll('a[href*="list="]');
  for (var i = 0; i < plLinks.length; i++) {
    var lh = plLinks[i].href || "";
    var lm = lh.match(/[?&]list=([^&]+)/);
    if (lm && lm[1] && lm[1].length > 10) {
      kind = "playlist";         // <-- ALWAYS fires: home, search, artist, etc.
      isPlaylistPage = true;
      playlistUrl = "https://music.youtube.com/playlist?list=" + lm[1];
      break;
    }
  }
} catch (e) {}
```

Every YTM page contains "Liked Songs", shelf playlists, "Your Mixtape" links — so this block almost always triggers. The correctly detected `kind` (`"search"`, `"artist"`, `"home"`, etc.) is overwritten.

**Fix:** Gate this fallback behind `kind === "other"` so it only runs when neither path-based nor DOM-header detection succeeded:

```js
if (kind === "other") {
  try {
    var plLinks = document.querySelectorAll('a[href*="list="]');
    // ...
  } catch (e) {}
}
```

---

### 1.2 Auto-Download Silenced While Ad Is Playing (Critical)

**File:** `src/explorerProfileScript.ts` lines 235–297 (`MUSIC_EXPLORE_NOW_PLAYING_INSTALL`)

**Reproduction:**
1. Open Music → Explore, navigate to any YTM page.
2. Play a song that triggers a pre-roll ad.
3. Observe that no auto-download is triggered when the real song starts — or that an ad URL is queued instead.

**Root cause A — ad video data returned:**  
When a YTM ad is playing, `movie_player` exists and `getVideoData()` returns the ad's video info. If the ad is a branded YouTube video, its 11-char `video_id` passes the validation and is emitted as "now playing." `autoQueuedVideoIdsRef` in `MusicShell.tsx` then permanently blacklists this ad ID for the session. When the real song follows, if it shares no ID with the ad (it won't) it downloads correctly. **However,** the ad itself gets silently queued first.

**Root cause B — ad video data is null:**  
If `getVideoData()` returns null during ads (common in some YTM player builds), the script falls through to DOM scraping. The `ytmusic-player-bar` DOM may already show the upcoming real song's link (YTM preloads), meaning the real song gets correctly detected **but** emitted prematurely — before playback starts. The 400ms `setTimeout` on the `play` listener is not enough to wait for ad → song transition.

**Root cause C — `__rf_last_vid` blocks re-fire:**  
If the real song's videoId was already seen during the ad state and stored in `__rf_last_vid`, the event won't re-emit when playback actually starts.

**Fix:** Add ad-state detection before trusting `getVideoData()`:

```js
// Inside readNowPlaying(), before line ~L239
var player = document.getElementById("movie_player");
if (player) {
  var adShowing = player.classList.contains("ad-showing")
    || player.classList.contains("ad-interrupting")
    || !!document.querySelector(".ytp-ad-player-overlay-interrupt, .ytp-ad-preview-container");
  if (adShowing) {
    return { videoId: null, title: null, artist: null };
  }
}
```

Additionally, reset `__rf_last_vid` when the ad-showing class is detected so the real song re-fires after the ad:

```js
// In emitNowPlaying():
if (!np.videoId) {
  // If we're in ad state, clear the cached vid so the post-ad song re-fires
  if (adShowing) window.__rf_last_vid = null;
  return;
}
```

---

### 1.3 `autoQueuedVideoIdsRef` Never Cleared — Re-download Impossible (High)

**File:** `src/components/music/MusicShell.tsx` lines 163, 375

```tsx
const autoQueuedVideoIdsRef = useRef<Set<string>>(new Set());
// ...
if (autoQueuedVideoIdsRef.current.has(videoId)) return;
autoQueuedVideoIdsRef.current.add(videoId);
```

Once a song is auto-downloaded, its videoId is permanently added to the session set. If the user deletes the downloaded file and plays the same song again, auto-download will silently skip it. There is no mechanism to remove from the set when a download job is removed.

**Fix:** Intercept `removeDownloadJob` to prune the set. Since the set lives in `MusicShell`, the cleanest approach is to listen for completed/removed job IDs and extract the videoId back from the URL:

```tsx
// When a download job completes or is removed:
const videoId = extractYouTubeVideoId(job.url);
if (videoId) autoQueuedVideoIdsRef.current.delete(videoId);
```

Alternatively, add a session-scoped expiry (e.g., clear after 30 minutes).

---

## 2. Race Conditions & State Bugs

### 2.1 Hidden Panel Still Reloads on URL Changes (Medium)

**File:** `src/components/music/MusicShell.tsx` line 311  
**File:** `src/components/music/MusicExploreDownloadPanel.tsx` lines 670–679

```tsx
// MusicShell.tsx
const explorePanelUrl = pasteUrl.trim() || currentMusicExploreUrl;
// ...
<MusicExploreDownloadPanel url={explorePanelUrl} ... />
```

```tsx
// MusicExploreDownloadPanel.tsx
useEffect(() => {
  if (!url.trim()) { ...; return; }
  void doLoad(url);
}, [url, doLoad]);
```

When `keepExplorePanelMounted` is true but `showExplorePanel` is false (panel is hidden via `className="hidden"` but stays in DOM), the `url` prop still updates every time the user navigates in the webview. Each URL change triggers `doLoad()`, which aborts the previous fetch and starts a new one. This wastes IPC calls to the Rust backend and can cause confusing intermediate states when the panel is later revealed.

**Fix:** Freeze `explorePanelUrl` when the panel is not visible:

```tsx
const explorePanelUrl = showExplorePanel
  ? (pasteUrl.trim() || currentMusicExploreUrl)
  : (frozenPanelUrlRef.current ?? "");
```

Or simply don't pass an updated URL to the panel when it's hidden:

```tsx
const explorePanelUrl = showExplorePanel
  ? (pasteUrl.trim() || currentMusicExploreUrl)
  : panelUrlRef.current;
```

---

### 2.2 `processNextCelebration` Stale Closure (Medium)

**File:** `src/components/music/MusicExploreDownloadPanel.tsx` lines 304–328

```tsx
const processNextCelebration = useCallback(() => {
  // ...
  celebrateTimerRef.current = setTimeout(() => {
    celebrateTimerRef.current = null;
    removeCompletedFromPlaylist([next.url]);
    setCelebrating(null);
    processNextCelebration();  // <-- captures stale closure!
  }, COLLAPSED_CELEBRATE_MS);
}, [removeCompletedFromPlaylist]);
```

The recursive call to `processNextCelebration` inside `setTimeout` captures the version of `processNextCelebration` from the render cycle where the timeout was created. If `removeCompletedFromPlaylist` identity changes (its `useCallback` deps change), a new `processNextCelebration` is created — but the old timer fires the old one. The queue drains incorrectly or tracks don't get removed.

**Fix:** Use a stable ref:

```tsx
const processNextCelebrationRef = useRef<() => void>(() => {});
processNextCelebrationRef.current = () => { /* impl using latest closures */ };

// Inside setTimeout:
celebrateTimerRef.current = setTimeout(() => {
  celebrateTimerRef.current = null;
  removeCompletedFromPlaylist([next.url]);
  setCelebrating(null);
  processNextCelebrationRef.current();  // always latest
}, COLLAPSED_CELEBRATE_MS);
```

---

### 2.3 `loadAllRemaining` Captures Stale `items` Array (Medium)

**File:** `src/components/music/MusicExploreDownloadPanel.tsx` lines 559–590

```tsx
const loadAllRemaining = useCallback(async () => {
  if (phase.kind !== "playlist" || phase.loadingMore) return;
  const { playlistUrl, items } = phase;   // <-- phase captured at callback creation
  setPhase((p) => p.kind === "playlist" ? { ...p, loadingMore: true } : p);
  let allItems = [...items];              // <-- stale items used for offset
  // ...
  while (hasMore) {
    const page = await invoke("get_playlist_items_page", {
      url: playlistUrl, offset: allItems.length, ...  // offset based on stale items
    });
    allItems = [...allItems, ...page.items];
  }
}, [phase]);
```

If tracks are removed from `phase.items` between callback creation and the `await invoke` (e.g., completion events prune the list), `allItems.length` is wrong and fetched pages skip items.

**Fix:** Read the current items count from a ref inside the loop rather than relying on the captured `items`:

```tsx
const loadAllRemaining = useCallback(async () => {
  if (phase.kind !== "playlist" || phase.loadingMore) return;
  const { playlistUrl } = phase;
  setPhase((p) => p.kind === "playlist" ? { ...p, loadingMore: true } : p);
  let offset = phase.items.length;  // snapshot at start; use phase ref below for ongoing count
  // ...
}, [phase]);
```

Or snapshot `items` at the start and accumulate only new pages (which is correct since removed items are already downloaded — they shouldn't count toward the fetch offset).

---

### 2.4 `doLoad` Dependency on Full `settings` Object (Medium)

**File:** `src/components/music/MusicExploreDownloadPanel.tsx` line 515

```tsx
const doLoad = useCallback(async (rawUrl: string) => {
  // ...
}, [applyPlaylistPhase, settings]);  // <-- full settings object
```

Because `doLoad` depends on `settings`, it is recreated whenever ANY setting changes. This triggers:

```tsx
useEffect(() => {
  void doLoad(url);
}, [url, doLoad]);  // doLoad changes → effect re-runs → panel reloads
```

If the user changes theme, volume, or any unrelated setting while browsing the panel, the panel silently re-fetches the current URL (aborting the current fetch).

**Fix:** Destructure only the cookie/auth settings used in `doLoad`:

```tsx
const { preferredQuality, browserCookies, cookieFile } = settings;
const doLoad = useCallback(async (rawUrl: string) => {
  // ...
}, [applyPlaylistPhase, preferredQuality, browserCookies, cookieFile]);
```

---

### 2.5 `music-explore-url` Event Can Overwrite Rich Page Context (Low)

**File:** `src/components/music/MusicShell.tsx` lines 321–337

```tsx
void listen<string>(MUSIC_EXPLORE_URL_EVENT, (ev) => {
  const url = ev.payload ?? "";
  setCurrentMusicExploreUrl(url);
  setMusicExplorePageContext(classifyMusicExplorePageFromUrl(url));  // URL-only
});
```

The `MUSIC_EXPLORE_INIT_SCRIPT` fires `emitUrl()` and `emitPageContext()` in the same `tick()`. Both arrive via async Tauri IPC. If the URL event arrives slightly after the page-context event (e.g., under IPC back-pressure), the richer context gets overwritten by the URL-only classification.

**Fix:** Merge instead of replace in the URL event listener — only update `currentMusicExploreUrl`; never downgrade the page context:

```tsx
void listen<string>(MUSIC_EXPLORE_URL_EVENT, (ev) => {
  const url = ev.payload ?? "";
  setCurrentMusicExploreUrl(url);
  // Don't reset page context here — wait for page-context event which carries richer data.
  // Only seed if context is stale (different URL):
  setMusicExplorePageContext((prev) => {
    if (prev.url === url) return prev;
    return classifyMusicExplorePageFromUrl(url);
  });
});
```

---

## 3. Ad / Now-Playing Detection Gaps

### 3.1 No Ad-State Guard (Critical — see §1.2 above)

### 3.2 DOM Fallback Title Selector Typo (Low)

**File:** `src/explorerProfileScript.ts` line 270

```js
var titleEl = document.querySelector("ytmusic-player-bar .title, ytmusic-player-bar .title");
```

The selector string is identical on both sides of the comma — a copy-paste error. Functionally it works (duplicate selectors are legal), but it should be:

```js
var titleEl = document.querySelector("ytmusic-player-bar .title, ytmusic-player-bar .byline");
```

### 3.3 `play` Event 400ms Delay Insufficient for Ad-to-Song Transition (Medium)

**File:** `src/explorerProfileScript.ts` line 294

```js
document.addEventListener("play", function(){
  setTimeout(function(){ window.__rf_emitNowPlaying(); }, 400);
}, true);
```

The 400ms delay was designed to wait for player state to settle. For ad-to-song transitions, the `play` event fires on the ad player's audio element ending. By 400ms the next song's `movie_player` state may not have fully updated yet, especially on slower machines. The `getVideoData()` call still sees the ad state.

**Fix:** Combine with ad-state detection (§1.2). If ad is detected at 400ms, schedule a retry at 1200ms:

```js
function tryEmitNowPlaying(retries) {
  var np = readNowPlaying();
  if (!np.videoId && retries > 0) {
    setTimeout(function(){ tryEmitNowPlaying(retries - 1); }, 800);
    return;
  }
  if (np.videoId) window.__rf_emitNowPlaying();
}
document.addEventListener("play", function(){
  setTimeout(function(){ tryEmitNowPlaying(2); }, 400);
}, true);
```

### 3.4 `getVideoData()` May Return Stale Data After Navigation (Medium)

**File:** `src/explorerProfileScript.ts` lines 238–246

YTM's single-page navigation does not always recreate `movie_player`. After navigating to a new song, `getVideoData()` can briefly return the previous song's data. The 1500ms polling interval (`__rf_last_vid` guard) normally prevents duplicate emission, but if the user skips songs faster than 1.5s, the intermediate song may be missed.

**Fix:** Listen to `yt-player-updated` or `yt-player-current-time-update` events (fired by YTM on actual player state changes) rather than polling. Failing that, also hook into `mediaSession.metadata` changes:

```js
if (navigator.mediaSession) {
  var origSet = Object.getOwnPropertyDescriptor(MediaMetadata.prototype, 'title');
  // Hook mediaSession metadata changes as an additional trigger
}
```

---

## 4. Playlist Auto-Detect Gaps

### 4.1 DOM Fallback Overrides Correct Kind (Critical — see §1.1 above)

### 4.2 `playlistUrl` From `watch+list` URL Not Normalized to `/playlist?list=` (Medium)

**File:** `src/explorerProfileScript.ts` lines 153–157

```js
} else if (path.indexOf("/watch") === 0) {
  if (/[?&]list=/.test(window.location.search)) {
    kind = "playlist";
    playlistUrl = href.split("#")[0];  // e.g. /watch?v=XXX&list=PLyyy
```

The `playlistUrl` for a watch+list URL keeps the `v=` parameter. When passed to `get_playlist_items_page` via `handleDownloadPlaylist`, the Rust command receives `music.youtube.com/watch?v=xxx&list=yyy` instead of the cleaner `music.youtube.com/playlist?list=yyy`. Some YTM playlist IDs (e.g., auto-generated `RDCLAK...` types) may only be correctly resolved on the `/playlist` endpoint.

**Fix:** When `list=` is detected on a watch URL, extract only the `list=` param:

```js
var listParam = new URLSearchParams(window.location.search).get("list");
if (listParam) {
  kind = "playlist";
  playlistUrl = "https://music.youtube.com/playlist?list=" + listParam;
  isPlaylistPage = true;
}
```

### 4.3 `mergeMusicExplorePageContext` Upgrades Kind Too Eagerly (Low)

**File:** `src/lib/musicExplorePageContext.ts` lines 162–169

```ts
if (payload?.isPlaylistPage || payload?.playlistUrl) {
  kind = "playlist";
}
```

If the injected script sends `isPlaylistPage: true` (which the DOM fallback may incorrectly set — see §4.1), any page gets classified as playlist. The fix to §4.1 (gating the DOM fallback) is the prerequisite; this condition is otherwise correct logic.

### 4.4 `classifyMusicExploreUrl` Treats Any `list=` URL as Playlist (Low)

**File:** `src/youtubeUrl.ts` lines 255–261

```ts
export function classifyMusicExploreUrl(input: string): MusicExploreUrlKind | null {
  if (isMusicYouTubePlaylistUrl(trimmed)) return "playlist";
  if (extractYouTubePlaylistId(trimmed)) return "playlist";  // <-- also plain youtube.com with list=
```

A plain `youtube.com/watch?v=xxx&list=yyy` (non-music domain) gets classified as `"playlist"`. This is correct for the downloader use case, but means any pasted plain YouTube playlist URL with a `list=` param is treated as a playlist (expected) — even if the actual watch URL was intended. This interacts with the paste flow in `MusicExploreBottomBar` which calls `resolveMusicExplorePasteUrl` → may navigate the panel to a `www.youtube.com/playlist?list=` URL that the panel's `get_playlist_items_page` may or may not handle.

---

## 5. Additional Findings

### 5.1 Duplicate Polling Intervals (Low)

**File:** `src/explorerProfileScript.ts`

Three independent polling loops run concurrently in the webview:
- `MUSIC_EXPLORE_INIT_SCRIPT` → `setInterval(tick, 2000)` which calls both `emitNowPlaying` and `emitPageContext`
- `MUSIC_EXPLORE_NOW_PLAYING_INSTALL` → `setInterval(emitNowPlaying, 1500)`
- `MUSIC_EXPLORE_PAGE_CONTEXT_INSTALL` → `setInterval(emitPageContext, 1500)`

The dedup guards (`__rf_last_vid`, `__rf_last_ctx`) prevent actual duplicate Tauri events, but the JS-side polling is redundant. At worst, `emitNowPlaying` fires 3 times per 6-second window (1500ms, 2000ms, 3000ms).

**Fix:** Remove the `setInterval` calls from the install scripts since the init script's tick already covers them. The install scripts should only register event listeners.

### 5.2 `TRACKING_PARAMS` Duplicate Entry (Low)

**File:** `src/youtubeUrl.ts` lines 80–91

```ts
const TRACKING_PARAMS = [
  "si",         // index 0 ← duplicate
  "feature",
  "pp",
  "fbclid",
  "gclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "si",         // index 10 ← duplicate
];
```

Harmless but noisy.

### 5.3 `MusicExploreBottomBar.downloadPlaylist` Passes Wrong URL to Backend (Medium)

**File:** `src/components/music/MusicExploreBottomBar.tsx` lines 117–164

```tsx
const downloadPlaylist = useCallback(async (targetUrl: string) => {
  const canonical = canonicalMusicYouTubeUrl(targetUrl) ?? targetUrl.trim();
  // canonical may be: music.youtube.com/watch?v=xxx&list=yyy
  const page = await invoke("get_playlist_items_page", { url: canonical, ... });
```

`canonicalMusicYouTubeUrl` preserves all params except tracking ones. For a watch+list URL, this is `music.youtube.com/watch?v=xxx&list=yyy`. The Rust command `get_playlist_items_page` expects a playlist-style URL. Depending on the Rust implementation, this may work (yt-dlp handles both), but it's an unreliable input. Pass the clean playlist URL instead:

```tsx
const listId = extractYouTubePlaylistId(targetUrl);
const canonical = listId
  ? `https://music.youtube.com/playlist?list=${listId}`
  : (canonicalMusicYouTubeUrl(targetUrl) ?? targetUrl.trim());
```

### 5.4 Panel Idle State Shows Spinner Instead of Empty Hint (Low)

**File:** `src/components/music/MusicExploreDownloadPanel.tsx` lines 799–803

```tsx
{phase.kind === "idle" && (
  <div className="flex items-center justify-center h-full">
    <Loader size={16} className="animate-spin" ... />
  </div>
)}
```

`phase: { kind: "idle" }` is set when `url` is empty. Showing a spinner implies loading is in progress, but "idle" means no URL yet. This should show a "Paste a link or browse to a playlist" hint instead of a spinner. Users see a spinning loader with no context.

---

## 6. Recommended Fix Order (Phased)

### Phase 1 — Critical (1–2 days)

| # | Fix | File |
|---|-----|------|
| 1 | Gate DOM playlist fallback behind `kind === "other"` | `explorerProfileScript.ts` MUSIC_EXPLORE_PAGE_CONTEXT_INSTALL |
| 2 | Add ad-state detection guard in `readNowPlaying` | `explorerProfileScript.ts` MUSIC_EXPLORE_NOW_PLAYING_INSTALL |
| 3 | Reset `__rf_last_vid = null` when ad state detected | same |
| 4 | Normalize watch+list playlistUrl to `/playlist?list=` in page-context script | same |

### Phase 2 — High (1 day)

| # | Fix | File |
|---|-----|------|
| 5 | Clear `autoQueuedVideoIdsRef` entry on download job removal | `MusicShell.tsx` |
| 6 | Fix `MusicExploreBottomBar.downloadPlaylist` to extract `list=` ID | `MusicExploreBottomBar.tsx` |
| 7 | Freeze panel URL prop when panel is hidden | `MusicShell.tsx` |

### Phase 3 — Medium (1–2 days)

| # | Fix | File |
|---|-----|------|
| 8 | Fix `processNextCelebration` stale closure via ref | `MusicExploreDownloadPanel.tsx` |
| 9 | Fix `loadAllRemaining` stale items offset | `MusicExploreDownloadPanel.tsx` |
| 10 | Scope `doLoad` deps to specific settings fields | `MusicExploreDownloadPanel.tsx` |
| 11 | Add retry logic to post-ad `emitNowPlaying` trigger | `explorerProfileScript.ts` |
| 12 | Merge rather than replace context in `music-explore-url` listener | `MusicShell.tsx` |

### Phase 4 — Low / Polish (0.5 day)

| # | Fix | File |
|---|-----|------|
| 13 | Remove redundant polling from install scripts | `explorerProfileScript.ts` |
| 14 | Fix duplicate title selector copy-paste typo | `explorerProfileScript.ts` |
| 15 | Remove duplicate `"si"` from `TRACKING_PARAMS` | `youtubeUrl.ts` |
| 16 | Show empty-state hint instead of spinner in idle panel | `MusicExploreDownloadPanel.tsx` |

---

## 7. Test Plan

### T1 — Playlist Button Appears Correctly

- [ ] Navigate to YTM **Home**: "Download playlist?" must NOT appear.
- [ ] Navigate to YTM **Search** (`/search?q=test`): button must NOT appear.
- [ ] Navigate to an **Artist page** (`/@artist` or `/channel/...`): button must NOT appear; "Pick tracks" may appear.
- [ ] Navigate to a **Playlist** (`/playlist?list=PLxxxx`): "Download playlist?" MUST appear.
- [ ] Play a song from within a playlist (`/watch?v=xxx&list=PLxxxx`): "Download playlist?" MUST appear.

### T2 — Playlist Download Correctness

- [ ] On a playlist page, click "Download playlist?": verify all tracks are queued for the CORRECT playlist.
- [ ] On home page with sidebar showing "Liked songs", click (if still shown — regression guard): tracks should match the current page's playlist, not a sidebar shortcut.

### T3 — Auto-Download During / After Ads

- [ ] Play a song that triggers a pre-roll YTM ad.
- [ ] Verify no download is triggered for the ad.
- [ ] Verify the real song IS auto-downloaded after the ad ends.
- [ ] Confirm the dock chip appears after ad ends.

### T4 — Auto-Download Dedup / Re-download

- [ ] Play song A → auto-downloaded. Remove the download job. Play song A again → should auto-download again (after Phase 2 fix).
- [ ] Play song B → auto-downloaded. Navigate away and back. Play song B again → within same session, should NOT re-queue.

### T5 — Panel Stability

- [ ] Open the download panel on a playlist, minimize it (dock chip shows).
- [ ] Navigate to several pages in the webview.
- [ ] Re-open the panel: it should still show the previously loaded playlist, not reload with each navigation.

### T6 — Settings Change Does Not Reload Panel

- [ ] Open the download panel with a playlist loaded (50 tracks visible).
- [ ] Open Settings, toggle any setting unrelated to cookies/quality.
- [ ] Return to Explore: panel should still show the same 50 tracks without reloading.

### T7 — Celebration Queue Drains Correctly

- [ ] Start downloading 5 tracks from the panel.
- [ ] Minimize the panel.
- [ ] As each track finishes, observe dock chip celebrations drain sequentially, one per `COLLAPSED_CELEBRATE_MS` (2.1s).
- [ ] After all tracks complete, panel list should be empty (all removed), not stuck mid-drain.

### T8 — Load All Remaining Under Concurrent Completions

- [ ] Open a 200-track playlist (first 50 loaded).
- [ ] Start downloading several tracks.
- [ ] While downloads complete (tracks removed from list), click "Load all remaining."
- [ ] Verify the remaining tracks are fetched with correct offset (no gaps, no duplicates).

---

*Plan generated: 2026-06-01. Do NOT edit the attached `music_mini_player.plan.md`.*
