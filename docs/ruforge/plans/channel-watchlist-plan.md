# Channel watchlist + notification center: build plan

Status: planned. Roadmap row: `website/src/content/roadmap.json` "Channel watchlist and new-upload notifications" (Explorer, Medium). Future consumer of the notification center: roadmap row "Download history log" (out of scope here).

Each phase is self-contained. A builder reads: Build protocol, Context for the builder, the architecture sections the phase links to, then only its own phase.

---

## Build protocol (every session)

1. Work only on branch `feature/channel-watchlist`.
   - First session (phase 1): `git fetch origin && git checkout -b feature/channel-watchlist origin/main`, push with `git push -u origin feature/channel-watchlist`, then open the draft PR: `gh pr create --draft --base main --head feature/channel-watchlist --title "Channel watchlist + notification center" --body "Tracks docs/ruforge/plans/channel-watchlist-plan.md"`.
   - Later sessions: `git fetch origin && git checkout feature/channel-watchlist && git pull --ff-only`.
2. One phase per session. Find the first unchecked phase in the checklist below and do only that.
3. Run the phase's Verification commands. Do not commit a failing phase; fix it first.
4. In this file, tick the phase in the checklist (`- [x]`). This edit goes in the same commit.
5. `git add -A`, then `git commit -m "watchlist: phase N <short summary>"`. No emdashes in the message.
6. `git push`.
7. `gh pr comment --body "Phase N landed: <what landed>. Next: phase N+1 <name>."` (run on the branch; `gh` finds the PR).
8. Never push to `main`. Never force push. Never `git reset`, `git clean`, `git checkout -- <file>` or `git restore` on work you did not create. If `git pull --ff-only` fails, stop and report.
9. Do not edit `STATE.md`. Do not log to Unreleased until phase 13.

### Phase checklist

- [x] Phase 1: Branch, roadmap flag, Rust watchlist core
- [x] Phase 2: Rust channel resolver
- [x] Phase 3: Rust poller, premieres, auto-download hold
- [x] Phase 4: Frontend watchlist data layer
- [ ] Phase 5: Notification center core (model, store, sources)
- [ ] Phase 6: Title bar bell + notification popover (in-page)
- [ ] Phase 7: Popover overlay above YouTube webviews
- [ ] Phase 8: Channels tab (manage follows)
- [ ] Phase 9: Explorer Follow toggle
- [ ] Phase 10: Library entry points, shelf, rail badge
- [ ] Phase 11: Watchlist alerts + auto-download
- [ ] Phase 12: Desktop island watchlist variant
- [ ] Phase 13: Settings, polish, Unreleased log

---

## Context for the builder (read cold)

RuForge is a Windows desktop app: Tauri v2 + Rust (`src-tauri/`), React 19 + TypeScript + Zustand + Tailwind v4 (`src/`), yt-dlp + ffmpeg. The downloader is the product. Read `STATE.md` and root `AGENTS.md` first.

What we are building, two features that ship together:

- **Channel watchlist.** The user follows YouTube channels. Rust checks each channel's public RSS feed in the background. New uploads (never Shorts) are announced; premieres and scheduled livestreams are announced as upcoming. Per channel, auto-download can enqueue new uploads into the existing download queue.
- **Notification center.** A bell in the title bar, shown in every mode (Library and Music). Its popover is a generic feed of notification items from several sources: watchlist uploads first, download events second (finished, failed, timed out, blocked by storage). A "Channels" tab manages follows. A "History" tab slot is reserved for the future Download history log.

Other surfaces: "New from channels you follow" shelf on Library home, unread badge on the Videos rail item, Follow toggles in Explorer and the library, and a watchlist variant of the desktop island (collapsed + expanded) while the app is not focused.

Webviews you will meet:

- `main` window: the app. Owns the Zustand store (`src/store/ruforgeStore.ts`), the download queue, the watchlist store and the notification center store.
- `mini` / `music-mini` windows: mini players. `mini` runs `App.tsx` hooks too (the early return is after the hooks). Watchlist and notification code must no-op there.
- `island` window: desktop island overlay (`src/IslandOverlayApp.tsx`, Rust `commands/island_overlay.rs`). No store. Main pushes `desktop-island-state`; the island sends `desktop-island-control` back.
- Child webviews inside the main window: Explorer (`explorer-view`, real youtube.com) and Music Explore (YouTube Music). Native child webviews paint above all DOM in the main window. They have Tauri event permission (`src-tauri/capabilities/music-explore-webview.json`), so never broadcast private data with `app.emit`; use `emit_to` main.
- `radial-nav-overlay` child webview: a transparent child webview created after the YouTube webviews so it stacks above them (`src/lib/radialNavOverlayHost.ts`). Phase 7 copies this pattern for the popover. Read it, do not modify it.

Zustand does not span webviews. Cross-webview sync is only Tauri `emit` / `emitTo` / `listen`.

Repo rules that bite (full list in `AGENTS.md`):

- No emdashes anywhere: code, comments, UI copy, commits, PR comments.
- Comments only for why, never what.
- Extract components before ~120 JSX lines. `App.tsx`, `SettingsView.tsx`, `useDesktopIslandOverlay.ts`, `downloadQueueSlice.ts` are already huge: add a few lines there, put logic in new files.
- Tailwind + tokens (`src/index.css`). `style={}` only for dynamic values. No css-in-js.
- Hover labels via `data-tooltip` (`TooltipLayer`). Never the `title` attribute. Any new webview that renders `data-tooltip` mounts `AppTooltipLayer`.
- Custom widgets, never native (`CustomSelect` and `ToggleSlot` in `SettingsView.tsx`; `rf-scrollbar` class for scrollers).
- Palette follows the mode. Library: `var(--accent)` (sand gold, user-pickable) on warm brown. Music: `[data-music-mode="true"]` redefines `--accent` to red and uses black surfaces. Anything portaled to `document.body` escapes that attribute, so it must set `data-music-mode="true"` itself in Music mode (pattern: `SettingsModalShell.tsx`, `musicMenuUi.tsx`). Never hardcode `#EDCF9B` or `#ff0033`.
- Design: read `.cursor/rules/design-style-anti-patterns.mdc` and `.cursor/skills/ruforge-design/restrictions.md` (Tooltips, Popups, Scrollbars, Motion) before UI phases. No divider lines between rows, no glow, no accent-bar section labels, 16:9 thumbnails `object-cover` with no letterboxing.
- RuForge does not support Shorts. No Shorts anywhere in this feature.
- Do not touch hero skins (`src/components/player/heroSkins/`) or radial nav code (`radialNavOverlayHost.ts`, `RadialNavOverlay*.tsx`, `radial_nav_bridge.*`).
- No OS notification plugin. Background alerts go through the island.

Commands:

- Rust: `cd src-tauri && cargo check` and `cargo test watchlist`
- TS: `npx tsc --noEmit` (repo root), `npx vitest run <path>`
- App: `npx tauri dev` (not `npm run dev:app` from bash; that is PowerShell)
- Devtools console in the main window during `tauri dev`: `await window.__TAURI_INTERNALS__.invoke("get_watchlist")`

---

## Architecture: channel watchlist (Rust-owned)

### Data flow

1. Rust owns `app_data_dir()/watchlist.json`. Only Rust writes it.
2. A Rust async poller fetches `https://www.youtube.com/feeds/videos.xml?channel_id=UC...` with reqwest (no cookies, no yt-dlp, not behind the yt-dlp rate gate).
3. Shorts are dropped at ingest. New video ids get one cookie-free player probe to learn duration and premiere / live state.
4. Rust emits to main only: `watchlist-updated` (snapshot), `watchlist-new-uploads` (newly surfaced uploads), `watchlist-auto-ready` (held premieres that became normal videos on auto-download channels).
5. Main keeps a mirror store, runs alerts and auto-download, and feeds the notification center and the island.

### Rust types (`src-tauri/src/commands/watchlist/model.rs`)

All structs `#[derive(Serialize, Deserialize, Clone, Debug)]`, `#[serde(rename_all = "camelCase")]`. `#[serde(default)]` on anything added after version 1.

