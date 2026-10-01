'use client';

import { memo } from 'react';
import { NAV_SECTIONS, pageHref, type NavSectionId, type SitePage } from '../lib/sitePages';
import {
  HELP_FEATURED_HREF,
  NAV_MENU_CONFIG,
  type NavFeaturedItem,
  type NavStackBreakpoint,
} from '../lib/siteNavMenu';
import { docsBuiltWithItems, techTickerSvgPaths } from '../lib/techTickerIcons';
import type { TechTickerIconId } from '../lib/techTickerIcons';
import { builtWithHrefForIcon } from '../lib/builtWithPages';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from './ui/navigation-menu';
import { IconPillTooltip } from './ui/icon-pill-tooltip';
import { cn } from '../lib/utils';
import { EtheralShadow } from './ui/etheral-shadow';

const featuredWidth: Record<NavFeaturedItem['variant'], string> = {
  portrait: 'w-[9.75rem]',
  landscape: 'w-[12.5rem]',
  hero: 'w-[13rem]',
};

// Spelled out per breakpoint because Tailwind only emits classes it finds as literals.
const STACKED: Record<
  NavStackBreakpoint,
  { panel: string; links: string; card: string; image: string; pairAside: string; pairCard: string }
> = {
  '34rem': {
    panel: 'max-[34rem]:w-[calc(100vw-3rem)] max-[34rem]:grid-cols-1 max-[34rem]:gap-y-5',
    links: 'max-[34rem]:grid-cols-2 max-[34rem]:gap-x-5',
    card: 'max-[34rem]:min-h-0 max-[34rem]:pb-1.5',
    image: 'max-[34rem]:hidden',
    pairAside: 'max-[34rem]:flex-row max-[34rem]:pl-0',
    pairCard: 'max-[34rem]:w-auto max-[34rem]:min-w-0',
  },
  '41rem': {
    panel: 'max-[41rem]:w-[calc(100vw-3rem)] max-[41rem]:grid-cols-1 max-[41rem]:gap-y-5',
    links: 'max-[41rem]:grid-cols-2 max-[41rem]:gap-x-5',
    card: 'max-[41rem]:min-h-0 max-[41rem]:pb-1.5',
    image: 'max-[41rem]:hidden',
    pairAside: 'max-[41rem]:flex-row max-[41rem]:pl-0',
    pairCard: 'max-[41rem]:w-auto max-[41rem]:min-w-0',
  },
  '43rem': {
    panel: 'max-[43rem]:w-[calc(100vw-3rem)] max-[43rem]:grid-cols-1 max-[43rem]:gap-y-5',
    links: 'max-[43rem]:grid-cols-2 max-[43rem]:gap-x-5',
    card: 'max-[43rem]:min-h-0 max-[43rem]:pb-1.5',
    image: 'max-[43rem]:hidden',
    pairAside: 'max-[43rem]:flex-row max-[43rem]:pl-0',
    pairCard: 'max-[43rem]:w-auto max-[43rem]:min-w-0',
  },
  '45rem': {
    panel: 'max-[45rem]:w-[calc(100vw-3rem)] max-[45rem]:grid-cols-1 max-[45rem]:gap-y-5',
    links: 'max-[45rem]:grid-cols-2 max-[45rem]:gap-x-5',
    card: 'max-[45rem]:min-h-0 max-[45rem]:pb-1.5',
    image: 'max-[45rem]:hidden',
    pairAside: 'max-[45rem]:flex-row max-[45rem]:pl-0',
    pairCard: 'max-[45rem]:w-auto max-[45rem]:min-w-0',
  },
  '57rem': {
    panel: 'max-[57rem]:w-[calc(100vw-3rem)] max-[57rem]:grid-cols-1 max-[57rem]:gap-y-5',
    links: 'max-[57rem]:grid-cols-2 max-[57rem]:gap-x-5',
    card: 'max-[57rem]:min-h-0 max-[57rem]:pb-1.5',
    image: 'max-[57rem]:hidden',
    pairAside: 'max-[57rem]:flex-row max-[57rem]:pl-0',
    pairCard: 'max-[57rem]:w-auto max-[57rem]:min-w-0',
  },
};

function MenuTextLink({
  href,
  title,
  external,
}: {
  href: string;
  title: string;
  external?: boolean;
}) {
  return (
    <NavigationMenuLink asChild>
      <a
        href={href}
        className="rf-mega-menu-link flex min-h-[2.5rem] items-center whitespace-nowrap select-none outline-none"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {title}
      </a>
    </NavigationMenuLink>
  );
}

