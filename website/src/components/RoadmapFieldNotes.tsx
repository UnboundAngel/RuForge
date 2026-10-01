'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHaptic } from './mobile/useHaptic';
import RoadmapReadySection, { AREA_ICON } from './RoadmapReadySection';
import RoadmapSectionHead from './RoadmapSectionHead';
import {
  priorityArcDasharray,
  priorityLabel,
  type RoadmapItem,
  type RoadmapPriority,
} from '../lib/roadmapFieldNotes';

const SHIPPED_BATCH = 10;
const MOBILE_PRIORITY_MS = 2000;

type RoadmapFieldNotesProps = {
  items: RoadmapItem[];
  nextVersion?: string | null;
  touchTooltips?: boolean;
  /** Desktop shows in-progress work in the page hero instead. */
  hideProgress?: boolean;
  /** Desktop closing row under the planned list. */
  suggestHref?: string;
};

const GITHUB_PATH =
  'M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.001 10.001 0 0022 12.021C22 6.484 17.523 2 12 2z';

function SuggestRow({ href }: { href: string }) {
  return (
    <div className="rf-roadmap-suggest">
      <div className="rf-roadmap-suggest-copy">
        <p className="rf-roadmap-suggest-title">something missing from the list?</p>
        <p className="rf-roadmap-suggest-note">post an idea or a request on GitHub Discussions</p>
      </div>
      <a href={href} className="rf-roadmap-cta no-underline" target="_blank" rel="noopener noreferrer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={GITHUB_PATH} />
        </svg>
        suggest a feature
      </a>
    </div>
  );
}

