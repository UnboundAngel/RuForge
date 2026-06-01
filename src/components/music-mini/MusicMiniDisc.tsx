import { Music } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoverLayer, TrackDirection } from "./useMusicMiniPlayback";

type Props = {
  layers: CoverLayer[];
  direction: TrackDirection;
  isExpanded: boolean;
};

export function MusicMiniDisc({ layers, direction: _direction, isExpanded }: Props) {
  const shellRadius = isExpanded ? "rounded-[32px]" : "rounded-[190px]";

  return (
    <div className="relative w-full h-full">
      <div
        className={cn(
          "absolute inset-0 overflow-hidden shadow-[0_12px_24px_rgba(0,0,0,0.4)] transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
          shellRadius,
          !isExpanded && "ring-1 ring-white/5",
        )}
      >
        {layers.map((l, i) => {
          const isNewest = i === layers.length - 1;
          const cls = cn(
            "absolute inset-0 w-full h-full min-w-full min-h-full object-cover object-center transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
            shellRadius,
            isNewest && l.dir ? "rf-mm-cover-enter" : "",
            !isNewest ? "rf-mm-cover-exit" : "",
          );
          return l.coverSrc ? (
            <img key={l.id} src={l.coverSrc} alt="" className={cls} draggable={false} />
          ) : (
            <div
              key={l.id}
              className={cn("absolute inset-0 flex items-center justify-center", shellRadius, cls)}
              style={{ background: "var(--music-surface-raised)" }}
            >
              <Music className="text-white/20" size={48} />
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "absolute inset-0 pointer-events-none mix-blend-screen transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
          shellRadius,
          isExpanded ? "opacity-0" : "opacity-[0.05]",
        )}
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.8) 100%)",
        }}
      />
    </div>
  );
}
