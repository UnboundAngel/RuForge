import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronLeft, Play, User, Disc3 } from "lucide-react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath, hasSquareCover } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";
import { artistKeyFromFile, rawArtistFromFile } from "./musicArtist";
import { albumKeyFromFile } from "./musicShelfDedup";

type Props = {
  path: string;
  onPlayFile: (file: MediaFile, playlist: MediaFile[]) => void;
  onOpenArtist: (artistKey: string) => void;
  onOpenAlbum: (artistKey: string, albumKey: string) => void;
  onBack: () => void;
};

export function MusicTrackView({ path, onPlayFile, onOpenArtist, onOpenAlbum, onBack }: Props) {
  const entries = useRuforgeStore((s) => s.entries);

  const file = useMemo<MediaFile | null>(() => {
    const all = flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path));
    return all.find((f) => f.path === path) ?? null;
  }, [entries, path]);

  if (!file) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 px-8 text-center" style={{ color: "var(--music-text-muted)" }}>
        <Play size={40} strokeWidth={1.5} style={{ opacity: 0.25 }} />
        <p className="text-sm">Track not found in library.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-2 flex items-center gap-1.5 text-xs font-medium hover:text-white transition-colors"
        >
          <ChevronLeft size={14} />
          Back
        </button>
      </div>
    );
  }

  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;
  const square = hasSquareCover(file);
  const artistKey = artistKeyFromFile(file);
  const artistDisplay = rawArtistFromFile(file);
  const album = (file.canonicalAlbum ?? file.album)?.trim() ?? "";
  const albumKey = album ? albumKeyFromFile(file) : "";

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden rf-scrollbar" style={{ background: "var(--music-surface)" }}>
      <div className="flex items-center gap-2 px-6 pt-5 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-medium hover:text-white transition-colors"
          style={{ color: "var(--music-text-secondary)" }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
          Back
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-8 px-8 pt-4 pb-10 max-w-[860px]">
        <div
          className="shrink-0 w-52 h-52 rounded-2xl overflow-hidden"
          style={{ background: "var(--music-surface-raised)" }}
        >
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="w-full h-full"
              style={{ objectFit: square ? "cover" : "contain" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--music-text-muted)" }}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.3 }}>
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 min-w-0 flex-1 pt-1">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--music-text-muted)" }}>
              Song
            </p>
            <h1
              className="text-3xl font-bold leading-tight truncate"
              style={{ color: "var(--music-text-primary)" }}
            >
              {file.name}
            </h1>

            {artistDisplay && (
              <button
                type="button"
                onClick={() => artistKey && onOpenArtist(artistKey)}
                className="flex items-center gap-1.5 text-sm font-medium w-fit hover:text-white transition-colors"
                style={{ color: "var(--music-text-secondary)" }}
                disabled={!artistKey}
              >
                <User size={13} strokeWidth={2} />
                {artistDisplay}
              </button>
            )}

            {album && albumKey && (
              <button
                type="button"
                onClick={() => onOpenAlbum(artistKey, albumKey)}
                className="flex items-center gap-1.5 text-sm w-fit hover:text-white transition-colors"
                style={{ color: "var(--music-text-muted)" }}
              >
                <Disc3 size={13} strokeWidth={2} />
                {album}
              </button>
            )}

            {file.duration > 0 && (
              <p className="text-xs mt-0.5" style={{ color: "var(--music-text-muted)" }}>
                {formatDuration(file.duration)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onPlayFile(file, [file])}
            className="flex items-center gap-2.5 w-fit px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-150 hover:brightness-110 active:scale-[0.97]"
            style={{ background: "var(--music-accent)", color: "#fff" }}
          >
            <Play size={15} fill="currentColor" strokeWidth={0} />
            Play
          </button>
        </div>
      </div>
    </div>
  );
}
