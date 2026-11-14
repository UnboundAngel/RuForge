# Video playlists: broken or missing, with decided fixes (0.10.0 overhaul)

Scope: video playlists only (not Music). Line numbers are from the brief and were not re-verified unless marked.

## Download side

| Broken | Where | Decided fix |
| --- | --- | --- |
| Sidecar never written for video playlists. `.ruforge-playlist.json` is written only by `kickoffPlaylistDownloadSidecar`, called only from the Music bottom bar and download panel. Per-track updates fail with "Playlist sidecar not found", swallowed. Playlist watch (0.8.0) cannot see video playlists; no cover file, no per-video status, no complete event. | src/lib/playlistDownloadSidecar.ts:228; src/components/music/MusicExploreBottomBar.tsx:349; MusicExploreDownloadPanel.tsx:476; downloadQueueSlice.ts ~1121, ~1614 | Write the sidecar when a video playlist download starts. |
| Folder merge by title. Intentional for Music (re-paste or screenshot import appends). | youtubeUrl.ts:331 (`sanitizePlaylistFolderName`); ytdlp_args.rs:26 | Video: match by list id stored in the sidecar. Same list appends; different list with same title gets its own folder. |
| Playlist with 1 usable item becomes a single video. | media_engine/src/ytdlp_json.rs:73-120 | Keep it a playlist. |
| Preview list hidden below 750px window width (`hidden min-[750px]:grid`). | DownloaderView.tsx:687-725 | Real narrow-window layout. |
| Loading shows "Fetching details..." and nothing until done. | DownloaderView | First 5 videos appear immediately, then batches of 10. |
| No way to exclude a video. | DownloaderView | Per-row cancel button (no checkboxes). Row dims and slides aside, others animate into place. Also Shift range select and search inside the list. |
| Size total blank until every row has a size; size errors only `console.warn`. | playlistDownloadPlan.ts:100; usePlaylistRowSizeFill.ts | Running total that shimmers while still growing. |
| `playlistIndex` has gaps when items are dropped. 2-digit NN padding breaks at 100+. | playlistDownloadPlan.ts:55-95; ytdlp_args.rs:56-75 | Contiguous numbering, pad to playlist size. |
| Finished/failed rows drop out of the batch grid. `playlistDownloadCarousel` waits for yt-dlp "item N of M" that per-item jobs never emit (dead code). | useDownloaderView.ts:234-240; useDownloaderView.ts:445-471 | No progress screen. Downloading videos stack on the left Downloads nav icon, each new one on top. When done, they animate into the playlist card when the user opens Playlists (into the existing card, or the new card into its spot), same animation as library downloads. Must NOT inherit the library bug where the flying thumbnail disappears while scrubber previews are extracted (that library bug is fixed separately later). |
| Failures not classified (no private/deleted/members-only handling). Auto-retry x3 even when pointless; `timed_out` never auto-retried. | downloadQueueSlice.ts:669 | Plain-language reasons. No retry for private/members-only when the yt-dlp error says so. |
| Queue persisted in sessionStorage, likely lost on restart. | downloadQueue.ts:239, 531-547 | Persist to disk, async writes, offer resume on launch. |
| Duplicates match on exact title alone, false positives. | duplicateDownload.ts:105-128 | URL first, then title plus duration within about 2s. |

## Playlist watch

- Blind to video playlists (see sidecar item above).
- No UI listing watched playlists or their failures (`fail_count` is Rust-only).
- Bell item text grows unbounded: src/playlistWatch/recordToItem.ts:29.
- Check interval shares the channel watchlist setting.
- Queue action queues all new videos and returns false silently when storage blocks downloads: src/playlistWatch/queueNewVideos.ts.
- Fix: make it work for video. Angel already planned auto-download of new videos; it is just broken.

## Library

| Broken | Where | Decided fix |
| --- | --- | --- |
| Thumbnail override fallback uses the raw video path, likely a broken image. | src/virtualPlaylists.ts:214-223 | Fix fallback to a real thumbnail source. |
| Empty Music playlists leak into the video Playlists filter even with hide-audio on (0 items does not count as all-audio). | virtualPlaylists.ts:247-257; mainLibraryFilter.ts; MediaView.tsx:233/256 | Filter by kind. |
| Watch later can appear in creator Playlists. | creatorSections.ts:48-53 | Exclude system playlists. |
| Watch later icon mismatch: card uses ListVideo, Save popover uses Clock. | SaveToPlaylistPopover.tsx:207 | Use one icon in both. |
| Home "Your playlists" row has no See all link. | LibraryHome.tsx:89-95 | Add See all. |
| Delete playlist has no confirm. Disk playlists cannot be deleted from the card. | MediaView.tsx:640-650 | Add confirm; allow delete of disk playlists from the card. |
| New playlists all named "Playlist". | SaveToPlaylistPopover.tsx:102-107 | Ask for a name, prefilled with an automatic number. |

