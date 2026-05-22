import type { ImageMetadata } from 'astro';

const testimonialModules = import.meta.glob<ImageMetadata>(
  '../assets/testimonials/*.webp',
  { eager: true, import: 'default' },
);

const screenshotModules = import.meta.glob<ImageMetadata>(
  '../assets/screenshots/*.{webp,png,jpg,jpeg}',
  { eager: true, import: 'default' },
);

function fileNameFromGlobPath(globPath: string): string {
  const parts = globPath.split('/');
  return parts[parts.length - 1] ?? globPath;
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

/** Sorted screenshot slides for the home carousel. */
export function discoverScreenshotSlides(): { image: ImageMetadata; name: string }[] {
  return Object.entries(screenshotModules)
    .sort(([a], [b]) =>
      fileNameFromGlobPath(a).localeCompare(fileNameFromGlobPath(b), undefined, { numeric: true }),
    )
    .map(([path, image]) => ({
      image,
      name: fileNameFromGlobPath(path).replace(/\.[^.]+$/i, ''),
    }));
}
