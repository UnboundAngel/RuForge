import type { ImageMetadata } from 'astro';
import { getTestimonialImage } from './imageAssets';

export type Testimonial = {
  text: string;
  image: ImageMetadata;
  /** e.g. theo-03; cards with the same key share rim color and avatar */
  imageKey: string;
  rimRgb: string;
  name: string;
  role: string;
};

const THEO_IMAGES = [
  'theo-01.webp',
  'theo-02.webp',
  'theo-03.webp',
  'theo-04.webp',
  'theo-05.webp',
  'theo-06.webp',
  'theo-07.webp',
  'theo-08.webp',
  'theo-09.webp',
] as const;

const MAYA_IMAGES = [
  'maya-01.webp',
  'maya-02.webp',
  'maya-03.webp',
  'maya-04.webp',
  'maya-05.webp',
  'maya-06.webp',
  'maya-07.webp',
] as const;

/** Muted rim RGB per avatar file; same key = same border on scroll. */
const IMAGE_RIM_RGB: Record<string, string> = {
  'theo-01': '186 165 128',
  'theo-02': '168 188 152',
  'theo-03': '148 172 186',
  'theo-04': '186 148 128',
  'theo-05': '198 178 142',
  'theo-06': '172 142 186',
  'theo-07': '142 186 168',
  'theo-08': '186 128 148',
  'theo-09': '158 142 118',
  'maya-01': '196 152 142',
  'maya-02': '142 158 196',
  'maya-03': '196 168 142',
  'maya-04': '168 142 172',
  'maya-05': '142 186 162',
  'maya-06': '186 162 142',
  'maya-07': '172 142 158',
};

function imageFileFor(name: 'Theo' | 'Maya', index: number): (typeof THEO_IMAGES)[number] | (typeof MAYA_IMAGES)[number] {
  const pool = name === 'Theo' ? THEO_IMAGES : MAYA_IMAGES;
  return pool[index % pool.length];
}

function imageKeyFrom(fileName: string): string {
  return fileName.replace(/\.webp$/i, '');
}

/** Em/en dashes become a visible middle dot pause (not an em dash). */
export function formatQuoteText(text: string): string {
  return text.replace(/\s[—–]\s/g, ' · ');
}

export type QuoteSegment =
  | { type: 'text'; value: string }
  | { type: 'pause' };

export function quoteSegments(text: string): QuoteSegment[] {
  const parts = text.split(' · ');
  const out: QuoteSegment[] = [];
  parts.forEach((part, i) => {
    out.push({ type: 'text', value: part });
    if (i < parts.length - 1) out.push({ type: 'pause' });
  });
  return out;
}

type QuoteInput = { text: string; name: 'Theo' | 'Maya'; role: string };

