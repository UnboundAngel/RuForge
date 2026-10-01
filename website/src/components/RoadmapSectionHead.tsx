import type { ReactNode } from 'react';

export default function RoadmapSectionHead({
  id,
  title,
  count,
  note,
  aside,
  tone,
}: {
  id: string;
  title: string;
  count: number;
  note?: string;
  aside?: ReactNode;
  tone: 'ready' | 'planned' | 'shipped';
}) {
  return (
    <div className={`rf-roadmap-split-head rf-roadmap-split-head--${tone}`}>
      <h2 id={id} className="rf-roadmap-split-title">
        {title}
        <span className="rf-roadmap-split-count">{count}</span>
      </h2>
      {note && <p className="rf-roadmap-split-note">{note}</p>}
      {aside}
    </div>
  );
}
