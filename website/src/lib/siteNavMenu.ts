import type { NavSectionId } from './sitePages';
import downloadShot from '../assets/screenshots/02-download-downloading.webp';
import libraryShot from '../assets/screenshots/04-library.webp';

export type NavFeaturedVariant = 'portrait' | 'landscape' | 'hero';

export interface NavFeaturedItem {
  slug: string;
  title: string;
  subtitle?: string;
  badge?: string;
  image: string;
  variant: NavFeaturedVariant;
}

/** Fixed height for every featured visual card; width varies by variant. */
export const FEATURED_CARD_HEIGHT = '8.25rem';

export interface NavMenuConfig {
  /** Slugs omitted from the text link columns (shown as featured cards instead). */
  featuredSlugs: string[];
  featured: NavFeaturedItem[];
  layout: 'links-featured-row' | 'links-featured-pair' | 'links-featured-single' | 'links-icons';
  /** Locks mega-menu size so Radix viewport does not animate/collapse. */
  panelClass: string;
}

export const NAV_MENU_CONFIG: Record<NavSectionId, NavMenuConfig> = {
  features: {
    featuredSlugs: ['downloader', 'media-library'],
    layout: 'links-featured-row',
    panelClass: 'w-[48rem] min-h-[15.5rem]',
    featured: [
      {
        slug: 'downloader',
        title: 'YouTube downloader',
        image: downloadShot.src,
        variant: 'portrait',
      },
      {
        slug: 'media-library',
        title: 'Media library',
        image: libraryShot.src,
        variant: 'portrait',
      },
    ],
  },
  company: {
    featuredSlugs: ['about', 'open-source'],
    layout: 'links-featured-pair',
    panelClass: 'w-[40rem] min-h-[17rem]',
    featured: [
      {
        slug: 'about',
        title: 'About RuForge',
        subtitle: 'Local-first on Windows',
        image: '',
        variant: 'landscape',
      },
      {
        slug: 'open-source',
        title: 'Open source',
        subtitle: 'Apache-2.0 on GitHub',
        image: '',
        variant: 'landscape',
      },
    ],
  },
  resources: {
    featuredSlugs: ['getting-started'],
    layout: 'links-featured-single',
    panelClass: 'w-[40rem] min-h-[14.5rem]',
    featured: [
      {
        slug: 'getting-started',
        title: 'Getting started',
        subtitle: 'Install and first download',
        badge: 'Start here',
        image: downloadShot.src,
        variant: 'hero',
      },
    ],
  },
  help: {
    featuredSlugs: [],
    layout: 'links-featured-single',
    panelClass: 'w-[38rem] min-h-[14.5rem]',
    featured: [
      {
        slug: 'getting-started',
        title: 'Getting started',
        subtitle: 'Install, library paths, first video',
        image: libraryShot.src,
        variant: 'hero',
      },
    ],
  },
  docs: {
    featuredSlugs: [],
    layout: 'links-icons',
    panelClass: 'w-[42rem] min-h-[16rem]',
    featured: [],
  },
};

/** Help mega-menu hero links into Resources getting started. */
export const HELP_FEATURED_HREF = '/resources/getting-started';
