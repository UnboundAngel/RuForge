import { useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, Music, Search } from "lucide-react";
import { bestCoverPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { filterTracksByQuery, trackArtistLabel } from "./musicPlaylists";

type Props = {
  libraryTracks: MediaFile[];
  inPlaylist: (path: string) => boolean;
  onAdd: (file: MediaFile) => void;
  /** Empty playlists get the prominent builder heading. */
  prominent: boolean;
  /** Off while the header title is in edit mode so the rename input keeps focus. */
  autoFocus: boolean;
};

export function MusicPlaylistFinder({ libraryTracks, inPlaylist, onAdd, prominent, autoFocus }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterTracksByQuery(libraryTracks, query), [libraryTracks, query]);

  return (
    <section className="px-5 pt-4 pb-8">
      <h2
        className={
          prominent
            ? "text-lg font-bold text-[color:var(--music-text-primary)]"
            : "text-sm font-semibold text-[color:var(--music-text-secondary)]"
        }
      >
        {prominent ? "Let's find something for your playlist" : "Find more songs"}
      </h2>
      <label className="mt-3 flex items-center gap-2 h-10 max-w-md px-3 rounded-xl bg-white/[0.07] text-[color:var(--music-text-muted)] focus-within:bg-white/[0.1]">
        <Search size={15} className="shrink-0" aria-hidden />
        <input
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library for songs"
          aria-label="Search your library for songs"
          className="min-w-0 flex-1 bg-transparent border-0 outline-none text-sm text-[color:var(--music-text-primary)] placeholder:text-[color:var(--music-text-muted)]"
        />
      </label>

      {query.trim() && results.length === 0 && (
        <p className="mt-4 text-sm text-[color:var(--music-text-muted)]">No songs in your library match.</p>
      )}

      <div className="mt-2 flex flex-col">
        {results.map((file) => (
          <FinderRow key={file.path} file={file} added={inPlaylist(file.path)} onAdd={() => onAdd(file)} />
        ))}
      </div>
    </section>
  );
}

function FinderRow({ file, added, onAdd }: { file: MediaFile; added: boolean; onAdd: () => void }) {
  const cover = bestCoverPath(file);
  const artist = trackArtistLabel(file);
  return (
    <div className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-[var(--music-surface-raised)] transition-colors">
      {cover ? (
        <img src={convertFileSrc(cover)} alt="" className="w-10 h-10 shrink-0 object-cover rounded-[var(--music-card-radius)]" />
      ) : (
        <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-[var(--music-card-radius)] bg-[var(--music-surface-raised)] text-[color:var(--music-text-muted)]">
          <Music size={15} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate text-[color:var(--music-text-primary)]">{file.name}</div>
        {artist && <div className="text-xs truncate text-[color:var(--music-text-secondary)]">{artist}</div>}
      </div>
      {added ? (
        <span className="flex items-center gap-1 px-3 h-8 text-xs font-semibold text-[color:var(--music-text-muted)]">
          <Check size={13} /> Added
        </span>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="px-4 h-8 rounded-full text-xs font-semibold border border-[var(--music-border)] text-[color:var(--music-text-primary)] hover:bg-white/10 transition-colors"
        >
          Add
        </button>
      )}
    </div>
  );
}
