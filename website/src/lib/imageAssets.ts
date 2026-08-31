import type { ImageMetadata } from 'astro';

const testimonialModules = import.meta.glob<ImageMetadata>(
  '../assets/testimonials/*.webp',
  { eager: true, import: 'default' },
);

const screenshotModules = import.meta.glob<ImageMetadata>(
  '../assets/screenshots/*.{webp,png,jpg,jpeg}',
  { eager: true, import: 'default' },
);

/** Human labels and alts for known hero stems (filename without extension). */
const HERO_SLIDE_COPY: Record<string, { label: string; alt: string }> = {
  '01-library': {
    label: 'Library',
    alt: 'RuForge media library grid with downloaded videos and audio on disk',
  },
  '02-download-downloading': {
    label: 'Downloading',
    alt: 'RuForge downloader with an active yt-dlp download in progress',
  },
  '03-music-now-playing': {
    label: 'Music now playing',
    alt: 'RuForge music Now Playing rail with cover art and playback controls',
  },
};

function fileNameFromGlobPath(globPath: string): string {
  const parts = globPath.split('/');
  return parts[parts.length - 1] ?? globPath;
}

function humanizeSlideName(stem: string): string {
  return stem
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolved testimonial avatar for Astro `<Image />`. */
export function getTestimonialImage(fileName: string): ImageMetadata {
  const entry = Object.entries(testimonialModules).find(([path]) =>
    fileNameFromGlobPath(path) === fileName,
  );
  if (!entry) {
    throw new Error(`Missing testimonial asset: ${fileName}`);
  }
  return entry[1];
}

export interface ScreenshotSlide {
  image: ImageMetadata;
  name: string;
  label: string;
  alt: string;
}

/** Sorted screenshot slides for the home carousel. */
export function discoverScreenshotSlides(): ScreenshotSlide[] {
  return Object.entries(screenshotModules)
    .sort(([a], [b]) =>
      fileNameFromGlobPath(a).localeCompare(fileNameFromGlobPath(b), undefined, { numeric: true }),
    )
    .map(([path, image]) => {
      const name = fileNameFromGlobPath(path).replace(/\.[^.]+$/i, '');
      const copy = HERO_SLIDE_COPY[name];
      const label = copy?.label ?? humanizeSlideName(name);
      return {
        image,
        name,
        label,
        alt: copy?.alt ?? `RuForge screenshot: ${label}`,
      };
    });
}
