import type { NavSectionId } from './sitePages';

export type NavFeaturedVariant = 'portrait' | 'landscape' | 'hero';

export interface NavFeaturedItem {
  slug: string;
  title: string;
  subtitle?: string;
  badge?: string;
  image: string;
  variant: NavFeaturedVariant;
  /** Animated shadow overlay color for featured cards. */
  shadowColor?: string;
}

/** Window widths (panel width plus 3rem) below which a mega panel stacks. */
export type NavStackBreakpoint = '34rem' | '41rem' | '43rem' | '45rem' | '57rem';

export interface NavMenuConfig {
  /** Slugs omitted from the text link columns (shown as featured cards instead). */
  featuredSlugs: string[];
  featured: NavFeaturedItem[];
  layout: 'links-featured-row' | 'links-featured-pair' | 'links-featured-single' | 'links-icons';
  /** Locks mega-menu size so Radix viewport does not animate/collapse. */
  panelClass: string;
  /** Below this window width the panel stacks, takes the window width and drops card images. */
  stackBelow: NavStackBreakpoint;
}

export const NAV_MENU_CONFIG: Record<NavSectionId, NavMenuConfig> = {
  features: {
    featuredSlugs: ['downloader', 'media-library', 'explorer', 'music'],
    layout: 'links-featured-row',
    panelClass: 'w-[54rem] min-h-[15.5rem]',
    stackBelow: '57rem',
    featured: [
      {
        slug: 'downloader',
        title: 'Downloader',
        image: '/tutorials/download2.webp',
        variant: 'hero',
        shadowColor: 'rgba(160, 110, 60, 1)',
      },
      {
        slug: 'media-library',
        title: 'Library',
        image: '/tutorials/library.webp',
        variant: 'hero',
        shadowColor: 'rgba(140, 100, 70, 1)',
      },
      {
        slug: 'explorer',
        title: 'Explorer',
        image: '/tutorials/explorer.webp',
        variant: 'hero',
        shadowColor: 'rgba(120, 90, 60, 1)',
      },
      {
        slug: 'music',
        title: 'Music',
        image: '/tutorials/music-mode.webp',
        variant: 'hero',
        shadowColor: 'rgba(150, 115, 65, 1)',
      },
    ],
  },
  company: {
    featuredSlugs: ['about', 'open-source'],
    layout: 'links-featured-pair',
    panelClass: 'w-[31rem] min-h-[14rem]',
    stackBelow: '34rem',
    featured: [
      {
        slug: 'about',
        title: 'About RuForge',
        subtitle: 'Local-first on Windows',
        image: '',
        variant: 'landscape',
        shadowColor: 'rgba(180, 140, 80, 1)',
      },
      {
        slug: 'open-source',
        title: 'Open source',
        subtitle: 'Apache-2.0 on GitHub',
        image: '',
        variant: 'landscape',
        shadowColor: 'rgba(120, 90, 60, 1)',
      },
    ],
  },
  resources: {
    featuredSlugs: ['getting-started'],
    layout: 'links-featured-single',
    panelClass: 'w-[40rem] min-h-[14.5rem]',
    stackBelow: '43rem',
    featured: [
      {
        slug: 'getting-started',
        title: 'Getting started',
        subtitle: 'Install and first download',
        badge: 'Start here',
        image: '/tutorials/resources.webp',
        variant: 'hero',
        shadowColor: 'rgba(170, 130, 70, 1)',
      },
    ],
  },
  help: {
    featuredSlugs: [],
    layout: 'links-featured-single',
    panelClass: 'w-[38rem] min-h-[14.5rem]',
    stackBelow: '41rem',
    featured: [
      {
        slug: 'getting-started',
        title: 'Your library',
        subtitle: 'Library paths, folders, first video',
        image: '/tutorials/playlists.webp',
        variant: 'hero',
        shadowColor: 'rgba(150, 115, 65, 1)',
      },
    ],
  },
  docs: {
    featuredSlugs: [],
    layout: 'links-icons',
    panelClass: 'w-[42rem] min-h-[16rem]',
    stackBelow: '45rem',
    featured: [],
  },
};

/** Help mega-menu hero links into Resources getting started. */
export const HELP_FEATURED_HREF = '/resources/getting-started';
