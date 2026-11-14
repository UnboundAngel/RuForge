/**
 * RuForge vs competitor pages, shared by desktop and mobile routes.
 * Every competitor claim comes from that app's own site, README or release
 * notes as of `checked`; re-check them before changing the date.
 */

import type { ImageMetadata } from 'astro';
import parabolicLogo from '../assets/compare/parabolic.png';
import tartubeLogo from '../assets/compare/tartube.png';
import fourKLogo from '../assets/compare/4k-video-downloader.svg';

export type CompareMark = 'yes' | 'no' | 'some';

export interface CompareCell {
  mark: CompareMark;
  note: string;
}

export interface CompareRow {
  feature: string;
  ruforge: CompareCell;
  them: CompareCell;
}

export interface CompareSource {
  label: string;
  href: string;
}

export interface ComparePageDef {
  slug: string;
  name: string;
  /** Fits the app labels in the narrow both-have rows. */
  shortName?: string;
  /** The app's official icon, from its own repo or site. */
  logo: ImageMetadata;
  /** Main color of the app's logo; the Download button morphs to it on the site circle. */
  brandColor: string;
  /** Text color that passes contrast on brandColor. */
  brandInk: string;
  /** Price and license line for the mobile index row. */
  priceLine: string;
  /** Price fact on the index card. */
  price: string;
  /** One short sentence for the index card. */
  blurb: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  /** ISO date the competitor facts were last checked. */
  checked: string;
  pickRuforge: string[];
  pickThem: string[];
  rows: CompareRow[];
  sources: CompareSource[];
}

/** RuForge's column uses the desktop app's own charcoal palette (src/index.css), not the site's brown. */
export const RUFORGE_BRAND = { color: '#fafaf9', ink: '#121212', bg: '#1a1a1a', head: '#242424', muted: '#c4c4c2' };

/** CSS variables both compare layouts read for the two app columns. */
export const compareVars = (page: { brandColor: string; brandInk: string }) =>
  `--cmp-ours: ${RUFORGE_BRAND.color}; --cmp-ours-ink: ${RUFORGE_BRAND.ink}; --cmp-ours-bg: ${RUFORGE_BRAND.bg}; --cmp-ours-head: ${RUFORGE_BRAND.head}; --cmp-ours-muted: ${RUFORGE_BRAND.muted}; --cmp-them: ${page.brandColor}; --cmp-them-ink: ${page.brandInk}; --cmp-them-muted: #dbc88b`;

const yes = (note = ''): CompareCell => ({ mark: 'yes', note });
const no = (note = ''): CompareCell => ({ mark: 'no', note });
const some = (note: string): CompareCell => ({ mark: 'some', note });

