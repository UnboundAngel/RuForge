import type { ImageMetadata } from 'astro';
import { SITE } from './site';
import musicHome from '../assets/screenshots/landing-music.webp';
import downloaderPaste from '../assets/screenshots/landing-downloader.webp';
import videoLibrary from '../assets/screenshots/landing-library.webp';
import playerChapters from '../assets/tutorials/player/player-chapters.png';
import skipFiller from '../assets/screenshots/landing-skip-filler.webp';

export interface LandingFeatureRow {
  id: string;
  reverse: boolean;
  pill: string;
  /** Short label for the mobile accordion row, which has room for about 24 characters. */
  title: string;
  headline: string;
  /** One thought per line, split on `\n`; each line renders as its own spaced row. */
  paragraph: string;
  bullets: [string, string, string];
  image: ImageMetadata;
  imageAlt: string;
}

export const landingFeatureIntro = {
  kicker: 'what it does',
  headline: 'save videos and music from YouTube and play them offline',
};

const LOGIN_CODE_URL = `${SITE.github}/blob/main/src-tauri/src/commands/explorer_cookies.rs`;

/** Paragraphs are trusted HTML so they can carry `.rf-inline-link` anchors. `base` is '' on desktop, '/m' on mobile. */
export function landingLoginTrust(base: '' | '/m') {
  const privacy = `${base}/legal/privacy`;
  const linkClass = base === '/m' ? 'rf-inline-link rf-m-link' : 'rf-inline-link';
  const link = (href: string, label: string) => `<a class="${linkClass}" href="${href}">${label}</a>`;
  return {
    headline: 'your YouTube login stays between you and YouTube',
    paragraphs: [
      "you sign in on YouTube's own page inside RuForge, the same one you'd see in a browser. when you download something, RuForge hands your session to the downloader for that one job and deletes the copy when it finishes. you can also use the login from your normal browser, or none at all",
      `there's no RuForge account and nothing to pay for, and no ${link(`${privacy}#no-telemetry`, 'usage stats or crash reports')} unless you turn them on. the only time RuForge calls home is the ${link(`${privacy}#update-check`, 'update check')}, which ruforge.app counts`,
    ],
    note: `read ${link(`${privacy}#login-cookies`, 'where your login goes')} in the privacy policy, or ${link(LOGIN_CODE_URL, 'the code that handles it')} on GitHub`,
  };
}

export const landingFeatureRows: LandingFeatureRow[] = [
  {
    id: 'downloader',
    reverse: false,
    pill: 'downloader',
    title: 'download YouTube videos',
    headline: 'paste a link to download one video or a whole playlist',
    paragraph: [
      'you see the file size before anything starts downloading',
      'queue up as many links as you want, and choose how many download at once',
      'pause, resume, or reorder anything in the queue',
      "if a download gets stuck, RuForge stops it and marks it failed so it doesn't hang forever",
    ].join('\n'),
    bullets: [
      'save just the audio as an m4a file',
      'playlists save into their own folder, numbered in order',
      'the extra tools YouTube downloads need install themselves',
    ],
    image: downloaderPaste,
    imageAlt: 'RuForge downloader showing a pasted YouTube video with its length, estimated size, and a download button',
  },
  {
    id: 'library',
    reverse: true,
    pill: 'library',
    title: 'everything in one place',
    headline: 'everything you download lands in one library',
    paragraph: [
      'videos are grouped by the day you saved them, newest first',
      'separate tabs for playlists, videos you started, and videos you finished',
      'open a video you stopped halfway and it picks up where you left off',
    ].join('\n'),
    bullets: [
      'play a whole playlist in order or shuffle it',
      'each video shows its length and size on disk',
      'saved videos play without an internet connection',
    ],
    image: videoLibrary,
    imageAlt: 'RuForge video library with a saved video and new uploads from followed channels',
  },
  {
    id: 'music',
    reverse: false,
    pill: 'music',
    title: 'a music player built in',
    headline: 'a music player for everything you save from YouTube Music',
    paragraph: [
      'browse YouTube Music inside the app and download songs or whole playlists as audio',
      'your library sorts everything by album and artist, with cover art',
      'lyrics show up while you listen, when the song has them',
      'if a playlist download gets interrupted, RuForge remembers which songs already finished',
    ].join('\n'),
    bullets: [
      'download a full playlist as audio in one go',
      'songs blend into each other between tracks',
      'loop a single song or a whole playlist',
    ],
    image: musicHome,
    imageAlt: 'RuForge music home with quick picks, artists, and the player bar',
  },
  {
    id: 'chapters',
    reverse: true,
    pill: 'chapters',
    title: 'chapters on the seek bar',
    headline: 'chapters on the seek bar, so you can jump to the part you want',
    paragraph: [
      'if a video has chapters, the seek bar splits into named sections',
      'hover anywhere on it to see a preview frame of that moment',
      'skip between chapters with the buttons, or Shift and the arrow keys',
    ].join('\n'),
    bullets: [
      'works offline, chapters are saved with the video',
      'long chapter names scroll so nothing gets cut off',
      'preview frames can be turned off in Settings',
    ],
    image: playerChapters,
    imageAlt: 'RuForge video player with chapters on the seek bar and a hover preview',
  },
  {
    id: 'sponsorblock',
    reverse: false,
    pill: 'SponsorBlock',
    title: 'skips sponsors for you',
    headline: "skips sponsors, even in videos you've already downloaded",
    paragraph: [
      'RuForge uses SponsorBlock, the same community database as the browser extension',
      'the first time you play a video, it looks up the sponsor segments and saves them with the file',
      'after that, skipping works without an internet connection',
    ].join('\n'),
    bullets: [
      'intros, outros, and self-promotion can be skipped too',
      'skipped segments show up in color on the seek bar',
      'the lookup never sends the full video ID',
    ],
    image: skipFiller,
    imageAlt: 'RuForge video player with a filler segment on the seek bar and a Skip filler button',
  },
];
