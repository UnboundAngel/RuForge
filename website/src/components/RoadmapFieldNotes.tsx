'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHaptic } from './mobile/useHaptic';
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
  touchTooltips?: boolean;
};

function useMobilePriorityFlash(mobile: boolean, onReveal?: () => void) {
  const [active, setActive] = useState(false);
  const timerRef = useRef<number>();

  const reveal = useCallback(() => {
    if (!mobile) return;
    onReveal?.();
    window.clearTimeout(timerRef.current);
    setActive(true);
    timerRef.current = window.setTimeout(() => setActive(false), MOBILE_PRIORITY_MS);
  }, [mobile, onReveal]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { active, reveal };
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
  onMobileTap,
}: {
  priority: RoadmapPriority;
  size?: number;
  lead?: boolean;
  mobile?: boolean;
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
      tabIndex={mobile ? undefined : 0}
      role="img"
      aria-label={`Priority: ${label}`}
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
      {!mobile && (
        <span className="rf-roadmap-priority-tt" role="tooltip">
          {label}
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
        <circle cx="10" cy="10" r="9" fill="rgba(201,184,122,0.14)" />
        <path
          d="M6.5 10.5l2.5 2.5 5-5"
          stroke="rgba(201,184,122,0.44)"
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
  const { active, reveal } = useMobilePriorityFlash(mobile, onPriorityReveal);

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
            className="rf-roadmap-item-title rf-roadmap-item-title--progress rf-roadmap-item-title--tappable"
            onClick={reveal}
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
  const { active, reveal } = useMobilePriorityFlash(mobile, onPriorityReveal);

  return (
    <li className="rf-roadmap-item rf-roadmap-item--planned">
      <PlannedIcon />
      <div className="rf-roadmap-item-body">
        {mobile ? (
          <button
            type="button"
            className="rf-roadmap-item-title rf-roadmap-item-title--planned rf-roadmap-item-title--tappable"
            onClick={reveal}
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
          <PriorityGauge
            priority={item.priority}
            size={13}
            mobile={mobile}
            onMobileTap={reveal}
          />
        </div>
      </div>
    </li>
  );
}

function ShippedSection({
  items,
  mobile,
  onExpand,
  onSeeMore,
}: {
  items: RoadmapItem[];
  mobile: boolean;
  onExpand?: () => void;
  onSeeMore?: () => void;
}) {
  const [expanded, setExpanded] = useState(!mobile);
  const [visibleCount, setVisibleCount] = useState(mobile ? 0 : items.length);
  const [staggerFrom, setStaggerFrom] = useState(0);

  useEffect(() => {
    if (!mobile) {
      setVisibleCount(items.length);
      setExpanded(true);
    }
  }, [mobile, items.length]);

  const toggleExpanded = () => {
    if (!mobile) return;
    onExpand?.();
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
    onSeeMore?.();
    setStaggerFrom(visibleCount);
    setVisibleCount((count) => Math.min(count + SHIPPED_BATCH, items.length));
  };

  const visibleItems = mobile ? items.slice(0, visibleCount) : items;
  const hasMore = mobile && expanded && visibleCount < items.length;

  const header = mobile ? (
    <button
      type="button"
      className="rf-roadmap-shipped-toggle rf-m-btn"
      onClick={toggleExpanded}
      aria-expanded={expanded}
      aria-controls="roadmap-shipped-list"
    >
      <div className="rf-roadmap-section-head rf-roadmap-section-head--shipped">
        <div className="rf-roadmap-eyebrow rf-roadmap-eyebrow--shipped">Shipped</div>
        <h2 id="status-shipped" className="rf-roadmap-heading rf-roadmap-heading--shipped">
          {items.length} done.
        </h2>
      </div>
      <span className={`rf-roadmap-shipped-chevron${expanded ? ' is-open' : ''}`} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </button>
  ) : (
    <div className="rf-roadmap-section-head rf-roadmap-section-head--shipped">
      <div className="rf-roadmap-eyebrow rf-roadmap-eyebrow--shipped">Shipped</div>
      <h2 id="status-shipped" className="rf-roadmap-heading rf-roadmap-heading--shipped">
        {items.length} done.
      </h2>
    </div>
  );

  return (
    <section className="rf-roadmap-shipped" aria-labelledby="status-shipped">
      {header}
      <div
        className={`rf-roadmap-shipped-panel${expanded ? ' is-expanded' : ''}`}
        id="roadmap-shipped-list"
      >
        <div className="rf-roadmap-shipped-panel-inner">
          <ul className="rf-roadmap-grid rf-roadmap-grid--shipped">
            {visibleItems.map((item, index) => {
              const staggerIndex = mobile && index >= staggerFrom ? index - staggerFrom : -1;
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
          {hasMore && (
            <button type="button" className="rf-roadmap-shipped-more rf-m-btn" onClick={loadMore}>
              See more
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function RoadmapFieldNotes({ items, touchTooltips = false }: RoadmapFieldNotesProps) {
  const mobile = touchTooltips;
  const { select, tap } = useHaptic();

  const progress = items.filter((item) => item.status === 'progress');
  const planned = items.filter((item) => item.status === 'planned');
  const shipped = items.filter((item) => item.status === 'shipped');

  const hapticPriority = useCallback(() => select(), [select]);

  return (
    <div className="rf-roadmap-body">
      {progress.length > 0 && (
        <section className="rf-roadmap-brewing" aria-labelledby="status-progress">
          <div className="rf-roadmap-section-head">
            <div className="rf-roadmap-eyebrow rf-roadmap-eyebrow--brewing">Brewing now</div>
            <div className="rf-roadmap-heading-wrap">
              <h2 id="status-progress" className="rf-roadmap-heading rf-roadmap-heading--progress">
                {progress.length} in the works.
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

      {planned.length > 0 && (
        <section className="rf-roadmap-horizon" aria-labelledby="status-planned">
          <div className="rf-roadmap-section-head rf-roadmap-section-head--horizon">
            <div className="rf-roadmap-eyebrow rf-roadmap-eyebrow--horizon">On the horizon</div>
            <h2 id="status-planned" className="rf-roadmap-heading rf-roadmap-heading--planned">
              {planned.length} planned.
            </h2>
          </div>
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
        </section>
      )}

      {shipped.length > 0 && (
        <ShippedSection
          items={shipped}
          mobile={mobile}
          onExpand={select}
          onSeeMore={tap}
        />
      )}
    </div>
  );
}
