# RuForge

RuForge is a YouTube downloader with a library to watch your videos and a mini player to listen to music.

My friend and I just wanted to watch YouTube videos without ads and offline. I figured I'd just build everything we both wanted in one place rather than piecing together a bunch of different tools.

I don't know if there's better things out there, but what I do know is that RuForge works well for what it is. It's a little niche. It only works on Windows for now. It's not Plex, Jellyfin, or Kodi, though I personally use those for movies. RuForge strictly supports MP4s and YouTube. I don't plan on supporting anything beyond that right now.

## What it does

Downloads run on yt-dlp. We handle playlists and cookies from your browser. There's a built-in browser you can use for cookies if you'd prefer that instead. Subtitles, quality picks, and parallel downloads are all optional and configurable in settings. Everything you download goes into both your file system and the library inside the app.

The media player has keyboard controls, playback speed, a subtitle overlay, and resume. Any video you start will pick back up where you left off when you reopen it. I took reference from Spotify when building it, so that's kind of the vibe you'll get, especially when you shrink it down to the mini player.

The built-in browser is specifically for cookies, but you can also build your download queue directly from it while you're browsing.

## Stack

Tauri v2, Rust backend, React and TypeScript frontend. Windows only for now. yt-dlp and ffmpeg handle the media side.

## Status

Version 0.1.4. Two of us use it every day and it works well. Not 1.0 yet. A few things are still half-wired and the repo has some gaps:

- No LICENSE file committed yet. It's Apache-2.0, just hasn't landed in the tree.
- No GitHub topics set.
- Roadmap is in internal notes for now, not a public file.

## Install

Download the latest setup `.exe` from the [Releases](https://github.com/UnboundAngel/RuForge/releases) page and run it. No additional software required.

## Building from Source

Clone the repo:

```bash
git clone https://github.com/UnboundAngel/RuForge.git
cd RuForge
```

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run tauri dev
```

Build for production:

```bash
npm run tauri build
```

Builds land in `src-tauri/target/release/`. Standalone exe is `ruforge.exe`, installers are under `bundle/nsis/` and `bundle/msi/`.

## License

Apache-2.0. File's coming soon.