function useMobilePriorityFlash(mobile: boolean, onReveal?: () => void) {
  const [active, setActive] = useState(false);
  const timerRef = useRef<number>();

  const show = useCallback(() => {
    if (!mobile) return;
    window.clearTimeout(timerRef.current);
    setActive(true);
    timerRef.current = window.setTimeout(() => setActive(false), MOBILE_PRIORITY_MS);
  }, [mobile]);

  const reveal = useCallback(() => {
    if (!mobile) return;
    onReveal?.();
    show();
  }, [mobile, onReveal, show]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // `show` is for `.rf-m-*` hosts, whose haptic already fires from MobileShell on pointerdown.
  return { active, reveal, show };
}

function MetaSwap({
  area,
  priority,
  mobile,
  showPriority,
  areaClassName,
}: {
  area: string;
  priority: RoadmapPriority;
  mobile: boolean;
  showPriority: boolean;
  areaClassName: string;
}) {
  if (!mobile) {
    return <span className={areaClassName}>{area}</span>;
  }

  return (
    <span
      className={`rf-roadmap-meta-swap${showPriority ? ' is-priority' : ''}`}
      aria-live="polite"
    >
      <span className={areaClassName}>{area}</span>
      <span className={`rf-roadmap-priority-inline rf-roadmap-priority-inline--${priority}`}>
        {priorityLabel(priority)}
      </span>
    </span>
  );
}

function PriorityGauge({
  priority,
  size = 15,
  lead = false,
  mobile = false,
  quiet = false,
  onMobileTap,
}: {
  priority: RoadmapPriority;
  size?: number;
  lead?: boolean;
  mobile?: boolean;
  /** Decorative next to a written label: no tooltip, no focus stop. */
  quiet?: boolean;
  onMobileTap?: () => void;
}) {
  const label = priorityLabel(priority);
  const arcDA = priorityArcDasharray(priority);

  const handleClick = (event: React.MouseEvent) => {
    if (!mobile || !onMobileTap) return;
    event.stopPropagation();
    onMobileTap();
  };

  return (
    <span
      className={`rf-roadmap-priority-trig rf-roadmap-priority-trig--${priority}${lead ? ' rf-roadmap-priority-trig--lead' : ''}${mobile ? ' rf-roadmap-priority-trig--mobile' : ''}`}
      tabIndex={mobile || quiet ? undefined : 0}
      role={quiet ? undefined : 'img'}
      aria-label={quiet ? undefined : `Priority: ${label}`}
      aria-hidden={quiet || undefined}
      onClick={handleClick}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle
          className="rf-roadmap-priority-track"
          cx="8"
          cy="8"
          r="5.5"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          className="rf-roadmap-priority-arc"
          cx="8"
          cy="8"
          r="5.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={arcDA}
          strokeDashoffset="-8.6"
          strokeLinecap="round"
        />
      </svg>
      {!mobile && !quiet && (
        <span className="rf-roadmap-priority-tt" role="tooltip">
          {label} priority
        </span>
      )}
    </span>
  );
}

function PlannedIcon() {
  return (
    <span className="rf-roadmap-planned-icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <circle
          cx="10"
          cy="10"
          r="8.5"
          stroke="#c9b87a"
          strokeWidth="1.5"
          strokeDasharray="3.5 4.5"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>
    </span>
  );
}

function ShippedIcon() {
  return (
    <span className="rf-roadmap-shipped-icon" aria-hidden="true">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" fill="rgba(201,184,122,0.16)" />
        <path
          d="M6.5 10.5l2.5 2.5 5-5"
          stroke="rgba(201,184,122,0.75)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ProgressRow({
  item,
  mobile,
  onPriorityReveal,
}: {
  item: RoadmapItem;
  mobile: boolean;
  onPriorityReveal: () => void;
}) {
  const { active, reveal, show } = useMobilePriorityFlash(mobile, onPriorityReveal);

  return (
    <li className="rf-roadmap-item rf-roadmap-item--progress">
      <PriorityGauge
        priority={item.priority}
        size={20}
        lead
        mobile={mobile}
        onMobileTap={reveal}
      />
      <div className="rf-roadmap-item-body">
        {mobile ? (
          <button
            type="button"
            className="rf-roadmap-item-title rf-roadmap-item-title--progress rf-roadmap-item-title--tappable rf-m-link"
            onClick={show}
          >
            {item.title}
          </button>
        ) : (
          <div className="rf-roadmap-item-title rf-roadmap-item-title--progress">{item.title}</div>
        )}
        <div className="rf-roadmap-item-meta">
          <MetaSwap
            area={item.area}
            priority={item.priority}
            mobile={mobile}
            showPriority={active}
            areaClassName="rf-roadmap-area rf-roadmap-area--progress"
          />
        </div>
      </div>
    </li>
  );
}

function PlannedRow({
  item,
  mobile,
  onPriorityReveal,
}: {
  item: RoadmapItem;
  mobile: boolean;
  onPriorityReveal: () => void;
}) {
  const { active, reveal, show } = useMobilePriorityFlash(mobile, onPriorityReveal);

  return (
    <li className="rf-roadmap-item rf-roadmap-item--planned">
      <PlannedIcon />
      <div className="rf-roadmap-item-body">
        {mobile ? (
          <button
            type="button"
            className="rf-roadmap-item-title rf-roadmap-item-title--planned rf-roadmap-item-title--tappable rf-m-link"
            onClick={show}
          >
            {item.title}
          </button>
        ) : (
          <div className="rf-roadmap-item-title rf-roadmap-item-title--planned">{item.title}</div>
        )}
        <div className="rf-roadmap-item-meta">
          <MetaSwap
            area={item.area}
            priority={item.priority}
            mobile={mobile}
            showPriority={active}
            areaClassName="rf-roadmap-area rf-roadmap-area--planned"
          />
          {mobile && (
            <PriorityGauge
              priority={item.priority}
              size={13}
              mobile={mobile}
              onMobileTap={reveal}
            />
          )}
        </div>
      </div>
    </li>
  );
}

type PlannedSort = 'priority' | 'area';

const PRIORITY_RANK: Record<RoadmapPriority, number> = { essential: 0, high: 1, medium: 2, low: 3 };

function SortHeader({
  label,
  column,
  sort,
  reversed,
  onSort,
}: {
  label: string;
  column: PlannedSort;
  sort: PlannedSort;
  reversed: boolean;
  onSort: (column: PlannedSort) => void;
}) {
  const active = sort === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (reversed ? 'descending' : 'ascending') : 'none'}
      className="rf-roadmap-table-th"
    >
      <button
        type="button"
        className={`rf-roadmap-table-sort${active ? ' is-active' : ''}`}
        onClick={() => onSort(column)}
      >
        {label}
        <svg
          className={`rf-roadmap-table-arrow${active && reversed ? ' is-reversed' : ''}`}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  );
}

