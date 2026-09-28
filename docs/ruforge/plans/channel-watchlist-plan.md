# Channel watchlist and new-upload notifications: build plan

Status: planned. Roadmap row: `website/src/content/roadmap.json` "Channel watchlist and new-upload notifications" (Explorer, Medium).

Each phase below is self-contained. Read "Context for the builder" first, then only your phase. Do not start a phase before the previous one passes its verification.

---

## Context for the builder (read cold)

RuForge is a Windows desktop app: Tauri v2 + Rust backend (`src-tauri/`), React 19 + TypeScript + Zustand + Tailwind v4 frontend (`src/`), yt-dlp + ffmpeg. The downloader is the product. Read `STATE.md` and root `AGENTS.md` before touching anything.

What we are building: the user follows YouTube channels. RuForge checks each followed channel's public RSS feed in the background. New uploads show up in four places: a notification bell in the title bar (popover with Queue / Open / Mark seen, plus channel management), a "New from channels you follow" shelf on Library home, an unread badge on the sidebar rail, and (when the app is hidden, minimized or unfocused) the desktop island with a collapsed and an expanded state. Each channel can opt into auto-download, which enqueues new uploads into the existing download queue.

Webviews you will meet:

- `main`: the app. Owns the Zustand store (`src/store/ruforgeStore.ts`), the download queue, and all watchlist UI.
- `mini`: mini player. Runs `App.tsx` hooks too (early return happens after hooks). Watchlist code must not run there.
- `island`: the desktop island overlay window (`src/IslandOverlayApp.tsx`, Rust `commands/island_overlay.rs`). It has no store. Main pushes it a payload (`desktop-island-state`) and it sends controls back (`desktop-island-control`).
- Explorer child webview (`explorer-view`): the real youtube.com page. It paints on top of the main column. It has Tauri event permission (`src-tauri/capabilities/music-explore-webview.json`), so never broadcast private data with `app.emit`; use `emit_to` main.

Zustand does not span webviews. Cross-webview sync is only Tauri `emit` / `listen`.

Repo rules that bite (full list in `AGENTS.md`):

- No emdashes anywhere: code, comments, UI copy, commit messages.
- Comments only for why, never what.
- Extract components before ~120 JSX lines. `App.tsx`, `SettingsView.tsx`, `useDesktopIslandOverlay.ts` are already huge: add a few lines there, put logic in new files.
- Tailwind + tokens. `style={}` only for dynamic values. No css-in-js.
- Hover labels via `data-tooltip` (served by `TooltipLayer`). Never the `title` attribute.
- Custom widgets, never native (select: `CustomSelect` in `SettingsView.tsx`; scroll: `rf-scrollbar` class).
- Palettes: Library / downloads / title bar use `var(--accent)` (sand gold) on warm brown. Music is red on black. Do not put watchlist chrome in Music mode.
- Design: read `.cursor/rules/design-style-anti-patterns.mdc` and `.cursor/skills/ruforge-design/restrictions.md` (Tooltips, Popups, Scrollbars, Motion blocks) before UI phases. No divider lines between list rows, no glow, no accent-bar section labels, no letterboxed thumbnails.
- Do not touch hero skins (`src/components/player/heroSkins/`) or the radial nav overlay (`RadialNavOverlay.tsx`, `radial_nav_bridge`).
- Do not add an OS notification plugin. Background alerts go through the island.
- Do not log to Unreleased until the last phase.

Commands you will run:

- Rust: `cd src-tauri && cargo check` and `cargo test watchlist`
- TS: `npx tsc --noEmit` (repo root) and `npx vitest run <path>`
- App: `npx tauri dev` (do not use `npm run dev:app` from bash, it is PowerShell)
- Devtools console in `tauri dev` main window: `await window.__TAURI_INTERNALS__.invoke("get_watchlist")`

---

## Final architecture

### Data flow

1. Rust owns `app_data_dir()/watchlist.json`. Only Rust writes it.
2. Rust poller (async task) fetches `https://www.youtube.com/feeds/videos.xml?channel_id=UC...` with reqwest, no cookies, no yt-dlp. RSS does not go through the yt-dlp rate gate.
3. On change Rust emits to main: `watchlist-updated` (full snapshot) and, only for genuinely new uploads, `watchlist-new-uploads`.
4. Main hydrates a standalone Zustand store (`src/watchlist/watchlistStore.ts`) via `get_watchlist` and listens to both events. All mutations go through Rust commands, which reply with a fresh snapshot.
5. Main decides notifications (toast when focused, island batch when not) and auto-download (enqueue through the existing queue).
6. Main builds an `IslandWatchlist` payload field for the island. The island sends `watchlist*` controls back to main.

### Rust types (`src-tauri/src/commands/watchlist/model.rs`)

All structs `#[derive(Serialize, Deserialize, Clone, Debug)]` with `#[serde(rename_all = "camelCase")]`. Use `#[serde(default)]` on every field that is not in version 1, so older files still load.

```rust
pub const WATCHLIST_FILE_VERSION: u32 = 1;
pub const MAX_CHANNELS: usize = 300;
pub const KNOWN_IDS_CAP: usize = 60;
pub const UNSEEN_CAP: usize = 100;
pub const SEEN_KEEP: usize = 100;
pub const SEEN_KEEP_SECS: i64 = 14 * 86_400;
pub const DEFAULT_INTERVAL_MIN: u32 = 30;
pub const MIN_INTERVAL_MIN: u32 = 15;
pub const MAX_INTERVAL_MIN: u32 = 360;

pub struct WatchlistFile {
    pub version: u32,
    pub prefs: WatchlistPrefs,
    pub channels: Vec<WatchedChannel>,
    pub uploads: Vec<WatchlistUpload>,
}

pub struct WatchlistPrefs {
    pub check_interval_min: u32, // clamp MIN..=MAX
}

pub struct WatchedChannel {
    pub channel_id: String,          // 24-char UC id, validated
    pub title: String,
    pub handle: Option<String>,      // "@name" without trailing path, lowercase compare
    pub followed_at: i64,            // unix secs
    pub auto_download: bool,
    pub hide_shorts: bool,
    pub seeded: bool,                // false until first successful fetch marks existing videos known
    pub known_ids: Vec<String>,      // newest first, cap KNOWN_IDS_CAP
    pub pending_ids: Vec<String>,    // upcoming premieres / live now, re-probed (phase 3)
    pub last_checked_at: Option<i64>,
    pub last_error: Option<String>,
    pub fail_count: u32,
    pub next_check_at: i64,
}

pub struct WatchlistUpload {
    pub video_id: String,
    pub channel_id: String,
    pub channel_title: String,
    pub title: String,
    pub url: String,                 // canonical https://www.youtube.com/watch?v=ID
    pub thumbnail: String,           // https://i.ytimg.com/vi/ID/mqdefault.jpg (16:9)
    pub published_at: i64,
    pub discovered_at: i64,
    pub short: bool,
    pub duration_sec: Option<u32>,
    pub seen: bool,
    pub auto_queued: bool,
}

/// What the webview gets. No known_ids / pending_ids / next_check_at.
pub struct WatchlistSnapshot {
    pub channels: Vec<WatchedChannelView>,
    pub uploads: Vec<WatchlistUpload>,   // newest published first, hidden Shorts filtered out
    pub unseen_count: u32,               // counts only what `uploads` contains
    pub check_interval_min: u32,
}

pub struct WatchedChannelView {
    pub channel_id: String,
    pub title: String,
    pub handle: Option<String>,
    pub followed_at: i64,
    pub auto_download: bool,
    pub hide_shorts: bool,
    pub last_checked_at: Option<i64>,
    pub last_error: Option<String>,
}

pub struct NewUploadsPayload { pub uploads: Vec<WatchlistUpload> }

pub struct ResolvedChannel { pub channel_id: String, pub title: String, pub handle: Option<String> }
```

