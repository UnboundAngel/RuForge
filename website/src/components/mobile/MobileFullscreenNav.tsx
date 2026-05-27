import { useState, useRef, useEffect, useCallback } from 'react';
import { NAV_SECTIONS, pageHref, type NavSectionId } from '../../lib/sitePages';
import { useHaptic } from './useHaptic';
import { detectPlatform, downloadCtaLabel } from '../../lib/detectPlatform';

const sections: { id: NavSectionId; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'company', label: 'Company' },
  { id: 'resources', label: 'Resources' },
  { id: 'help', label: 'Help' },
  { id: 'docs', label: 'Docs' },
];

const MAX_SUB_ITEMS = 3;

interface Props {
  open: boolean;
  onClose: () => void;
  logoSrc: string;
}

function NavSection({
  section,
  open,
  expandedId,
  onToggle,
  index,
}: {
  section: (typeof sections)[0];
  open: boolean;
  expandedId: NavSectionId | null;
  onToggle: (id: NavSectionId) => void;
  index: number;
}) {
  const { select } = useHaptic();
  const isExpanded = expandedId === section.id;
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isExpanded ? contentRef.current.scrollHeight : 0);
    }
  }, [isExpanded]);

  const navSection = NAV_SECTIONS.find((s) => s.id === section.id);
  const subItems = navSection
    ? navSection.pages.slice(0, MAX_SUB_ITEMS)
    : [];
  const hasMore = navSection ? navSection.pages.length > MAX_SUB_ITEMS : false;

  return (
    <li
      className="transition-all duration-500 ease-out"
      style={{
        transitionDelay: open ? `${80 + index * 60}ms` : '0ms',
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(16px)',
      }}
    >
      <button
        type="button"
        onClick={() => { select(); onToggle(section.id); }}
        className="rf-m-link group flex items-center justify-between w-full py-4 px-2 border-b border-rf-border/15 hover:border-rf-border/40 min-h-[44px] bg-transparent text-left"
        aria-expanded={isExpanded}
      >
        <span className="font-display text-3xl font-bold tracking-tight text-rf-text group-hover:text-rf-accent transition-colors">
          {section.label}
        </span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-rf-text-muted/50 group-hover:text-rf-accent transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      <div
        style={{ height: `${height}px` }}
        className="transition-[height] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden"
      >
        <div ref={contentRef} className="py-2 pl-4 pr-2">
          {subItems.map((page) => (
            <a
              key={page.slug}
              href={page.externalHref ?? pageHref(section.id, page.slug)}
              className="rf-m-link flex items-center gap-3 py-2.5 px-2 rounded-lg no-underline hover:bg-rf-surface/40 min-h-[40px]"
            >
              <span className="w-1 h-1 rounded-full bg-rf-text-muted/40 shrink-0" />
              <span className="text-[15px] text-rf-text/90 font-medium">{page.title}</span>
            </a>
          ))}
          {hasMore && (
            <a
              href={`/m/${section.id}`}
              className="rf-m-link flex items-center gap-2 py-2.5 px-2 mt-1 rounded-lg no-underline text-rf-accent text-sm font-semibold hover:bg-rf-accent/10"
            >
              View all
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export default function MobileFullscreenNav({ open, onClose, logoSrc }: Props) {
  const { tap } = useHaptic();
  const [expandedId, setExpandedId] = useState<NavSectionId | null>(null);
  const [ctaLabel, setCtaLabel] = useState('Download for Windows');

  const handleToggle = useCallback((id: NavSectionId) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    setCtaLabel(downloadCtaLabel(detectPlatform()));
  }, []);

  useEffect(() => {
    if (!open) setExpandedId(null);
  }, [open]);

  return (
    <div
      className={`
        fixed inset-0 z-[200] flex flex-col bg-rf-bg overflow-hidden
        transition-opacity duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]
        ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
      `}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <a href="/m/" className="flex items-center gap-2.5 no-underline">
          <img src={logoSrc} alt="RuForge" className="w-8 h-8 rounded-md" width={32} height={32} />
          <span className="font-hand text-2xl font-bold text-rf-text tracking-tight">RuForge</span>
        </a>
        <button
          onClick={() => { tap(); onClose(); }}
          className="rf-m-btn relative z-[210] flex items-center justify-center w-11 h-11 -mr-1 rounded-lg text-rf-text-muted hover:text-rf-text"
          aria-label="Close menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="3" y1="5" x2="17" y2="5"
              style={{
                transformOrigin: '10px 10px',
                transition: 'transform 200ms ease, opacity 200ms ease',
                transform: open ? 'rotate(45deg) translateY(5px)' : 'rotate(0deg) translateY(0px)',
              }}
            />
            <line x1="3" y1="10" x2="17" y2="10"
              style={{
                transition: 'opacity 200ms ease',
                opacity: open ? 0 : 1,
              }}
            />
            <line x1="3" y1="15" x2="17" y2="15"
              style={{
                transformOrigin: '10px 10px',
                transition: 'transform 200ms ease, opacity 200ms ease',
                transform: open ? 'rotate(-45deg) translateY(-5px)' : 'rotate(0deg) translateY(0px)',
              }}
            />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain px-8">
        <ul className="space-y-0">
          {sections.map((section, i) => (
            <NavSection
              key={section.id}
              section={section}
              open={open}
              expandedId={expandedId}
              onToggle={handleToggle}
              index={i}
            />
          ))}
        </ul>
      </nav>

      <div
        className="px-8 pb-8 pt-4 shrink-0 transition-opacity duration-500"
        style={{
          opacity: open ? 1 : 0,
          transitionDelay: open ? '400ms' : '0ms',
        }}
      >
        <a
          href="/m/download"
          onClick={tap}
          className="rf-m-btn flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-rf-accent/15 border border-rf-accent/25 text-rf-accent text-sm font-semibold tracking-wide no-underline hover:bg-rf-accent/25"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          {ctaLabel}
        </a>
      </div>
    </div>
  );
}
