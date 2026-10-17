# Companion: offline and caching plan

Status: all five phases built (2026-10-08). Phases 3 to 5 are typechecked and unit tested only; not yet exercised in a browser or on the iPhone.

Phases 3 to 5 as built: `sideData.ts` keeps sidecars of saved items and a local progress log (pending rows flush on `online` and on reconnect; a pending local position wins on resume). Offline status strip ("Offline. Library from 2h ago. N saved.", tap opens the sheet), "Back online" notice, and saves asked for offline queue in localStorage and run on reconnect. The offline sheet links to a Phone storage sheet (saved size, covers size, Clear covers, Remove all saved). `storage.persist()` runs at launch. Revoke or auth loss wipes catalog, side data and covers; saved songs stay. The shell cache name is stamped with a build hash by `companion-web.config.ts`. Also built: dimmed unsaved rows offline, a "Saved on this phone" search filter, and next-track skipping unsaved items offline. Not done: hiding sidecar-only UI offline, scrub sprites offline, a Saved pill on rows, an always-visible Storage entry.

Phase 2 as built: `GET /art/:id?v=<thumbV>` (session cookie, immutable cache, ETag) serves a 256px JPEG (q82, about 7 KB) made on first request and kept in the PC app cache dir `companion-art`. `thumbV` is the cover file mtime, sent in `/library`. The service worker `rf-art` cache is cache-first, trims oldest-first past 4000 entries or 200 MB, and never trims covers of saved songs (the page posts the pin list). The Media Session and tint use the same URL. The signed `/thumb` route stays for old cached clients. Wipe-on-revoke of `rf-art` (`art-clear` message) lands with Phase 5.

Phase 1 as built: catalog in IndexedDB (`catalogCache.ts`), painted before the network; `/library` returns 304 on a matching `If-None-Match` (tag covers version, ready and refreshing); 4s timeouts on `/library` and `/healthz`, 8s on `/stream-token`; offline keeps the whole catalog plus saves the PC no longer lists; tapping an unsaved item offline says so; auth errors wipe the catalog, never saves. The service worker now serves the cached shell first (a dead PC cost 3s before any paint) and keeps the previous shell's assets for one update. Not yet: dimmed unsaved rows and the Saved pill (moved to Phase 4 with the rest of the offline visuals).

## What is wrong today (from the code)

- **Cold start blocks on the PC.** `App.tsx` sets `session = "loading"` and waits for `GET /library`. `fetch` has no timeout, so an unreachable PC over Tailscale can hang a long time before the disconnected screen shows.
- **The catalog is memory only.** Every launch refetches the whole library. The server already sends `ETag` (catalogVersion) and `max-age=30`, but the client never sends `If-None-Match` and nothing persists.
- **Offline mode only shows saved items.** `listOffline()` returns just the downloaded entries. With no downloads, the user gets the "Can't reach your PC" gate and nothing else.
- **Thumbnails cost two requests each and are never reused.** `LazyThumb` does `POST /stream-token` (tunnel round trip) then `GET /thumb/:id?exp&sid&sig`. The URL changes on every mint, the response is `private, no-store`, and the URL map lives in memory with a 240s TTL. Every launch refetches every visible thumb. Saved items do not keep their art, so offline rows lose their thumbnails too.
- **Sidecar (sponsor segments, scrub sprites) and progress** are network only. Progress posts are dropped silently when offline.
- **Messages are thin.** One line, "PC unreachable, showing saved items", and a generic player error. Tapping an unsaved item offline does nothing visible.

## Principle

Paint from local data first, reconcile in the background. The phone should never wait on the PC to show something it already knew.

## Phase 1: instant start

1. Persist the catalog in IndexedDB: `{ items, catalogVersion, fetchedAt }`, plus a `paired` marker.
2. On launch, if a catalog exists, render the real UI immediately (`session = "paired"`, `stale = true`) and revalidate `/library` in the background. If the revalidate returns an auth error, drop to the gate as today. If it is a network error, stay in offline mode with the cached catalog.
3. Make `GET /library` honor `If-None-Match` and return `304` so a warm revalidate is a few hundred bytes. Client sends the stored version.
4. Add timeouts: `AbortController` at about 4s on `/library` and `/healthz`, so unreachable fails fast and the retry loop (already backoff) takes over.
5. Offline mode shows the whole cached catalog, not only saved items. Unsaved rows are dimmed with a "Not saved" mark (see Phase 4). A "Saved" filter pill defaults on while offline.

Result: second and later launches show Home in one frame, online or not.

## Phase 2: thumbnails

Goal: one request per thumbnail ever, zero when cached.

