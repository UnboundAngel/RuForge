import type { NavSectionId } from './sitePages';

export type NavFeaturedVariant = 'portrait' | 'landscape' | 'hero';

export interface NavFeaturedItem {
  slug: string;
  title: string;
  subtitle?: string;
  badge?: string;
  /** Overrides the section page link. */
  href?: string;
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
  layout: 'links-featured-row' | 'links-featured-pair' | 'links-featured-single' | 'links-icons' | 'featured-grid';
  /** Locks mega-menu size so Radix viewport does not animate/collapse. */
  panelClass: string;
  /** Below this window width the panel stacks, takes the window width and drops card images. */
  stackBelow: NavStackBreakpoint;
}

export const NAV_MENU_CONFIG: Record<NavSectionId, NavMenuConfig> = {
  features: {
    featuredSlugs: ['downloader', 'media-library', 'player', 'music', 'mini-player'],
    layout: 'featured-grid',
    panelClass: 'w-[44rem] min-h-[15.5rem]',
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
        slug: 'player',
        title: 'Video Player',
        image: '/tutorials/nav-player.webp',
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
      {
        slug: 'mini-player',
        title: 'Mini Player',
        image: '/tutorials/nav-mini.webp',
        variant: 'hero',
        shadowColor: 'rgba(130, 95, 65, 1)',
      },
      {
        slug: 'all',
        title: 'All features',
        subtitle: 'Everything RuForge does, on one page.',
        href: '/features',
        image: '',
        variant: 'hero',
        shadowColor: 'rgba(160, 110, 60, 1)',
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
    featuredSlugs: ['install'],
    layout: 'links-featured-single',
    panelClass: 'w-[31rem] min-h-[14.5rem]',
    stackBelow: '34rem',
    featured: [
      {
        slug: 'install',
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
    panelClass: 'w-[31rem] min-h-[14.5rem]',
    stackBelow: '34rem',
    featured: [
      {
        slug: 'library-folders',
        href: '/docs/library-folders',
        title: 'Your library',
        subtitle: 'Where files save, adding folders',
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