Decided card behavior: "New" badge when videos were added since last opened. No progress ring, no channel avatar, no duration on the card (decided against).

## Detail screen (stays YouTube-style, not Spotify)

| Broken | Where | Decided fix |
| --- | --- | --- |
| Title shows underscores; card hides them. | PlaylistDetailView.tsx:162 vs PlaylistStackCard.tsx:54 | Same display name in both. |
| No rename or description for video playlists; functions exist but only Music uses them. Row menu only offers remove/move/set thumbnail. | PlaylistDetailView | Add rename and description; extend row menu. |
| Disk playlists cannot be reordered (sort/drag only for virtual). | PlaylistDetailView | Order stored on disk. |
| Drag reorder looks bad: dragged card barely visible, other rows do not move apart. Drop works. | PlaylistDetailView | Visible drag preview; rows part to show the slot. |
| Drop after a reorder drag fires downloader toast "No supported URL in drop.". | src/features/downloader/dropIntake.ts | Reorder drops must not reach global drop intake. |
| Numbers turn into the grip in manual sort. | PlaylistDetailView | Always numbered, grip on hover only, every playlist. |
| Remove from a virtual playlist has no confirm. | PlaylistDetailView | No confirm; undo toast. |
| Empty-state copy wrong for disk playlists. | PlaylistDetailView.tsx:250-252 | Correct copy per playlist kind. |
| No watched state on rows. | PlaylistDetailView | Show watched state. |
| No missing-file state: missing files silently dropped; video items lack `identityKey` so moved files are lost (relocation is Music-only). | virtualPlaylists.ts:209-213; ruforgeStore.ts:618-632 | Grey "Missing" rows with Relocate/Remove; add `identityKey` to video items. |
| Cramped at small window sizes; fine on large. | PlaylistDetailView | Fix small-window layout. |

## Playback

| Broken | Where | Decided fix |
| --- | --- | --- |
| Sticky shuffle: Shuffle writes `musicShuffleOn`, then every later Play all smart-shuffles. Reproduced: Play all started at video 7. | ruforgeStore.ts:1137, 1151 | Play all always uses playlist order unless shuffle was chosen for that action. |
| Global Next-up sort reorders playlist playback. | PlayerView.tsx:186-188; nextUpOrder.ts | Always playlist order. |
| Video does not auto-advance in a playlist; end screen suggests whole-library videos. Loop all loops the whole library. | PlayerView.tsx:541-546, 784-790 | Scope auto-advance, end screen and loop to the playlist. |
| Autoplay countdown gated by audio setting "Auto-advance local audio". | PlayerView.tsx:741, 808; SettingsView.tsx:1606 | Decouple from the audio setting. |
| Card Play all passes source null; detail passes a music-helper source. | PlaylistStackCard / PlaylistDetailView (unverified lines) | Use one consistent playlist source. |
| Continue watching and In progress/Watched filters skip playlist items; creator counts include them. | MediaView.tsx:233-234, 298-299 | Include playlist items consistently. |

## Decided new behavior (season model)

- Playlists behave like a season. Not started: button says Play all. Started: "Resume where you left off", with a small nub on its left that opens a Start over button beneath it.
- Start over begins at the playlist's start video. Default start video is #1.
- Dragging a video onto the cover area sets it as the start video (does NOT move it in the order) and shows an indicator on that row.
- Drop a YouTube video or playlist URL onto an existing playlist card to download into it.
- No early completion threshold: Resume always continues the current video from its saved position, even past 90%. YouTube videos have no credits padding the end the way anime does, so a video only counts as done when it actually ends.
- Shuffle counts as started. Resume continues the same shuffled order.
- Watching a playlist's video from anywhere (library, creator page) moves that playlist's resume point.
- Recommended playlists shelf at the bottom of the Playlists filter, like Games mode's RecommendedGamePlaylistCard but with a new design for video.

## Other

- Export from a playlist is flat files, loses order and folder.jpg: MediaView.tsx:627-630; export.rs:280-300 (folder branch unused). Fix direction: not yet decided.
- Regroup is Debugging-only, move failures are counted silently as skipped, no undo: gallery.rs:1518-1590. Fix direction: not yet decided.
- Branch `feat/playlist-import-cli` (Music import CLI) can be merged whenever.

## Picked ideas (from other apps)

- Play next / Add to queue (video has no queue today; Music has it)
- Bulk watched actions: mark all watched, mark all unwatched, remove watched
- Suggested videos under a playlist, from the library (Spotify-style)
- More sort options: upload date, duration, title, date added; sorting is a view and never rewrites the order
- Already-added warning when saving a video into a playlist that has it
- Recently played sort on the Playlists page
- Shift+N / Shift+P for next / previous video (Settings > Shortcuts row)
- End-of-playlist choice: stop, loop, or continue with a suggested video

Rejected: unwatched-only filter, auto 2x2 cover mosaic, pin and folders, saved-not-downloaded playlists, open/save .m3u.
