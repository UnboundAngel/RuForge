'use client';

import { memo, useState, useCallback, useEffect } from 'react';
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
        'grid min-w-0 content-start gap-y-0.5 lg:gap-y-1.5',
        twoCols ? 'grid-cols-1 lg:grid-cols-2 lg:gap-x-5' : 'grid-cols-1',
      )}
    >
      {linkPages.map((page: SitePage) => {
        const href = page.externalHref ?? pageHref(sectionId, page.slug);
        const external = Boolean(page.externalHref?.startsWith('http'));
        return (
          <li key={page.slug} className="min-h-[2.25rem] lg:min-h-[2.75rem]">
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
        'rf-mega-menu grid shrink-0 items-stretch px-5 py-5 lg:px-7 lg:py-6',
        'max-w-[calc(100vw-3rem)]',
        config.layout === 'links-icons'
          ? 'grid-cols-1 lg:gap-x-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(10.5rem,13.25rem)]'
          : config.layout === 'links-featured-row'
            ? 'grid-cols-1 lg:gap-x-6 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,1.2fr)]'
            : 'grid-cols-1 lg:gap-x-10 lg:grid-cols-[minmax(0,1fr)_auto]',
        config.panelClass,
      )}
    >
      {linkColumns}
      <div className="hidden lg:block">
        {config.layout === 'links-icons' ? <DocsBuiltWithRail /> : featuredAside}
      </div>
    </div>
  );
});

const SECTION_ICONS: Record<NavSectionId, React.ReactNode> = {
  features: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
  ),
  company: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  resources: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
  ),
  help: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
  ),
  docs: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
  ),
};

function MobileDrawerNav() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, close]);

  return (
    <div className="md:hidden flex items-center">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'rf-mobile-nav-link inline-flex h-9 w-9 items-center justify-center rounded-full',
          'text-rf-text-muted hover:text-rf-text hover:bg-[#edd79c]/[0.08] active:bg-[#edd79c]/[0.14] transition-all duration-150',
          open && 'bg-[#edd79c]/[0.1] text-rf-text',
        )}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        )}
      </button>

      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm transition-opacity duration-250',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={close}
        aria-hidden
      />

      {/* Drawer */}
      <nav
        className={cn(
          'fixed top-0 left-0 z-[201] h-full w-[min(18rem,85vw)] overflow-y-auto',
          'bg-[#1a1311]/[0.98] backdrop-blur-xl border-r border-[#edd79c]/[0.08]',
          'shadow-[4px_0_24px_rgb(0_0_0/0.4)]',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="px-5 pt-6 pb-4 border-b border-[#edd79c]/[0.06]">
          <span className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-rf-text-muted/50">
            Navigation
          </span>
        </div>

        <div className="px-3 py-3 space-y-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.id}>
              <a
                href={`/${section.id}`}
                onClick={close}
                className={cn(
                  'rf-mobile-nav-link flex items-center gap-2.5 rounded-lg px-3 py-2',
                  'text-[0.8125rem] font-semibold text-rf-text no-underline',
                  'hover:bg-[#edd79c]/[0.06] active:bg-[#edd79c]/[0.1] transition-colors duration-150',
                )}
              >
                <span className="flex items-center justify-center w-5 h-5 shrink-0 text-rf-text-muted/60">
                  {SECTION_ICONS[section.id]}
                </span>
                {section.label}
              </a>
              <ul className="mt-0.5 mb-2 ml-[1.875rem] space-y-0.5">
                {section.pages.slice(0, 6).map((page) => {
                  const href = page.externalHref ?? pageHref(section.id, page.slug);
                  const external = Boolean(page.externalHref?.startsWith('http'));
                  return (
                    <li key={page.slug}>
                      <a
                        href={href}
                        onClick={close}
                        className="rf-mobile-nav-link block rounded-md px-2.5 py-1.5 text-[0.75rem] text-rf-text-muted/70 no-underline hover:text-rf-text hover:bg-[#edd79c]/[0.05] transition-colors duration-150"
                        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {page.title}
                      </a>
                    </li>
                  );
                })}
                {section.pages.length > 6 && (
                  <li>
                    <a
                      href={`/${section.id}`}
                      onClick={close}
                      className="rf-mobile-nav-link block rounded-md px-2.5 py-1.5 text-[0.6875rem] font-medium text-rf-accent/70 no-underline hover:text-rf-accent transition-colors duration-150"
                    >
                      View all {section.label.toLowerCase()}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 mt-1 border-t border-[#edd79c]/[0.06] space-y-2">
          <a href="/changelog" onClick={close} className="rf-mobile-nav-link flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-[0.75rem] text-rf-text-muted/70 no-underline hover:text-rf-text transition-colors duration-150">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
            Changelog
          </a>
          <a href="/roadmap" onClick={close} className="rf-mobile-nav-link flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-[0.75rem] text-rf-text-muted/70 no-underline hover:text-rf-text transition-colors duration-150">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" /><path d="M9 3v15M15 6v15" /></svg>
            Roadmap
          </a>
        </div>
      </nav>
    </div>
  );
}

export default function SiteHeaderNav() {
  return (
    <>
      <NavigationMenu className="hidden max-w-none flex-1 justify-center md:flex">
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

      <MobileDrawerNav />
    </>
  );
}
