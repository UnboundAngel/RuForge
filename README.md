# RuForge

RuForge is a YouTube downloader with a library to watch your videos and a mini player to listen to music.

my friend and i just wanted to watch YouTube videos without ads and offline. i figured i'd just build everything we both wanted in one place rather than piecing together a bunch of different tools.

i don't know if there's better things out there, but what i do know is that RuForge works well for what it is. it's a little niche. it only works on Windows for now. it's not Plex, Jellyfin, or Kodi, though i personally use those for movies. RuForge is built around YouTube and doesn't try to be a general-purpose media manager. i don't plan on supporting anything beyond that right now.

## what it does

downloads run on yt-dlp. we handle playlists and cookies from your browser. there's a built-in browser you can use for cookies if you'd prefer that instead. subtitles, quality picks, and parallel downloads are all optional and configurable in settings. everything you download goes into both your file system and the library inside the app.

the media player has keyboard controls, playback speed, a subtitle overlay, and chapter support. any video you start will pick back up where you left off when you reopen it. i took reference from Spotify when building it, so that's kind of the vibe you'll get, especially when you shrink it down to the mini player.

the built-in browser is specifically for cookies, but you can also build your download queue directly from it while you're browsing.

## stack

Tauri v2, Rust backend, React and TypeScript frontend. Windows only for now. yt-dlp and ffmpeg handle the media side.

## status

version 0.1.7. two of us use it every day and it works well. not 1.0 yet, a few things are still half-wired.

discussions are open if you want to ask something or share how you're using it.

## install

download the latest setup `.exe` from the [Releases](https://github.com/UnboundAngel/RuForge/releases) page and run it. Windows may show a SmartScreen warning the first time, click "more info" then "run anyway". no additional software required.

## building from source

clone the repo:
git clone https://github.com/UnboundAngel/RuForge.git
cd RuForge

install dependencies:
npm install

run in development:
npm run tauri dev

build for production:
npm run tauri build

builds land in `src-tauri/target/release/`. standalone exe is `ruforge.exe`, installers are under `bundle/nsis/` and `bundle/msi/`.

## license

Apache-2.0. see [LICENSE](./LICENSE).