### TS types (`src/watchlist/types.ts`)

Mirror of the Rust views, camelCase:

```ts
export type WatchedChannel = {
  channelId: string;
  title: string;
  handle: string | null;
  followedAt: number;
  autoDownload: boolean;
  hideShorts: boolean;
  lastCheckedAt: number | null;
  lastError: string | null;
};

export type WatchlistUpload = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: number;
  discoveredAt: number;
  short: boolean;
  durationSec: number | null;
  seen: boolean;
  autoQueued: boolean;
};

export type WatchlistSnapshot = {
  channels: WatchedChannel[];
  uploads: WatchlistUpload[];
  unseenCount: number;
  checkIntervalMin: number;
};

export type ResolvedChannel = { channelId: string; title: string; handle: string | null };

export const WATCHLIST_UPDATED_EVENT = "watchlist-updated";
export const WATCHLIST_NEW_UPLOADS_EVENT = "watchlist-new-uploads";
```

### Commands (all in `commands/watchlist/mod.rs`, registered in `lib.rs` `generate_handler!`)

| Command | Args | Returns |
|---|---|---|
| `get_watchlist` | none | `WatchlistSnapshot` |
| `follow_channel` | `channelId, title, handle?` | `WatchlistSnapshot` (seeds before returning, see phase 1) |
| `unfollow_channel` | `channelId` | `WatchlistSnapshot` (drops its uploads) |
| `set_channel_auto_download` | `channelId, enabled` | `WatchlistSnapshot` |
| `set_channel_hide_shorts` | `channelId, enabled` | `WatchlistSnapshot` |
| `mark_watchlist_seen` | `videoIds: string[]` | `WatchlistSnapshot` |
| `mark_all_watchlist_seen` | none | `WatchlistSnapshot` |
| `mark_watchlist_auto_queued` | `videoIds: string[]` | `WatchlistSnapshot` |
| `resolve_watchlist_channel` | `input: string` | `ResolvedChannel` (phase 2) |
| `set_watchlist_check_interval` | `minutes` | `WatchlistSnapshot` (phase 3) |
| `refresh_watchlist_now` | none | `()` (phase 3, throttled to once per 2 min) |

Every mutating command also emits `watchlist-updated` to main, so any other listener stays in sync.

### Events (Rust to main only)

- `watchlist-updated`: `WatchlistSnapshot`. Emitted after any change.
- `watchlist-new-uploads`: `NewUploadsPayload`. Emitted only when a poll of an already-seeded channel finds new, surfaced uploads. Never on seeding, never on hydration.

Emit with `app.emit_to(tauri::EventTarget::webview_window("main"), EVENT, payload)`. Pattern already used in `lib.rs` for `MAIN_HIDDEN_EVENT`.

### Island protocol additions (`src/lib/desktopIslandBridge.ts`)

```ts
// DesktopIslandStatePayload gains:
watchlist: IslandWatchlist | null;

// DesktopIslandControl gains:
| { type: "watchlistQueue"; videoId: string }
| { type: "watchlistOpen"; videoId: string }
| { type: "watchlistMarkAllSeen" }
```

```ts
// src/components/island/IslandWatchlistContent.tsx
export type IslandWatchlist = {
  /** Newest video id; re-keys the collapsed pill when a new batch lands. */
  key: string;
  count: number;
  faces: { src: string | null; initial: string }[]; // up to 3, newest channel first
  rows: { videoId: string; title: string; channel: string; thumbnail: string }[]; // up to 6
  /** True for a few seconds after a batch lands: wins over the music / download pill. */
  takeover: boolean;
};
```

### File layout

Rust (new): `src-tauri/src/commands/watchlist/{mod.rs, model.rs, feed.rs, resolve.rs, poller.rs}`. Edits: `commands/mod.rs`, `lib.rs`, `Cargo.toml` (+ `Cargo.lock`), `commands/music_playlists.rs` (make `write_atomic` `pub(crate)`), `commands/youtube_feed.rs` (extract player fetch helper).

Frontend (new): `src/watchlist/{types.ts, watchlistStore.ts, watchlistSync.ts, watchlistActions.ts, channelUrl.ts, channelUrl.test.ts, watchlistSelectors.ts, watchlistSelectors.test.ts, watchlistAlerts.ts, islandWatchlist.ts}`, `src/lib/storageBlocks.ts`, `src/components/watchlist/*`, `src/components/island/IslandWatchlistContent.tsx`.

---

## Decisions and risks (including where this plan overrules the original proposal)

