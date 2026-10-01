/**
 * Shared feature page section data for both desktop and mobile routes.
 * Images are referenced by filename; the consuming .astro file resolves
 * them via import.meta.glob on the tutorials asset directory.
 */

export interface FeatureSectionDef {
  heading: string;
  body: string;
  bullets: string[];
  imageFile: string;
  imageAlt: string;
}

export interface FeaturePageDef {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  imageDir: string;
  sections: FeatureSectionDef[];
}

export const FEATURE_PAGES: FeaturePageDef[] = [
  {
    slug: 'downloader',
    title: 'Downloader',
    metaTitle: 'YouTube downloader for videos, audio, and playlists',
    metaDescription: 'Download YouTube videos, audio, and whole playlists to your PC. See the file size first, pick the quality, and skip videos you already have.',
    description: 'Paste a link, a playlist, or a whole stack of links. You see what you are getting before it downloads, and the files are yours to keep.',
    imageDir: 'download',
    sections: [
      {
        heading: 'See what you are getting first',
        body: 'Paste a YouTube link and RuForge shows the title, length, and file size before anything downloads. Want just the sound? Switch to audio and the size updates to match.',
        bullets: [
          'Video in 720p, 1080p, or 4K, or whatever the best available is',
          'Audio saves as m4a, mp3, or opus',
          'Turn on captions and they download with the video, in the languages you pick',
        ],
        imageFile: 'dl-link-preview.webp',
        imageAlt: 'RuForge download dialog showing a video title, length, estimated size and source before downloading',
      },
      {
        heading: 'Whole playlists, your way',
        body: 'Paste a playlist link and the full list shows up before anything downloads. Drag videos into the order you want, and switch any one of them to audio only. Videos you already have are tagged In library, so you never grab the same thing twice.',
        bullets: [
          'Turn on Skip Duplicates in Settings and videos you already have are left out on their own',
        ],
        imageFile: 'dl-playlist.webp',
        imageAlt: 'RuForge playlist download showing total runtime, video count and a numbered list of videos',
      },
      {
        heading: 'Download a lot at once',
        body: 'Paste link after link and they line up as one batch. RuForge works through them in order and shows the progress and speed of each. Raise the limit in Settings to run up to six at the same time.',
        bullets: [
          'If a download gets stuck, RuForge stops it and moves on instead of waiting forever',
        ],
        imageFile: 'dl-batch.webp',
        imageAlt: 'RuForge download carousel with the active video at 14 percent and 19 MB/s',
      },
      {
        heading: 'Keep using the app while you wait',
        body: 'Downloads keep going while you watch something or browse your library. Click the bar at the top of the window to see what is downloading, what is next, and how far along each one is.',
        bullets: [],
        imageFile: 'dl-island-queue.webp',
        imageAlt: 'RuForge download list open from the top of the window, one video at 54 percent and two queued',
      },
    ],
  },
  {
    slug: 'media-library',
    title: 'Media Library',
    metaTitle: 'Local media library for your downloads',
    metaDescription: 'Every video you download lands in a local library that remembers how far you got in each one.',
    description: 'Everything you downloaded, ready to watch, with your place saved in every video.',
    imageDir: 'library',
    sections: [
      {
        heading: 'Everything you downloaded, in one place',
        body: 'Finished downloads go straight into your library. No importing, no sorting. Open the app and the videos you have not finished are waiting at the top under Continue watching.',
        bullets: [
          'Plays mp4, mkv, webm, and m4a files',
          'Download the same video twice and it still shows up once',
        ],
        imageFile: 'lib-home.webp',
        imageAlt: 'RuForge library opening on Continue watching, with two video cards and their progress bars',
      },
      {
        heading: 'Pick up where you left off',
        body: 'RuForge remembers how far you got in every video, even after you close the app. Each card shows your progress, so you can tell at a glance what you finished and what you did not. In progress and Watched tabs sort them for you.',
        bullets: [],
        imageFile: 'lib-watch-progress.webp',
        imageAlt: 'Two RuForge library cards with progress bars showing how much of each video has been watched',
      },
    ],
  },
  {
    slug: 'music',
    title: 'Music mode',
    metaTitle: 'Music mode: offline music player with lyrics and playlists',
    metaDescription: 'Play downloaded songs in a dedicated music player with lyrics, albums, artists, playlists, crossfade, and YouTube Music browsing.',
    description: 'A separate space for your songs: albums, artists, playlists, lyrics, and a way to find and save new music from YouTube Music.',
    imageDir: 'music',
    sections: [
      {
        heading: 'Your music home',
        body: 'Music mode opens on a home page built from the songs you already downloaded: quick picks to start something fast, and a row of your artists. Relax and Focus filters narrow it down to the mood you want.',
        bullets: [
          'Quick picks from your own library',
          'Artists row with song counts',
          'Search your songs, or open Explore to find new ones on YouTube Music',
          'Storage bar shows how close you are to your storage limit',
        ],
        imageFile: 'musicHome.png',
        imageAlt: 'RuForge Music mode home page with quick picks and an artists row',
      },
      {
        heading: 'Lyrics and Now Playing',
        body: 'When a song has lyrics, they scroll along with the music and the current line lights up. The side panel shows the cover art, the next lines, and related songs. The player bar at the bottom keeps shuffle, loop, skip, and volume in reach.',
        bullets: [
          'Lyrics follow the song line by line',
          'Crossfade blends the end of one song into the next',
          'Smart shuffle favors songs you like and holds back ones you just heard',
          'Like songs to collect them in Liked Songs',
        ],
        imageFile: 'musicLyrics.png',
        imageAlt: 'RuForge Music mode showing synced lyrics with the current line highlighted',
      },
      {
        heading: 'Artists, albums and playlists',
        body: 'Your songs are grouped into artists and albums automatically. Artist pages add genres, where the artist is from, and a short bio from MusicBrainz and Wikipedia. Make your own playlists, or bring one over from another service and check the matches before anything downloads.',
        bullets: [
          'Artist and album pages built from your downloaded files',
          'Play or shuffle a whole artist in one click',
          'Create, rename, and sort playlists',
          'Import a playlist and review each matched song first',
        ],
        imageFile: 'musicArtist.png',
        imageAlt: 'RuForge Music mode artist page with albums, genre tags, and play and shuffle buttons',
      },
    ],
  },
  {
    slug: 'player',
    title: 'Video Player',
    metaTitle: 'Video player for downloaded videos',
    metaDescription: 'Watch downloaded videos with chapter previews, SponsorBlock skipping, and the comments beside the video, all offline.',
    description: 'Watch what you downloaded without the parts you do not want, and with the comments right there.',
    imageDir: 'player',
    sections: [
      {
        heading: 'Jump straight to the part you want',
        body: 'Long video? Hover the bar to see each chapter name and a preview of that moment, then click to go right there. Shift and the arrow keys skip a whole chapter at a time.',
        bullets: [],
        imageFile: 'vp-chapters.webp',
        imageAlt: 'RuForge player with the cursor over a chapter, showing a preview frame, the time and the chapter name',
      },
      {
        heading: 'Skip sponsors, intros, and filler',
        body: 'SponsorBlock is built in. Sponsor reads, intros, self-promotion, and other filler are marked on the bar, and RuForge either skips them for you or shows a Skip button. Once you have played a video, skipping works offline too.',
        bullets: [],
        imageFile: 'vp-sponsor-skip.webp',
        imageAlt: 'RuForge player at the start of an intro segment, with the segment labeled on the scrub bar and a Skip intro button',
      },
      {
        heading: 'You decide what gets skipped',
        body: 'Set each kind of segment to skip on its own, show a button, or stay off. If you keep pressing Skip on the same kind, RuForge picks up on it and starts skipping those for you. Jump back after a skip and it goes back to asking.',
        bullets: [],
        imageFile: 'vp-sponsor-settings.webp',
        imageAlt: 'RuForge SponsorBlock settings with a mode for each category, such as Auto-skip or Show skip button',
      },
      {
        heading: 'Read the comments with the video',
        body: 'Open the comments beside the video, no browser needed. They are saved with the video, so they are still there when you are offline.',
        bullets: [],
        imageFile: 'vp-comments.webp',
        imageAlt: 'RuForge player with the comments panel open beside the video',
      },
    ],
  },
  {
    slug: 'mini-player',
    title: 'Mini Player',
    metaTitle: 'Mini player: a floating window for your videos',
    metaDescription: 'Pop downloaded videos out into a small window that stays on top of your other apps and shrinks down to a thin bar.',
    description: 'Keep a video playing in the corner while you do something else.',
    imageDir: 'mini',
    sections: [
      {
        heading: 'Keep watching while you work',
        body: 'Pop the video out into a small window and get back to whatever you were doing. Pin it and it stays on top of every other app. Drag it anywhere and resize it from the corner.',
        bullets: [],
        imageFile: 'mini-large.webp',
        imageAlt: 'RuForge mini player window with the scrub bar, playback controls and time',
      },
      {
        heading: 'As big or as small as you want',
        body: 'At full size you get the timeline and every control. Shrink it and it turns into a slim bar with just the title, play, and next.',
        bullets: [],
        imageFile: 'mini-sizes.webp',
        imageAlt: 'RuForge mini player at four sizes, from large with full controls down to a thin bar with the title and play button',
      },
    ],
  },
];

export function findFeaturePage(slug: string): FeaturePageDef | undefined {
  return FEATURE_PAGES.find((p) => p.slug === slug);
}

const tutorialImages = import.meta.glob<{ default: ImageMetadata }>('../assets/tutorials/**/*.{png,webp}');

export async function featureSectionsWithImages(page: FeaturePageDef) {
  return Promise.all(
    page.sections.map(async (section) => {
      const path = `../assets/tutorials/${page.imageDir}/${section.imageFile}`;
      const load = tutorialImages[path];
      if (!load) throw new Error(`Missing feature image: ${path}`);
      return {
        heading: section.heading,
        body: section.body,
        bullets: section.bullets,
        image: (await load()).default,
        imageAlt: section.imageAlt,
      };
    }),
  );
}

export function featureReadingMinutes(page: FeaturePageDef): number {
  const words = [page.description, ...page.sections.flatMap((s) => [s.heading, s.body, ...s.bullets])]
    .join(' ')
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export function featurePageSlugs(): string[] {
  return FEATURE_PAGES.map((p) => p.slug);
}

export function featureDetailHref(slug: string): string {
  return `/features/${slug}`;
}