```rust
pub const WATCHLIST_FILE_VERSION: u32 = 1;
pub const MAX_CHANNELS: usize = 300;
pub const KNOWN_IDS_CAP: usize = 60;
pub const UNSEEN_CAP: usize = 100;
pub const SEEN_KEEP: usize = 100;
pub const SEEN_KEEP_SECS: i64 = 14 * 86_400;
pub const LIVE_RECHECK_SECS: i64 = 7 * 86_400;
pub const DEFAULT_INTERVAL_MIN: u32 = 30;
pub const MIN_INTERVAL_MIN: u32 = 15;
pub const MAX_INTERVAL_MIN: u32 = 360;

pub struct WatchlistFile { pub version: u32, pub prefs: WatchlistPrefs, pub channels: Vec<WatchedChannel>, pub uploads: Vec<WatchlistUpload> }

pub struct WatchlistPrefs { pub check_interval_min: u32 }

pub struct WatchedChannel {
    pub channel_id: String,          // 24-char UC id
    pub title: String,
    pub handle: Option<String>,      // "@name", compared case-insensitively
    pub followed_at: i64,            // unix secs
    pub auto_download: bool,
    pub seeded: bool,                // false until the first successful fetch marks existing videos known
    pub known_ids: Vec<String>,      // newest first, cap KNOWN_IDS_CAP; includes dropped Shorts
    pub last_checked_at: Option<i64>,
    pub last_error: Option<String>,
    pub fail_count: u32,
    pub next_check_at: i64,
}

#[serde(rename_all = "lowercase")]
pub enum LiveStatus { None, Upcoming, Live }

pub struct WatchlistUpload {
    pub video_id: String,
    pub channel_id: String,
    pub channel_title: String,
    pub title: String,
    pub url: String,                 // https://www.youtube.com/watch?v=ID
    pub thumbnail: String,           // https://i.ytimg.com/vi/ID/mqdefault.jpg (16:9)
    pub published_at: i64,
    pub discovered_at: i64,
    pub duration_sec: Option<u32>,
    pub live_status: LiveStatus,
    pub scheduled_at: Option<i64>,   // premiere / stream start, when known
    pub seen: bool,
    pub auto_queued: bool,
}

pub struct WatchlistSnapshot {
    pub channels: Vec<WatchedChannelView>,  // no known_ids / next_check_at / fail_count
    pub uploads: Vec<WatchlistUpload>,      // newest published first
    pub unseen_count: u32,
    pub check_interval_min: u32,
}

pub struct WatchedChannelView { pub channel_id: String, pub title: String, pub handle: Option<String>, pub followed_at: i64, pub auto_download: bool, pub last_checked_at: Option<i64>, pub last_error: Option<String> }

pub struct UploadsPayload { pub uploads: Vec<WatchlistUpload> }

pub struct ResolvedChannel { pub channel_id: String, pub title: String, pub handle: Option<String> }
```

### Commands (`commands/watchlist/mod.rs`, registered in `lib.rs` `generate_handler!`)

| Command | Args | Returns |
|---|---|---|
| `get_watchlist` | none | `WatchlistSnapshot` |
| `follow_channel` | `channelId, title, handle?` | `WatchlistSnapshot` |
| `unfollow_channel` | `channelId` | `WatchlistSnapshot` (drops its uploads) |
| `set_channel_auto_download` | `channelId, enabled` | `WatchlistSnapshot` |
| `mark_watchlist_seen` | `videoIds` | `WatchlistSnapshot` |
| `mark_all_watchlist_seen` | none | `WatchlistSnapshot` |
| `mark_watchlist_auto_queued` | `videoIds` | `WatchlistSnapshot` |
| `resolve_watchlist_channel` | `input` | `ResolvedChannel` (phase 2) |
| `set_watchlist_check_interval` | `minutes` | `WatchlistSnapshot` (phase 3) |
| `refresh_watchlist_now` | none | `()` (phase 3, throttled to once per 120 s) |

Every mutating command also emits `watchlist-updated`.

### Events (Rust to main only, `app.emit_to(tauri::EventTarget::webview_window("main"), ...)`, same as `MAIN_HIDDEN_EVENT` in `lib.rs`)

- `watchlist-updated`: `WatchlistSnapshot`, after any change.
- `watchlist-new-uploads`: `UploadsPayload`, only for uploads newly surfaced by a poll of an already seeded channel. Never on seeding or hydration.
- `watchlist-auto-ready`: `UploadsPayload`, uploads on auto-download channels that were upcoming / live and are now normal videos, not yet `auto_queued`.

### TS mirror (`src/watchlist/types.ts`)

```ts
export type LiveStatus = "none" | "upcoming" | "live";
export type WatchedChannel = { channelId: string; title: string; handle: string | null; followedAt: number; autoDownload: boolean; lastCheckedAt: number | null; lastError: string | null };
export type WatchlistUpload = { videoId: string; channelId: string; channelTitle: string; title: string; url: string; thumbnail: string; publishedAt: number; discoveredAt: number; durationSec: number | null; liveStatus: LiveStatus; scheduledAt: number | null; seen: boolean; autoQueued: boolean };
export type WatchlistSnapshot = { channels: WatchedChannel[]; uploads: WatchlistUpload[]; unseenCount: number; checkIntervalMin: number };
export type ResolvedChannel = { channelId: string; title: string; handle: string | null };
export const WATCHLIST_UPDATED_EVENT = "watchlist-updated";
export const WATCHLIST_NEW_UPLOADS_EVENT = "watchlist-new-uploads";
export const WATCHLIST_AUTO_READY_EVENT = "watchlist-auto-ready";
```

---

## Architecture: notification center (main-owned)

### Model (`src/notifications/types.ts`)

```ts
export type NotificationSourceId = "watchlist" | "download";

export type NotificationKind =
  | "upload"              // watchlist: new video
  | "premiere"            // watchlist: upcoming premiere or scheduled stream
  | "live"                // watchlist: streaming now
  | "download-finished"
  | "download-failed"
  | "download-timed-out"
  | "download-blocked";   // storage cap / disk space, queue hold or add refused

export type NotificationActionId =
  | "queue" | "open-explorer"            // watchlist
  | "play" | "show-in-folder" | "retry"  // download
  | "open-storage-settings";             // download-blocked

export type NotificationItem = {
  /** Stable: `${source}:${key}` so re-recording updates in place. */
  id: string;
  source: NotificationSourceId;
  kind: NotificationKind;
  title: string;
  /** Secondary line: channel name, error text, file name. */
  subtitle: string | null;
  thumbnail: string | null;
  /** For a channel avatar badge on the thumbnail. */
  channelId: string | null;
  createdAt: number;       // ms
  read: boolean;
  actions: NotificationActionId[];
  /** Source-specific references the source's action runner needs. */
  ref: { videoId?: string; url?: string; jobId?: string; outputPath?: string; scheduledAt?: number | null };
};
```

### Sources (`src/notifications/sources/`)

Each source exports the same interface so the center stays source-agnostic:

```ts
export type NotificationSource = {
  id: NotificationSourceId;
  /** Pure projection from store state into items. */
  items: () => NotificationItem[];
  markRead: (ids: string[]) => void | Promise<void>;
  markAllRead: () => void | Promise<void>;
  runAction: (item: NotificationItem, action: NotificationActionId) => void | Promise<void>;
  subscribe: (onChange: () => void) => () => void;
};
```

- `watchlistSource.ts`: items projected from the watchlist snapshot (Rust owns them and their seen state; nothing is copied). `read = upload.seen`. Kind from `liveStatus`. `queue` is omitted while `liveStatus !== "none"`.
- `downloadSource.ts`: items stored in the notification center store (below). Recorded by `recordDownloadNotification(...)` at the existing `deliverUserNotification` call sites.
- A registry `src/notifications/registry.ts` lists the sources in order. Adding a producer later means one new file and one registry line.

### Store and persistence (`src/notifications/notificationCenterStore.ts`)

```ts
type NotificationCenterState = {
  local: NotificationItem[];          // records owned by the center (download source today)
  popoverOpen: boolean;
  tab: NotificationCenterTab;         // "feed" | "channels" | "history" (history reserved)
  filter: "all" | "watchlist" | "download";
};
```

- Main is the only writer. Local items persist in `localStorage` key `ruforge-notification-center-v1`, written on change (debounced 300 ms). Loaded on main startup. Other windows never read or write it.
- Retention: keep at most 150 local items; drop read items older than 30 days; unread items kept until the cap pushes them out oldest first.
- Watchlist items are not persisted here; `watchlist.json` already persists them.
- Recording from another window (mini runs some download UI): `recordNotification` checks `getCurrentWindow().label`; outside main it `emitTo("main", "notification-center-record", item)` and main listens. No-op if the event fails.
- Selectors: `allItems()` merges every source's `items()`, sorted by `createdAt` desc; `unreadCount()` sums unread across sources. Badge = `unreadCount()`.

### History seam

`NotificationCenterTab` already includes `"history"`. The tab bar reads a config array `NOTIFICATION_CENTER_TABS` where `history` has `enabled: false` and is not rendered. The Download history log feature will add its own store and a `DownloadHistoryPanel`, flip `enabled`, and leave the feed alone. Download notifications here are a short feed, not the history log: do not grow them into one.

