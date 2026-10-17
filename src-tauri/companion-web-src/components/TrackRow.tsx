import { Art, NowPlayingMark } from "./Cards";
import { useOfflineState } from "../offlineStore";
import { SaveButton } from "./SaveButton";
import { fmtDuration, itemMediaType, type CompanionItem } from "../types";

type Props = {
  item: CompanionItem;
  active: boolean;
  playable: boolean;
  /** Album and artist pages number their rows like desktop `MusicTrackIndexPlay`. */
  index?: number;
  /** Shown under the title instead of the artist (album pages already name the artist). */
  meta?: string | null;
  kindLabel?: boolean;
  onPlay: () => void;
};

export function TrackRow({ item, active, playable, index, meta, kindLabel, onPlay }: Props) {
  const saved = useOfflineState().saved.has(item.id);
  const video = itemMediaType(item) === "video";
  const dur = item.durationSecs ? fmtDuration(item.durationSecs) : null;
  const sub = !playable
    ? "Can't play on this device"
    : meta !== undefined
      ? meta
      : [kindLabel ? (video ? "Video" : "Song") : null, item.artist].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className={`ph-row${active ? " ph-row--active" : ""}${playable ? "" : " ph-row--off"}${saved ? " ph-row--saved" : ""}`}
      onClick={() => { if (playable) onPlay(); }}
      aria-disabled={!playable}
    >
      {index !== undefined ? (
        <span className="ph-row-num">{active ? "♪" : index + 1}</span>
      ) : null}
      <Art item={item} className={`ph-row-art${video ? " ph-row-art--wide" : ""}`} iconSize={16} />
      <span className="ph-row-text">
        <span className="ph-row-title">{item.title}</span>
        {sub ? <span className="ph-row-meta">{sub}</span> : null}
      </span>
      {active && index === undefined ? <NowPlayingMark /> : null}
      {playable ? <SaveButton item={item} size={20} /> : null}
      {dur ? <span className="ph-row-dur">{dur}</span> : null}
    </button>
  );
}