export const COMPARE_PAGES: ComparePageDef[] = [
  {
    slug: 'parabolic',
    name: 'Parabolic',
    logo: parabolicLogo,
    brandColor: '#e8453c',
    brandInk: '#1d1613',
    priceLine: 'Free, MIT',
    price: 'Free',
    blurb: 'A focused yt-dlp downloader for Windows, macOS, and Linux.',
    metaTitle: 'RuForge vs Parabolic: free yt-dlp GUIs for Windows compared',
    metaDescription:
      'RuForge and Parabolic are both free, open-source yt-dlp apps. See which one fits: platforms, playlists, clips, SponsorBlock, and a built-in library and player.',
    description:
      'Both are free, open-source apps that run yt-dlp for you. Parabolic is a focused downloader for Windows, macOS, and Linux. RuForge is Windows only and keeps going after the download, with a library, a player, and a music mode.',
    checked: '2026-10-21',
    pickRuforge: [
      'You want to watch and organize what you download in the same app',
      'You want to follow channels and have new uploads download on their own',
      'You want to see the file size before you download',
    ],
    pickThem: [
      'You are on macOS or Linux, or want a portable build',
      'You download from sites other than YouTube',
      'You want to cut a clip out of a video or split it into chapter files',
    ],
    rows: [
      { feature: 'Price', ruforge: yes('Free, Apache 2.0'), them: yes('Free, MIT') },
      { feature: 'Platforms', ruforge: some('Windows only'), them: yes('Windows, macOS, Linux') },
      { feature: 'Sites', ruforge: some('YouTube only'), them: yes('Hundreds via yt-dlp') },
      { feature: 'Playlists', ruforge: yes('Reorder, checks for new'), them: yes('Yes') },
      { feature: 'Several downloads at once', ruforge: yes('Up to 6'), them: yes('Yes') },
      { feature: 'Audio formats', ruforge: yes('m4a, mp3, opus'), them: yes('mp3, opus, flac, wav') },
      { feature: 'Subtitles', ruforge: yes('Downloads and shows'), them: yes('Downloads') },
      { feature: 'SponsorBlock', ruforge: yes('Skips while you watch'), them: yes('Cuts from the file') },
      { feature: 'Download a clip or time range', ruforge: no(), them: yes() },
      { feature: 'Chapters', ruforge: yes('In the player'), them: yes('Splits into files') },
      { feature: 'Signed-in downloads', ruforge: yes('Sign-in or cookies'), them: yes('Browser cookies or file') },
      { feature: 'Browse YouTube in the app', ruforge: yes(), them: no() },
      { feature: 'Follow channels', ruforge: yes('Alerts and auto-download'), them: no() },
      { feature: 'Library and player', ruforge: yes(), them: no('History only') },
      { feature: 'Music mode', ruforge: yes(), them: no() },
      { feature: 'Portable build', ruforge: no(), them: yes() },
    ],
    sources: [
      { label: 'Parabolic README', href: 'https://github.com/NickvisionApps/Parabolic' },
      { label: 'Parabolic 2026.5.0 release notes', href: 'https://github.com/NickvisionApps/Parabolic/releases/tag/2026.5.0' },
    ],
  },
  {
    slug: 'tartube',
    name: 'Tartube',
    logo: tartubeLogo,
    brandColor: '#9b4fd0',
    brandInk: '#ffffff',
    priceLine: 'Free, LGPL 2.1',
    price: 'Free',
    blurb: 'A long-running archiving tool with deep options and channel tracking.',
    metaTitle: 'RuForge vs Tartube: yt-dlp GUIs for Windows compared',
    metaDescription:
      'RuForge and Tartube are both free, open-source yt-dlp apps. Compare channel tracking, SponsorBlock, clips, playback, and platforms.',
    description:
      'Both are free and open source, and both can keep track of channels for you. Tartube is a long-running archiving tool with a deep set of options. RuForge is newer, Windows only, and built around watching what you saved.',
    checked: '2026-10-21',
    pickRuforge: [
      'You want a modern app where you paste a link and go',
      'You want to watch downloads in a built-in player instead of a separate one',
      'You want a music mode for the songs you save',
    ],
    pickThem: [
      'You archive many channels and want fine control over every option',
      'You want livestream alerts or download from sites other than YouTube',
      'You want clips, or sponsor segments cut out of the file itself',
    ],
    rows: [
      { feature: 'Price', ruforge: yes('Free, Apache 2.0'), them: yes('Free, LGPL 2.1') },
      { feature: 'Platforms', ruforge: some('Windows only'), them: yes('Windows, Linux, macOS, BSD') },
      { feature: 'Sites', ruforge: some('YouTube only'), them: yes('YouTube, Twitch, and more') },
      { feature: 'Playlists', ruforge: yes('Reorder, checks for new'), them: yes('Yes') },
      { feature: 'Track channels', ruforge: yes('Alerts and auto-download'), them: yes('Checks and downloads') },
      { feature: 'Automatic downloads', ruforge: yes('New uploads and playlists'), them: yes('On a timer') },
      { feature: 'Browse YouTube in the app', ruforge: yes(), them: no() },
      { feature: 'Livestream alerts', ruforge: some('Premieres only'), them: yes('YouTube, Twitch, Odysee') },
      { feature: 'SponsorBlock', ruforge: yes('Skips while you watch'), them: yes('Cuts from the file') },
      { feature: 'Video clips', ruforge: no(), them: yes() },
      { feature: 'Built-in player', ruforge: yes(), them: no('Opens your player') },
      { feature: 'Music mode', ruforge: yes(), them: no() },
      { feature: 'Portable build', ruforge: no(), them: yes() },
    ],
    sources: [
      { label: 'Tartube README', href: 'https://github.com/axcore/tartube' },
      { label: 'Tartube releases', href: 'https://github.com/axcore/tartube/releases' },
    ],
  },
  {
    slug: '4k-video-downloader',
    name: '4K Video Downloader',
    shortName: '4K Downloader',
    logo: fourKLogo,
    brandColor: '#7db300',
    brandInk: '#1d1613',
    priceLine: 'Free plan, paid from $15 a year',
    price: 'Free plan, from $15/yr',
    blurb: 'A paid app with a limited free plan, on more platforms and sites.',
    metaTitle: 'RuForge vs 4K Video Downloader: a free, open-source alternative',
    metaDescription:
      'Compare RuForge with 4K Video Downloader Plus: price, limits on the free plan, playlists, channel subscriptions, formats, and platforms.',
    description:
      '4K Video Downloader Plus is a well-known paid app with a limited free plan. RuForge is free and open source, with no limits or ads, but it only runs on Windows and only downloads from YouTube.',
    checked: '2026-10-21',
    pickRuforge: [
      'You want everything free, with no download limits, ads, or license keys',
      'You want open-source code you can check',
      'You want a library, player, and music mode in the same app',
    ],
    pickThem: [
      'You are on macOS, Linux, or Android',
      'You download from sites other than YouTube',
      'You want a paid app with a company behind it',
    ],
    rows: [
      { feature: 'Price', ruforge: yes('Free'), them: some('Free plan, from $15/yr') },
      { feature: 'Open source', ruforge: yes('Apache 2.0'), them: no() },
      { feature: 'Ads', ruforge: yes('None'), them: some('Paid to remove') },
      { feature: 'Platforms', ruforge: some('Windows only'), them: yes('Windows, macOS, Ubuntu, Android') },
      { feature: 'Sites', ruforge: some('YouTube only'), them: yes('YouTube, Vimeo, TikTok, more') },
      { feature: 'Highest quality', ruforge: yes('Up to 8K'), them: yes('Up to 8K') },
      { feature: 'Audio formats', ruforge: yes('m4a, mp3, opus'), them: yes('mp3, m4a, ogg') },
      { feature: 'Playlists and channels', ruforge: yes('No limits'), them: some('Limited on free plan') },
      { feature: 'Several downloads at once', ruforge: yes('Up to 6'), them: yes('3, up to 7 on Pro') },
      { feature: 'Subtitles', ruforge: yes('Downloads and shows'), them: yes('Downloads') },
      { feature: 'Channel subscriptions', ruforge: yes('Free'), them: some('Paid') },
      { feature: 'Private and signed-in videos', ruforge: yes('Free'), them: some('Paid') },
      { feature: 'Library and player', ruforge: yes(), them: no() },
      { feature: 'Music mode', ruforge: yes(), them: no() },
    ],
    sources: [
      { label: '4K Video Downloader Plus product page', href: 'https://www.4kdownload.com/products/videodownloader-42' },
      { label: '4K Download license comparison', href: 'https://www.4kdownload.com/buy/videodownloader-8' },
    ],
  },
];

