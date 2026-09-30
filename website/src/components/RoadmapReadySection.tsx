'use client';

import { useState } from 'react';
import { CalendarClock, Download, Gauge, Globe, LibraryBig, Play, Settings, type LucideIcon } from 'lucide-react';
import type { RoadmapArea, RoadmapItem } from '../lib/roadmapFieldNotes';

const AREA_ICON: Record<RoadmapArea, LucideIcon> = {
  Downloads: Download,
  Library: LibraryBig,
  Player: Play,
  Browser: Globe,
  Settings: Settings,
  Performance: Gauge,
};

function ReadyCard({ item, expectedLabel, mobile }: { item: RoadmapItem; expectedLabel: string; mobile: boolean }) {
  const [showWhen, setShowWhen] = useState(false);
  const Icon = showWhen ? CalendarClock : AREA_ICON[item.area];

  return (
    <li className={`rf-roadmap-ready--${item.area.toLowerCase()}`}>
      <button
        type="button"
        className={`rf-roadmap-ready-card${mobile ? ' rf-m-card' : ''}${showWhen ? ' is-when' : ''}`}
        aria-pressed={showWhen}
        onClick={() => setShowWhen((open) => !open)}
      >
        <span className="rf-roadmap-ready-body">
          <span className="rf-roadmap-ready-notch">
            <span className="rf-roadmap-ready-chip" aria-live="polite">
              <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
              {showWhen ? expectedLabel : item.area}
            </span>
          </span>
          <span className="rf-roadmap-ready-title">{item.title}</span>
        </span>
      </button>
    </li>
  );
}

export default function RoadmapReadySection({
  items,
  nextVersion,
  mobile = false,
}: {
  items: RoadmapItem[];
  nextVersion: string | null;
  mobile?: boolean;
}) {
  const expectedLabel = nextVersion ? `expected by v${nextVersion}` : 'in the next update';

  return (
    <section className="rf-roadmap-ready" aria-labelledby="status-unreleased">
      <div className="rf-roadmap-section-head rf-roadmap-section-head--ready">
        <div className="rf-roadmap-eyebrow rf-roadmap-eyebrow--ready">landing next</div>
        <h2 id="status-unreleased" className="rf-roadmap-heading rf-roadmap-heading--ready">
          {items.length} ready for the next update
        </h2>
        <p className="rf-roadmap-ready-note">these are finished and arrive with the next update</p>
      </div>
      <ul className="rf-roadmap-grid--ready">
        {items.map((item) => (
          <ReadyCard key={item.title} item={item} expectedLabel={expectedLabel} mobile={mobile} />
        ))}
      </ul>
    </section>
  );
}
