'use client';

import { memo } from 'react';
import { NAV_SECTIONS, pageHref, type NavSectionId, type SitePage } from '../lib/sitePages';
import {
  HELP_FEATURED_HREF,
  NAV_MENU_CONFIG,
  type NavFeaturedItem,
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
        className="rf-mega-menu-link flex min-h-[2.75rem] items-center whitespace-nowrap select-none outline-none"
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
}: {
  item: NavFeaturedItem;
  href: string;
  className?: string;
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
          <div className="relative z-10 mt-auto min-h-0 flex-1 px-3.5 pb-3.5 pt-1">
            <div
              className="h-full min-h-[4.5rem] w-full overflow-hidden rounded-lg border border-[#2a2420]/80 bg-[#120e0c] bg-cover bg-top transition-transform duration-200 ease-out group-hover:scale-[1.01]"
              style={{ backgroundImage: `url(${item.image})` }}
              aria-hidden
            />
          </div>
        )}

        {showImage && item.variant === 'portrait' && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 top-[2.75rem] opacity-[0.38] transition-opacity duration-200 group-hover:opacity-[0.52]"
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

  const linkColumns = (
    <ul
      className={cn(
        'grid min-w-0 content-start gap-y-1.5',
        twoCols ? 'grid-cols-2 gap-x-5' : 'grid-cols-1',
      )}
    >
      {linkPages.map((page: SitePage) => {
        const href = page.externalHref ?? pageHref(sectionId, page.slug);
        const external = Boolean(page.externalHref?.startsWith('http'));
        return (
          <li key={page.slug} className="min-h-[2.75rem]">
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
            className="h-auto min-h-0 w-auto"
          />
        ))}
      </div>
    ) : config.layout === 'links-featured-pair' ? (
      <div className="rf-mega-menu-featured rf-scrollbar flex max-w-full shrink-0 flex-col gap-2.5 pl-1">
        {config.featured.map((item) => (
          <FeaturedVisualCard
            key={item.slug}
            item={item}
            href={featuredHref(sectionId, item)}
            className="min-h-0 flex-1"
          />
        ))}
      </div>
    ) : config.layout === 'links-featured-single' && config.featured[0] ? (
      <div className="rf-mega-menu-featured flex max-w-full shrink-0 pl-1">
        <FeaturedVisualCard
          item={config.featured[0]}
          href={featuredHref(sectionId, config.featured[0])}
          className="h-auto min-h-[8.25rem] w-full"
        />
      </div>
    ) : null;

  return (
    <div
      className={cn(
        'rf-mega-menu grid shrink-0 items-stretch px-7 py-6',
        config.layout === 'links-icons'
          ? 'gap-x-10 grid-cols-[minmax(0,1.55fr)_minmax(10.5rem,13.25rem)]'
          : config.layout === 'links-featured-row'
            ? 'gap-x-6 grid-cols-[minmax(14rem,1fr)_minmax(0,1.2fr)]'
            : 'gap-x-10 grid-cols-[minmax(0,1fr)_auto]',
        config.panelClass,
      )}
    >
      {linkColumns}
      {config.layout === 'links-icons' ? <DocsBuiltWithRail /> : featuredAside}
    </div>
  );
});

export default function SiteHeaderNav() {
  return (
    <>
      <NavigationMenu className="hidden max-w-none flex-1 justify-center lg:flex">
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

      <details className="site-header-mobile-menu relative lg:hidden">
        <summary className="rf-header-nav-trigger inline-flex h-10 list-none cursor-pointer items-center justify-center rounded-full px-4 text-xs font-semibold tracking-[0.12em] uppercase [&::-webkit-details-marker]:hidden">
          Menu
        </summary>
        <div className="rf-scrollbar absolute right-0 top-[calc(100%+0.5rem)] z-[60] max-h-[min(70vh,24rem)] w-[min(100vw-2rem,18rem)] overflow-y-auto rounded-xl border border-rf-border/80 bg-[#241a17]/98 p-2 shadow-[0_16px_48px_rgb(0_0_0/0.45)] backdrop-blur-md">
          {NAV_SECTIONS.map((section) => (
            <div key={section.id} className="mb-2 last:mb-0">
              <a
                href={`/${section.id}`}
                className="block px-2 py-1.5 text-[0.625rem] font-semibold tracking-[0.14em] text-rf-text uppercase no-underline"
              >
                {section.label}
              </a>
              <ul className="space-y-1">
                {section.pages.map((page) => {
                  const href = page.externalHref ?? pageHref(section.id, page.slug);
                  const external = Boolean(page.externalHref?.startsWith('http'));
                  return (
                    <li key={page.slug}>
                      <a
                        href={href}
                        className="rf-mega-menu-link text-xs"
                        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {page.title}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
