import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { MediaFile } from "@/types";
import { MusicPlaylistCover } from "./MusicPlaylistCover";

type Props = {
  title: string;
  tracks: MediaFile[];
  coverFile: MediaFile | null;
  startEditing: boolean;
  /** Bumped by the "..." menu's Rename item to open the title editor. */
  renameSignal: number;
  onRename: (title: string) => void;
  onBack: () => void;
  /** Action bar; sits on the same tinted backdrop so the color fades out beneath it. */
  children?: React.ReactNode;
};

/** Spotify-style total: "2 hr 45 min" for long lists, "23 min 12 sec" for short ones. */
export function formatPlaylistLength(seconds: number): string {
  const s = Math.round(seconds);
  const hr = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (hr > 0) return `${hr} hr ${min} min`;
  if (min > 0) return sec > 0 ? `${min} min ${sec} sec` : `${min} min`;
  return `${sec} sec`;
}

export function MusicPlaylistHeader({
  title,
  tracks,
  coverFile,
  startEditing,
  renameSignal,
  onRename,
  onBack,
  children,
}: Props) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (renameSignal > 0) setEditing(true);
  }, [renameSignal]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    setEditing(false);
  };

  const titleSize = title.length > 28 ? "text-4xl" : title.length > 16 ? "text-5xl" : "text-6xl";

  return (
    <div className="relative shrink-0">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 blur-[60px] brightness-[0.55] saturate-150 scale-[1.3]">
          <MusicPlaylistCover files={tracks} coverFile={coverFile} className="w-full h-full" radius="0" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 via-60% to-[var(--music-surface)]" />
      </div>

      <button
        type="button"
        onClick={onBack}
        className="absolute top-3 left-4 z-20 flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} /> Back
      </button>

      <div className="relative z-10 flex items-end gap-6 px-6 pt-14 pb-6">
        <MusicPlaylistCover
          files={tracks}
          coverFile={coverFile}
          className="w-48 h-48 shrink-0 shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
          iconSize={64}
        />
        <div className="min-w-0 flex-1 pb-1">
          <p className="text-sm font-medium text-white">Playlist</p>
          {editing ? (
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              maxLength={100}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(title);
                  setEditing(false);
                }
              }}
              aria-label="Playlist name"
              className={`w-full bg-white/[0.08] rounded-md px-2 -mx-2 my-2 font-black tracking-tight leading-tight outline-none text-white focus:bg-white/[0.12] ${titleSize}`}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="block max-w-full text-left my-2"
            >
              <h1 className={`font-black tracking-tight leading-tight truncate text-white ${titleSize}`}>{title}</h1>
            </button>
          )}
          <p className="text-sm text-white/70">
            {tracks.length} {tracks.length === 1 ? "song" : "songs"}
            {totalDuration > 0 && `, ${formatPlaylistLength(totalDuration)}`}
          </p>
        </div>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
