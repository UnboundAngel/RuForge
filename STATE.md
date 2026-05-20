# RuForge — STATE

> Live cursor. Every agent (Chad, Jim / Gemini CLI, Claude) reads this FIRST,
> before any task, and updates it LAST, after any task that changed shipped
> behavior or moved the project. On version bump the release ritual rolls
> this header. If this file and the code disagree, the code wins and this
> file is stale: fix it forward, do not trust it blindly.

Shipping version: 0.1.6 (unreleased)
Last shipped to users: 0.1.5
Last updated: 2026-05-19
Status: in progress

## Now

0.1.5 is live on main updater.json. 0.1.6 code is on main; version triplet
and Shipped log are aligned. Build signed installer next, then run the 0.1.6
release ritual (updater.json, graph surfaces). Open P0 is empty; Authorize
Cleanup (#8) works via the in-app modal (see Notes).

## What is new since last user release

Closed release 0.1.5 (what users on 0.1.5 received). The release-note drafter
reads this for the last shipped delta, not the git tree. For the in-flight
0.1.6 cycle, mirror AGENTS.md Shipped log into this section after each ship
task until the ritual rolls the header.

**0.1.5 shipped:**

Additions:
- Audio-only download mode. Toggle extracts audio only, no video file on disk.
- Processing phase. Queue row and hero show "Processing" while ffmpeg extracts.
- In-app delete confirm modal. Replaces native confirm() which is dead in WebView2.
- Duplicate skip feedback. "Already in library" then row removes.

Fixes:
- Ghost queue rows on library delete. Queue job removed when its file is deleted.
- Hero URL not clearing after download. Clears when finished URL matches hero.
- Double-dot sidecar bug. Scanner now finds Title..info.json, fixes ~43% of
  library entries that had null sourceUrl.

**0.1.6 unreleased (see AGENTS.md Shipped log, keep in sync):**
- Mini player controls. Tiny title shifts when hover sidebar opens; compact
  shuffle picks a random library track and hides with the volume slider.
- Mini player Video Library. Locks browse mode to 430x275 (no resize); hides redundant library toggle; removed header camera icon glow.
- Mini player micro layout. Added an even smaller micro layout (Size 2: height 86-135px; Size 1: height 70-85px) with the minimum window height set to 70px. In Size 1, a marquee track title renders on the left, and Play & Next controls render on the right. Sidebars and controls stay in static horizontal positions on hover (no layout shifting). In Size 2, Loop and Rewind controls dynamically hide when the window width drops below 250px and 210px. In Size 2, a Pin button renders in the top-right corner on hover, while in Size 1, the Pin button is removed and the Back to Library button displays in the top-right corner on hover instead. Restored the full background image layout fading to the right in all compact modes, and removed the small sticker cover art square in Size 1. Added smooth spring and fade animations for the metadata when entering Size 1.
- Mini player metadata and controls. Wired the compact mode title display with the `MarqueeText` scrolling component for long titles, conditionally removed the empty subtitle row when the uploader/artist metadata is unavailable (replacing the fallback "RuForge Media" text), aligned thumbnail fallback priority to prefer local `thumbnailPath` over `ruforgePosterPath`, and introduced dynamic button sizing/spacing that automatically scales down under 250px window widths to prevent controls from overflowing the window.
- Video preview loading. Added the `poster` attribute referencing the `coverArtSrc` thumbnail to the `<video>` elements in `MiniPlayer.tsx` and `PlayerView.tsx` to ensure the actual thumbnail/preview is loaded and displayed immediately when swapping videos instead of displaying a blank screen or a decoded first frame of the video.
- Audio visualizer SVG path crash. Padded the `idlePaths1` array in `MiniPlayer.tsx` to 3 elements to match the length of `playingPaths1` and `playingPaths2`, preventing Framer Motion from looking up `undefined` keyframe values and throwing a `<path> attribute d: Expected moveto path command` error when toggling play/pause.
- Mini player cover art. Refactored cover art backgrounds into a unified component inside the main container to fix visibility issues when resized; small mode and compact mode display the cover art using the identical full absolute inset-0 background layout with a smooth horizontal black gradient overlay to prevent any shifting, misalignment, or differing crop ratios, and large mode displays full background cover art with a blurred backing and gradient dark overlay for maximum readability.
- Mini player layout. Wired compact responsive mode below 180px height using AnimatePresence; styled the compact controls (track title, artist/uploader name parsing, and morphing circular audio visualizer row, clean overlay volume slider with no card background, and right export button), unified cover art rendering with borderless blending into background, a tight centered control cluster (Shuffle, Rewind, Play, Next, Repeat), and a prominent shadowless Play/Pause button colored with the user's custom accent color. Upgraded the visualizer in the top right to a dual-layered morphing fluid orb with ambient glow (removed the outer circle), removed the placeholder "RuForge Media" artist fallback, and added an animated hover shift that moves metadata down when hovered to prevent overlapping top controls. In the non-compact small player layout, morphed/blended the left cover art into the background instead of displaying it as a boxed square.
- Explorer title bar. Back, forward, reload in ExplorerTitlebarNav flush at
  sidebar edge; queue stays in WindowControls.
- Sidebar collapse label. No popLayout flash while the rail narrows.

## Open P0 (blocks release)

(none)

## Next 3 (priority order)

1. F-12 estimate accuracy. get_video_info simulate ignores format and cookies,
   produces wildly wrong size estimates. Prerequisite for storage-check (#10).
2. ETA smoothing (#9). Rolling average over last N progress samples instead of
   instantaneous rate.
3. 429 / rate-limit spacing (#11). Configurable delay between job starts (not retry-on-failure).

## Notes (not P0)

- Authorize Cleanup (#8) is shipped and works via AuthorizeCleanupModal +
  delete_media_batch toward ~75% of the storage cap. The legacy Rust
  authorize_cleanup command is not used by the UI. Do not list this as broken.

## Project reference (static, rarely changes)

Core value: local YouTube downloader and player. The downloader is the wedge.
Player, gallery, Explorer support that story. Not a Plex competitor.
Stack: Tauri v2, Rust, React 19, TypeScript, Zustand, yt-dlp.
Windows: two webviews, main and mini, optional explorer. Zustand does not span
webviews. Cross-window sync is Tauri emit/listen only.
Version triplet must stay aligned every bump: package.json,
src-tauri/tauri.conf.json, src-tauri/Cargo.toml.
Zustand audit doc (cite, do not restate inline):
c:\Users\Attic\.cursor\plans\zustand_migration_audit_53cd5b61.plan.md