function FeaturedVisualCard({
  item,
  href,
  className: extraClassName,
  imageClassName,
}: {
  item: NavFeaturedItem;
  href: string;
  className?: string;
  imageClassName?: string;
}) {
  const widthClass = featuredWidth[item.variant];
  const showImage = Boolean(item.image);

  return (
    <NavigationMenuLink asChild>
      <a
        href={href}
        className={cn(
          'group relative flex shrink-0 flex-col overflow-hidden rounded-xl border border-[#2a2420] bg-[#1a1412]/90 no-underline outline-none',
          widthClass,
          extraClassName,
        )}
      >
        <div className="relative z-10 shrink-0 px-4 pt-3.5 pb-2">
          {item.badge && <span className="text-[0.65rem] font-medium text-rf-text-muted">{item.badge}</span>}
          <span className="mt-0.5 block text-sm font-medium leading-tight text-rf-text">{item.title}</span>
          {item.subtitle && (
            <span className="mt-0.5 block text-xs leading-snug text-rf-text-muted">{item.subtitle}</span>
          )}
        </div>

        {showImage && item.variant === 'hero' && (
          <div className={cn('relative z-10 mt-auto min-h-0 flex-1 px-3.5 pb-3.5 pt-1', imageClassName)}>
            <div
              className="h-full min-h-[4.5rem] w-full overflow-hidden rounded-lg border border-[#2a2420]/80 bg-[#120e0c] bg-cover bg-top transition-transform duration-200 ease-out group-hover:scale-[1.01]"
              style={{ backgroundImage: `url(${item.image})` }}
              aria-hidden
            />
          </div>
        )}

        {showImage && item.variant === 'portrait' && (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 top-[2.75rem] opacity-[0.38] transition-opacity duration-200 group-hover:opacity-[0.52]',
              imageClassName,
            )}
            style={{
              backgroundImage: `url(${item.image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center bottom',
              maskImage: 'linear-gradient(to top, black 32%, transparent 88%)',
              WebkitMaskImage: 'linear-gradient(to top, black 32%, transparent 88%)',
            }}
            aria-hidden
          />
        )}

        <div
          className="pointer-events-none absolute inset-0 opacity-25 transition-opacity duration-300 group-hover:opacity-45"
          aria-hidden
        >
          <EtheralShadow
            color={item.shadowColor ?? 'rgba(128, 128, 128, 1)'}
            animation={{ scale: 60, speed: 40 }}
            noise={{ opacity: 0.6, scale: 1 }}
            sizing="fill"
          />
        </div>

        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#edd79c]/6 via-transparent to-transparent"
          aria-hidden
        />
      </a>
    </NavigationMenuLink>
  );
}

/** Resend-style docs rail: muted icons on the panel, no per-icon cards. */
function DocsBuiltWithRail() {
  const icons = docsBuiltWithItems;

  return (
    <ul
      className="rf-docs-built-with grid min-h-0 min-w-0 grid-cols-4 content-center gap-x-6 gap-y-5 self-center py-1"
      aria-label="Built with"
    >
      {icons.map((item) => (
        <li key={item.name} className="group/icon-tip flex items-center justify-center">
          <IconPillTooltip label={item.name}>
            <a
              href={builtWithHrefForIcon(item.icon)}
              className="flex items-center justify-center rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-rf-accent/40"
              aria-label={item.name}
            >
              <DocsTechIcon id={item.icon} wide={item.icon === 'ytdlp'} />
            </a>
          </IconPillTooltip>
        </li>
      ))}
    </ul>
  );
}

function DocsTechIcon({
  id,
  wide,
  'aria-label': ariaLabel,
}: {
  id: TechTickerIconId;
  wide?: boolean;
  'aria-label'?: string;
}) {
  if (id === 'lucide') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="rf-docs-built-with__icon h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={!ariaLabel}
        aria-label={ariaLabel}
        role={ariaLabel ? 'img' : undefined}
      >
        <path d="M14 12C14 9.79086 12.2091 8 10 8C7.79086 8 6 9.79086 6 12C6 16.4183 9.58172 20 14 20C18.4183 20 22 16.4183 22 12C22 8.446 20.455 5.25285 18 3.05557" />
        <path d="M10 12C10 14.2091 11.7909 16 14 16C16.2091 16 18 14.2091 18 12C18 7.58172 14.4183 4 10 4C5.58172 4 2 7.58172 2 12C2 15.5841 3.57127 18.8012 6.06253 21" />
      </svg>
    );
  }

  const path = techTickerSvgPaths[id as keyof typeof techTickerSvgPaths];

  if (path) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="rf-docs-built-with__icon h-5 w-5 shrink-0"
        aria-hidden={!ariaLabel}
        aria-label={ariaLabel}
        role={ariaLabel ? 'img' : undefined}
      >
        <path fill="currentColor" d={path} />
      </svg>
    );
  }

  const src =
    id === 'ytdlp'
      ? '/icons/tech/ytdlp.svg'
      : id === 'zustand'
        ? '/icons/tech/zustand.svg'
        : id === 'sponsorblock'
          ? '/icons/tech/sponsorblock.svg'
          : null;

  if (!src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={ariaLabel ?? ''}
      width={wide ? 52 : 20}
      height={20}
      className={cn('rf-docs-built-with__img shrink-0', wide && 'rf-docs-built-with__img--wide')}
    />
  );
}

function featuredHref(sectionId: NavSectionId, item: NavFeaturedItem): string {
  if (sectionId === 'help' && item.slug === 'getting-started') {
    return HELP_FEATURED_HREF;
  }
  return pageHref(sectionId, item.slug);
}

const MegaPanel = memo(function MegaPanel({ sectionId }: { sectionId: NavSectionId }) {
  const section = NAV_SECTIONS.find((s) => s.id === sectionId)!;
  const config = NAV_MENU_CONFIG[sectionId];
  const linkPages = section.pages.filter((p) => !config.featuredSlugs.includes(p.slug));
  const twoCols = linkPages.length > 5;
  const stacked = STACKED[config.stackBelow];

  const linkColumns = (
    <ul
      className={cn(
        'grid min-w-0 content-start gap-y-0.5',
        twoCols ? 'grid-cols-2 gap-x-5' : cn('grid-cols-1', stacked.links),
      )}
    >
      {linkPages.map((page: SitePage) => {
        const href = page.externalHref ?? pageHref(sectionId, page.slug);
        const external = Boolean(page.externalHref?.startsWith('http'));
        return (
          <li key={page.slug} className="min-h-[2.5rem]">
            <MenuTextLink href={href} title={page.title} external={external} />
          </li>
        );
      })}
    </ul>
  );

  const featuredAside =
    config.layout === 'links-featured-row' ? (
      <div className="rf-mega-menu-featured rf-scrollbar grid max-w-full shrink-0 grid-cols-2 gap-2.5 pl-1">
        {config.featured.map((item) => (
          <FeaturedVisualCard
            key={item.slug}
            item={item}
            href={featuredHref(sectionId, item)}
            className={cn('h-auto min-h-0 w-auto', stacked.card)}
            imageClassName={stacked.image}
          />
        ))}
      </div>
    ) : config.layout === 'links-featured-pair' ? (
      <div
        className={cn(
          'rf-mega-menu-featured rf-scrollbar flex h-full max-w-full shrink-0 flex-col gap-2.5 pl-1',
          stacked.pairAside,
        )}
      >
        {config.featured.map((item) => (
          <FeaturedVisualCard
            key={item.slug}
            item={item}
            href={featuredHref(sectionId, item)}
            className={cn('min-h-0 flex-1', stacked.pairCard, stacked.card)}
            imageClassName={stacked.image}
          />
        ))}
      </div>
    ) : config.layout === 'links-featured-single' && config.featured[0] ? (
      <div className="rf-mega-menu-featured flex max-w-full shrink-0 pl-1">
        <FeaturedVisualCard
          item={config.featured[0]}
          href={featuredHref(sectionId, config.featured[0])}
          className={cn('h-auto min-h-[8.25rem] w-full', stacked.card)}
          imageClassName={stacked.image}
        />
      </div>
    ) : null;

  return (
    <div
      className={cn(
        'rf-mega-menu grid shrink-0 items-stretch px-7 py-5',
        'max-w-[calc(100vw-3rem)]',
        config.layout === 'links-icons'
          ? 'gap-x-10 grid-cols-[minmax(0,1.55fr)_minmax(10.5rem,13.25rem)]'
          : config.layout === 'links-featured-row'
            ? 'gap-x-6 grid-cols-[minmax(14rem,1fr)_minmax(0,1.2fr)]'
            : 'gap-x-10 grid-cols-[minmax(0,1fr)_auto]',
        config.panelClass,
        stacked.panel,
      )}
    >
      {linkColumns}
      <div className="min-h-0">
        {config.layout === 'links-icons' ? <DocsBuiltWithRail /> : featuredAside}
      </div>
    </div>
  );
});


export default function SiteHeaderNav() {
  return (
    <NavigationMenu className="static max-w-none flex-1 justify-center flex">
      <NavigationMenuList>
        {NAV_SECTIONS.map((section) => (
          <NavigationMenuItem key={section.id}>
            <NavigationMenuTrigger>{section.label}</NavigationMenuTrigger>
            <NavigationMenuContent>
              <MegaPanel sectionId={section.id} />
            </NavigationMenuContent>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