### Popover rendering (decision, see Decided by planner 1)

- `NotificationCenterPanel` is a pure-props component: `{ items, channels, tab, filter, navMode, onAction, onMarkRead, onMarkAllRead, onTab, onFilter, onClose, ...channel manage callbacks }`. It never imports stores.
- Host A (phase 6), in-page: `NotificationCenterPopover` portals the panel to `document.body` under the bell, wrapped in `data-music-mode="true"` in Music mode.
- Host B (phase 7), overlay: when a YouTube child webview is the active surface (Explorer tab, or Music Explore), the panel renders inside a transparent child webview `notify-overlay` created after the YouTube webviews, exactly like `radialNavOverlayHost.ts`. Main pushes state with `emitTo`, the overlay sends actions back. The Explorer webview is never hidden and never paused.

---

## Decided by planner

Angel is away; these were resolved with the most sensible default. Change them here if Angel disagrees.

1. **Popover above Explorer: transparent child webview overlay (Host B), not hiding the Explorer.** Verified in code: the Explorer pause is not a side effect of hiding; `App.tsx` runs `EXPLORER_PAUSE_MEDIA_SCRIPT` explicitly when leaving the surface. But hiding still blanks the page the user is watching, and whether WebView2 throttles a hidden page's playback is unverified. Shrinking the webview bounds would reflow YouTube's layout under the user. The repo already ships a working overlay for exactly this (`radialNavOverlayHost.ts`, commit "Alt radial menu opens above YouTube webviews via an overlay window"), so the popover reuses that proven pattern. Fallback if the overlay cannot be created (`ensure` returns null): render Host A and hide the Explorer webview for the popover's lifetime WITHOUT running the pause script (a dedicated `explorerCoveredByPopover` flag that skips `pauseExplorerMedia`). Phase 7 must confirm in `tauri dev` that playback keeps going on that fallback path and note the result in the PR comment.
2. **Notification center state lives in main; local items persist in localStorage, watchlist items persist in Rust.** localStorage is main-only by rule, so no cross-webview write races. A file is not needed until Download history, which will have its own store.
3. **Toasts and island notices stay as they are.** The center is additive: every recorded download event still toasts or goes to the island through `deliverUserNotification` exactly as today.
4. **Download events recorded:** finished, failed, timed out, storage hold from the queue (`announceStorageBlocks`), and storage-full refusals from the downloader / Explorer queue button. All storage-full refusals share one id (`download:storage-full`), so repeats bump it to the top and unread instead of stacking.
5. **Opening the popover does not mark anything read.** Rows mark read on their primary action (Queue, Open, Play, Show in folder, Retry) or on the row's "Mark read". "Mark all read" clears every source.
6. **Bell in every mode.** Mode palette via `--accent` under `data-music-mode`; panel surface via new tokens `--rf-popover-bg` / `--rf-popover-raised` in `:root` and `[data-music-mode="true"]`.
7. **Shorts are dropped at ingest** and their ids go into `known_ids` so they never resurface. Primary signal: the RSS `<link rel="alternate">` href contains `/shorts/`. If phase 1 finds that unreliable, use `HEAD https://www.youtube.com/shorts/ID` with redirects off (200 = Short, redirect to `/watch` = video) on new ids only. The Explorer Follow button is hidden on `/shorts/` pages.
8. **Premieres and scheduled streams:** announced when first seen as `premiere` (or `live` if already streaming), labeled with the start time. No second alert when they go live or end. Queue is disabled on those rows ("Available after the premiere"). Auto-download is held; when the poller sees it become a normal video it emits `watchlist-auto-ready` and main enqueues. Upcoming items are not shown on the Library shelf (nothing to download yet). Held items are re-probed for 7 days, then left as they are.
9. **New-upload rule:** id not in `known_ids`, channel `seeded`, and `published_at >= followed_at - 3600`, so reordered or newly public old videos do not resurface.
10. **Auto-download options:** same as the Library feed button (`downloadFeedVideo.ts`): video, never audio-only, preferred quality. If storage blocks, queue nothing and warn once per batch.
11. **Interval lives in `watchlist.json`** because the Rust poller starts before any webview. Options: 15, 30, 60, 180 minutes; default 30. The alerts toggle (`watchlistAlerts`) lives in `RuforgeSettings`.
12. **Channel resolution avoids yt-dlp:** watch links via the cookie-free player endpoint (`youtube_feed.rs`), handles and custom URLs via the channel page canonical link (like `channel_avatar.rs`), yt-dlp through `run_ytdlp_json` (rate gated) only as last fallback.
13. **Rail badge on Videos** shows watchlist unseen only (the shelf is there). The bell badge shows the total unread across sources.
14. **Limits:** 300 followed channels; poller checks at most 5 due channels per 60 s tick; backoff doubles per failure up to 6 h; RSS failures never auto-unfollow.
15. **Island:** the watchlist variant covers uploads only. Download events keep using the existing island notice path.
16. **XML parsing:** add `roxmltree` (no XML crate exists; `reqwest 0.12` with rustls already does). No string-search XML parsing.
17. **Thumbnails:** build `mqdefault.jpg` from the id; RSS gives `hqdefault.jpg`, which is 4:3 letterboxed.

---

## Traps (read before any phase)

- **Mini runs App hooks.** Every watchlist / notification bootstrap in `App.tsx` needs the `getCurrentWindow().label !== "main"` guard (copy the `startMusicPlaylistsFileSync` effect at `App.tsx` ~434). Otherwise mini double-enqueues auto-downloads.
- **Child webview label.** Inside a child webview, `getCurrentWindow().label` returns the parent window (`main`). The radial overlay identifies itself by URL query (`isRadialNavOverlayDocument()` in `src/lib/radialNavOverlayEvents.ts`, routed in `src/main.tsx`). The notify overlay must do the same with `?rfWindow=notify-overlay`, and the main-only guards must also exclude that document.
- **Stacking order.** Child webviews stack in creation order. The overlay must be (re)created after any YouTube webview it needs to cover; copy the `stackedAbove` logic from `radialNavOverlayHost.ts`.
- **Transparent webviews still eat clicks.** Size the overlay to the panel's measured height, not a fixed max.
- **Emit to main only** from Rust (Explorer has event permission).
- **Never hold a `std::sync::Mutex` guard across `.await`** in Rust.
- **Hidden main still runs JS.** Minimize-to-tray hides `main` (`lib.rs` `CloseRequested`), events still arrive, timers are throttled. Polling belongs to Rust, not a main `setInterval`.
- **Portals escape the Music palette.** Set `data-music-mode="true"` on portaled roots in Music mode.

---

## Phases

### Phase 1: Branch, roadmap flag, Rust watchlist core

Goal: branch + draft PR exist; follow / unfollow by UC id works through devtools; RSS parsing (with Shorts drop) is unit-tested.

Files:

- Branch and draft PR per Build protocol step 1.
- `website/src/content/roadmap.json`: on "Channel watchlist and new-upload notifications" add `"roadmapStatus": "progress"`. Nothing else.
- `src-tauri/Cargo.toml` + `Cargo.lock`: run `cargo add roxmltree` in `src-tauri/`.
- `src-tauri/src/commands/music_playlists.rs`: `fn write_atomic` becomes `pub(crate) fn write_atomic`. Nothing else.
- New `src-tauri/src/commands/watchlist/model.rs`: types from the architecture section (leave `live_status` `None`, `scheduled_at` `None`, `duration_sec` `None` for now), plus pure functions:
  - `pub fn is_channel_id(id: &str) -> bool` (same rule as `channel_avatar.rs`; do not change that file).
  - `pub fn thumbnail_for(video_id: &str) -> String`, `pub fn watch_url(video_id: &str) -> String`.
  - `impl WatchlistFile { pub fn snapshot(&self) -> WatchlistSnapshot; pub fn trim_uploads(&mut self, now: i64); pub fn channel_mut(&mut self, id: &str) -> Option<&mut WatchedChannel>; }`
  - `pub fn seed_channel(ch: &mut WatchedChannel, entries: &[FeedEntry])`: every entry id (Shorts too) into `known_ids`, `seeded = true`.
  - `pub fn merge_entries(ch: &mut WatchedChannel, entries: &[FeedEntry]) -> Vec<FeedEntry>`: applies Decided 9, records every unknown id in `known_ids` (cap), returns only non-Short candidates.