1. **RSS via reqwest: kept.** `reqwest 0.12` with `rustls-tls` is already in `src-tauri/Cargo.toml`. No XML crate exists yet. Add `roxmltree` (read-only DOM, zero deps, simplest API for namespaced Atom). Run `cargo add roxmltree` in `src-tauri/` so the current version is picked; do not hand-parse XML with string search (titles carry entities like `&amp;`).
2. **Poller is an async task, not a std thread (overrule, minor).** `removable_drives.rs` uses `std::thread` because its work is sync syscalls. The watchlist does async HTTP, so use `tauri::async_runtime::spawn` with `tokio::time::sleep`. Keep the rest of that pattern: managed state, first reading at startup, emit only on change.
3. **Poll interval lives in `watchlist.json`, not `RuforgeSettings` (overrule).** The poller starts in Rust `setup` before any webview hydrates, and `RuforgeSettings` lives in webview localStorage. The notifications on/off toggle does live in `RuforgeSettings` (`watchlistAlerts`), because notifying is a frontend decision.
4. **Resolving channels avoids yt-dlp where it can (refines proposal).** Watch and Shorts URLs resolve through the existing cookie-free player endpoint (`get_video_stats` in `youtube_feed.rs`, returns `channelId` + `author`). `@handle`, `/c/`, `/user/` URLs fetch the channel page cookie-free and read `<link rel="canonical" href=".../channel/UC...">` (same approach as `channel_avatar.rs`). yt-dlp is the last fallback only, through `run_ytdlp_json`, which already waits on the rate gate.
5. **Shorts tagging from the RSS link, not `get_video_stats` (overrule).** The player endpoint has no Shorts flag. YouTube's RSS `<link rel="alternate">` points at `/shorts/ID` for Shorts, the same signal `youtube_feed.rs` already uses (`url.contains("/shorts/")`). Phase 1 must confirm this on a live feed. If it does not hold, fall back to a `HEAD https://www.youtube.com/shorts/ID` with redirects disabled (200 means Short, a redirect to `/watch` means not) for new ids only. Shorts are included by default; per-channel "Hide Shorts" filters them.
6. **Hold premieres and live streams (addition).** RSS lists scheduled premieres and live streams before they are downloadable. Auto-download would fail on every one. For new ids, the poller calls the player endpoint: `videoDetails.isUpcoming == true` or `lengthSeconds == "0"` means hold the id in `pending_ids` and re-probe each poll (drop after 7 days). Probe failure surfaces the upload anyway, so nothing is lost.
7. **New-upload rule.** An entry is new only if its id is not in `known_ids` or `pending_ids`, the channel is `seeded`, and `published_at >= followed_at - 3600`. The date guard stops old videos from resurfacing when RSS reorders or an unlisted video goes public.
8. **Two events, not one (addition).** `watchlist-updated` is state; `watchlist-new-uploads` is the only trigger for toasts, island batches and auto-download. Hydration and app restarts never re-notify.
9. **Emit to main only (addition).** The Explorer child webview has event permission. `app.emit` would broadcast the user's follow list into the youtube.com page context.
10. **Thumbnails: `mqdefault.jpg` (addition).** RSS gives `hqdefault.jpg`, which is 4:3 with black bars (anti-pattern #2). Build `https://i.ytimg.com/vi/{id}/mqdefault.jpg` (16:9) from the video id.
11. **Standalone Zustand store.** `useRuforgeStore` is persisted and huge. Watchlist state is Rust-owned, so a small non-persisted `create()` store (same shape as `useYoutubeFeedStore` in `useYoutubeFeed.ts`) is enough.
12. **Explorer webview covers popovers (trap).** The Explorer child webview paints above everything in the main column. Settings and the downloader overlay already hide it (`explorerSurfaceActive` in `App.tsx` ~856). The bell popover does the same: while it is open on the Explorer tab, the Explorer webview hides (and its video pauses via the existing leave path). See open question 2.
13. **Bell hidden in Music mode.** Same rule as the USB export button in `WindowControls`: watchlist chrome is Library-palette. Toasts and island still fire in Music mode.
14. **Rail badge on Videos.** The Videos rail item (`media`) is where the shelf lives, so the badge points somewhere useful.
15. **Seen is explicit.** Opening the popover does not clear the badge. Queue, Open and Mark seen each mark that upload seen; "Mark all seen" clears everything.
16. **Auto-download pre-checks storage.** The queue already holds over-cap jobs (`gateStorageAfterEnqueue` / `announceStorageBlocks` in `downloadQueueSlice.ts`), but piling held jobs from a background poll is noisy. Auto-download checks `storageBlocksNewDownloads` first; if blocked it queues nothing and warns once per batch.
17. **YouTube feed flakiness (risk).** The RSS endpoint has had periods of intermittent 404 / 5xx. Treat every failure as transient with backoff; never auto-unfollow. Show `lastError` in the Channels tab.
18. **EU consent page (risk).** Cookie-free channel page fetches can land on a consent interstitial. If the canonical link is missing, go to the yt-dlp fallback instead of failing. RSS is not affected.
19. **Hidden main webview (trap).** When minimized to tray, `main` is hidden, not destroyed (`lib.rs` `CloseRequested` hides). Its JS still receives events, so notification and auto-download logic in main works while hidden. Timers are throttled, so do not depend on `setInterval` in main for polling. Polling is Rust's job.

---

## Phases

### Phase 1: Rust core, persistence, RSS parse, follow by channel id

Goal: follow / unfollow by UC id works end to end through devtools; RSS parsing is unit-tested; roadmap row flagged in progress.

Files:

- `website/src/content/roadmap.json`: on the "Channel watchlist and new-upload notifications" row add `"roadmapStatus": "progress"`. No other field changes.
- `src-tauri/Cargo.toml` + `Cargo.lock`: `cargo add roxmltree` from `src-tauri/`.
- `src-tauri/src/commands/music_playlists.rs`: change `fn write_atomic` to `pub(crate) fn write_atomic`. Nothing else.
- New `src-tauri/src/commands/watchlist/model.rs`: types above, plus pure functions:
  - `pub fn is_channel_id(id: &str) -> bool` (copy the rule from `channel_avatar.rs`; do not make that one pub, keep modules independent).
  - `pub fn thumbnail_for(video_id: &str) -> String`
  - `pub fn watch_url(video_id: &str) -> String`
  - `impl WatchlistFile { pub fn snapshot(&self) -> WatchlistSnapshot; pub fn trim_uploads(&mut self, now: i64); pub fn channel_mut(&mut self, id: &str) -> Option<&mut WatchedChannel>; }`
  - `pub fn seed_channel(ch: &mut WatchedChannel, entries: &[FeedEntry])`: puts every entry id into `known_ids` (cap), sets `seeded = true`.
  - `pub fn merge_entries(ch: &mut WatchedChannel, entries: &[FeedEntry], now: i64) -> Vec<FeedEntry>`: returns candidates per decision 7, adds them to `known_ids`. Pending logic comes in phase 3; leave `pending_ids` untouched here.
- New `src-tauri/src/commands/watchlist/feed.rs`:
  - `pub struct FeedEntry { video_id, channel_id, channel_title, title, published_at: i64, short: bool }`
  - `pub fn parse_channel_feed(xml: &str) -> Result<Vec<FeedEntry>, String>` with roxmltree. Match by local name (`node.tag_name().name()`): `entry`, `videoId`, `channelId`, `title`, `published`, `link` (attribute `href`), `author/name`. Parse `published` with `chrono::DateTime::parse_from_rfc3339`. `short = href.contains("/shorts/")`.
  - `pub enum FeedError { NotFound, Transient(String) }`
  - `pub async fn fetch_channel_feed(client: &reqwest::Client, channel_id: &str) -> Result<Vec<FeedEntry>, FeedError>`: GET the RSS URL, 404 maps to `NotFound`, anything else non-2xx or network error to `Transient`.
- New `src-tauri/src/commands/watchlist/mod.rs`:
  - `pub mod model; pub mod feed;`
  - `pub struct WatchlistState { file: std::sync::Mutex<WatchlistFile>, path: PathBuf, client: reqwest::Client }`, `WatchlistState::load(app: &AppHandle) -> WatchlistState` (missing or corrupt file gives an empty default; a corrupt file is renamed to `watchlist.json.bad` first so it is not silently overwritten).
  - `fn save(&self)` uses `crate::commands::music_playlists::write_atomic` with `serde_json::to_string_pretty`.
  - `fn emit_updated(app: &AppHandle, snap: &WatchlistSnapshot)` to main only.
  - Commands: `get_watchlist`, `follow_channel`, `unfollow_channel`, `set_channel_auto_download`, `set_channel_hide_shorts`, `mark_watchlist_seen`, `mark_all_watchlist_seen`, `mark_watchlist_auto_queued`.
  - `follow_channel`: validate id, reject past `MAX_CHANNELS` with "You can follow up to 300 channels.", no-op if already followed. Try `fetch_channel_feed` once; on success `seed_channel`; on failure keep `seeded = false` (the poller seeds later). Set `next_check_at = now + interval`. Save, emit, return snapshot.
- `src-tauri/src/commands/mod.rs`: `pub mod watchlist;`
- `src-tauri/src/lib.rs`: in `setup`, after `spawn_removable_drives_watcher`, `app.manage(crate::commands::watchlist::WatchlistState::load(app.handle()));`. Add the commands to `generate_handler!`.

Trap: never hold the `std::sync::Mutex` guard across an `.await`. Clone what you need, drop the guard, await, then lock again to write.

Tests in `feed.rs` and `model.rs` (`#[cfg(test)]`): a hand-written Atom fixture with two entries (one `/watch`, one `/shorts/`, a title with `&amp;`), parse assertions; `merge_entries` returns nothing when unseeded, returns only unknown ids, rejects entries published before `followed_at - 3600`; `known_ids` cap; `snapshot()` hides Shorts when `hide_shorts` and counts `unseen_count` accordingly.

Live check (do once, note the result in the phase summary): in `tauri dev` devtools, follow a channel that posts Shorts, then inspect `watchlist.json` in `%APPDATA%/<identifier>/`. Confirm RSS Shorts links contain `/shorts/`. If not, stop and report; decision 5 fallback applies.

Acceptance:

- `cargo test watchlist` passes, `cargo check` clean.
- In devtools: `invoke("follow_channel", { channelId: "UC...", title: "X", handle: null })` returns a snapshot with the channel; `watchlist.json` exists and `seeded` is true; `unfollow_channel` removes it; restart keeps state.

Do not touch: frontend, poller, `channel_avatar.rs`.

### Phase 2: Resolve any channel input to a UC id

Goal: `resolve_watchlist_channel(input)` turns a pasted URL, `@handle`, UC id, watch URL or Shorts URL into `ResolvedChannel`.

Files:

- `src-tauri/src/commands/youtube_feed.rs`: extract the inline player POST in `get_video_stats` into `pub(crate) async fn fetch_player_response(client: &reqwest::Client, video_id: &str) -> Option<serde_json::Value>`. `get_video_stats` calls it. Behavior identical. Also make `is_video_id` `pub(crate)` if it is not.
- New `src-tauri/src/commands/watchlist/resolve.rs`:
  - `pub enum ChannelInput { Id(String), Handle(String), PagePath(String), Video(String) }`
  - `pub fn classify_input(input: &str) -> Option<ChannelInput>`: accepts bare `UC...`, bare `@name`, and `youtube.com` / `m.youtube.com` / `youtu.be` URLs: `/channel/UC..`, `/@name[/anything]`, `/c/name`, `/user/name`, `/watch?v=`, `/shorts/ID`, `/live/ID`, `youtu.be/ID`. Anything else is `None`.
  - `pub fn channel_id_from_page_html(html: &str) -> Option<String>`: canonical link first, then `"externalId":"UC..."`, then `<meta itemprop="identifier" content="UC...">`. Validate with `is_channel_id`.
  - `pub fn title_from_page_html(html: &str) -> Option<String>`: `og:title`, HTML-unescape `&amp; &quot; &#39; &lt; &gt;`.
  - `pub fn handle_from_page_html(html: &str) -> Option<String>`: `"vanityChannelUrl":"http://www.youtube.com/@x"` or the input handle.
  - `pub async fn resolve(app: &AppHandle, client: &reqwest::Client, input: &str) -> Result<ResolvedChannel, String>`:
    - `Id`: fetch the RSS feed to get the title (feed-level `<title>`; add `pub fn parse_feed_title(xml) -> Option<String>` in `feed.rs`). 404 means "That channel does not exist."
    - `Video`: `fetch_player_response`, read `videoDetails.channelId` and `author`.
    - `Handle` / `PagePath`: GET `https://www.youtube.com/{path}` with the browser UA from `channel_avatar.rs` and `Accept-Language: en-US`. Parse. If no id, fallback yt-dlp: `crate::commands::downloader::run_ytdlp_json(app, vec!["--flat-playlist".into(), "--playlist-end".into(), "1".into(), "-J".into(), url], "watchlist resolve")`, read `channel_id`, `channel`, `uploader_id`.
- `mod.rs`: `#[tauri::command] resolve_watchlist_channel(app, state, input)`; register in `lib.rs`.

Errors are user-facing copy: "Paste a YouTube channel or video link." for `None`, "Could not find that channel." otherwise. No emdashes.

Tests: `classify_input` table test (at least 12 cases including trailing `/videos`, query strings, `m.` host, junk); HTML fixtures for the three id sources and entity unescape.

Acceptance: `cargo test watchlist` passes; in devtools `invoke("resolve_watchlist_channel", { input: "https://www.youtube.com/@<real handle>/videos" })` and a watch URL both return the same `channelId`.

Do not touch: frontend, `run_ytdlp_json` internals, rate gate.

### Phase 3: Background poller

Goal: channels are re-checked on a staggered schedule; new uploads are recorded and announced with `watchlist-new-uploads`; premieres and live streams are held.

Files:

- New `src-tauri/src/commands/watchlist/poller.rs`:
  - `pub fn spawn_watchlist_poller(app: &AppHandle)`: `tauri::async_runtime::spawn` loop. First tick after 20 s (let startup settle), then every 60 s, or sooner when `WatchlistState.poke` (`tokio::sync::Notify`, add it to the state) fires.
  - Each tick: under the lock, pick up to 5 channels with `next_check_at <= now` (unseeded first, then oldest `next_check_at`). Drop the lock. Fetch each sequentially with a 1.5 s gap.
  - For each fetch result, lock and apply:
    - Success, unseeded: `seed_channel`, no announcement.
    - Success, seeded: `merge_entries`, then probe candidates (below). Surfaced ones become `WatchlistUpload { seen: false, auto_queued: false, discovered_at: now, .. }`.
    - Re-probe `pending_ids` still inside 7 days; surface those that are now regular videos.
    - `last_checked_at = now`, `last_error = None`, `fail_count = 0`, `next_check_at = now + interval*60 + jitter` where jitter is `rand` in `0..interval*60/5`.
    - Failure: `fail_count += 1`, `last_error` = "Channel feed not found" for `NotFound`, else "Could not reach YouTube"; `next_check_at = now + min(interval*60 * 2^fail_count, 6 h)`.
  - After the batch: `trim_uploads`, save once, emit `watchlist-updated` if anything changed, emit `watchlist-new-uploads` if any uploads surfaced.
  - Probe: `fetch_player_response` per candidate (sequential is fine, volumes are tiny). Hold when `videoDetails.isUpcoming` is true or `lengthSeconds` is `"0"`. Fill `duration_sec` from `lengthSeconds`. `None` response surfaces with `duration_sec: None`.
- `model.rs`: extend `merge_entries` / add `apply_probe(...)` as pure functions so the hold logic is unit-tested without network.
- `mod.rs`: `set_watchlist_check_interval(minutes)` (clamp, recompute each channel's `next_check_at` to `min(existing, now + new_interval)`), `refresh_watchlist_now()` (throttle 120 s via an `AtomicI64` last-run; sets every `next_check_at = now` and pokes). `follow_channel` also pokes when seeding failed.
- `lib.rs` `setup`: `crate::commands::watchlist::poller::spawn_watchlist_poller(app.handle());` right after the `manage` line from phase 1. Register the two new commands.
- Optional logging: add `{ id: "youtube.watchlist", label: "Channel watchlist poller", side: "rust" }` to `src/debug/debugCategories.ts` (under an existing group that fits) and use `crate::rf_log!("youtube.watchlist", ...)`. Category ids must match between the two files.

Traps: the sleep computer case (every channel due at once) is handled by the 5-per-tick cap; do not remove it. Do not call yt-dlp from the poller. Do not emit on every tick.

Tests: pure tests for backoff math, jitter bounds, hold / release of pending ids, 7-day pending expiry.

Acceptance: `cargo test watchlist` passes. Manual: in `watchlist.json`, remove the newest id from a followed channel's `known_ids` and set its `next_check_at` to 0, restart `tauri dev`; within ~90 s `get_watchlist` returns that video as an upload with `seen: false`. The event itself is checked in phase 4 once a listener exists. Do not commit debug listeners or logging you added to check this.

Do not touch: frontend UI.

### Phase 4: Frontend data layer

Goal: main webview holds a live watchlist store; shared actions exist; URL helpers are tested. No visible UI yet.

Files:

- New `src/watchlist/types.ts`: types and event names from the architecture section.
- New `src/watchlist/watchlistStore.ts`:
  ```ts
  type WatchlistStoreState = {
    snapshot: WatchlistSnapshot | null;
    popoverOpen: boolean;
    popoverTab: "new" | "channels";
    /** Uploads that arrived while main was not focused; island shows these. */
    islandBatchIds: string[];
    islandBatchAt: number;
  };
  export const useWatchlistStore = create<WatchlistStoreState>(() => ({ ... }));
  ```
- New `src/watchlist/watchlistSync.ts`: `export async function startWatchlistSync(onNewUploads: (u: WatchlistUpload[]) => void): Promise<() => void>`. Register both listeners first, then `invoke("get_watchlist")`, so no update is lost between the two. `onNewUploads` is a no-op until phase 9.
- New `src/watchlist/watchlistActions.ts`: every function invokes the command and writes the returned snapshot into the store:
  - `followChannel(ch: ResolvedChannel)`, `unfollowChannel(id)`, `setAutoDownload(id, on)`, `setHideShorts(id, on)`, `markSeen(ids)`, `markAllSeen()`, `resolveChannel(input)`, `followFromInput(input)` (resolve then follow).
  - `queueUpload(upload)`: storage check (below), then enqueue exactly like `src/components/library/downloadFeedVideo.ts` (copy its option building: `resolveDownloadOutputDir`, `patchDownloadJobOptionsForAudio(..., false, ...)`, snapshot with title / thumbnail / duration) but with `enqueueSource: "watchlistAdd"`, then `pumpDownloadQueue()`, then `markSeen([id])`. When storage blocks: `deliverUserNotification({ dedupeKey: "storage-full", body: STORAGE_FULL_NOTIFY, kind: "warning" }, notify)` using the same copy as `ExplorerWatchQueueButton.tsx`, and return `false`.
  - `openUploadInExplorer(upload)`: `markSeen`, then if `activeTab !== "explorer"` or `navMode === "music"`: `setNavMode("default")` if needed, `setLastExplorerUrl(upload.url)`, `setActiveTab("explorer")` (entering the tab navigates to `lastExplorerUrl`, see `reloadExplorerPage` in `App.tsx`). If already on Explorer: `setLastExplorerUrl`, then `invoke("eval_in_webview", { label: await invoke("embedded_explorer_webview_label"), script: explorerNavigateOrReloadScript(upload.url) })`.
- `src/downloadQueue.ts`: add `"watchlistAdd"` and `"watchlistAuto"` to `DownloadEnqueueSource` with a one-line why comment each, matching the existing style.
- New `src/lib/storageBlocks.ts`: `export function storageBlocksNewDownloads(s: Pick<RuforgeStore, "saveToInternal" | "storageStats" | "settings">): boolean` using the exact formula at `App.tsx` ~450. Replace that inline expression in `App.tsx` with a call. Behavior identical.
- New `src/watchlist/channelUrl.ts` + `channelUrl.test.ts`:
  - `export type ExplorerChannelRef = { kind: "id"; channelId: string } | { kind: "handle"; handle: string } | { kind: "path"; path: string } | { kind: "video"; videoId: string }`
  - `export function explorerChannelRef(url: string): ExplorerChannelRef | null` for youtube.com page URLs (same shapes as phase 2 `classify_input`; reuse `extractYouTubeVideoId` from `src/youtubeUrl.ts` for videos).
  - `export function isFollowed(snapshot, ref, videoChannelId?: string | null): WatchedChannel | null` (handle compare is case-insensitive).
- New `src/watchlist/watchlistSelectors.ts` + test:
  - `unseenUploads(snapshot)`, `shelfUploads(snapshot, libraryIds: ReadonlySet<string>, limit)`, `toFeedVideo(upload): FeedVideo` (maps to `src/components/library/youtubeFeed.ts` `FeedVideo`: `timestamp = publishedAt`, `channelVerified: false`, `viewCount: null`, `short`).
- `src/App.tsx`: one `useEffect` next to the `startMusicPlaylistsFileSync` effect (~434), with the same `getCurrentWindow().label !== "main"` guard, calling `startWatchlistSync(() => {})` and cleaning up on unmount.

Trap: the mini window runs `App.tsx` hooks. Without the label guard, mini would hydrate and later double-enqueue auto-downloads.

Acceptance: `npx tsc --noEmit` clean, `npx vitest run src/watchlist` passes. In `tauri dev` devtools: follow via `invoke`, and the store (expose nothing globally; check through React DevTools or a temporary `console.log` you remove) updates without reload.

Do not touch: `ruforgeStore.ts` persisted shape, `downloadFeedVideo.ts` behavior.

### Phase 5: Title bar bell and "New" popover

Goal: a bell in the title bar with an unseen badge opens a popover listing uploads with Queue / Open / Mark seen.

Read first: restrictions.md Tooltips, Popups, Scrollbars, Motion; `design-style-anti-patterns.mdc`.

Files:

- New `src/components/watchlist/WatchlistBellButton.tsx`: uses `titlebarIconButtonClass` from `TitlebarHoverButton.tsx` inside the same `relative flex h-10 w-10` slot. Icon `tabler:bell` (iconify, 18px); `tabler:bell-filled` in accent while the popover is open. Badge when `unseenCount > 0`: `absolute right-1 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[9px] font-black tabular-nums text-[#1D1613]`, text `9+` past 9. `data-tooltip`: "Channel uploads" or "N new uploads". Toggles `popoverOpen`.
- New `src/components/watchlist/WatchlistPopover.tsx`: portaled to `document.body`, `fixed` under the bell, right-aligned to it (measure the bell rect on open and on resize; `style={}` only for those dynamic coordinates). Width 384, max height `min(560px, 100vh - 72px)`. Panel `bg-[#1D1613] rounded-[20px]` with one soft float shadow (`shadow-[0_18px_48px_rgba(0,0,0,0.5)]`, allowed because it floats). Motion: opacity + `y: -6` + scale `0.98 to 1`, 0.18 s, ease `[0.16, 1, 0.3, 1]`; `AnimatePresence`; reduced motion duration 0. Close on outside pointerdown, Escape, and tab change. Header: title "Uploads" (`text-base font-semibold text-stone-100`), two text tabs "New" / "Channels" (active: `text-stone-100 bg-white/[0.06] rounded-lg`, inactive `text-stone-500`), and a text-only "Mark all seen" action when there are unseen uploads. "Channels" tab renders a placeholder until phase 6. Body scroller has class `rf-scrollbar`.
- New `src/components/watchlist/WatchlistUploadRow.tsx`: 16:9 thumb `h-[54px] w-24 rounded-[10px] object-cover` with `referrerPolicy="no-referrer"`, title 13px semibold 2-line clamp, meta line 11px stone-500 `channel · formatAge(publishedAt)` (reuse `formatAge` and `MetaParts`), Shorts get a small "Short" chip. Unseen rows sit on `bg-white/[0.035] rounded-xl`; seen rows have no fill. No divider lines. Actions on the right, icon buttons with `data-tooltip`: Queue (`lucide Download`), Open (`tabler:brand-youtube` or `lucide ExternalLink`), Mark seen (`lucide Check`, hidden when seen). A row that is already in the queue shows the queued state (reuse `useOutsideDownloadPercent(url)` from `useMusicOutsideRecommendations` like `FeedVideoCard` does).
- Empty state copy (casual, no emoji): "Nothing new yet. Follow a channel and fresh uploads land here." with a text button "Add a channel" that switches to the Channels tab.
- `src/App.tsx`: in `WindowControls`, render `<WatchlistBellButton />` right before the USB export button, only when `navMode !== "music"`. Render `<WatchlistPopover />` once. Add `!watchlistPopoverOpen` (from `useWatchlistStore`) to `explorerSurfaceActive` (~856) so the Explorer webview hides while the popover is open. Leave `showExplorerToolbar` alone so the title band actions stay put.

Trap: without the `explorerSurfaceActive` change the popover renders under the Explorer page and looks broken.

Acceptance: `npx tsc --noEmit` clean. In `tauri dev`: badge count matches `unseenCount`; Queue adds a job to the download queue and the row flips to queued; Open lands on the video in Explorer; Mark seen and Mark all seen clear the badge; popover works on Library and Explorer tabs; tooltips use the house pill (no native title boxes).

Do not touch: `UpdaterStatusIndicator`, `YouTubeProfileChip`, window buttons.

### Phase 6: Channels tab (manage view)

Goal: paste a channel link to follow; list followed channels with per-channel toggles.

Files:

- New `src/components/watchlist/WatchlistAddChannelField.tsx`: text input (`rounded-[var(--radius-input)] bg-white/[0.05]`) with placeholder "Paste a channel or video link", Enter or a "Follow" button calls `followFromInput`. Pending state shows a spinner in the button; errors render as a small `text-[11px] text-amber-300/90` line under the field with the Rust error string. Also accept paste of a watch URL (resolves the uploader).
- New `src/components/watchlist/WatchlistChannelRow.tsx`: `ChannelAvatar` (from `src/components/library/VideoByline.tsx`, `h-9 w-9`), title + handle, "Checked 12 minutes ago" or `lastError` in amber. Two compact toggles with labels "Auto-download" and "Hide Shorts" (build a small accent toggle in the house style; look at `ToggleSlot` in `SettingsView.tsx` and copy its look into `src/components/watchlist/WatchlistToggle.tsx` if it is not exported). Unfollow as a text-only action on hover (`text-stone-500 hover:text-stone-200`).
- New `src/components/watchlist/WatchlistChannelsPanel.tsx`: field on top, then channels sorted by title, then a text button "Check now" calling `invoke("refresh_watchlist_now")` (disable for 2 minutes after click). Empty list copy: "Not following anyone yet."
- `WatchlistPopover.tsx`: render the panel in the Channels tab.

Acceptance: tsc clean. Manual: follow via `@handle` link, `/channel/UC` link and a watch link; duplicate follow is a no-op; toggles persist across restart; Hide Shorts removes that channel's Shorts from the New tab and the badge count; Unfollow removes its uploads.

Do not touch: Rust, except fixing a bug you find there (say so in your summary).

### Phase 7: Explorer Follow toggle in the title band

Goal: on a YouTube channel page, watch page or Short in Explorer, a Follow / Following toggle sits in the title band next to the queue button.

Files:

- New `src/components/watchlist/ExplorerFollowButton.tsx`, modeled on `src/components/ExplorerWatchQueueButton.tsx` (same slot sizes, left hint motion, three-icon crossfade):
  - Reads `lastExplorerUrl`; `explorerChannelRef(url)`; hidden when `null`.
  - For `kind: "video"`, look up the channel with `invoke<VideoStats[]>("get_video_stats", { videoIds: [id] })`. Cache results in a module-level `Map<videoId, VideoStats>` so the 800 ms URL poll in `App.tsx` does not refetch.
  - For `kind: "handle" | "path"`, followed state comes from `isFollowed` (handle match); if unknown, the button shows Follow and resolves on click.
  - Icons: not following `ic:round-person-add-alt`, following `ic:round-how-to-reg`, following + hover `ic:round-person-remove`. Tooltips: "Follow {channel} for new uploads" / "Following {channel}. Click to unfollow".
  - Click: re-read the live URL with `invoke<string>("get_embedded_explorer_webview_url")` like the queue button does, then follow (`followFromInput(url)`) or unfollow. Left hint: "Following" / "Unfollowed" / error text.
- `src/App.tsx` `WindowControls`: render `<ExplorerFollowButton />` immediately before `<ExplorerWatchQueueButton />`, under the same `showExplorerQueueToolbar` condition.

Trap: Explorer actions live only in the title band (`h-10`, `z-[100]`), never in the well or as an overlay on the Explorer page.

Acceptance: tsc clean. Manual: on a channel home, its `/videos` tab, a watch page and a Short, the button shows the right state; follow from a watch page then open that channel page shows Following; hover-unfollow works.

Do not touch: `ExplorerTitlebarNav`, Explorer bounds sync.

### Phase 8: Library entry points, shelf and rail badge

Goal: follow from the library; see new uploads on Library home; unread badge on the rail.

Files:

- New `src/components/watchlist/FollowChannelButton.tsx`: small pill (`h-8 rounded-full px-3 text-[12px] font-semibold`), not following `bg-white/[0.07] text-stone-200 hover:bg-[color:var(--accent)] hover:text-stone-900`, following `text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent),transparent_88%)]` with text "Following" (hover "Unfollow"). Props `{ channelId: string; channel: string }`. Uses `followChannel({ channelId, title: channel, handle: null })`.
- `src/components/library/LibraryHome.tsx`: in the `channel` section title, after "More from {section.channel}", render `<FollowChannelButton>` when `section.channelId` is set (push it right with `ml-auto` inside the flex title). Add a new section kind render for `watchlist` (below).
- `src/components/library/homeSections.ts`: add `| { kind: "watchlist"; key: string; videos: FeedVideo[] }` to `HomeSection`, a `{ kind: "watchlist" }` plan step placed right after the first `rows` step, and a `watchlist: FeedVideo[]` input to `composeHomeSections` (push only when non-empty). Update `homeSections.test.ts` for the new step (existing tests must still pass; add one for the shelf).
- `LibraryHome.tsx` `watchlist` case: `<SectionTitle>New from channels you follow</SectionTitle>` then a grid of `FeedVideoCard` (existing component, unchanged) using `renderGrid` or the same grid class, one row (`columns` items). Title is typographic only (no accent bar).
- `src/components/MediaView.tsx`: read `useWatchlistStore((s) => s.snapshot)`, compute `shelfUploads(snapshot, libraryVideoIds, columns).map(toFeedVideo)` and pass it to `composeHomeSections` only in `homeMode`. Watchlist videos must also be removed from the feed interleave (filter `feed.items` by those ids) so a video does not show twice.
- `src/components/library/LibraryVideoCard.tsx`: in `menuItems`, when `file.youtube?.channelId` and `file.youtube.channel` exist, add a row "Follow {channel}" / "Unfollow {channel}" with `lucide UserPlus` / `UserCheck` at 14px, `className="shrink-0 ml-1.5"`, matching sibling rows.
- `src/components/navigation/AppSidebarRail.tsx`: on the `media` item, render the same badge as the bell (extract `WatchlistBadge` into `src/components/watchlist/WatchlistBadge.tsx` and use it in both). Rail badge position `right-1 top-1`.

Note: `FeedVideoCard`'s Download button uses `downloadFeedVideo` with `enqueueSource: "libraryFeedAdd"`. That is fine for the shelf; do not fork the card. Queuing from the shelf does not mark the upload seen; a finished download drops out of the shelf via `libraryVideoIds`.

Acceptance: `npx tsc --noEmit`, `npx vitest run src/components/library src/watchlist` pass. Manual: shelf appears with unseen uploads and hides when empty; follow from "More from" and from the card menu; rail badge matches the bell.

Do not touch: `FeedVideoCard.tsx`, `useYoutubeFeed.ts`.

### Phase 9: Alerts and auto-download

Goal: new uploads toast when the app is focused, feed the island batch when not, and auto-queue for opted-in channels.

Files:

- `src/systemNotify.ts`: export the existing `isAnyRuforgeWindowFocused` (rename not needed). No behavior change.
- `src/store/types.ts`: add `watchlistAlerts: boolean` to `RuforgeSettings` with a why comment, `DEFAULT_SETTINGS.watchlistAlerts = true`, and `watchlistAlerts: merged.watchlistAlerts !== false` in `loadMergedSettings`.
- New `src/watchlist/watchlistAlerts.ts`: `export async function handleNewUploads(uploads: WatchlistUpload[]): Promise<void>`:
  1. Dedupe with `claimUserNotification("watchlist:" + ids.join(","))`.
  2. Auto-download: uploads whose channel has `autoDownload` (and not a hidden Short, the snapshot already filters those). If `storageBlocksNewDownloads(useRuforgeStore.getState())`: queue nothing and `deliverUserNotification({ dedupeKey: "watchlist-storage-full", kind: "warning", body: "Storage limit reached. N new uploads from channels you follow were not downloaded." }, notify)`. Else skip ids already in the library (`findLibraryDuplicate(url, entries)` when `entries` is loaded) and enqueue each with `enqueueSource: "watchlistAuto"`, `approval: "auto"` (same option building as `queueUpload`), one `pumpDownloadQueue()`, then `invoke("mark_watchlist_auto_queued", { videoIds })`.
  3. Alerts, only if `settings.watchlistAlerts`: if `await isAnyRuforgeWindowFocused()`, `notify(copy, "info")` where copy is "New from {channel}: {title}" for one upload, "{n} new uploads from {channel}" for one channel, "{n} new uploads from channels you follow" otherwise, with " Downloading now." appended when auto-queued. If not focused, append ids to `islandBatchIds`, set `islandBatchAt = Date.now()` in `useWatchlistStore` (phase 10 renders it).
- `src/App.tsx`: pass `handleNewUploads` instead of the no-op into `startWatchlistSync`.

Traps: `handleNewUploads` runs only in main (guarded in phase 4). Do not call `deliverUserNotification` for the unfocused case: it would push a plain text notice instead of the watchlist island.

Tests: move the copy builder into a pure `watchlistAlertCopy(uploads, autoQueuedCount)` and cover it in `watchlistSelectors.test.ts` or a new test file.

Acceptance: tsc and vitest pass. Manual (use the phase 3 trick to force a new upload): focused app shows one toast; auto-download channel gets a queued job; with storage over the cap (set the limit below current usage in Settings) nothing is queued and the warning shows once.

Do not touch: `downloadQueueSlice.ts`.

### Phase 10: Desktop island watchlist variant (collapsed and expanded)

Goal: while main is not focused, new uploads show on the desktop island. Collapsed: stacked channel avatars + "N new uploads". Expanded: rows with thumb / title / channel and Queue / Open, plus Mark all seen.

Read first: `src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`, `IslandUpdateContent.tsx` (collapsed vs expanded pair), `IslandDownloadContent.tsx`, `IslandOverlayApp.tsx`.

Files:

- New `src/components/island/IslandWatchlistContent.tsx`:
  - `IslandWatchlist` type (architecture section).
  - `export function islandWatchlistCollapsedWidth(count: number): number` (about 240).
  - `export const ISLAND_WATCHLIST_EXPANDED_DIMENSIONS = { width: 350, height: 248, borderRadius: 24 } as const;`
  - `IslandWatchlistCompactContent({ watchlist })`: `pointer-events-none`, up to 3 faces `h-6 w-6 rounded-full object-cover` overlapping with `-ml-2` and a ring in the island shell color, initials on `bg-white/10` when `src` is null; text `12px font-medium text-stone-100`: "1 new upload" / "N new uploads". Same enter / exit motion as `IslandDownloadContent`.
  - `IslandWatchlistExpandedContent({ watchlist, onQueue, onOpen, onMarkAllSeen })`: `pointer-events-auto absolute inset-0 flex flex-col p-3.5`, `onClick={(e) => e.stopPropagation()}` like the update expanded panel. Header: faces + "N new uploads" + text action "Mark all seen" on the right. Up to 3 rows visible (thumb `h-9 w-16 rounded-lg object-cover`, title 12px 1-line truncate, channel 10px stone-500), each with icon buttons Queue and Open (`data-tooltip`). If more than 3, a quiet "+N more in RuForge" line that restores main. Scroller `scrollbar-none` (island exception in restrictions.md). No dividers.
- `src/components/island/DynamicIsland.tsx`: add `"watchlist" | "watchlist-expanded"` to `IslandState` and `ISLAND_DIMENSIONS` (`watchlist`: width 240, height 36, radius 18; `watchlist-expanded`: the expanded constant). New optional props `watchlist`, `onWatchlistQueue`, `onWatchlistOpen`, `onWatchlistMarkAllSeen`. Render the two contents in the `AnimatePresence` with keys `watchlist-compact` / `watchlist-expanded`. Width for `watchlist` uses `islandWatchlistCollapsedWidth`. Keep the update-mode and notice logic untouched; notice still wins over collapsed watchlist.
- `src/lib/desktopIslandBridge.ts`: payload field and control variants from the architecture section. In `applyDesktopIslandControl` add cases that call `queueUpload`, `openUploadInExplorer`, `markAllSeen` from `watchlistActions.ts` (look the upload up in `useWatchlistStore.getState().snapshot`).
- New `src/watchlist/islandWatchlist.ts`: `export function buildIslandWatchlist(state: WatchlistStoreState, avatarSrc: (channelId: string) => string | null, now: number): IslandWatchlist | null`. Uses batch ids that are still unseen; `null` when none. `takeover = now - islandBatchAt < WATCHLIST_TAKEOVER_MS` (8000). Avatar src: resolve with `invoke("get_channel_avatar")` + `convertFileSrc` in main and cache in a module map (the island webview must not fetch). Unit-test the pure part.
- `src/hooks/useDesktopIslandOverlay.ts` (keep the diff small):
  - Subscribe to `useWatchlistStore` and call `sync()` on change.
  - In `sync`: `const watchlist = focused ? null : buildIslandWatchlist(...)`; include it in the payload and in the hide condition (`!music && !download && !notice && !watchlist`).
  - When `refreshWindow` finds main focused, clear `islandBatchIds` (the bell still has them).
  - When `takeover` is true, schedule one re-sync at its end so the pill can yield.
- `src/IslandOverlayApp.tsx`:
  - Replace `userExpanded: boolean` with `expandedTarget: "music" | "watchlist" | null`. Music behavior must stay identical.
  - State order: `expandedTarget === "watchlist" && watchlist` gives `watchlist-expanded`; music expanded gives `expanded`; `notice`; `watchlist && (watchlist.takeover || !hasSession)` gives `watchlist`; `hasSession` gives `compact`; `download`; `idle`.
  - Shell click: in `watchlist` state expand to watchlist; otherwise existing behavior.
  - Collapse on Escape / blur / focus loss (existing effect, now keyed on `expandedTarget != null`), and when `watchlist` becomes null.
  - Bounds: `WATCHLIST_EXPANDED_BOUNDS = { width: 380, height: 272 }` when watchlist-expanded (Rust clamps height to 280, so 272 fits).
  - Handlers: Queue emits `watchlistQueue`; Open calls `restoreMainFromDesktopIsland()` then emits `watchlistOpen`; Mark all seen emits `watchlistMarkAllSeen`.
- `DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md`: add a short "Watchlist variant" section (states, priority, controls).

Traps: the island has no store and no Tauri command access beyond what it has today; all data arrives in the payload, all actions go back as controls. The in-app `ActivityIsland` also renders `DynamicIsland`; new props are optional so it needs no change. Do not raise the Rust island max size.

Acceptance: tsc and vitest pass. Manual in `tauri dev`: minimize to tray, force a new upload (phase 3 trick): collapsed pill appears with avatars and count; click expands; Queue adds a job (visible after restoring); Open restores main on the video in Explorer; Mark all seen clears badge and hides the pill; with music playing while minimized, the watchlist pill shows for ~8 s then music returns, and clicking the music pill still expands music controls exactly as before.

Do not touch: `island_overlay.rs`, `IslandUpdateContent.tsx`, music expanded content.

### Phase 11: Settings, final pass, Unreleased log

Goal: user-facing settings, a polish pass, and the changelog entry.

Files:

- `src/components/SettingsView.tsx`: new `<SettingsSection title="Channel watchlist" keywords="follow subscribe notifications new uploads">` right after the section containing "YouTube feed in Video Library" (~1792). Items:
  - "New upload alerts": `ToggleSlot` bound to `watchlistAlerts`. Description: "Shows a notice when a channel you follow posts. In the background it appears on the desktop island."
  - "Check for new uploads": `CustomSelect` with "Every 15 minutes", "Every 30 minutes", "Every hour", "Every 3 hours", mapped to 15 / 30 / 60 / 180, calling `invoke("set_watchlist_check_interval", { minutes })` and reading from the snapshot.
  - "Followed channels": a button "Manage" that closes Settings and opens the popover on the Channels tab (`useWatchlistStore.setState({ popoverOpen: true, popoverTab: "channels" })`).
  Keep this block small; if it passes ~40 JSX lines, extract `src/components/settings/WatchlistSettingsSection.tsx` like `CompanionSettingsSection.tsx`.
- Polish check against `design-style-anti-patterns.mdc`: no dividers, no native `title`, thumbnails 16:9 `object-cover`, no glow, reduced motion honored in popover and island.
- Unreleased log: write `.shipped-entry.txt` at the repo root with the file-write tool (not the shell):
  ```
  Explorer: Follow YouTube channels from Explorer, the library or a pasted link, get new uploads in a title bar bell, a Library home shelf and the desktop island, and optionally auto-download them.
  src-tauri/src/commands/watchlist/mod.rs
  src/watchlist/watchlistActions.ts
  src/components/watchlist/WatchlistPopover.tsx
  src/components/island/IslandWatchlistContent.tsx
  ```
  Then run `node scripts/shipped.mjs add`. Do not paste the sentence on the command line, do not open `shipped.jsonl`. Later fixes to this feature before release use `amend`, not `add`.
- Do not flip the roadmap row to Finished; that happens at release.

Acceptance: `cd src-tauri && cargo check && cargo test watchlist`, `npx tsc --noEmit`, `npx vitest run` all pass. Full manual run: follow from all four entry points, change interval, toggle alerts off (no toast, no island, badge still updates), restart persists everything.

---

## Open questions for Angel

1. Bell in Music mode: this plan hides it there (Library palette, like the USB export button). Toasts and island still fire. Want it visible in Music too?
2. Opening the bell popover on the Explorer tab hides the Explorer page while it is open and pauses any video playing there (the Explorer webview paints over everything, same reason Settings hides it). Acceptable, or should the bell open straight to a full manage view on that tab?
3. Shorts are included by default with a per-channel "Hide Shorts". Would you rather default to hidden?
4. Auto-download uses the same options as the Library feed download button (video, never audio-only, your preferred quality). OK, or should it follow the downloader's audio-only toggle?
5. Premieres and live streams are held until they become regular videos, then announced. Or announce them when scheduled and only hold the auto-download?
6. Rail badge sits on Videos (where the shelf is). Prefer it on the YouTube (Explorer) item?