/** Home page only. Avatar files live in `src/assets/testimonials/` (see README in public/testimonials). */
const QUOTES: QuoteInput[] = [
  {
    text: 'honestly i just wanted one app for grabbing videos and watching later without a browser tab graveyard — ruforge does that',
    name: 'Theo',
    role: 'uses it daily',
  },
  {
    text: "theo put it on my laptop to 'test' and i still have it. the cooking playlist situation is out of control",
    name: 'Maya',
    role: 'friend',
  },
  {
    text: 'mini player sits in the corner during homework and i keep forgetting its a whole separate window lol',
    name: 'Theo',
    role: 'mini player person',
  },
  {
    text: 'sponsorblock jumped a segment while i was making dinner and i did not expect to care but i did',
    name: 'Maya',
    role: 'playback',
  },
  {
    text: 'we are not calling it neotube anymore. ruforge stuck.',
    name: 'Theo',
    role: 'windows',
  },
  {
    text: 'the floating download list is actually nice?? it doesnt eat the whole screen',
    name: 'Maya',
    role: 'downloader regular',
  },
  {
    text: 'library stays on disk. no account no sync drama that was kinda the whole point',
    name: 'Theo',
    role: 'local library',
  },
  {
    text: 'i still roast him in the group chat. also told my sister to download it so',
    name: 'Maya',
    role: 'friend',
  },
  {
    text: 'when yt-dlp changes something i patch rebuild move on — not glamorous but it keeps working',
    name: 'Theo',
    role: 'maintainer',
  },
  {
    text: 'queued like six baking videos at once and the little card just sat there judging me. worth it',
    name: 'Maya',
    role: 'uses it daily',
  },
  {
    text: 'explorer tab is mostly for cookies when youtube gets annoying. not trying to replace chrome',
    name: 'Theo',
    role: 'explorer when needed',
  },
  {
    text: 'audio only downloads are smaller now thank god my drive was crying',
    name: 'Maya',
    role: 'audio downloads',
  },
  {
    text: 'chapters on the scrub bar look stupidly fancy for something i built in my room but ok',
    name: 'Theo',
    role: 'player',
  },
  {
    text: 'caught an ad skip i didnt even click and did a little chef kiss. dramatic but true',
    name: 'Maya',
    role: 'sponsorblock',
  },
  {
    text: 'download stalled once and the watchdog actually yelled at me (toast). fair',
    name: 'Theo',
    role: 'downloader',
  },
  {
    text: 'replaced a file in library without redownloading the whole channel — felt like cheating',
    name: 'Maya',
    role: 'library',
  },
  {
    text: 'volume mixer finally says ruforge instead of whatever webview2 is. tiny win huge',
    name: 'Theo',
    role: 'windows',
  },
  {
    text: 'mini player tiny mode is cursed i love it. title marquee at 70px height is insane',
    name: 'Maya',
    role: 'mini player',
  },
  {
    text: 'settings sponsorblock tree is nested chaos but at least its all in one place',
    name: 'Theo',
    role: 'settings person',
  },
  {
    text: 'told him the hero progress bar was giving math test anxiety and he removed the big percent. king behavior',
    name: 'Maya',
    role: 'friend',
  },
  {
    text: 'duplicate library rows after muxed downloads were driving me nuts — dedupe pass fixed my sanity',
    name: 'Theo',
    role: 'maintainer',
  },
  {
    text: 'watched the same pasta tutorial four times. nobody on the internet knows. perfect',
    name: 'Maya',
    role: 'repeat viewer',
  },
  {
    text: 'led visualizer on audio only tracks is so extra i cant disable it',
    name: 'Theo',
    role: 'audio only',
  },
  {
    text: 'he sent a screenshot of ruforge at 2am with caption "fixed" and i pretended to be asleep',
    name: 'Maya',
    role: 'friend',
  },
  {
    text: 'auto preview sprites for downloads are nice when im picking what to delete later',
    name: 'Theo',
    role: 'downloads',
  },
  {
    text: 'pop out to mini while folding laundry — yes i am that person',
    name: 'Maya',
    role: 'mini player',
  },
  {
    text: 'updater whats new modal finally scrolls on my laptop screen. small text big win',
    name: 'Theo',
    role: 'uses it daily',
  },
  {
    text: 'if this ever asks me to make an account im uninstalling (joking. mostly.)',
    name: 'Maya',
    role: 'local files fan',
  },
  {
    text: 'still weird seeing our names on a real website testimonials section but here we are',
    name: 'Theo',
    role: 'also built it',
  },
  {
    text: 'pinterest pics incoming for these cards. until then initials are doing heavy lifting',
    name: 'Maya',
    role: 'friend',
  },
];

const theoCount = { n: 0 };
const mayaCount = { n: 0 };

export const TESTIMONIALS: Testimonial[] = QUOTES.map((q) => {
  const idx = q.name === 'Theo' ? theoCount.n++ : mayaCount.n++;
  const fileName = imageFileFor(q.name, idx);
  const imageKey = imageKeyFrom(fileName);
  return {
    text: formatQuoteText(q.text),
    name: q.name,
    role: q.role,
    image: getTestimonialImage(fileName),
    imageKey,
    rimRgb: IMAGE_RIM_RGB[imageKey] ?? '237 215 156',
  };
});

function splitIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, i) => {
    columns[i % columnCount].push(item);
  });
  return columns;
}

const [colA, colB, colC] = splitIntoColumns(TESTIMONIALS, 3);

/** Round-robin split keeps names and vibes mixed per visible column. */
export const TESTIMONIAL_COLUMNS = [
  { items: colA, duration: 48, offset: '0s' },
  { items: colB, duration: 52, offset: '-9s', hideBelow: 'md' as const },
  { items: colC, duration: 50, offset: '-16s', hideBelow: 'lg' as const },
];
