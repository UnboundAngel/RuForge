import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { DOCS_TREE } from '../lib/docsTree';
import { DOCS_CONTENT } from '../lib/docsContent';

const PLACEHOLDER =
  'Full write-up for this section is coming soon. If you need help now, check Troubleshooting or ask on GitHub Discussions.';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

interface SearchItem {
  type: 'page' | 'heading' | 'content';
  slug: string;
  pageTitle: string;
  sectionLabel: string;
  displayText: string;
  lineNum: number;
  anchor?: string;
  /** Pre-lowercased search corpus, built once. */
  _h: string;
}

function buildIndex(): SearchItem[] {
  const items: SearchItem[] = [];
  for (const section of DOCS_TREE) {
    for (const page of section.pages) {
      if (page.externalHref) continue;
      let ln = 1;
      const pageContent = DOCS_CONTENT[page.slug];

      items.push({
        type: 'page',
        slug: page.slug,
        pageTitle: page.title,
        sectionLabel: section.label,
        displayText: page.title,
        lineNum: ln++,
        _h: `${page.title}\0${section.label}\0${page.description}`.toLowerCase(),
      });

      if (page.description) {
        items.push({
          type: 'content',
          slug: page.slug,
          pageTitle: page.title,
          sectionLabel: section.label,
          displayText: page.description,
          lineNum: ln++,
          _h: page.description.toLowerCase(),
        });
      }

      for (const heading of page.outline) {
        const anchor = heading.toLowerCase().replace(/\s+/g, '-');
        items.push({
          type: 'heading',
          slug: page.slug,
          pageTitle: page.title,
          sectionLabel: section.label,
          displayText: heading,
          lineNum: ln++,
          anchor,
          _h: heading.toLowerCase(),
        });

        const sc = pageContent?.[heading];
        if (sc) {
          const textParts: string[] = [];
          sc.paragraphs?.forEach((p) => textParts.push(stripHtml(p)));
          sc.paragraphs2?.forEach((p) => textParts.push(stripHtml(p)));
          sc.paragraphs3?.forEach((p) => textParts.push(stripHtml(p)));
          sc.steps?.forEach((s) => textParts.push(stripHtml(s)));
          sc.bullets?.forEach((b) => textParts.push(stripHtml(b)));
          if (sc.note) textParts.push(stripHtml(sc.note));
          if (sc.tip) textParts.push(stripHtml(sc.tip));

          for (const text of textParts) {
            if (!text.trim()) continue;
            items.push({
              type: 'content',
              slug: page.slug,
              pageTitle: page.title,
              sectionLabel: section.label,
              displayText: text,
              lineNum: ln++,
              anchor,
              _h: text.toLowerCase(),
            });
          }
        } else {
          items.push({
            type: 'content',
            slug: page.slug,
            pageTitle: page.title,
            sectionLabel: section.label,
            displayText: PLACEHOLDER,
            lineNum: ln++,
            anchor,
            _h: PLACEHOLDER.toLowerCase(),
          });
        }
      }
    }
  }
  return items;
}

/** Plain-text snippet windowed around the first match. No markup. */
function snippet(text: string, query: string): string {
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) {
    return text.length > 72 ? text.slice(0, 72) + '\u2026' : text;
  }
  const before = Math.max(0, idx - 20);
  const after = Math.min(text.length, idx + query.length + 52);
  const prefix = before > 0 ? '\u2026' : '';
  const suffix = after < text.length ? '\u2026' : '';
  return prefix + text.slice(before, after) + suffix;
}

export default function DocsSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const kbNav = useRef(false);

  const index = useMemo(buildIndex, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: SearchItem[] = [];
    for (const item of index) {
      if (!item._h.includes(q)) continue;
      const key = `${item.slug}\0${item.type}\0${item.displayText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= 30) break;
    }
    return out;
  }, [query, index]);

  useEffect(() => setActive(0), [results]);

  useEffect(() => {
    if (!kbNav.current || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const go = useCallback(
    (item: SearchItem) => {
      const q = query.trim();
      const href =
        `/docs/${item.slug}` +
        `?q=${encodeURIComponent(q)}` +
        `&ln=${item.lineNum}`;
      setOpen(false);
      setQuery('');
      window.location.href = href;
    },
    [query],
  );

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          kbNav.current = true;
          setActive((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          kbNav.current = true;
          setActive((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          if (results[active]) {
            e.preventDefault();
            go(results[active]);
          }
          break;
        case 'Escape':
          setOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [results, active, go],
  );

  const showResults = open && query.trim().length > 0;

  return (
    <div className="docs-search" ref={wrapRef}>
      <div
        className={`docs-search__box${open ? ' docs-search__box--focus' : ''}`}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <svg
          className="docs-search__icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="docs-search__input"
          placeholder="Search docs..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
      </div>

      {showResults && (
        <ul className="docs-search__results" ref={listRef}>
          {results.length === 0 ? (
            <li className="docs-search__empty">No matches</li>
          ) : (
            results.map((item, i) => {
              const q = query.trim();
              const path =
                item.type === 'page'
                  ? item.sectionLabel
                  : `${item.sectionLabel} / ${item.pageTitle}`;
              return (
                <li
                  key={`${item.slug}-${item.anchor ?? ''}-${item.type}-${item.lineNum}`}
                  className={`docs-search__result${i === active ? ' docs-search__result--active' : ''}`}
                  onMouseEnter={() => { kbNav.current = false; setActive(i); }}
                  onClick={() => go(item)}
                >
                  <span className="docs-search__result-path">{path}</span>
                  <span className="docs-search__result-line">
                    <span className="docs-search__result-ln">
                      L{item.lineNum}
                    </span>
                    <span className="docs-search__result-text">
                      {snippet(item.displayText, q)}
                    </span>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
