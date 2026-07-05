import { LazyThumb } from "./LazyThumb";
import type { CompanionItem } from "../types";

type Props = {
  items: CompanionItem[];
  activeId: string | null;
  onPlay: (item: CompanionItem) => void;
  onClose: () => void;
};

export function QueueSidebar({ items, activeId, onPlay, onClose }: Props) {
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const upNext = activeIndex >= 0 ? items.slice(activeIndex + 1) : items;
  const played = activeIndex > 0 ? items.slice(0, activeIndex) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="right-panel-header">
        <span className="right-panel-title">Queue</span>
        <button type="button" className="right-panel-close" onClick={onClose} aria-label="Close queue">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "4px 4px 8px" }}>
        {activeId && (
          <>
            <div className="mode-section-header" style={{ paddingTop: 8 }}>Now playing</div>
            {items.filter((i) => i.id === activeId).map((item) => (
              <QueueTrack key={item.id} item={item} active onPlay={onPlay} />
            ))}
          </>
        )}

        {upNext.length > 0 && (
          <>
            <div className="mode-section-header" style={{ paddingTop: 12 }}>Next up</div>
            {upNext.map((item) => (
              <QueueTrack key={item.id} item={item} active={false} onPlay={onPlay} />
            ))}
          </>
        )}

        {played.length > 0 && (
          <>
            <div className="mode-section-header" style={{ paddingTop: 12 }}>History</div>
            {played.map((item) => (
              <QueueTrack
                key={item.id}
                item={item}
                active={false}
                dim
                onPlay={onPlay}
              />
            ))}
          </>
        )}

        {items.length === 0 && (
          <div className="empty-state" style={{ fontSize: 12 }}>No tracks in queue</div>
        )}
      </div>
    </div>
  );
}

function QueueTrack({
  item,
  active,
  dim,
  onPlay,
}: {
  item: CompanionItem;
  active: boolean;
  dim?: boolean;
  onPlay: (item: CompanionItem) => void;
}) {
  return (
    <div
      className={`queue-track ${active ? "active" : ""}`}
      onClick={() => onPlay(item)}
      style={{ opacity: dim ? 0.45 : 1 }}
    >
      <LazyThumb id={item.id} hasThumb={item.hasThumb} className="queue-track-art">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--music-text-muted)" }}>
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
      </LazyThumb>
      <div className="queue-track-info">
        <div className="queue-track-title">{item.title}</div>
        {item.artist && <div className="queue-track-artist">{item.artist}</div>}
      </div>
    </div>
  );
}
