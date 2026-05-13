# RuForge

RuForge is a powerful, elegant media management and downloading tool designed to make YouTube content easier to access and enjoy offline. Whether you have a full playlist or just a single video, simply drop the link into RuForge, and it will handle the rest.

## Features

- **Zero-Dependency Engine:** Bundles official `yt-dlp` and `FFmpeg` binaries as sidecars. No terminal setup required.
- **Auto-Updater:** Built-in update system that notifies you when a new version is available.
- **High-Performance Downloader:** Integrated with `yt-dlp` for high-quality video and audio extraction.
- **Local Media Gallery:** A beautiful, organized gallery to manage and watch your local media collection.
- **Dynamic MiniPlayer:** A Spotify-inspired, always-on-top mini player for seamless multi-tasking while watching or listening.
- **Customizable UI:** Full control over accent colors, grid density, and playback preferences.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Styling & Animation:** Tailwind CSS, Framer Motion, Lucide Icons
- **Backend & Native Windowing:** Tauri v2 (Rust)
- **Media Engine (Bundled):** `yt-dlp`, FFmpeg

## Getting Started

### Installation

Just download the latest **RuForge Setup (.exe)** from the [Releases](https://github.com/UnboundAngel/RuForge/releases) page and run the installer. No additional software is required.

### Building from Source

1. **Clone the repository:**
   ```bash
   git clone https://github.com/UnboundAngel/RuForge.git
   cd RuForge
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development:**
   ```bash
   npm run tauri dev
   ```

### Building for Production

To generate the standalone `.exe` and installer:
```bash
npm run tauri build
```
The builds will be located in:
- **Standalone EXE:** `src-tauri/target/release/ruforge.exe`
- **Installers:** `src-tauri/target/release/bundle/nsis/` (Setup) and `src-tauri/target/release/bundle/msi/` (MSI)

## Roadmap

Feature plans and bug tracking are maintained in [miniplayer_plan.md](./miniplayer_plan.md).
