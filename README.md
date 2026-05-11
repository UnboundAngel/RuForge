# NeoTube

NeoTube is a premium, high-fidelity desktop application for downloading and managing YouTube media. Built with a focus on modern aesthetics, fluid animations, and a seamless user experience, NeoTube combines a powerful Rust backend with a stunning glassmorphic React frontend.

## 🌟 Features

- **Premium Design System:** Soft geometry, glassmorphism, and layered depth powered by Tailwind CSS.
- **Fluid Animations:** Every interaction, page transition, and micro-interaction is animated using Framer Motion.
- **Robust Downloading Engine:** Seamless integration with `yt-dlp` for high-quality video and audio extraction.
- **Local Media Gallery:** A dynamic, YouTube-style gallery to manage and explore your downloaded content natively.
- **Custom Media Player:** A sleek, borderless video player with flat, modern controls, scrubbing, and speed adjustments.
- **MiniPlayer:** Seamlessly pop out videos into a persistent mini-player.
- **Customizable Settings:** Change download directories, format preferences, and global accent colors.

## 🛠 Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Styling & Animation:** Tailwind CSS, Framer Motion, Lucide Icons
- **Backend & Native Windowing:** Tauri (Rust)
- **Downloading:** `yt-dlp`, FFmpeg

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your system:
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

## 🔮 Roadmap

Check out the [miniplayer_plan.md](./miniplayer_plan.md) for our upcoming Quality of Life features, which include:
- Hover-to-Peek scrubber thumbnails.
- Double-Tap to seek functionality.
- Global Media Hotkeys and Smart Transparency.
- Persistent volume and playback state memory.

## 📝 License

This project is licensed under the MIT License.
