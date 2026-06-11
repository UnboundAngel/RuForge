import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Heart } from "lucide-react";
import { bestCoverPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { cn } from "@/lib/utils";

export function collectLikedCoverPaths(files: MediaFile[], max = 4): string[] {
  const paths: string[] = [];
  for (const f of files) {
    const cover = bestCoverPath(f);
    if (!cover || paths.includes(cover)) continue;
    paths.push(cover);
    if (paths.length >= max) break;
  }
  return paths;
}

type CoverProps = {
  files: MediaFile[];
  className?: string;
};

export function LikedSongsCover({ files, className }: CoverProps) {
  const covers = useMemo(() => collectLikedCoverPaths(files), [files]);
  const radius = "var(--music-card-radius, 14px)";

  if (covers.length === 0) {
    return (
      <div
        className={cn("relative overflow-hidden flex items-center justify-center", className)}
        style={{
          borderRadius: radius,
          background: "linear-gradient(135deg, #3a0810 0%, #1a1012 45%, #121212 100%)",
        }}
      >
        <Heart size={40} fill="#ff0033" stroke="#ff0033" strokeWidth={1.5} style={{ opacity: 0.85 }} />
      </div>
    );
  }

  if (covers.length === 1) {
    return (
      <img
        src={convertFileSrc(covers[0]!)}
        alt=""
        className={cn("object-cover", className)}
        style={{ borderRadius: radius }}
      />
    );
  }

  if (covers.length === 2) {
    return (
      <div className={cn("grid grid-cols-2 overflow-hidden", className)} style={{ borderRadius: radius }}>
        {covers.map((path) => (
          <img key={path} src={convertFileSrc(path)} alt="" className="w-full h-full object-cover" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("grid grid-cols-2 grid-rows-2 overflow-hidden", className)}
      style={{ borderRadius: radius }}
    >
      {Array.from({ length: 4 }, (_, i) => {
        const path = covers[i];
        if (path) {
          return <img key={path} src={convertFileSrc(path)} alt="" className="w-full h-full object-cover" />;
        }
        return (
          <div
            key={`empty-${i}`}
            className="w-full h-full"
            style={{ background: "linear-gradient(135deg, #2a0408 0%, #141414 100%)" }}
          />
        );
      })}
    </div>
  );
}

type CardProps = {
  files: MediaFile[];
  onClick: () => void;
};

export function LikedSongsCard({ files, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/card flex w-full min-w-0 items-center gap-4 sm:gap-5 rounded-2xl px-3 py-3 sm:px-4 sm:py-3.5 text-left transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.995]"
      style={{
        background: "linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.02) 100%)",
      }}
    >
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 shrink-0 overflow-hidden rounded-xl transition-transform duration-200 group-hover/card:scale-[1.03]">
        <LikedSongsCover files={files} className="w-full h-full" />
        <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: "var(--music-accent)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1 pr-1">
        <div
          className="text-base sm:text-lg font-bold leading-tight group-hover/card:text-[var(--music-accent)] transition-colors"
          style={{ color: "var(--music-text-primary)" }}
        >
          Liked Songs
        </div>
        <div className="text-sm leading-snug" style={{ color: "var(--music-text-secondary)" }}>
          {files.length} {files.length === 1 ? "song" : "songs"}
        </div>
      </div>
    </button>
  );
}
