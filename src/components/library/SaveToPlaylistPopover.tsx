import { useMemo, useState } from "react";
import { Check, Clock, ListVideo, Minus, Plus, Search, X } from "lucide-react";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  type MenuAt,
} from "@/components/music/musicMenuUi";
import { localThumbSrc } from "@/lib/localImageSrc";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  WATCH_LATER_ID,
  sortVirtualRecords,
  virtualPlaylistPath,
  type VirtualPlaylistRecord,
} from "@/virtualPlaylists";

const tone = MUSIC_MENU_TONES.playlist;
const ACCENT = "var(--rf-menu-accent,var(--accent))";

type Membership = "all" | "some" | "none";

function membershipOf(record: VirtualPlaylistRecord, paths: string[]): Membership {
  if (paths.length === 0) return "none";
  const held = paths.filter((p) => record.items.some((i) => mediaPathsMatch(i.path, p))).length;
  return held === 0 ? "none" : held === paths.length ? "all" : "some";
}

/**
 * Small anchored picker for saving videos to a video playlist. Toggling a row saves or removes at
 * once and keeps the popover open, so one video can land in several playlists in one pass.
 */
export function SaveToPlaylistPopover({
  paths,
  at,
  onClose,
}: {
  paths: string[];
  at: MenuAt | null;
  onClose: () => void;
}) {
  const notify = useRuforgeStore((s) => s.notify);
  const entries = useRuforgeStore((s) => s.entries);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const removePathsFromVirtualPlaylist = useRuforgeStore((s) => s.removePathsFromVirtualPlaylist);
  const createVirtualPlaylist = useRuforgeStore((s) => s.createVirtualPlaylist);
  const listVirtualPlaylistRecords = useRuforgeStore((s) => s.listVirtualPlaylistRecords);
  const open = at != null;

  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState<string | null>(null);
  // Records are read from storage, so a toggle bumps this to re-read them.
  const [rev, setRev] = useState(0);

  const records = useMemo(
    () =>
      open
        ? sortVirtualRecords(listVirtualPlaylistRecords()).filter((r) => r.kind !== "music")
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, listVirtualPlaylistRecords, entries, rev],
  );

  const covers = useMemo(() => {
    const byPath = new Map<string, string>();
    for (const e of entries) {
      if (e.kind !== "playlist") continue;
      const first = e.items[0];
      const cover = e.stackThumbnailPath || first?.thumbnailPath || first?.ruforgePosterPath;
      if (cover) byPath.set(e.path, cover);
    }
    return byPath;
  }, [entries]);

  const q = query.trim().toLowerCase();
  const visible = q ? records.filter((r) => r.title.toLowerCase().includes(q)) : records;
  const canToggle = paths.length > 0;

  const close = () => {
    setQuery("");
    setNaming(null);
    onClose();
  };

  const toggle = (record: VirtualPlaylistRecord, membership: Membership) => {
    if (membership === "all") {
      removePathsFromVirtualPlaylist(record.id, paths);
      notify(`Removed from ${record.title}`);
    } else {
      const missing = paths.filter((p) => !record.items.some((i) => mediaPathsMatch(i.path, p)));
      addToVirtualPlaylist(record.id, missing);
      notify(`Added to ${record.title}`);
    }
    setRev((n) => n + 1);
  };

  const create = (name: string) => {
    const title = name.trim() || "Playlist";
    createVirtualPlaylist(title, paths);
    notify(`Created "${title}"`);
    close();
  };

  return (
    <MusicFloatingMenu
      open={open}
      x={at?.x ?? 0}
      y={at?.y ?? 0}
      placement={at?.placement}
      theme="library"
      onClose={close}
      ariaLabel="Save to playlist"
      measureKey={`${visible.length}:${naming != null}`}
    >
      <div className="flex items-center justify-between gap-2 px-1.5 pt-0.5">
        <span className="text-[13px] font-semibold text-stone-100">Save to playlist</span>
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-md p-1 text-stone-500 transition-colors hover:text-stone-200"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {canToggle ? (
        <label className="flex h-8 items-center gap-2 rounded-lg bg-white/[0.06] px-2 text-[12px] text-white/60 focus-within:bg-white/[0.09]">
          <Search size={MUSIC_MENU_ICON_SIZE} className="shrink-0" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a playlist"
            className="min-w-0 flex-1 border-0 bg-transparent text-white outline-none placeholder:text-white/35"
            aria-label="Find a playlist"
          />
        </label>
      ) : null}

      <MusicMenuSection label="Playlists" tone={tone}>
        {naming != null ? (
          <form
            className="flex h-8 items-center gap-2 rounded-lg bg-white/[0.06] px-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              create(naming);
            }}
          >
            <Plus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} className="shrink-0" style={{ color: ACCENT }} aria-hidden />
            <input
              autoFocus
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onBlur={() => {
                if (!naming.trim()) setNaming(null);
              }}
              placeholder="Playlist name"
              aria-label="New playlist name"
              className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-white outline-none placeholder:text-white/35"
            />
          </form>
        ) : (
          <MusicMenuRow
            tone={tone}
            label="New playlist"
            icon={<Plus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
            onClick={() => setNaming("")}
          />
        )}
        {canToggle
          ? visible.map((record) => (
              <PlaylistRow
                key={record.id}
                record={record}
                cover={covers.get(virtualPlaylistPath(record.id))}
                membership={membershipOf(record, paths)}
                onToggle={toggle}
              />
            ))
          : null}
        {canToggle && records.length > 0 && visible.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-white/40">No playlist matches</p>
        ) : null}
      </MusicMenuSection>
    </MusicFloatingMenu>
  );
}

function PlaylistRow({
  record,
  cover,
  membership,
  onToggle,
}: {
  record: VirtualPlaylistRecord;
  cover: string | undefined;
  membership: Membership;
  onToggle: (record: VirtualPlaylistRecord, membership: Membership) => void;
}) {
  const checked = membership !== "none";
  const Fallback = record.id === WATCH_LATER_ID ? Clock : ListVideo;

  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={membership === "all" ? true : membership === "some" ? "mixed" : false}
      onClick={() => onToggle(record, membership)}
      className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 px-1.5 text-left text-[12px] text-[#cfcfcf] outline-none transition-colors duration-100 hover:bg-white/[0.07] hover:text-white"
    >
      <span className="flex h-6 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-[color:var(--rf-field)]">
        {cover ? (
          <img src={localThumbSrc(cover)} alt="" className="h-full w-full object-cover" />
        ) : (
          <Fallback size={12} strokeWidth={1.75} className="text-stone-500" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <HoverMarqueeText text={record.title} slow />
      </span>
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-transparent" : "border-white/30",
        )}
        style={checked ? { background: ACCENT } : undefined}
        aria-hidden
      >
        {membership === "all" && <Check size={10} strokeWidth={3} className="text-stone-900" />}
        {membership === "some" && <Minus size={10} strokeWidth={3} className="text-stone-900" />}
      </span>
    </button>
  );
}
