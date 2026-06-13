import { ActivityIslandWaveform } from "./ActivityIslandWaveform";

type Props = {
  coverSrc: string | null;
  title: string;
  paused: boolean;
  accentColor: string;
  isStub: boolean;
  onClick: () => void;
};

export function ActivityIslandPill({
  coverSrc,
  title,
  paused,
  accentColor,
  isStub,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Now playing: ${title}`}
      aria-expanded={false}
      className="pointer-events-auto flex h-[38px] min-w-[154px] items-center justify-between gap-4 rounded-full bg-black pl-1.5 pr-3 shadow-lg shadow-black/20 ring-1 ring-white/5 transition-transform hover:scale-[1.02] active:scale-95"
    >
      <div className="h-[26px] w-[26px] shrink-0 overflow-hidden rounded-full bg-white/10">
        {coverSrc ? (
          <img src={coverSrc} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <ActivityIslandWaveform
        paused={paused}
        accentColor={accentColor}
        muted={isStub}
      />
    </button>
  );
}
