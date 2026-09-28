# Handoff: Channel watchlist + notification center

Branch: `feature/channel-watchlist` (never push this work to main). Draft PR: https://github.com/UnboundAngel/RuForge/pull/4

Plan: `docs/ruforge/plans/channel-watchlist-plan.md`.

## Status

All 13 phases are built and pushed. The PR stays a draft until Angel runs the manual QA below in `npx tauri dev`. None of the live checks were run by the builders: every session was unattended, and a running `ruforge.exe` / locked machine was left alone. Unreleased has two entries (Explorer, Notifications). The roadmap row stays `progress` until release.

## What this is

- Follow YouTube channels. A Rust poller reads each channel's public RSS feed (no cookies, no yt-dlp rate gate) and records new uploads.
- New uploads land in a global notification center: a bell in the title bar, shown in every mode. Download results (finished, failed, timed out, storage blocked) are recorded there too. A History tab slot is reserved for the future download history log.
- Optional per-channel auto-download: video at preferred quality, respecting the storage cap.
- Other surfaces: Explorer Follow toggle, library Follow pill and card menu, a "New from channels you follow" shelf on Library home, an unread badge on the Videos rail item, a desktop island watchlist variant (collapsed and expanded) when the app is not focused, and a Notifications section in Settings (Downloads tab).

## Decisions Angel already made

- The bell is the global notification center, not a watchlist-only widget.
- No Shorts anywhere. Filter them out when uploads come in.
- Premieres and livestreams are announced when scheduled. Only the auto-download waits until they're normal videos.
- Opening the popover over the Explorer must not pause the Explorer video.
- The rail badge goes on Videos.

## Manual QA checklist (run in `npx tauri dev`)

Setup trick for a fresh upload: in `%APPDATA%\<identifier>\watchlist.json`, remove the newest id from a followed channel's `knownIds`, set its `nextCheckAt` to 0, restart. The poller surfaces it within about 90 s.

Rust core
- [ ] Devtools: `await window.__TAURI_INTERNALS__.invoke("follow_channel", { channelId: "UC...", title: "X", handle: null })` returns the channel; a restart keeps it; `unfollow_channel` removes it.
- [ ] `resolve_watchlist_channel` gives the same channel id for an `@handle/videos` URL and one of its watch URLs.
- [ ] Setup trick: the video appears with `seen: false` and a `durationSec`; the store updates without a reload.

Notification center (bell)
- [ ] Library mode: bell and popover in gold on warm brown. Music mode: red on black.
- [ ] Badge count matches unread across sources; 9+ past 9.
- [ ] Finish a download: `localStorage.getItem("ruforge-notification-center-v1")` holds a `download-finished` item, and the row shows in the feed.
- [ ] Row actions: Queue adds a job, Open lands in Explorer on the video, Play plays a finished download, Show in folder, Retry re-queues a failed one, Mark read, Mark all read clears the badge.
- [ ] Storage blocked row: the HardDrive action opens Settings on General with Storage at the top.
- [ ] Tooltips are the house pill everywhere (no native tooltips).

Popover above YouTube (overlay webview)
- [ ] Play a video in Explorer, open the bell: video keeps playing and stays visible around the panel.
- [ ] Actions work from the overlay; clicking the YouTube page closes it; clicking the bell again toggles cleanly (no reopen flicker).
- [ ] Music Explore: bell opens above YouTube Music, red palette.
- [ ] Forced fallback (temporarily make `ensureNotifyOverlay` return null, then revert): the in-page popover shows with Explorer hidden, and playback keeps going (WebView2 hidden-page playback is unverified).

Channels tab
- [ ] Follow via an `@handle` link, a `/channel/UC` link and a watch link; a duplicate says "Already following".
- [ ] Auto-download toggle persists across restart; Unfollow removes that channel's items from the feed.
- [ ] Check now disables for 120 s with a countdown.
- [ ] Works in both hosts (in-page and above Explorer).

Explorer Follow toggle
- [ ] Channel home, `/videos` tab and a watch page show the right state; follow from a watch page, then the channel page shows Following.
- [ ] Hidden on a Short, on home and on feed pages.

Library
- [ ] "New from channels you follow" shelf appears with unseen uploads and hides when empty; premieres and live streams are not on it.
- [ ] Follow from the "More from" shelf pill and from the library card menu.
- [ ] Videos rail badge matches unseen uploads.

Alerts and auto-download
- [ ] Focused app, setup trick: one toast per batch.
- [ ] Auto-download channel: the new upload gets a queued job.
- [ ] Storage over the cap (lower the limit in Settings): nothing is queued, one warning, and a blocked row in the center.

Desktop island
- [ ] Minimize to tray, setup trick: collapsed pill with avatars and count.
- [ ] Click expands; Queue adds a job; Open restores main on the video; "+N more" restores main and opens the bell on Uploads; Mark all seen hides the pill and clears the badge.
- [ ] With music playing, the watchlist pill shows about 8 s, then music returns and still expands as before.
- [ ] Windows "Show animations" off: the watchlist contents appear without scale or delay.
- [ ] Music island still works end to end (play/pause, seek, skip, volume, pop out): its state and controls now go through the private mailbox.

Settings
- [ ] Settings, Downloads tab, Notifications: "New upload alerts" off means no toast and no island, while badges still update.
- [ ] "Check followed channels" changes the interval (check `checkIntervalMin` via `get_watchlist`) and survives a restart.
- [ ] "Manage" closes Settings and opens the bell on the Channels tab, including while on the Explorer tab (overlay host).
- [ ] Restart keeps follows, read state and download items.

## Known residual risks

- Payload-free pings stay visible to the Explorer page. The youtube.com webview can hear the `watchlist-updated`, `watchlist-events`, `notify-overlay-state`, `desktop-island-state` and record/action pings (no data), so it can tell that a poll or an action happened. It can also forge those pings, which only makes RuForge re-fetch its own data. Payloads go through Rust commands (`private_mailbox_*`, `get_watchlist`, `take_watchlist_events`), which remote origins cannot invoke.
- Overlay size / ready / close events and the radial nav overlay events still use plain `emitTo`. They carry only heights and close reasons (radial files were out of scope).
- Other app-wide events that predate this feature (download progress and similar) are still broadcast. Those are out of scope here.
- Rust `cargo test` binaries crash on this machine with `STATUS_ENTRYPOINT_NOT_FOUND`. Earlier phases ran the pure watchlist modules in a throwaway harness. The phase 13 test (`watchlist_pending_events_cap_drops_oldest`) compiles but has not run.
- Hidden-Explorer fallback playback is unverified (see QA above).
- Island reduced motion covers the watchlist contents only. The shared island shell morph and the other island variants still animate, as before.
