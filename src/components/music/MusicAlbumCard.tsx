import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Play } from "lucide-react";

type Props = {
  title: string;
  subtitle: string;
  cover: string | null;
  coverFallback?: string | null;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

export function MusicAlbumCard({ title, subtitle, cover, coverFallback = null, onClick, onContextMenu }: Props) {
  const [coverSrc, setCoverSrc] = useState<string | null>(() => (cover ? convertFileSrc(cover) : null));

  useEffect(() => {
    setCoverSrc(cover ? convertFileSrc(cover) : null);
  }, [cover]);

  const handleCoverError = () => {
    if (coverFallback) {
      setCoverSrc(convertFileSrc(coverFallback));
    } else {
      setCoverSrc(null);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
      className="flex flex-col gap-3 text-left group/card shrink-0 w-36 md:w-40 transition-all duration-300 relative hover:z-25 snap-start"
    >
      <div className="relative w-32 h-32 md:w-36 md:h-36 shrink-0 z-10">
        <div className="absolute top-0.5 bottom-0.5 right-0.5 aspect-square rounded-full bg-neutral-950 border border-neutral-800 transition-all duration-500 ease-out translate-x-0 group-hover/card:translate-x-6 group-hover/card:rotate-[180deg] z-0 flex items-center justify-center">
          <div className="absolute inset-2 rounded-full border border-neutral-900/60" />
          <div className="absolute inset-4 rounded-full border border-neutral-900/60" />
          <div className="absolute inset-6 rounded-full border border-neutral-900/60" />
          <div className="absolute inset-8 rounded-full border border-neutral-900/60" />
          <div className="w-10 h-10 rounded-full overflow-hidden bg-stone-900 border border-neutral-850 flex items-center justify-center relative">
            {coverSrc ? (
              <img src={coverSrc} alt="" className="w-full h-full object-cover" onError={handleCoverError} />
            ) : (
              <div className="w-full h-full bg-neutral-800" />
            )}
            <div className="absolute w-2.5 h-2.5 rounded-full bg-black border border-stone-900 z-10" />
          </div>
        </div>

        <div className="relative z-10 w-full h-full rounded-xl overflow-hidden bg-stone-950 border border-white/5 transition-all duration-300 ease-out group-hover/card:-translate-x-2 group-hover/card:scale-[0.97] group-hover/card:rotate-[-2deg]">
          {coverSrc ? (
            <img src={coverSrc} alt="" className="w-full h-full object-cover" onError={handleCoverError} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--music-text-muted)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.35 }}>
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 z-20">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: "var(--music-accent)" }}
            >
              <Play size={18} className="text-white fill-white ml-0.5" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-0.5 min-w-0 flex flex-col gap-0.5 z-20 relative">
        <div
          className="text-sm font-bold truncate leading-tight group-hover/card:text-[var(--music-accent)] transition-colors"
          style={{ color: "var(--music-text-primary)" }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-xs truncate leading-snug" style={{ color: "var(--music-text-secondary)" }}>
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}
