import type { ImageMetadata } from 'astro';
import downloadQueue from '../assets/tutorials/download/download2.png';
import playerAudioHero from '../assets/tutorials/player/player-audio-hero.png';
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
    'Everything streaming won\u2019t give you.',
    'Your files, offline, no strings attached.',
  ],
};

export const landingFeatureRows: LandingFeatureRow[] = [
  {
    id: 'downloader',
    reverse: false,
    pill: 'Downloader',
    headline: ['Paste a link and walk away.', 'Playlists, formats, stall watchdog, all of it.'],
    paragraph:
      'Multi-item batches stay on a centered card carousel with MB/s on the active row. The corner queue still crossfades thumbnails as jobs move. Music playlist downloads write `.ruforge-playlist.json` sidecars with per-track status. If something hangs too long, RuForge kills it and tells you why.',
    bullets: [
      'Deno auto-install when yt-dlp needs a JS runtime',
      'Tells you when the file is already in your library',
      'Pause, resume, reorder, or replace a job in place',
    ],
    image: downloadQueue,
    imageAlt: 'RuForge downloader with floating queue drawer',
  },
  {
    id: 'audio',
    reverse: true,
    pill: 'Audio-only',
    headline: ['Audio that isn\u2019t a video in disguise.', 'Player stays alive when there\u2019s no picture.'],
    paragraph:
      'Turn on audio-only and you get a real m4a, not a giant video stream squeezed into an audio file. Playback shows a full LED equalizer on the cover instead of a dead black box. Side waveforms move with the music while it plays.',
    bullets: [
      'm4a extraction, not a full video re-encoded as audio',
      '90-bar LED visualizer wired to Web Audio',
      'Library cards keep cover art on hover',
    ],
    image: playerAudioHero,
    imageAlt: 'RuForge audio-only player with LED equalizer hero',
  },
  {
    id: 'chapters',
    reverse: false,
    pill: 'Chapters',
    headline: ['Scrub by chapter, not by guesswork.', 'Hover a segment and see the frame.'],
    paragraph:
      'Chapters from the yt-dlp sidecar become their own scrub pills. Hover one and you get a preview pulled from the sprite sheet ffmpeg built when you downloaded. Jump with prev/next, or Shift+arrow if you are in a hurry.',
    bullets: [
      'Sprite sheets on download (off in Settings if you want)',
      'Long chapter titles scroll instead of clipping',
      'Chapter data lives in the sidecar, no extra API calls',
    ],
    image: playerChapters,
    imageAlt: 'RuForge player chapter scrubber with hover preview',
  },
  {
    id: 'sponsorblock',
    reverse: true,
    pill: 'SponsorBlock',
    headline: ['Sponsor chunks skip on files you already own.', 'Not just in a browser tab.'],
    paragraph:
      'First play pulls segments and saves a sidecar next to the video. Intros, self-promo, music tangents, the usual categories. It learns what you skip versus what you sit through.',
    bullets: [
      'Scrub bar colors match each segment type',
      'On by default; tune categories in Settings',
      'Works offline after the first fetch',
    ],
    image: sponsorScrub,
    imageAlt: 'RuForge player with SponsorBlock scrub overlay',
  },
];
