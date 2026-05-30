import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { isAudioOnlyPath, bestCoverPath } from "@/mediaKind";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import type { MediaFile } from "@/types";

type ShelfCardProps = {
  file: MediaFile;
  label: string;
  sublabel?: string;
  onClick: () => void;
};

function ShelfCard({ file, label, sublabel, onClick }: ShelfCardProps) {
  const cover = bestCoverPath(file);
  const coverSrc = cover ? convertFileSrc(cover) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-lg p-2 text-left shrink-0"
      style={{ width: 160 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--music-surface-raised)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {coverSrc ? (
        <img src={coverSrc} alt="" className="w-full aspect-square object-cover rounded" style={{ borderRadius: "var(--music-card-radius)" }} />
      ) : (
        <div
          className="w-full aspect-square rounded flex items-center justify-center"
          style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
      )}
      <div>
        <div className="text-sm font-medium truncate" style={{ color: "var(--music-text-primary)" }}>{label}</div>
        {sublabel && <div className="text-xs truncate mt-0.5" style={{ color: "var(--music-text-secondary)" }}>{sublabel}</div>}
      </div>
    </button>
  );
}

type Props = {
  onPlayFile: (file: MediaFile, playlist: MediaFile[]) => void;
};

export function MusicExploreView({ onPlayFile }: Props) {
  const entries = useRuforgeStore((s) => s.entries);

  const tracks = useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );

  const shuffled = useMemo(() => {
    const copy = [...tracks];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, 24);
  }, [tracks]);

  const byArtist = useMemo(() => {
    const map = new Map<string, MediaFile[]>();
    for (const t of tracks) {
      const a = t.artist ?? t.albumArtist ?? "";
      if (!a) continue;
      if (!map.has(a)) map.set(a, []);
      map.get(a)!.push(t);
    }
    return [...map.entries()]
      .filter(([, ts]) => ts.length >= 2)
      .slice(0, 6)
      .map(([artist, ts]) => ({ artist, tracks: ts }));
  }, [tracks]);

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "var(--music-text-muted)" }}>
        <p className="text-sm">Download some music to explore your library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6 overflow-y-auto h-full" style={{ scrollbarColor: "var(--music-border) transparent" }}>
      {/* Shuffle shelf */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--music-text-primary)" }}>From your library</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {shuffled.map((file) => (
            <ShelfCard
              key={file.path}
              file={file}
              label={file.name}
              sublabel={file.artist ?? undefined}
              onClick={() => onPlayFile(file, shuffled)}
            />
          ))}
        </div>
      </section>

      {/* By artist */}
      {byArtist.map(({ artist, tracks: aTracks }) => (
        <section key={artist}>
          <h2 className="text-base font-semibold mb-4" style={{ color: "var(--music-text-primary)" }}>{artist}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {aTracks.slice(0, 12).map((file) => (
              <ShelfCard
                key={file.path}
                file={file}
                label={file.name}
                sublabel={file.album ?? undefined}
                onClick={() => onPlayFile(file, aTracks)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