export function findComparePage(slug: string): ComparePageDef | undefined {
  return COMPARE_PAGES.find((p) => p.slug === slug);
}

export function compareHref(slug: string): string {
  return `/compare/${slug}`;
}

const MARK_SCORE: Record<CompareMark, number> = { yes: 2, some: 1, no: 0 };

export type CompareWinner = 'ruforge' | 'them' | null;

export interface CompareTableRow {
  row: CompareRow;
  winner: CompareWinner;
}

export interface CompareTableGroup {
  label: string;
  rows: CompareTableRow[];
}

/** Weighted for a YouTube downloader: getting videos first, price and platform last. */
const GROUP_ORDER = [
  { label: 'Downloading', features: ['Sites', 'Playlists', 'Playlists and channels', 'Several downloads at once', 'Highest quality', 'Audio formats', 'Subtitles', 'Download a clip or time range', 'Video clips', 'Signed-in downloads', 'Private and signed-in videos'] },
  { label: 'Watching and library', features: ['Library and player', 'Built-in player', 'Browse YouTube in the app', 'Chapters', 'SponsorBlock', 'Music mode', 'Interface'] },
  { label: 'Channels', features: ['Follow channels', 'Track channels', 'Channel subscriptions', 'Automatic downloads', 'Scheduled downloads', 'Livestream alerts'] },
  { label: 'Price, license and platforms', features: ['Price', 'Open source', 'Ads', 'Platforms', 'Portable build'] },
];