- New `src-tauri/src/commands/watchlist/feed.rs`:
  - `pub struct FeedEntry { pub video_id: String, pub channel_id: String, pub channel_title: String, pub title: String, pub published_at: i64, pub short: bool }`
  - `pub fn parse_channel_feed(xml: &str) -> Result<Vec<FeedEntry>, String>` with roxmltree, matching local names (`node.tag_name().name()`): `entry`, `videoId`, `channelId`, `title`, `published`, `link` (`href`), `author/name`. `published` via `chrono::DateTime::parse_from_rfc3339`. `short = href.contains("/shorts/")`.
  - `pub fn parse_feed_title(xml: &str) -> Option<String>` (feed-level `<title>`).
  - `pub enum FeedError { NotFound, Transient(String) }`
  - `pub async fn fetch_channel_feed(client: &reqwest::Client, channel_id: &str) -> Result<(Vec<FeedEntry>, Option<String>), FeedError>` (entries + feed title). 404 is `NotFound`; everything else failing is `Transient`.
- New `src-tauri/src/commands/watchlist/mod.rs`:
  - `pub mod model; pub mod feed;`
  - `pub struct WatchlistState { file: std::sync::Mutex<WatchlistFile>, path: PathBuf, client: reqwest::Client, poke: tokio::sync::Notify }`. Client: 15 s timeout, the browser UA string from `channel_avatar.rs`.
  - `WatchlistState::load(app: &AppHandle) -> WatchlistState`: missing file gives defaults; a corrupt file is renamed `watchlist.json.bad` first.
  - `fn save(&self)` via `crate::commands::music_playlists::write_atomic` + `serde_json::to_string_pretty`. `fn emit_updated(app, &snapshot)`.
  - Commands: `get_watchlist`, `follow_channel`, `unfollow_channel`, `set_channel_auto_download`, `mark_watchlist_seen`, `mark_all_watchlist_seen`, `mark_watchlist_auto_queued`.
  - `follow_channel`: validate id; error "You can follow up to 300 channels." past the cap; already followed is a no-op returning the snapshot. Fetch the feed once: success seeds; failure keeps `seeded = false`. `next_check_at = now + interval*60`. Save, emit, return.
- `src-tauri/src/commands/mod.rs`: `pub mod watchlist;`
- `src-tauri/src/lib.rs` `setup`: after `spawn_removable_drives_watcher(app.handle());` add `app.manage(crate::commands::watchlist::WatchlistState::load(app.handle()));`. Register the commands in `generate_handler!`.

Tests (`#[cfg(test)]` in `feed.rs` and `model.rs`): an Atom fixture with three entries (a `/watch` link, a `/shorts/` link, a title containing `&amp;`); parse asserts; `merge_entries` returns nothing when unseeded, drops the Short but records its id, rejects entries older than `followed_at - 3600`; `known_ids` cap; `snapshot().unseen_count`.

