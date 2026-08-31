import type { ImageMetadata } from 'astro';
import heroDownload from '../assets/screenshots/02-download-downloading.webp';
import heroMusic from '../assets/screenshots/03-music-now-playing.webp';
import playerChapters from '../assets/tutorials/player/player-chapters.png';
import sponsorScrub from '../assets/tutorials/sponsor/sponsor-scrub.png';

export interface LandingFeatureRow {
  id: string;
  reverse: boolean;
  pill: string;
  headline: [string, string];
  paragraph: string;
  bullets: [string, string, string];
  image: ImageMetadata;
  imageAlt: string;
}

export const landingFeatureIntro = {
  kicker: 'What you actually get',
  headline: [
    'Download, library, and playback.',
    'Your files, offline, no strings attached.',
  ],
};

export const landingFeatureRows: LandingFeatureRow[] = [
  {
    id: 'downloader',
    reverse: false,
    pill: 'Downloader',
    headline: ['Paste a URL. Hit download.', 'The queue keeps working while you leave the tab.'],
    paragraph:
      'yt-dlp under the hood, with a UI that shows size before you commit. Batches use a card carousel with speed on the active job. Pause, resume, reorder, or replace from the queue. If a job stalls, RuForge kills it and marks it failed instead of pretending it is fine.',
    bullets: [
      'Video or audio-only (real m4a extraction)',
      'Playlists land in numbered folders',
      'Deno installs itself when yt-dlp needs a JS runtime',
    ],
    image: heroDownload,
    imageAlt: 'RuForge downloader with an active download in progress',
  },
  {
    id: 'music',
    reverse: true,
    pill: 'Music',
    headline: ['Music mode with a Now Playing rail.', 'Albums, playlists, and cover art that stays put.'],
    paragraph:
      'Explore music.youtube.com in-app, pull playlists as audio, and keep listening from the Now Playing rail. Library shelves group albums and artists. Sidecars track which tracks finished so a partial playlist download is not a mystery.',
    bullets: [
      'Audio-only batch downloads from Music Explore',
      'Now Playing rail with lyrics when available',
      'Playlist status sidecars under your Playlists folder',
    ],
    image: heroMusic,
    imageAlt: 'RuForge music Now Playing rail with cover art and playback controls',
  },
  {
    id: 'chapters',
    reverse: false,
    pill: 'Chapters',
    headline: ['Chapters on the scrub bar.', 'Hover a segment to preview the frame.'],
    paragraph:
      'If the video has chapters in its yt-dlp sidecar, the scrub bar splits into labeled segments. Hover shows a frame from the sprite sheet ffmpeg built after download. Jump with prev/next or Shift+arrow.',
    bullets: [
      'Sprite sheets generate after download (optional in Settings)',
      'Long chapter titles scroll instead of clipping',
      'No extra network call; chapters come from the sidecar',
    ],
    image: playerChapters,
    imageAlt: 'RuForge player chapter scrubber with hover preview',
  },
  {
    id: 'sponsorblock',
    reverse: true,
    pill: 'SponsorBlock',
    headline: ['Skip sponsors on files you already own.', 'Same categories as the browser extension.'],
    paragraph:
      'First play fetches segments and writes a sidecar next to the video. After that it works offline. Categories include sponsor, intro, outro, self-promo, and music offtopic. It learns what you actually skip.',
    bullets: [
      'Color-coded ranges on the scrub bar',
      'On by default; tune categories in Settings',
      'Privacy hash fetch (prefix only, not the full id)',
    ],
    image: sponsorScrub,
    imageAlt: 'RuForge player with SponsorBlock scrub overlay',
  },
];