function winnerOf(row: CompareRow): CompareWinner {
  const diff = MARK_SCORE[row.ruforge.mark] - MARK_SCORE[row.them.mark];
  return diff > 0 ? 'ruforge' : diff < 0 ? 'them' : null;
}

const WIN_ORDER: Record<string, number> = { ruforge: 0, them: 1, none: 2 };

/** Plain "Yes" on both sides: nothing to compare, so it moves to the Both have line. */
const isTie = (r: CompareRow) =>
  r.ruforge.mark === 'yes' && r.them.mark === 'yes' && !r.ruforge.note && !r.them.note;

/** Rows grouped by topic, ties left out; inside a group, rows with a winner lead. */
export function compareTable(page: ComparePageDef): CompareTableGroup[] {
  const placed = new Set<string>();
  const groups = GROUP_ORDER.map((g) => {
    const rows = page.rows
      .filter((r) => g.features.includes(r.feature))
      .map((row) => {
        placed.add(row.feature);
        return { row, winner: winnerOf(row) };
      })
      .filter(({ row }) => !isTie(row))
      .sort((x, y) => WIN_ORDER[x.winner ?? 'none'] - WIN_ORDER[y.winner ?? 'none']);
    return { label: g.label, rows };
  }).filter((g) => g.rows.length > 0);
  const stray = page.rows.filter((r) => !placed.has(r.feature) && !isTie(r));
  if (stray.length) groups.push({ label: 'More', rows: stray.map((row) => ({ row, winner: winnerOf(row) })) });
  return groups;
}

/** Feature names both apps share, lowercased for the Both have line. */
export function bothHave(page: ComparePageDef): string[] {
  return page.rows.filter(isTie).map((r) => r.feature.charAt(0).toLowerCase() + r.feature.slice(1));
}

/** The competitor home page is the first source link. */
export function compareSiteHref(page: ComparePageDef): string {
  return page.sources[0].href;
}

export function platformsOf(page: ComparePageDef): string {
  return page.rows.find((r) => r.feature === 'Platforms')?.them.note ?? '';
}

export function bestIf(items: string[]): string {
  const first = items[0] ?? '';
  return 'Best if ' + first.replace(/^You /, 'you ');
}

export function formatChecked(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const COMPARE_INDEX = {
  metaTitle: 'Compare RuForge with other YouTube downloaders',
  metaDescription:
    'How RuForge, a free and open-source yt-dlp GUI for Windows, compares with Parabolic, Tartube, and 4K Video Downloader.',
  description: 'RuForge next to other apps people use to save YouTube videos, and what each one does better.',
};
