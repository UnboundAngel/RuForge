# RoForge

RoForge is meant to make youtube easier, and last even when you go offline. If you have a playlist you want to watch, or just a single video, grab the link of the video from RoForges in-app browser and just drop it into the text box and hit download. It will automatically send your video to the path you have selected in settings. 

## Features

- **Downloading engine (WIP):** integration with `yt-dlp` for video and audio extraction.
- **Local Media Gallery:** A place in-app to watch all of the videos you have from youtube; both pre-existing and downloaded in the app. 
- **MiniPlayer:** A spotify-like mini player for playing your videos or just listening to them. 

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Styling & Animation:** Tailwind CSS, Framer Motion, Lucide Icons
- **Backend & Native Windowing:** Tauri (Rust)
- **Downloading:** `yt-dlp`, FFmpeg

## Getting Started

### Prerequisites

You will need to have the following software on your system:
- [Node.js](https://nodejs.org/) (v16+)
- [Rust](https://www.rust-lang.org/tools/install)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (must be accessible in your system PATH or bundled)
- [FFmpeg](https://ffmpeg.org/) (required for media merging and processing)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/neotube.git
   cd neotube
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run tauri dev
   ```

### Building for Production

To build the standalone executable for your operating system:
```bash
npm run tauri build
```
The compiled installer and executable will be available in the `src-tauri/target/release/bundle` directory.

## Roadmap

All plans go into [miniplayer_plan.md](./miniplayer_plan.md) - if youd like to add onto them, request features, or simply recommend a fix feel free to ask. 