function PlannedTable({ items }: { items: RoadmapItem[] }) {
  const [sort, setSort] = useState<PlannedSort>('priority');
  const [reversed, setReversed] = useState(false);

  const onSort = (column: PlannedSort) => {
    if (column === sort) {
      setReversed((r) => !r);
    } else {
      setSort(column);
      setReversed(false);
    }
  };

  const rows = [...items].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    const byArea = a.area.localeCompare(b.area);
    const primary = sort === 'priority' ? byPriority : byArea;
    const secondary = sort === 'priority' ? byArea : byPriority;
    return (reversed ? -primary : primary) || secondary || a.title.localeCompare(b.title);
  });

  return (
    <table className="rf-roadmap-table">
      <thead>
        <tr>
          <th scope="col" className="rf-roadmap-table-th">
            <span className="rf-roadmap-table-label">feature</span>
          </th>
          <SortHeader label="area" column="area" sort={sort} reversed={reversed} onSort={onSort} />
          <SortHeader label="priority" column="priority" sort={sort} reversed={reversed} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => {
          const Icon = AREA_ICON[item.area];
          return (
            <tr key={item.title} className="rf-roadmap-table-row">
              <td className="rf-roadmap-table-title">{item.title}</td>
              <td className={`rf-roadmap-table-area rf-roadmap-ready--${item.area.toLowerCase()}`}>
                <span className="rf-roadmap-ready-chip">
                  <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
                  {item.area}
                </span>
              </td>
              <td className={`rf-roadmap-table-priority rf-roadmap-table-priority--${item.priority}`}>
                <PriorityGauge priority={item.priority} size={15} quiet />
                {priorityLabel(item.priority)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const SHIPPED_GROUP_PREVIEW = 4;

function Chevron({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <svg
      className={`rf-roadmap-attached-chevron${open ? ' is-open' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ShippedGroupCard({ area, list }: { area: RoadmapItem['area']; list: RoadmapItem[] }) {
  const [open, setOpen] = useState(false);
  const Icon = AREA_ICON[area];
  const extra = list.length - SHIPPED_GROUP_PREVIEW;
  const shown = open || extra <= 0 ? list : list.slice(0, SHIPPED_GROUP_PREVIEW);
  const listId = `roadmap-shipped-${area.toLowerCase()}`;

  return (
    <div className={`rf-roadmap-attached rf-roadmap-ready--${area.toLowerCase()}${extra > 0 ? ' has-foot' : ''}`}>
      <div className="rf-roadmap-attached-card rf-roadmap-shipped-group">
        <div className="rf-roadmap-shipped-group-head">
          <span className="rf-roadmap-ready-chip">
            <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
            {area}
          </span>
          <span className="rf-roadmap-shipped-group-count">{list.length}</span>
        </div>
        <ul className="rf-roadmap-shipped-group-list" id={listId}>
          {shown.map((item) => (
            <li key={item.title} className="rf-roadmap-shipped-group-item">
              <ShippedIcon />
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      </div>
      {extra > 0 && (
        <button
          type="button"
          className="rf-roadmap-attached-foot"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
        >
          <span>{open ? 'show less' : `${extra} more`}</span>
          <Chevron open={open} />
        </button>
      )}
    </div>
  );
}

function ShippedGroups({ items }: { items: RoadmapItem[] }) {
  const [open, setOpen] = useState(false);
  const groups = Object.entries(
    items.reduce<Record<string, RoadmapItem[]>>((acc, item) => {
      (acc[item.area] ??= []).push(item);
      return acc;
    }, {}),
  )
    .map(([area, list]) => ({
      area: area as RoadmapItem['area'],
      list: [...list].sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title),
      ),
    }))
    .sort((a, b) => b.list.length - a.list.length || a.area.localeCompare(b.area));

  return (
    <section className="rf-roadmap-shipped" aria-labelledby="status-shipped">
      <div className="rf-roadmap-attached">
        <div className="rf-roadmap-attached-card rf-roadmap-shipped-card">
          <h2 id="status-shipped" className="rf-roadmap-shipped-card-h">
            <button
              type="button"
              className="rf-roadmap-shipped-toggle"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="roadmap-shipped-list"
            >
              <span className="rf-roadmap-shipped-toggle-copy">
                <span className="rf-roadmap-shipped-card-title">already shipped</span>
                <span className="rf-roadmap-shipped-card-meta">{items.length} features</span>
              </span>
              <Chevron open={open} size={18} />
            </button>
          </h2>
          <div className={`rf-roadmap-shipped-panel${open ? ' is-expanded' : ''}`} id="roadmap-shipped-list">
            <div className="rf-roadmap-shipped-panel-inner">
              <div className="rf-roadmap-shipped-groups">
                {groups.map(({ area, list }) => (
                  <ShippedGroupCard key={area} area={area} list={list} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileShippedSection({ items }: { items: RoadmapItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [staggerFrom, setStaggerFrom] = useState(0);

  const toggleExpanded = () => {
    setExpanded((open) => {
      if (open) {
        setVisibleCount(0);
        return false;
      }
      setStaggerFrom(0);
      setVisibleCount(Math.min(SHIPPED_BATCH, items.length));
      return true;
    });
  };

  const loadMore = () => {
    setStaggerFrom(visibleCount);
    setVisibleCount((count) => Math.min(count + SHIPPED_BATCH, items.length));
  };

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = expanded && visibleCount < items.length;

  return (
    <section className="rf-roadmap-shipped" aria-labelledby="status-shipped">
      <div className={`rf-roadmap-attached${hasMore ? ' has-foot' : ''}`}>
        <div className="rf-roadmap-attached-card rf-roadmap-shipped-card">
          <h2 id="status-shipped" className="rf-roadmap-shipped-card-h">
            <button
              type="button"
              className="rf-roadmap-shipped-toggle rf-m-btn"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              aria-controls="roadmap-shipped-list"
            >
              <span className="rf-roadmap-shipped-toggle-copy">
                <span className="rf-roadmap-shipped-card-title">already shipped</span>
                <span className="rf-roadmap-shipped-card-meta">{items.length} features</span>
              </span>
              <Chevron open={expanded} size={18} />
            </button>
          </h2>
          <div
            className={`rf-roadmap-shipped-panel${expanded ? ' is-expanded' : ''}`}
            id="roadmap-shipped-list"
          >
            <div className="rf-roadmap-shipped-panel-inner">
              <ul className="rf-roadmap-grid rf-roadmap-grid--shipped">
                {visibleItems.map((item, index) => {
                  const staggerIndex = index >= staggerFrom ? index - staggerFrom : -1;
                  return (
                    <li
                      key={item.title}
                      className={`rf-roadmap-item rf-roadmap-item--shipped${staggerIndex >= 0 ? ' rf-roadmap-item--reveal' : ''}`}
                      style={
                        staggerIndex >= 0
                          ? ({ '--rf-shipped-i': staggerIndex } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <ShippedIcon />
                      <span className="rf-roadmap-item-title rf-roadmap-item-title--shipped">
                        {item.title}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
        {hasMore && (
          <button type="button" className="rf-roadmap-attached-foot rf-m-btn" onClick={loadMore}>
            <span>show {Math.min(SHIPPED_BATCH, items.length - visibleCount)} more</span>
            <Chevron open={false} />
          </button>
        )}
      </div>
    </section>
  );
}

export default function RoadmapFieldNotes({
  items,
  nextVersion = null,
  touchTooltips = false,
  hideProgress = false,
  suggestHref,
}: RoadmapFieldNotesProps) {
  const mobile = touchTooltips;
  const { select } = useHaptic();

  const progress = items.filter((item) => item.status === 'progress');
  const ready = items.filter((item) => item.status === 'unreleased');
  const planned = items.filter((item) => item.status === 'planned');
  const shipped = items.filter((item) => item.status === 'shipped');

  const hapticPriority = useCallback(() => select(), [select]);

  return (
    <div className="rf-roadmap-body">
      {progress.length > 0 && !hideProgress && (
        <section className="rf-roadmap-brewing" aria-labelledby="status-progress">
          <div className="rf-roadmap-section-head">
            <div className="rf-roadmap-eyebrow rf-roadmap-eyebrow--brewing">brewing now</div>
            <div className="rf-roadmap-heading-wrap">
              <h2 id="status-progress" className="rf-roadmap-heading rf-roadmap-heading--progress">
                {progress.length} being built right now
              </h2>
              <svg
                className="rf-roadmap-squiggle rf-roadmap-squiggle--section"
                viewBox="0 0 300 13"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M 0,6.5 Q 75,0 150,6.5 Q 225,13 300,6.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  pathLength="320"
                  className="rf-roadmap-draw-line rf-roadmap-draw-line--section"
                />
              </svg>
            </div>
          </div>
          <ul className="rf-roadmap-grid rf-roadmap-grid--progress">
            {progress.map((item) => (
              <ProgressRow
                key={item.title}
                item={item}
                mobile={mobile}
                onPriorityReveal={hapticPriority}
              />
            ))}
          </ul>
        </section>
      )}

      {ready.length > 0 && <RoadmapReadySection items={ready} nextVersion={nextVersion} mobile={mobile} />}

      {planned.length > 0 && (
        <section className="rf-roadmap-horizon" aria-labelledby="status-planned">
          {mobile ? (
            <div className="rf-roadmap-section-head rf-roadmap-section-head--horizon">
              <div className="rf-roadmap-eyebrow rf-roadmap-eyebrow--horizon">on the horizon</div>
              <h2 id="status-planned" className="rf-roadmap-heading rf-roadmap-heading--planned">
                {planned.length} planned
              </h2>
            </div>
          ) : (
            <RoadmapSectionHead
              id="status-planned"
              title="planned after that"
              count={planned.length}
              tone="planned"
            />
          )}
          {mobile ? (
            <ul className="rf-roadmap-grid rf-roadmap-grid--planned">
              {planned.map((item) => (
                <PlannedRow
                  key={item.title}
                  item={item}
                  mobile={mobile}
                  onPriorityReveal={hapticPriority}
                />
              ))}
            </ul>
          ) : (
            <PlannedTable items={planned} />
          )}
        </section>
      )}

      {suggestHref && !mobile && <SuggestRow href={suggestHref} />}

      {shipped.length > 0 &&
        (mobile ? <MobileShippedSection items={shipped} /> : <ShippedGroups items={shipped} />)}
    </div>
  );
}