Live check (once, report in the PR comment): follow a channel known to post Shorts, open `watchlist.json` (`%APPDATA%\<identifier>\`) and confirm a Short id is in `known_ids`, proving RSS links carry `/shorts/`. If they do not, implement the HEAD fallback from Decided 7 in `feed.rs` (`pub async fn is_short(client, id) -> Option<bool>`, reqwest with `redirect::Policy::none()`) before closing the phase.

Verification: `cd src-tauri && cargo test watchlist && cargo check`. Devtools: `invoke("follow_channel", { channelId: "UC...", title: "X", handle: null })` returns the channel; restart keeps it; `unfollow_channel` removes it.

Do not touch: frontend, `channel_avatar.rs`.

### Phase 2: Rust channel resolver

Goal: `resolve_watchlist_channel(input)` turns a UC id, `@handle`, channel URL, watch URL or `youtu.be` link into `ResolvedChannel`.

Files:

- `src-tauri/src/commands/youtube_feed.rs`: extract the inline player POST in `get_video_stats` into `pub(crate) async fn fetch_player_response(client: &reqwest::Client, video_id: &str) -> Option<serde_json::Value>`; `get_video_stats` calls it; behavior identical. Make `is_video_id` `pub(crate)` if needed.
- New `src-tauri/src/commands/watchlist/resolve.rs`:
  - `pub enum ChannelInput { Id(String), Handle(String), PagePath(String), Video(String) }`
  - `pub fn classify_input(input: &str) -> Option<ChannelInput>`: bare `UC...`, bare `@name`, and `youtube.com` / `www.` / `m.` / `youtu.be` URLs: `/channel/UC..[/...]`, `/@name[/...]`, `/c/name`, `/user/name`, `/watch?v=`, `/live/ID`, `youtu.be/ID`. `/shorts/` returns `None` (Decided 7). Junk returns `None`.
  - `pub fn channel_id_from_page_html(html: &str) -> Option<String>`: `<link rel="canonical" href=".../channel/UC...">`, then `"externalId":"UC..."`, then `<meta itemprop="identifier" content="UC...">`; validate with `is_channel_id`.
  - `pub fn title_from_page_html(html: &str) -> Option<String>` (`og:title`, unescape `&amp; &quot; &#39; &lt; &gt;`), `pub fn handle_from_page_html(html: &str) -> Option<String>` (`"vanityChannelUrl":"http://www.youtube.com/@x"`).
  - `pub async fn resolve(app: &AppHandle, client: &reqwest::Client, input: &str) -> Result<ResolvedChannel, String>`:
    - `Id`: `fetch_channel_feed` for the title; `NotFound` is "That channel does not exist."
    - `Video`: `fetch_player_response`; `videoDetails.channelId` + `author`.
    - `Handle` / `PagePath`: GET the page with the browser UA and `Accept-Language: en-US`. No id found (consent page, layout change): fallback `crate::commands::downloader::run_ytdlp_json(app, vec!["--flat-playlist".into(), "--playlist-end".into(), "1".into(), "-J".into(), url], "watchlist resolve")`, read `channel_id`, `channel`, `uploader_id`.
- `mod.rs`: `resolve_watchlist_channel(app, state, input)` command; register in `lib.rs`.

User-facing errors: "Paste a YouTube channel or video link." (classify fails), "Could not find that channel." (resolve fails).

Tests: `classify_input` table (12+ cases: trailing `/videos`, query strings, `m.` host, `/shorts/` is `None`, junk); HTML fixtures for all three id sources; unescape.

Verification: `cargo test watchlist && cargo check`. Devtools: a real `@handle/videos` URL and one of its watch URLs resolve to the same `channelId`.

Do not touch: frontend, `run_ytdlp_json`, the rate gate.

### Phase 3: Rust poller, premieres, auto-download hold

Goal: staggered background checks; new uploads recorded with duration and live state; events emitted; held premieres released to auto-download.

Files:

- New `src-tauri/src/commands/watchlist/poller.rs`:
  - `pub fn spawn_watchlist_poller(app: &AppHandle)`: `tauri::async_runtime::spawn` loop. First tick after 20 s, then every 60 s or immediately when `poke` fires (`tokio::select!` over `sleep` and `poke.notified()`).
  - Tick: lock, pick up to 5 channels with `next_check_at <= now` (unseeded first, then oldest), clone ids, unlock. Fetch sequentially with a 1.5 s gap.
  - Apply per result under the lock:
    - Unseeded success: `seed_channel`, nothing surfaced.
    - Seeded success: `merge_entries`; probe each candidate (below); push `WatchlistUpload { seen: false, auto_queued: false, discovered_at: now, .. }`.
    - Success: `last_checked_at = now`, `last_error = None`, `fail_count = 0`, `next_check_at = now + interval*60 + jitter`, jitter via `rand::Rng::gen_range(0..=interval*60/5)`.
    - Failure: `fail_count += 1`; `last_error` "Channel feed not found" for `NotFound`, else "Could not reach YouTube"; `next_check_at = now + min(interval*60 * 2^fail_count, 6 h)`.
  - Re-probe: uploads with `live_status != None` and `discovered_at > now - LIVE_RECHECK_SECS`, at most 10 per tick. When one becomes `None`: update duration; if its channel has `auto_download` and not `auto_queued`, include it in the `watchlist-auto-ready` payload.
  - After the tick: `trim_uploads`, save once, emit `watchlist-updated` if anything changed, `watchlist-new-uploads` if anything surfaced, `watchlist-auto-ready` if anything released.
- `model.rs`: `pub fn probe_from_player(player: &serde_json::Value) -> Probe` where `Probe { live_status: LiveStatus, scheduled_at: Option<i64>, duration_sec: Option<u32> }`. Rules: `videoDetails.isUpcoming == true` is `Upcoming`; `videoDetails.isLive == true` or (`isLiveContent == true` and `lengthSeconds == "0"`) is `Live`; else `None`. `scheduled_at` from `microformat.playerMicroformatRenderer.liveBroadcastDetails.startTimestamp` (RFC 3339). `duration_sec` from `lengthSeconds` when > 0. A failed probe (`None` response) surfaces the upload with `LiveStatus::None` and `duration_sec: None`. Pure and unit-tested.
- `mod.rs`: `set_watchlist_check_interval(minutes)` (clamp; each channel `next_check_at = min(existing, now + new*60)`), `refresh_watchlist_now()` (`AtomicI64` last run, 120 s throttle; set every `next_check_at = now`; `poke.notify_one()`). `follow_channel` pokes when seeding failed. Register in `lib.rs`.
- `lib.rs` `setup`: `crate::commands::watchlist::poller::spawn_watchlist_poller(app.handle());` right after the `manage` line.
- Optional debug logging: add `{ id: "youtube.watchlist", label: "Channel watchlist poller", side: "rust" }` to `src/debug/debugCategories.ts` and log with `crate::rf_log!("youtube.watchlist", ...)`. IDs must match on both sides.

Traps: keep the 5-per-tick cap (after sleep every channel is due). No yt-dlp in the poller. Emit only on change.

Tests: backoff and jitter bounds; `probe_from_player` for VOD, upcoming premiere (with start timestamp), live now, ended stream with length, empty JSON.

Verification: `cargo test watchlist && cargo check`. Manual: in `watchlist.json` delete the newest id from a followed channel's `known_ids`, set `next_check_at` to 0, restart `tauri dev`; within ~90 s `get_watchlist` lists that video with `seen: false` and a `durationSec`. Remove any debug code you added.

Do not touch: frontend UI.

### Phase 4: Frontend watchlist data layer

Goal: main holds a live watchlist mirror; shared actions and URL helpers exist and are tested. No UI.

Files:

- New `src/watchlist/types.ts` (architecture section).
- New `src/watchlist/watchlistStore.ts`: `create()` (not persisted) with `{ snapshot: WatchlistSnapshot | null; islandBatchIds: string[]; islandBatchAt: number }`.
- New `src/watchlist/watchlistSync.ts`: `startWatchlistSync(handlers: { onNewUploads(u: WatchlistUpload[]): void; onAutoReady(u: WatchlistUpload[]): void }): Promise<() => void>`. Register all three listeners first, then `invoke("get_watchlist")`, so nothing is missed in between. Handlers are no-ops until phase 11.
- New `src/lib/storageBlocks.ts`: `storageBlocksNewDownloads(s: Pick<RuforgeStore, "saveToInternal" | "storageStats" | "settings">): boolean`, the exact formula at `App.tsx` ~450. Replace that inline expression with the helper; behavior identical.
- `src/downloadQueue.ts`: add `"watchlistAdd"` and `"watchlistAuto"` to `DownloadEnqueueSource`, each with a short why comment like its siblings.
- New `src/watchlist/watchlistActions.ts` (each invokes, then writes the returned snapshot into the store):
  - `followChannel(ch)`, `unfollowChannel(id)`, `setAutoDownload(id, on)`, `markSeen(ids)`, `markAllSeen()`, `resolveChannel(input)`, `followFromInput(input)`.
  - `enqueueWatchlistUploads(uploads, source: "watchlistAdd" | "watchlistAuto"): { queued: string[]; blocked: boolean }`: if `storageBlocksNewDownloads(useRuforgeStore.getState())`, queue nothing and return `blocked: true`. Otherwise build options exactly like `src/components/library/downloadFeedVideo.ts` (`resolveDownloadOutputDir`, `buildDownloadJobOptions`, `patchDownloadJobOptionsForAudio(..., false, ...)`, snapshot with title / thumbnail / duration) and `enqueueDownload(url, opts, { title, snapshot, enqueueSource: source })` per upload, then one `pumpDownloadQueue()`.
  - `queueUpload(upload)`: `enqueueWatchlistUploads([upload], "watchlistAdd")`; when blocked, `deliverUserNotification({ dedupeKey: "storage-full", body: STORAGE_FULL_NOTIFY, kind: "warning" }, notify)` with the copy from `ExplorerWatchQueueButton.tsx` (move that constant to `src/lib/storageBlocks.ts` and import it in both); on success `markSeen([videoId])`.
  - `openUploadInExplorer(upload)`: `markSeen`; if not on Explorer or in Music mode: `setNavMode("default")` when needed, `setLastExplorerUrl(url)`, `setActiveTab("explorer")` (entering the tab navigates to `lastExplorerUrl`, see `reloadExplorerPage` in `App.tsx`). Already on Explorer: `setLastExplorerUrl(url)` then `invoke("eval_in_webview", { label: await invoke<string>("embedded_explorer_webview_label"), script: explorerNavigateOrReloadScript(url) })`.
- New `src/watchlist/channelUrl.ts` + `channelUrl.test.ts`: `explorerChannelRef(url): { kind: "id"; channelId } | { kind: "handle"; handle } | { kind: "path"; path } | { kind: "video"; videoId } | null` for youtube.com page URLs (same shapes as phase 2; `/shorts/` returns `null`; reuse `extractYouTubeVideoId` from `src/youtubeUrl.ts`). `findFollowed(snapshot, ref, videoChannelId?)` (case-insensitive handle match).
- New `src/watchlist/watchlistSelectors.ts` + test: `unseenUploads(s)`, `shelfUploads(s, libraryIds, limit)` (unseen, `liveStatus === "none"`, not in library), `toFeedVideo(u): FeedVideo` (`timestamp = publishedAt`, `channelVerified: false`, `viewCount: null`, `short: false`).
- `src/App.tsx`: one guarded effect next to the `startMusicPlaylistsFileSync` effect (~434) calling `startWatchlistSync` with no-op handlers, cleaned up on unmount.

Verification: `npx tsc --noEmit`; `npx vitest run src/watchlist`. Manual: follow via devtools `invoke`, the store updates without reload (check with a temporary log, then remove it).

Do not touch: persisted shape of `ruforgeStore.ts`, `downloadFeedVideo.ts` behavior.

### Phase 5: Notification center core (model, store, sources)

Goal: a source-agnostic notification feed exists in main with watchlist and download producers. No UI yet.

Files:

- New `src/notifications/types.ts`: model from the architecture section, plus `NotificationCenterTab = "feed" | "channels" | "history"` and `NOTIFICATION_CENTER_TABS = [{ id: "feed", label: "Notifications", enabled: true }, { id: "channels", label: "Channels", enabled: true }, { id: "history", label: "History", enabled: false }] as const`.
- New `src/notifications/notificationCenterStore.ts`: state from the architecture section; `loadLocal()` / debounced `saveLocal()` against `ruforge-notification-center-v1` (try/catch like `youtubeFeed.ts` cache helpers); `upsertLocal(item)` (replace by id, move to top, force `read: false`), `markLocalRead(ids)`, `markAllLocalRead()`, `pruneLocal(now)` (Decided 2 retention). Pure helpers exported for tests.
- New `src/notifications/recordNotification.ts`: `recordNotification(item)`: in main, `upsertLocal`; elsewhere `emitTo("main", "notification-center-record", item)`. `startNotificationCenter(): Promise<() => void>` (main only): load local, prune, listen for `notification-center-record`.
- New `src/notifications/sources/watchlistSource.ts`: projection per architecture. Actions: `queue` calls `queueUpload`, `open-explorer` calls `openUploadInExplorer`. Subtitle: channel title; for `premiere` "Premieres {formatted scheduledAt}" (use `Intl.DateTimeFormat` with weekday + time), for `live` "Live now".
- New `src/notifications/sources/downloadSource.ts`: `recordDownloadNotification(kind, { jobId, url, title, thumbnail, outputPath, error })` builds the item: id `download:${jobId}` (storage-full refusal: `download:storage-full`, storage hold: `download:storage-block:${ids}`), actions: finished `["play", "show-in-folder"]`, failed / timed-out `["retry"]` (only while the job still exists), blocked `["open-storage-settings"]`. Runners: `play` opens the file the way the library does (find the gallery entry by path in `useRuforgeStore.getState().entries` and call `handlePlayFile`; fall back to `show-in-folder` if not found), `show-in-folder` calls `openInFileManager(path)` from `src/openInFileManager.ts`, `retry` calls `retryDownloadJob(jobId)`, `open-storage-settings` opens Settings on the storage section (find how `SettingsView` is opened from the store and reuse it).
- New `src/notifications/registry.ts` + `src/notifications/selectors.ts`: `allItems()`, `unreadCount()`, `useNotificationItems()` / `useUnreadCount()` hooks that subscribe to every source.
- Recording call sites (add one call next to each existing `deliverUserNotification`, do not change the toast calls):
  - `src/store/downloadQueueSlice.ts`: finished (~1560, use `finishedJobBefore` for title / thumbnail and `payload.outputPath`), timed out (~1571), failed (~1581), `announceStorageBlocks` (~159).
  - `src/components/downloader/useDownloaderView.ts` (~1113, ~1335, ~1735) and `src/components/ExplorerWatchQueueButton.tsx` (~145): storage-full refusal.
- `src/App.tsx`: guarded effect calling `startNotificationCenter()`.

Tests (`src/notifications/*.test.ts`): upsert moves to top and marks unread; retention; storage-full coalescing; watchlist projection (kind from liveStatus, no `queue` action on upcoming); `unreadCount` sums sources.

Verification: `npx tsc --noEmit`; `npx vitest run src/notifications src/watchlist`. Manual: finish a download, then in devtools `localStorage.getItem("ruforge-notification-center-v1")` holds a `download-finished` item.

Do not touch: `systemNotify.ts` behavior, toast copy.

### Phase 6: Title bar bell + notification popover (in-page)

Goal: bell with unread badge in every mode; clicking opens the feed with per-row actions. Covers every surface except while a YouTube child webview is active (phase 7).

Read first: restrictions.md Tooltips, Popups, Scrollbars, Motion; `design-style-anti-patterns.mdc`.

Files:

- `src/index.css`: tokens `--rf-popover-bg: #1D1613; --rf-popover-raised: rgb(255 255 255 / 0.04);` in `:root`, overridden in `[data-music-mode="true"]` with `--rf-popover-bg: #0f0f0f; --rf-popover-raised: rgb(255 255 255 / 0.05);` (same surfaces `musicMenuUi.tsx` uses).
- New `src/components/notifications/NotificationBadge.tsx`: `absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[9px] font-black tabular-nums text-black/85`, `9+` past 9, hidden at 0. Position via a `className` prop.
- New `src/components/notifications/NotificationBellButton.tsx`: `titlebarIconButtonClass` from `TitlebarHoverButton.tsx` in a `relative flex h-10 w-10` slot. `tabler:bell` 18px; `tabler:bell-filled` in accent while open. Badge `right-1 top-1.5` with `useUnreadCount()`. `data-tooltip`: "Notifications" or "N unread". Toggles `popoverOpen`. Exposes its DOM rect for anchoring (a ref registered in a tiny module `bellAnchor.ts`).
- New `src/components/notifications/NotificationCenterPanel.tsx` (pure props, architecture section): header with title "Notifications", tab bar from `NOTIFICATION_CENTER_TABS` (enabled only; active `text-stone-100 bg-[color:var(--rf-popover-raised)] rounded-lg`, inactive `text-stone-500`), filter chips All / Uploads / Downloads on the feed tab, text-only "Mark all read" when unread > 0. Body scroller with `rf-scrollbar`. Channels tab shows a placeholder until phase 8. Keep under ~120 JSX lines by splitting:
  - `NotificationRow.tsx`: 16:9 thumb `h-[54px] w-24 rounded-[10px] object-cover` (`referrerPolicy="no-referrer"`), or a kind icon tile on `--rf-popover-raised` when there is no thumbnail (error: `lucide CircleX` rose, blocked: `lucide AlertTriangle` amber, finished: `lucide CircleCheck` accent). Title 13px semibold 2-line clamp; meta 11px stone-500 via `MetaParts` (`subtitle · formatAge(createdAt / 1000)`); premiere / live rows get a small chip "Premiere" / "Live" in accent tint. Unread rows on `bg-[color:var(--rf-popover-raised)] rounded-xl`; read rows no fill. No dividers. Action icon buttons with `data-tooltip`: queue `lucide Download` (disabled with tooltip "Available after the premiere" when not offered), open-explorer `tabler:brand-youtube`, play `lucide Play`, show-in-folder `lucide FolderOpen`, retry `lucide RotateCcw`, open-storage-settings `lucide HardDrive`, mark read `lucide Check` (unread only).
  - `NotificationEmpty.tsx`: "You're all caught up." with a text button "Follow a channel" switching to Channels.
- New `src/components/notifications/NotificationCenterPopover.tsx` (Host A): portal to `document.body`; root carries `data-music-mode="true"` when `navMode === "music"`; `fixed`, right-aligned under the bell rect (recompute on open and window resize; `style={}` for those coordinates only). Width 392, max height `min(560px, 100vh - 72px)`. Panel `bg-[color:var(--rf-popover-bg)] rounded-[20px] shadow-[0_18px_48px_rgba(0,0,0,0.5)]` (a float shadow is allowed). Motion: opacity + `y: -6` + scale 0.98 to 1, 0.18 s, ease `[0.16, 1, 0.3, 1]`, `AnimatePresence`, 0 s with reduced motion. Close on outside pointerdown, Escape, and `activeTab` / `navMode` change. Wires the panel to the stores and runs `source.runAction`, then `markRead([id])` for primary actions.
- `src/App.tsx` `WindowControls`: render `<NotificationBellButton />` before the USB export button, in every mode. Render `<NotificationCenterPopover />` once in the app root. For now it renders only when no YouTube child webview is the active surface (compute `youtubeSurfaceActive` from `explorerSurfaceActive` and the Music Explore flag that `MusicShell.tsx` passes to `setRadialNavSurfaceActive`; the simplest source is `activeRadialNavSurface() != null` from `radialNavOverlayHost.ts`, read-only use). When a YouTube surface is active in this phase, the bell still toggles `popoverOpen` but nothing renders; phase 7 fills that in.

Check: `WindowControls` must sit inside the element carrying `data-music-mode` (`App.tsx` ~1730) so the bell's accent turns red in Music mode. If it does not, pass `navMode` and set the attribute on the `WindowControls` root.

Verification: `npx tsc --noEmit`, `npx vitest run src/notifications`. Manual in `tauri dev`: Library mode gold, Music mode red on black; badge counts match; Queue adds a job; Open lands in Explorer on the video; Play plays a finished download; Retry re-queues a failed one; Mark all read clears the badge; tooltips are the house pill.

Do not touch: `UpdaterStatusIndicator`, `YouTubeProfileChip`, window buttons, `explorerSurfaceActive`.

### Phase 7: Popover overlay above YouTube webviews

Goal: on the Explorer tab and in Music Explore, the popover renders above the YouTube page without hiding or pausing it.

Read first: `src/lib/radialNavOverlayHost.ts`, `src/lib/radialNavOverlayEvents.ts`, `src/RadialNavOverlayApp.tsx`, `src/main.tsx`. Copy the pattern into new files; do not edit the radial files.

Files:

- New `src/lib/notifyOverlayEvents.ts`: `NOTIFY_OVERLAY_LABEL = "notify-overlay"`, `NOTIFY_OVERLAY_QUERY = "notify-overlay"`, `isNotifyOverlayDocument()`, event names `notify-overlay-state` (main to overlay), `notify-overlay-action` (overlay to main), `notify-overlay-ready`, `notify-overlay-size` (overlay reports measured height), `notify-overlay-close`. Payload `NotifyOverlayState = { open: boolean; navMode: NavMode; accent: string; items: NotificationItem[]; channels: WatchedChannel[]; tab; filter }`. `accent` is read in main with `getComputedStyle(appShellEl).getPropertyValue("--accent")` so custom accents carry over. Actions mirror the panel callbacks as a discriminated union.
- New `src/lib/notifyOverlayHost.ts`: `ensureNotifyOverlay()`, `showNotifyOverlay(rect)`, `hideNotifyOverlay()`, `pushNotifyOverlayState(state)`, with the `stackedAbove` recreate logic and hidden-on-create behavior copied from the radial host. Create with `transparent: true`, `focus: true` on show (call `webview.setFocus()` after `show()`), same hardware-acceleration args lookup. On `notify-overlay-size`, `setSize(new LogicalSize(392, height))`.
- New `src/NotifyOverlayApp.tsx`: sets `document.documentElement` transparent background, mounts `AppTooltipLayer` and `RfScrollbarHost`, listens to state, renders `NotificationCenterPanel` in a root with `data-music-mode` per `navMode` and `style={{ "--accent": accent }}`. Reports height with a `ResizeObserver`. Emits `notify-overlay-close` on `window` blur and Escape. Same enter motion as Host A.
- `src/main.tsx`: route `isNotifyOverlayDocument()` to `NotifyOverlayApp`, the same way the radial overlay is routed; exclude it from main-only boot work.
- Main-only guards from phases 4 and 5: also skip when `isNotifyOverlayDocument()` (the child webview reports label `main`).
- `src-tauri/capabilities/default.json`: add `"notify-overlay"` to `"webviews"` next to `"radial-nav-overlay"`.
- `NotificationCenterPopover.tsx`: when `youtubeSurfaceActive`, call the overlay host instead of the portal: on open `ensureNotifyOverlay()`; if it returns a webview, position it at the anchored rect (main window logical coordinates, same math as Host A), push state on every store change, apply incoming actions with the same runners. On `notify-overlay-close`, set `popoverOpen = false` and ignore a bell click within 250 ms of that close (blur fires before the bell's click, which would otherwise reopen it).
- Fallback (Decided 1): if `ensureNotifyOverlay()` returns `null`, render Host A and set a new `explorerCoveredByPopover` flag. In `App.tsx`, add `!explorerCoveredByPopover` to `explorerSurfaceActive` (~856) and make the leave path skip `pauseExplorerMedia()` when the reason for leaving is that flag (track the previous flag in a ref next to `prevExplorerSurfaceRef`). Music Explore has no equivalent hide path to reuse, so on that surface the fallback is Host A under the YouTube Music webview plus a `debugLog` warning; the overlay path is expected to work there because the radial overlay already covers it.

Verification: `npx tsc --noEmit`. Manual in `tauri dev`: play a video in Explorer, open the bell: the video keeps playing and stays visible around the panel; actions work from the overlay; clicking the YouTube page closes the popover; clicking the bell again toggles cleanly; switching to Music Explore and opening the bell works with red palette. Force the fallback once (temporarily make `ensureNotifyOverlay` return null, then revert) and confirm playback continues; report the result in the PR comment.

Do not touch: radial nav files, Explorer bounds sync logic beyond the fallback flag.

### Phase 8: Channels tab (manage follows)

Goal: follow by pasted link and manage followed channels from the notification center.

Files (all props-only so both hosts render them):

- New `src/components/notifications/channels/ChannelAddField.tsx`: input `rounded-[var(--radius-input)] bg-[color:var(--rf-popover-raised)]`, placeholder "Paste a channel or video link", Enter or "Follow" button runs `onFollowInput(input)` (Host A: `followFromInput`; Host B: an overlay action). Pending spinner; errors under the field in `text-[11px] text-amber-300/90` using the Rust error string.
- New `src/components/notifications/channels/ChannelRow.tsx`: `ChannelAvatar` (`src/components/library/VideoByline.tsx`, `h-9 w-9`; in the overlay it fetches its own avatar through `get_channel_avatar`, which is fine because that command is cookie-free and cached), title + handle, "Checked 12 minutes ago" (`formatAge`) or `lastError` in amber. "Auto-download" toggle (copy the `ToggleSlot` look from `SettingsView.tsx` into `src/components/notifications/channels/MiniToggle.tsx` if it is not exported; accent from `--accent`). Unfollow as text-only hover action.
- New `src/components/notifications/channels/ChannelsPanel.tsx`: field, channels sorted by title, footer text button "Check now" (`refresh_watchlist_now`, disabled for 120 s after use). Empty copy: "Not following anyone yet."
- `NotificationCenterPanel.tsx`: render `ChannelsPanel` in the Channels tab. Extend the overlay action union for follow input, auto-download toggle, unfollow and check now.

Verification: `npx tsc --noEmit`. Manual: follow via `@handle` link, `/channel/UC` link and a watch link; duplicate is a no-op; auto-download persists across restart; unfollow removes that channel's items from the feed; works in both hosts.

Do not touch: Rust (unless you find a bug; say so in the PR comment).

### Phase 9: Explorer Follow toggle

Goal: on a YouTube channel page or watch page in Explorer, a Follow / Following toggle sits in the title band next to the queue button.

Files:

- New `src/components/watchlist/ExplorerFollowButton.tsx`, modeled on `src/components/ExplorerWatchQueueButton.tsx` (slot sizes, left hint motion, three-icon crossfade):
  - `explorerChannelRef(lastExplorerUrl)`; hidden when `null` (includes `/shorts/`).
  - `kind: "video"`: `invoke<VideoStats[]>("get_video_stats", { videoIds: [id] })`, cached in a module `Map` so the 800 ms URL poll (`App.tsx` ~1613) never refetches.
  - `kind: "handle" | "path"`: state from `findFollowed`; unknown shows Follow and resolves on click.
  - Icons: `ic:round-person-add-alt` / `ic:round-how-to-reg` / hover `ic:round-person-remove`. Tooltips: "Follow {channel} for new uploads" / "Following {channel}. Click to unfollow".
  - Click: read the live URL with `invoke<string>("get_embedded_explorer_webview_url")` first (like the queue button), then `followFromInput(url)` or `unfollowChannel`. Left hint "Following" / "Unfollowed" / error.
- `src/App.tsx` `WindowControls`: `<ExplorerFollowButton />` right before `<ExplorerWatchQueueButton />`, same `showExplorerQueueToolbar` condition.

Trap: Explorer actions live only in the title band (`h-10`, `z-[100]`).

Verification: `npx tsc --noEmit`. Manual: channel home, `/videos` tab and a watch page show the right state; follow from a watch page then open the channel page shows Following; hidden on a Short.

Do not touch: `ExplorerTitlebarNav`, Explorer bounds sync.

### Phase 10: Library entry points, shelf, rail badge

Goal: follow from the library; "New from channels you follow" on Library home; unread badge on the Videos rail item.

Files:

- New `src/components/watchlist/FollowChannelButton.tsx`: pill `h-8 rounded-full px-3 text-[12px] font-semibold`; not following `bg-white/[0.07] text-stone-200 hover:bg-[color:var(--accent)] hover:text-stone-900`; following `text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent),transparent_88%)]` "Following" (hover "Unfollow"). Props `{ channelId, channel }`.
- `src/components/library/homeSections.ts`: add `{ kind: "watchlist"; key: string; videos: FeedVideo[] }` to `HomeSection`, a `{ kind: "watchlist" }` plan step right after the first `rows` step, and a `watchlist: FeedVideo[]` input to `composeHomeSections` (push only when non-empty). Update `homeSections.test.ts`; add a shelf case.
- `src/components/library/LibraryHome.tsx`: `watchlist` case with `<SectionTitle>New from channels you follow</SectionTitle>` and one row of existing `FeedVideoCard`s (unchanged component). In the `channel` section title add `<FollowChannelButton>` with `ml-auto` when `section.channelId` exists.
- `src/components/MediaView.tsx`: in `homeMode`, `shelfUploads(snapshot, libraryVideoIds, columns).map(toFeedVideo)` into `composeHomeSections`; also filter those ids out of `feed.items` so nothing shows twice.
- `src/components/library/LibraryVideoCard.tsx` `menuItems`: when `file.youtube?.channelId` and `file.youtube.channel` exist, add "Follow {channel}" / "Unfollow {channel}" (`lucide UserPlus` / `UserCheck`, 14px, `className="shrink-0 ml-1.5"`).
- `src/components/navigation/AppSidebarRail.tsx`: on the `media` item render `<NotificationBadge className="right-1 top-1" count={unseenCount} />` using the watchlist store's `unseenCount` (Decided 13).

Note: `FeedVideoCard` downloads through `downloadFeedVideo` (`enqueueSource: "libraryFeedAdd"`). Fine for the shelf; do not fork the card.

Verification: `npx tsc --noEmit`; `npx vitest run src/components/library src/watchlist`. Manual: shelf appears with unseen uploads and hides when empty; premieres are not on the shelf; follow from "More from" and from the card menu; rail badge matches unseen uploads.

Do not touch: `FeedVideoCard.tsx`, `useYoutubeFeed.ts`.

### Phase 11: Watchlist alerts + auto-download

Goal: toasts when focused, island batch when not, auto-queue on opted-in channels, premieres auto-queued once they become normal videos.

Files:

- `src/systemNotify.ts`: `export` the existing `isAnyRuforgeWindowFocused`. No behavior change.
- `src/store/types.ts`: `watchlistAlerts: boolean` in `RuforgeSettings` (why comment), `DEFAULT_SETTINGS.watchlistAlerts = true`, `watchlistAlerts: merged.watchlistAlerts !== false` in `loadMergedSettings`.
- New `src/watchlist/watchlistAlerts.ts`:
  - `watchlistAlertCopy(uploads, autoQueued: number): string` (pure): one upload "New from {channel}: {title}"; a premiere "{channel} scheduled a premiere: {title}"; one channel "{n} new uploads from {channel}"; otherwise "{n} new uploads from channels you follow"; append " Downloading now." when `autoQueued > 0`.
  - `handleNewUploads(uploads)`: dedupe with `claimUserNotification("watchlist:" + ids.join(","))`. Auto: uploads whose channel has `autoDownload`, `liveStatus === "none"`, not already in the library (`findLibraryDuplicate(url, entries)` when `entries` is loaded). `enqueueWatchlistUploads(list, "watchlistAuto")`; blocked: `deliverUserNotification({ dedupeKey: "watchlist-storage-full", kind: "warning", body: "Storage limit reached. {n} new uploads from channels you follow were not downloaded." }, notify)` and `recordDownloadNotification("download-blocked", ...)` with id `download:storage-full`; queued: `invoke("mark_watchlist_auto_queued", { videoIds })`. Then alerts only if `settings.watchlistAlerts`: focused, `notify(copy, "info")`; not focused, append ids to `islandBatchIds` and set `islandBatchAt = Date.now()`.
  - `handleAutoReady(uploads)`: same auto path, no alert (Decided 8).
- `src/App.tsx`: pass both handlers into `startWatchlistSync`.

Trap: do not use `deliverUserNotification` for the unfocused upload case; it would push a plain text notice instead of the watchlist island.

Tests: `watchlistAlertCopy` cases.

Verification: `npx tsc --noEmit`; `npx vitest run src/watchlist`. Manual with the phase 3 trick: focused app shows one toast; an auto-download channel gets a queued job; storage over the cap (lower the limit in Settings) queues nothing, warns once and adds a blocked item to the center.

Do not touch: `downloadQueueSlice.ts` (beyond phase 5's calls).

### Phase 12: Desktop island watchlist variant

Goal: while main is not focused, new uploads show on the desktop island. Collapsed: stacked channel avatars + "N new uploads". Expanded: rows with thumb / title / channel and Queue / Open, plus Mark all seen.

Read first: `src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`, `IslandUpdateContent.tsx` (collapsed vs expanded pair), `IslandDownloadContent.tsx`, `IslandOverlayApp.tsx`, `useDesktopIslandOverlay.ts`, `desktopIslandBridge.ts`.

Files:

- New `src/components/island/IslandWatchlistContent.tsx`:
  - `export type IslandWatchlist = { key: string; count: number; faces: { src: string | null; initial: string }[]; rows: { videoId: string; title: string; channel: string; thumbnail: string; upcoming: boolean }[]; takeover: boolean }` (faces up to 3, rows up to 6).
  - `islandWatchlistCollapsedWidth(count): number` (about 240); `ISLAND_WATCHLIST_EXPANDED_DIMENSIONS = { width: 350, height: 248, borderRadius: 24 } as const`.
  - `IslandWatchlistCompactContent`: `pointer-events-none`; faces `h-6 w-6 rounded-full object-cover`, overlapping `-ml-2` with a ring in the island shell color, initials on `bg-white/10` without `src`; "1 new upload" / "N new uploads" 12px `text-stone-100`. Motion like `IslandDownloadContent`.
  - `IslandWatchlistExpandedContent({ watchlist, onQueue, onOpen, onMarkAllSeen })`: `pointer-events-auto absolute inset-0 flex flex-col p-3.5`, `onClick={(e) => e.stopPropagation()}` like the update panel. Header: faces + count + text action "Mark all seen". Up to 3 rows (thumb `h-9 w-16 rounded-lg object-cover`, title 12px truncate, channel 10px stone-500), each with Queue (hidden on upcoming rows) and Open icon buttons with `data-tooltip`. "+N more in RuForge" line that restores main when more than 3. `scrollbar-none` (island exception). No dividers. Accent from `content.accentColor` like the other island parts.
- `src/components/island/DynamicIsland.tsx`: add `"watchlist" | "watchlist-expanded"` to `IslandState` and `ISLAND_DIMENSIONS` (`watchlist`: 240 x 36, radius 18; `watchlist-expanded`: the constant). Optional props `watchlist`, `onWatchlistQueue`, `onWatchlistOpen`, `onWatchlistMarkAllSeen`. Render both contents inside the existing `AnimatePresence` (keys `watchlist-compact` / `watchlist-expanded`). Notice still wins over collapsed watchlist; update mode logic untouched.
- `src/lib/desktopIslandBridge.ts`: `watchlist: IslandWatchlist | null` on `DesktopIslandStatePayload`; controls `{ type: "watchlistQueue"; videoId }`, `{ type: "watchlistOpen"; videoId }`, `{ type: "watchlistMarkAllSeen" }`; `applyDesktopIslandControl` cases call `queueUpload`, `openUploadInExplorer`, `markAllSeen` (look the upload up in `useWatchlistStore.getState().snapshot`).
- New `src/watchlist/islandWatchlist.ts` + test: `buildIslandWatchlist(state, avatarSrc, now): IslandWatchlist | null` from `islandBatchIds` still unseen; `takeover = now - islandBatchAt < 8000`. Avatar src resolved in main (`invoke("get_channel_avatar")` + `convertFileSrc`, module cache); the island never fetches.
- `src/hooks/useDesktopIslandOverlay.ts` (small diff): subscribe to `useWatchlistStore` and re-sync; `const watchlist = focused ? null : buildIslandWatchlist(...)`; add to payload and to the hide condition; clear `islandBatchIds` when main becomes focused; schedule one re-sync when `takeover` ends.
- `src/IslandOverlayApp.tsx`: replace `userExpanded` with `expandedTarget: "music" | "watchlist" | null` (music behavior identical). State order: watchlist expanded, music expanded, notice, `watchlist` when `takeover || !hasSession`, compact, download, idle. Shell click in `watchlist` expands it. Collapse on Escape / blur / focus loss and when `watchlist` becomes null. Bounds `{ width: 380, height: 272 }` when watchlist-expanded (Rust clamps to 280). Open calls `restoreMainFromDesktopIsland()` then emits `watchlistOpen`.
- `DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`: short "Watchlist variant" section (states, priority, controls).

Traps: the island gets data only from the payload and acts only through controls. `ActivityIsland` also renders `DynamicIsland`; the new props are optional, leave it alone. Do not raise the Rust island max size.

Verification: `npx tsc --noEmit`; `npx vitest run src/watchlist`. Manual: minimize to tray, force a new upload (phase 3 trick): collapsed pill with avatars and count; click expands; Queue adds a job; Open restores main on the video; Mark all seen hides the pill and clears the badge; with music playing, the watchlist pill shows ~8 s then music returns and still expands as before.

Do not touch: `island_overlay.rs`, `IslandUpdateContent.tsx`, music expanded content.

### Phase 13: Settings, polish, Unreleased log

Goal: settings, a polish pass, changelog entries.

Files:

- `src/components/SettingsView.tsx`: new `<SettingsSection title="Notifications" keywords="follow subscribe channel watchlist new uploads bell">` after the section containing "YouTube feed in Video Library" (~1792):
  - "New upload alerts": `ToggleSlot` bound to `watchlistAlerts`. Description: "Shows a notice when a channel you follow posts. In the background it appears on the desktop island."
  - "Check followed channels": `CustomSelect` "Every 15 minutes" / "Every 30 minutes" / "Every hour" / "Every 3 hours" mapped to 15 / 30 / 60 / 180, via `set_watchlist_check_interval`, value from the snapshot.
  - "Followed channels": button "Manage" that closes Settings and opens the popover on the Channels tab.
  If the block passes ~40 JSX lines, extract `src/components/settings/NotificationsSettingsSection.tsx` like `CompanionSettingsSection.tsx`.
- Polish against `design-style-anti-patterns.mdc`: no dividers, no native `title`, 16:9 `object-cover`, no glow, reduced motion in both popover hosts and the island, Music mode red everywhere the bell and popover appear, no Shorts anywhere.
- Unreleased log, two entries. Write `.shipped-entry.txt` at the repo root with the file-write tool (not the shell):
  ```
  Explorer: Follow YouTube channels from Explorer, the library or a pasted link, see their new uploads and premieres on Library home and the desktop island, and optionally auto-download them.
  src-tauri/src/commands/watchlist/mod.rs
  src/watchlist/watchlistActions.ts
  src/components/island/IslandWatchlistContent.tsx
  ```
  Run `node scripts/shipped.mjs add`. Then write it again:
  ```
  Notifications: New notification center in the title bar, in every mode, collects new uploads and download results with one-click actions.
  src/notifications/notificationCenterStore.ts
  src/components/notifications/NotificationCenterPanel.tsx
  ```
  Run `node scripts/shipped.mjs add` again. Never paste the sentence on the command line; never open `shipped.jsonl`.
- Do not flip the roadmap row to Finished (release does that). Tick phase 13, commit, push, comment, and in the PR comment say the branch is ready for Angel's review.

Verification: `cd src-tauri && cargo check && cargo test watchlist`; `npx tsc --noEmit`; `npx vitest run`. Full manual pass: follow from all entry points, change the interval, alerts off (no toast, no island, badges still update), restart keeps follows, read state and download items.
