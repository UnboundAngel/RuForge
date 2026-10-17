import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import { MUSIC_MENU_ICON_SIZE, MUSIC_MENU_TONES, MusicMenuRow, MusicMenuSection } from "@/components/music/musicMenuUi";
import type { LibraryTag } from "@/lib/libraryTags";
import { cn } from "@/lib/utils";
import { TagGlyph } from "./TagChips";
import { useAllTags } from "./useVideoTags";

const tone = MUSIC_MENU_TONES.playlist;
const ACCENT = "var(--rf-menu-accent,var(--accent))";

/**
 * Search, pick, or make a tag in place. `checked` tags show a filled mark; the caller decides
 * whether a click toggles (a video's tags) or picks one (a rule's tag).
 */
export function TagPicker({
  checked,
  onPick,
  onCreate,
  autoFocus = false,
}: {
  checked: ReadonlySet<string>;
  onPick: (tag: LibraryTag) => void;
  onCreate: (name: string) => void;
  autoFocus?: boolean;
}) {
  const tags = useAllTags();
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => (q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags),
    [tags, q],
  );
  const games = visible.filter((t) => t.kind === "game");
  const plain = visible.filter((t) => t.kind === "plain");
  const exact = q ? tags.some((t) => t.name.trim().toLowerCase() === q) : true;

  const create = (name: string) => {
    if (!name.trim()) return;
    onCreate(name);
    setNaming(null);
    setQuery("");
  };

  return (
    <>
      <label className="flex h-8 items-center gap-2 rounded-lg bg-white/[0.06] px-2 text-[12px] text-white/60 focus-within:bg-white/[0.09]">
        <Search size={MUSIC_MENU_ICON_SIZE} className="shrink-0" aria-hidden />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q && !exact) create(query);
          }}
          placeholder="Find a tag"
          className="min-w-0 flex-1 border-0 bg-transparent text-white outline-none placeholder:text-white/35"
          aria-label="Find a tag"
        />
      </label>

      {games.length ? (
        <MusicMenuSection label="Game" tone={tone}>
          {games.map((tag) => (
            <TagPickRow key={tag.id} tag={tag} checked={checked.has(tag.id)} onPick={onPick} />
          ))}
        </MusicMenuSection>
      ) : null}

      <MusicMenuSection label="Tags" tone={tone}>
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
              placeholder="Tag name"
              aria-label="New tag name"
              className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-white outline-none placeholder:text-white/35"
            />
          </form>
        ) : (
          <MusicMenuRow
            tone={tone}
            label={q && !exact ? `New tag “${query.trim()}”` : "New tag…"}
            icon={<Plus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
            onClick={() => (q && !exact ? create(query) : setNaming(""))}
          />
        )}
        {plain.map((tag) => (
          <TagPickRow key={tag.id} tag={tag} checked={checked.has(tag.id)} onPick={onPick} />
        ))}
        {q && visible.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-white/40">No tag matches</p>
        ) : null}
      </MusicMenuSection>
    </>
  );
}

function TagPickRow({
  tag,
  checked,
  onPick,
}: {
  tag: LibraryTag;
  checked: boolean;
  onPick: (tag: LibraryTag) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={() => onPick(tag)}
      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border-0 px-1.5 text-left text-[12px] text-[#cfcfcf] outline-none transition-colors duration-100 hover:bg-white/[0.07] hover:text-white"
    >
      <TagGlyph tag={tag} size={13} />
      <span className="min-w-0 flex-1">
        <HoverMarqueeText text={tag.name} slow />
      </span>
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-transparent" : "border-white/30",
        )}
        style={checked ? { background: ACCENT } : undefined}
        aria-hidden
      >
        {checked ? <Check size={10} strokeWidth={3} className="text-stone-900" /> : null}
      </span>
    </button>
  );
}
