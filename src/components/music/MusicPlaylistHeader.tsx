import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Pencil, Play, Shuffle, Trash2 } from "lucide-react";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import type { MediaFile } from "@/types";
import { MusicPlaylistCover } from "./MusicPlaylistCover";

type Props = {
  title: string;
  tracks: MediaFile[];
  coverFile: MediaFile | null;
  startEditing: boolean;
  onRename: (title: string) => void;
  onPlay: () => void;
  onShuffle: () => void;
  onDelete: () => void;
  onBack: () => void;
};

export function MusicPlaylistHeader({
  title,
  tracks,
  coverFile,
  startEditing,
  onRename,
  onPlay,
  onShuffle,
  onDelete,
  onBack,
}: Props) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const empty = tracks.length === 0;

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    setEditing(false);
  };

  return (
    <>
      <div className="relative shrink-0 overflow-hidden min-h-[180px]">
        <div className="absolute inset-0 pointer-events-none overflow-hidden blur-[40px] brightness-[0.35] scale-[1.15]">
          <MusicPlaylistCover files={tracks} coverFile={coverFile} className="w-full h-full min-h-[180px]" />
        </div>
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent from-30% to-[var(--music-surface)]" />
        <button
          type="button"
          onClick={onBack}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity text-[color:var(--music-text-primary)]"
        >
          <ChevronLeft size={16} /> Back
        </button>

        <div className="relative z-10 flex items-end gap-5 px-5 pb-5 pt-12">
          <MusicPlaylistCover files={tracks} coverFile={coverFile} className="w-32 h-32 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1 text-[color:var(--music-text-muted)]">
              Playlist
            </p>
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
                className="w-full max-w-md bg-white/[0.08] rounded-lg px-2 -mx-2 py-0.5 text-xl font-bold outline-none text-[color:var(--music-text-primary)] focus:bg-white/[0.12]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="group/title flex items-center gap-2 max-w-full text-left"
                aria-label={`Rename ${title}`}
              >
                <h1 className="text-xl font-bold truncate text-[color:var(--music-text-primary)]">{title}</h1>
                <Pencil
                  size={14}
                  className="shrink-0 opacity-0 group-hover/title:opacity-60 transition-opacity text-[color:var(--music-text-secondary)]"
                  aria-hidden
                />
              </button>
            )}
            <p className="text-xs mt-1 text-[color:var(--music-text-muted)]">
              {tracks.length} {tracks.length === 1 ? "song" : "songs"}
              {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-3 shrink-0">
        <button
          type="button"
          onClick={onPlay}
          disabled={empty}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl text-white bg-[var(--music-accent)] transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          <Play size={15} fill="currentColor" /> Play
        </button>
        <button
          type="button"
          onClick={onShuffle}
          disabled={empty}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold border border-[var(--music-border)] text-[color:var(--music-text-primary)] transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <Shuffle size={15} /> Shuffle
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto w-9 h-9 flex items-center justify-center rounded-full text-[color:var(--music-text-muted)] hover:text-[color:var(--music-text-primary)] hover:bg-white/10 transition-colors"
          aria-label="Delete playlist"
          title="Delete playlist"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </>
  );
}
