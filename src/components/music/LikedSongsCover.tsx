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
      className="flex flex-col gap-3 text-left group/card shrink-0 w-36 md:w-40 transition-all duration-300 relative hover:z-25"
    >
      <div className="relative w-32 h-32 md:w-36 md:h-36 shrink-0 overflow-hidden transition-transform duration-200 group-hover/card:scale-[1.03]">
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
      <div className="px-0.5 min-w-0 flex flex-col gap-0.5">
        <div
          className="text-sm font-bold truncate leading-tight group-hover/card:text-[var(--music-accent)] transition-colors"
          style={{ color: "var(--music-text-primary)" }}
        >
          Liked Songs
        </div>
        <div className="text-xs truncate leading-snug" style={{ color: "var(--music-text-secondary)" }}>
          {files.length} {files.length === 1 ? "song" : "songs"}
        </div>
      </div>
    </button>
  );
}
