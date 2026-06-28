# RuForge

RuForge is a local-first desktop app built around yt-dlp: download YouTube video and audio, keep a library on disk, watch offline, and listen in a separate music mode that feels more like a streaming app than a file browser.

my friend and i just wanted to watch YouTube videos without ads and offline. i figured i'd just build everything we both wanted in one place rather than piecing together a bunch of different tools.

i don't know if there's better things out there, but what i do know is that RuForge works well for what it is. it's a little niche. it's not Plex, Jellyfin, or Kodi, though i personally use those for movies. RuForge is built around YouTube and doesn't try to be a general-purpose media manager. i don't plan on turning it into one or supporting platforms beyond YouTube right now.

## scope

**Windows only** for installs and the auto-updater. i run `npm run tauri dev` on Linux locally, but that is dev-only on my machine, not a shipped target.

for a full feature walkthrough, docs, and release history, see [ruforge.app](https://ruforge.app) (changelog at [/changelog](https://ruforge.app/changelog)).

## what it does

### downloads

downloads run on yt-dlp with a hero-centered queue and multi-item carousel for batches, parallel jobs, playlist batch intake with retry for failed tracks, audio-only mode, duplicate handling, and optional comment sidecars. cookies come from your browser or the embedded YouTube Explorer. subtitles, quality picks, and concurrency are all configurable in settings. everything you download lands on disk and in the in-app library.

the built-in Explorer is mainly for cookies and session flows, but you can also add videos to the download queue while you browse.

### video library and player

the video library scans your download folders (Videos, Music, Movies, Shows, Playlists buckets), tracks watch progress on each card, and opens into a player with keyboard controls, playback speed, custom subtitle overlay, chapters, SponsorBlock, scrub hover previews, a comments drawer, and resume where you left off. the activity island keeps playback and transport controls available when you leave the player tab. pop out to a video mini player when you want something smaller on screen. if the app crashes, a recovery screen offers reload with optional error details.

### windows integration

while video is playing in the main window, the Windows taskbar thumbnail shows transport controls (previous, play/pause, next).

### music mode

music mode is its own shell: Home, Explore, and Library tabs, a now-playing bar, artist/album/track pages with MusicBrainz-backed sidecars, liked songs, and listen stats. playlist batch downloads write `.ruforge-playlist.json` sidecars under `Playlists/{folder}/` so batch status survives restarts. track detail uses a gatefold layout with liner-notes-style credits. Explore embeds music.youtube.com so you can pick tracks and queue audio-only batch downloads. there is a separate music mini player. it shares cookies with the main Explorer but it is not the same UI.

switch modes from the sidebar or hold Alt for the radial menu.

### housekeeping

storage cap with Authorize Cleanup when you need space back, Recently Deleted restore, export bundle for copying media off disk, in-app RuForge updates, and yt-dlp self-update from Settings.

## stack

Tauri v2, Rust backend, React and TypeScript frontend, Zustand for main-window state. yt-dlp, ffmpeg, and ffprobe ship as bundled sidecars. Deno is optional: install from Settings when YouTube downloads need a JS runtime; it lands in app data, not the system path.

## status

version 0.2.0 shipped. two of us use it every day. still pre-1.0 and actively developed; see the [roadmap](https://ruforge.app/roadmap) and [changelog](https://ruforge.app/changelog) on the site for what is new and what is next.

[GitHub Discussions](https://github.com/UnboundAngel/RuForge/discussions) are open if you want to ask something or share how you're using it.

## install

download the latest setup `.exe` from the [Releases](https://github.com/UnboundAngel/RuForge/releases) page and run it. Windows may show a SmartScreen warning the first time, click "more info" then "run anyway". no additional software required (yt-dlp, ffmpeg, and ffprobe are bundled; Deno is optional from Settings if YouTube needs it).

## building from source

clone the repo:

```bash
git clone https://github.com/UnboundAngel/RuForge.git
cd RuForge
```

install dependencies:

```bash
npm install
```

run in development:

```bash
npm run tauri dev
```

build for production:

```bash
npm run tauri build
```

builds land in `src-tauri/target/release/`. standalone exe is `ruforge.exe`, installers are under `bundle/nsis/` and `bundle/msi/`.

## privacy

no telemetry in a standard session. an optional debugging suite (off by default) includes developer tooling and gated telemetry for maintainer use. see the [privacy policy](https://ruforge.app/legal/privacy) on the site for what leaves your machine.

## license

Apache-2.0. see [LICENSE](./LICENSE).
