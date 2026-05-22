import type { ImageMetadata } from 'astro';
import { getTestimonialImage } from './imageAssets';

export type Testimonial = {
  text: string;
  image: ImageMetadata;
  /** e.g. angel-03; cards with the same key share rim color and avatar */
  imageKey: string;
  rimRgb: string;
  name: string;
  role: string;
};

const ANGEL_IMAGES = [
  'angel-01.webp',
  'angel-02.webp',
  'angel-03.webp',
  'angel-04.webp',
  'angel-05.webp',
  'angel-06.webp',
  'angel-07.webp',
  'angel-08.webp',
  'angel-09.webp',
] as const;

const SUSIE_IMAGES = [
  'susie-01.webp',
  'susie-02.webp',
  'susie-03.webp',
  'susie-04.webp',
  'susie-05.webp',
  'susie-06.webp',
  'susie-07.webp',
] as const;

/** Muted rim RGB per avatar file; same key = same border on scroll. */
const IMAGE_RIM_RGB: Record<string, string> = {
  'angel-01': '186 165 128',
  'angel-02': '168 188 152',
  'angel-03': '148 172 186',
  'angel-04': '186 148 128',
  'angel-05': '198 178 142',
  'angel-06': '172 142 186',
  'angel-07': '142 186 168',
  'angel-08': '186 128 148',
  'angel-09': '158 142 118',
  'susie-01': '196 152 142',
  'susie-02': '142 158 196',
  'susie-03': '196 168 142',
  'susie-04': '168 142 172',
  'susie-05': '142 186 162',
  'susie-06': '186 162 142',
  'susie-07': '172 142 158',
};

function imageFileFor(name: 'Angel' | 'Susie', index: number): (typeof ANGEL_IMAGES)[number] | (typeof SUSIE_IMAGES)[number] {
  const pool = name === 'Angel' ? ANGEL_IMAGES : SUSIE_IMAGES;
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

type QuoteInput = { text: string; name: 'Angel' | 'Susie'; role: string };

/** Home page only. Avatar files live in `src/assets/testimonials/` (see README in public/testimonials). */
const QUOTES: QuoteInput[] = [
  {
    text: 'honestly i just wanted one app for grabbing videos and watching later without a browser tab graveyard — ruforge does that',
    name: 'Angel',
    role: 'uses it daily',
  },
  {
    text: "angel put it on my laptop to 'test' and i still have it. the cooking playlist situation is out of control",
    name: 'Susie',
    role: 'friend',
  },
  {
    text: 'mini player sits in the corner during homework and i keep forgetting its a whole separate window lol',
    name: 'Angel',
    role: 'mini player person',
  },
  {
    text: 'sponsorblock jumped a segment while i was making dinner and i did not expect to care but i did',
    name: 'Susie',
    role: 'playback',
  },
  {
    text: 'we are not calling it neotube anymore. ruforge stuck.',
    name: 'Angel',
    role: 'windows',
  },
  {
    text: 'the floating download list is actually nice?? it doesnt eat the whole screen',
    name: 'Susie',
    role: 'downloader regular',
  },
  {
    text: 'library stays on disk. no account no sync drama that was kinda the whole point',
    name: 'Angel',
    role: 'local library',
  },
  {
    text: 'i still roast him in the group chat. also told my sister to download it so',
    name: 'Susie',
    role: 'friend',
  },
  {
    text: 'when yt-dlp changes something i patch rebuild move on — not glamorous but it keeps working',
    name: 'Angel',
    role: 'maintainer',
  },
  {
    text: 'queued like six baking videos at once and the little card just sat there judging me. worth it',
    name: 'Susie',
    role: 'uses it daily',
  },
  {
    text: 'explorer tab is mostly for cookies when youtube gets annoying. not trying to replace chrome',
    name: 'Angel',
    role: 'explorer when needed',
  },
  {
    text: 'audio only downloads are smaller now thank god my drive was crying',
    name: 'Susie',
    role: 'audio downloads',
  },
  {
    text: 'chapters on the scrub bar look stupidly fancy for something i built in my room but ok',
    name: 'Angel',
    role: 'player',
  },
  {
    text: 'caught an ad skip i didnt even click and did a little chef kiss. dramatic but true',
    name: 'Susie',
    role: 'sponsorblock',
  },
  {
    text: 'download stalled once and the watchdog actually yelled at me (toast). fair',
    name: 'Angel',
    role: 'downloader',
  },
  {
    text: 'replaced a file in library without redownloading the whole channel — felt like cheating',
    name: 'Susie',
    role: 'library',
  },
  {
    text: 'volume mixer finally says ruforge instead of whatever webview2 is. tiny win huge',
    name: 'Angel',
    role: 'windows',
  },
  {
    text: 'mini player tiny mode is cursed i love it. title marquee at 70px height is insane',
    name: 'Susie',
    role: 'mini player',
  },
  {
    text: 'settings sponsorblock tree is nested chaos but at least its all in one place',
    name: 'Angel',
    role: 'settings person',
  },
  {
    text: 'told him the hero progress bar was giving math test anxiety and he removed the big percent. king behavior',
    name: 'Susie',
    role: 'friend',
  },
  {
    text: 'duplicate library rows after muxed downloads were driving me nuts — dedupe pass fixed my sanity',
    name: 'Angel',
    role: 'maintainer',
  },
  {
    text: 'watched the same pasta tutorial four times. nobody on the internet knows. perfect',
    name: 'Susie',
    role: 'repeat viewer',
  },
  {
    text: 'led visualizer on audio only tracks is so extra i cant disable it',
    name: 'Angel',
    role: 'audio only',
  },
  {
    text: 'he sent a screenshot of ruforge at 2am with caption "fixed" and i pretended to be asleep',
    name: 'Susie',
    role: 'friend',
  },
  {
    text: 'auto preview sprites for downloads are nice when im picking what to delete later',
    name: 'Angel',
    role: 'downloads',
  },
  {
    text: 'pop out to mini while folding laundry — yes i am that person',
    name: 'Susie',
    role: 'mini player',
  },
  {
    text: 'updater whats new modal finally scrolls on my laptop screen. small text big win',
    name: 'Angel',
    role: 'uses it daily',
  },
  {
    text: 'if this ever asks me to make an account im uninstalling (joking. mostly.)',
    name: 'Susie',
    role: 'local files fan',
  },
  {
    text: 'still weird seeing our names on a real website testimonials section but here we are',
    name: 'Angel',
    role: 'also built it',
  },
  {
    text: 'pinterest pics incoming for these cards. until then initials are doing heavy lifting',
    name: 'Susie',
    role: 'friend',
  },
];

const angelCount = { n: 0 };
const susieCount = { n: 0 };

export const TESTIMONIALS: Testimonial[] = QUOTES.map((q) => {
  const idx = q.name === 'Angel' ? angelCount.n++ : susieCount.n++;
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