1. **Server:** add cookie-authenticated `GET /art/:id?v=<thumbVersion>`. Same-origin guard and session check already exist; the HttpOnly cookie rides on `<img>` requests. Response: `Cache-Control: private, max-age=31536000, immutable` plus `ETag`. Add `thumbV` (file mtime and size hash) to each item in the `/library` payload so a changed cover gets a new URL. Keep the signed `/thumb` route for now; remove after migration.
2. **Client:** `LazyThumb` uses `/art/:id?v=` directly. Delete the token queue and URL TTL map. Keep the IntersectionObserver, drop concurrency limit to what HTTP/2 over Tailscale tolerates (measure; start at 6).
3. **Service worker:** cache-first for `/art/*` in an `rf-art` cache. Cap by entry count and bytes (start 4000 entries or 200 MB, least recently used out). Art for saved items is pinned and never evicted.
4. Media Session artwork uses the same URL, so lock screen art works offline.
5. Optional, measure first: serve a 256px WebP variant for grid and row use, full size only in the player. Resize on the PC once and keep on disk next to the source.

## Phase 3: other data

- **Sidecar:** store sponsor segments and sprite count per saved item at save time, so offline playback still skips and scrubs.
- **Progress:** write position locally on every flush. When the POST fails, queue it in IndexedDB (last write wins per id, timestamped) and flush on reconnect. Offline resume reads the local position.
- **Prefetch on Wi-Fi idle (later):** warm art for the first screen of each shelf. Only if Phase 2 numbers show it is needed.

## Phase 4: screens and messages when disconnected

| Where | Today | Plan |
| --- | --- | --- |
| Cold launch, nothing cached, PC unreachable | Gate "Can't reach your PC" | Keep. Say "No internet on this phone" when `navigator.onLine` is false, otherwise the PC checklist. Show "Last connected 2 days ago" when known. |
| Cold launch, catalog cached | Not possible | Normal UI with a status strip under the header: "Offline. Library from 2h ago. 14 songs saved." Tap opens a small sheet: why, Try again, the three checks. Replaces the one-line note. |
| Mid-session PC drop | Generic player error | "Lost your PC. Saved songs keep playing." Queue skips unsaved items and says how many. Auto-continues on a saved next item. |
| Tap an unsaved item offline | Nothing happens | Row shows a cloud-slash mark. Tap shows a short sheet: "Not saved on this phone. Save it next time you're connected." |
| Save button offline | Fails quietly | Offer "Save when back online". Queue the save and run it on reconnect while the app is open (iOS gives no background time). |
| Search | Client side | Works on the cached catalog. Add the Saved filter. |
| Detail pages, Home shelves | Mixed | Everything built from the catalog stays. Anything sidecar driven hides cleanly instead of showing an empty slot. |
| Reconnect | Silent | Short "Back online" toast, silent refresh, strip clears. |
| Settings | Storage limit only | Show used storage for saves, art cache and catalog, with Clear art cache. |

Copy rule: plain words, say what still works before what does not. Reuse the existing `offline` intro sheet text where it fits. No emdashes.

## Phase 5: shell and storage hygiene

- Stamp the service worker cache name with the build hash (small Vite plugin) so shell updates are deterministic. Today the cache is refreshed on each successful online navigation, which already works; this removes any staleness doubt.
- Call `navigator.storage.persist()` at first launch from the Home Screen, not only on first save, so the catalog and art are not evicted.
- On `session_revoked` or an explicit unpair, wipe catalog, art cache and queued progress. Decision needed on saved media (see below).

## Order and size

1. Phase 1 (medium): biggest felt speed win and unlocks the rest.
2. Phase 2 (medium): second biggest, mostly server route plus SW cache.
3. Phase 4 (medium): the screens and copy, built on the cached catalog.
4. Phase 3 (small to medium).
5. Phase 5 (small).

Each phase ships on its own and leaves the app working.

## Verification

- Real server at `http://localhost:8787/`, Playwright with the service worker enabled, viewport 390x844.
- Count network requests on a warm second launch: expect one `/library` (304) and zero art requests.
- `context.setOffline(true)` after the first load: Home, Library, Search and saved playback all render; art loads from cache.
- Unit tests (vitest) for the catalog cache, queued progress merge and art cache eviction (pinned entries survive).
- Throttled profile (slow 3G) before and after for time to first Home paint.
- Done checklist in `COMPANION-APP.md` still applies, with screenshots of each offline state.

## Decided (Angel, 2026-10-08)

1. Unpair or revoke keeps saved songs on the phone (they play offline, cannot resync). Settings gets a "Remove all saved" button. Catalog, art cache and queued progress are wiped.
2. Resized thumbnails: build the 256px variant in Phase 2. iPhone decode memory and the 200 MB art cache cap both favor small grid art; full size stays for the player and lock screen.
3. Queued saves run only while the app is open. iOS gives a web app no background time, so this is the design, not a gap.
