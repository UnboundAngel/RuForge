import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCopy, Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { IMPORT_PROMPT } from "@/playlistImport/importPrompt";
import { parseImport } from "@/playlistImport/parseImport";
import {
  closePlaylistImport,
  DEFAULT_IMPORT_NAME,
  importMergeTarget,
  importRowOwnedFile,
  importRowSaveable,
  libraryByVideoId,
  resetPlaylistImport,
  retryPlaylistImport,
  savePlaylistImport,
  startPlaylistImport,
  useImportSession,
} from "@/playlistImport/importSession";
import { SettingsModalShell } from "@/components/settings/SettingsModalShell";
import { useStuckHeader } from "@/hooks/useStuckHeader";
import { useMusicPreviewBridge } from "./MusicPreviewButton";
import { MusicPlaylistHeader, formatPlaylistLength } from "./MusicPlaylistHeader";
import { IMPORT_ROW_GRID, ImportLibraryGroup, ImportRowView } from "./MusicPlaylistImportRow";
import { showMusicToast } from "./musicToast";
import { useMusicLibraryTracks } from "./useMusicPlaylists";

const FIELD =
  "w-full rounded-xl border border-transparent bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-white/40 outline-none transition-colors hover:bg-white/[0.08] focus:border-white/[0.16] focus:bg-white/[0.1] caret-[#ff0033]";
const GHOST =
  "h-10 rounded-full px-5 text-sm font-bold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white";
const PRIMARY =
  "h-10 rounded-full bg-[#ff0033] px-6 text-sm font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

type Filter = "all" | "check" | "missing";

/** Music's playlist import: copy a prompt, paste the chatbot's JSON, review matches, save. Mounted once in the shell. */
export function MusicPlaylistImport() {
  const { open, phase } = useImportSession(useShallow((s) => ({ open: s.open, phase: s.phase })));
  return (
    <SettingsModalShell
      open={open}
      onClose={closePlaylistImport}
      titleId="rf-music-import-title"
      title={phase === "paste" ? "Import a playlist" : "Review matches"}
      eyebrow={null}
      theme="music"
      zIndexClass={OVERLAY_Z_CLASS.confirm}
      maxWidthClass={phase === "paste" ? "max-w-[560px]" : "max-w-[820px]"}
      bodyClassName={phase === "review" ? "pt-0 min-h-[min(540px,62vh)]" : undefined}
      footer={phase === "paste" ? <PasteFooter /> : <ReviewFooter />}
      footerClassName={phase === "review" ? "pb-4 pt-3" : undefined}
    >
      {phase === "paste" ? <PasteStep /> : <ReviewStep />}
    </SettingsModalShell>
  );
}

const PASTE_FORM = "rf-music-import-paste";

function PasteStep() {
  const { text, error } = useImportSession(useShallow((s) => ({ text: s.draft, error: s.draftError })));
  const library = useMusicLibraryTracks();
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => areaRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showMusicToast("Couldn't copy the prompt", "error");
    }
  };

  const submit = () => {
    if (!text.trim()) return;
    const r = parseImport(text);
    if (!r.ok) {
      useImportSession.setState({ draftError: r.error });
      return;
    }
    useImportSession.setState({ draftError: null });
    void startPlaylistImport(r.value, library);
  };

  return (
    <form
      id={PASTE_FORM}
      data-music-mode="true"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <ol className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-white/70">
        <li className="flex gap-3">
          <StepNumber n={1} />
          <span className="min-w-0 flex-1">
            Copy the prompt and send it to any chatbot (ChatGPT, Claude, Gemini) with screenshots of your playlist.
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber n={2} />
          <span className="min-w-0 flex-1">Paste the whole reply below. RuForge finds each song for you to check before anything downloads.</span>
        </li>
      </ol>
      <button
        type="button"
        onClick={() => void copy()}
        className="flex h-9 w-fit items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] font-bold text-white transition-[background-color,transform] hover:bg-white/[0.12] active:scale-[0.97]"
      >
        {copied ? <Check size={15} className="text-emerald-400" /> : <ClipboardCopy size={15} />}
        {copied ? "Copied" : "Copy prompt"}
      </button>
      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => useImportSession.setState({ draft: e.target.value, draftError: null })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
        spellCheck={false}
        placeholder="Paste the chatbot's reply"
        aria-label="Chatbot reply"
        className={cn(FIELD, "h-48 resize-none py-3 font-mono text-[12px] leading-relaxed rf-scrollbar")}
      />
      {error ? (
        <p role="alert" className="-mt-2 text-[13px] text-[#ff5c7a]">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 translate-y-px items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-bold text-white">
      {n}
    </span>
  );
}

function PasteFooter() {
  const empty = useImportSession((s) => !s.draft.trim());
  return (
    <>
      <button type="button" onClick={closePlaylistImport} className={GHOST}>
        Cancel
      </button>
      <button
        type="submit"
        form={PASTE_FORM}
        disabled={empty}
        className={PRIMARY}
      >
        Continue
      </button>
    </>
  );
}

function ReviewStep() {
  useMusicPreviewBridge();
  const { rows, name, notes, stopped } = useImportSession(
    useShallow((s) => ({ rows: s.rows, name: s.name, notes: s.notes, stopped: s.stopped })),
  );
  const [filter, setFilterState] = useState<Filter>("all");
  const [openAlt, setOpenAlt] = useState<number | null>(null);
  const mergeTarget = useMemo(() => importMergeTarget(name), [name]);
  // A row fixed from inside a filter stays in view until the filter changes, so it doesn't vanish mid-review.
  const [pinned, setPinned] = useState<Set<number>>(() => new Set());
  const setFilter = (f: Filter) => {
    setFilterState(f);
    setPinned(new Set());
    setOpenAlt(null);
  };
  const { headerRef, moreBelow } = useMoreBelow();

  const counts = useMemo(() => {
    let done = 0;
    let check = 0;
    let missing = 0;
    let failed = 0;
    for (const r of rows) {
      if (r.state === "done" || r.state === "failed") done++;
      if (r.state === "failed") failed++;
      if (r.state === "done" && r.bucket === "check") check++;
      if ((r.state === "done" || r.state === "failed") && r.bucket === "missing") missing++;
    }
    return { done, check, missing, failed };
  }, [rows]);

  const indexed = rows.map((row, index) => ({ row, index }));
  const libraryRows = filter === "all" ? indexed.filter(({ row }) => row.library) : [];
  const visible = indexed.filter(({ row, index }) => {
    if (row.library) return false;
    if (filter === "all" || pinned.has(index)) return true;
    return row.state !== "waiting" && row.state !== "searching" && row.bucket === filter;
  });
  const matching = counts.done < rows.length;

  const hero = useMemo(() => {
    let cover: string | null = null;
    let coverFile: MediaFile | null = null;
    let count = 0;
    let seconds = 0;
    for (const r of rows) {
      const chosen = r.choice >= 0 ? r.candidates[r.choice] : undefined;
      if (!cover && !coverFile) {
        if (r.library) coverFile = r.library;
        else if (chosen?.track.thumbnail) cover = chosen.track.thumbnail;
      }
      if (!importRowSaveable(r)) continue;
      count++;
      seconds += (r.library ? r.library.duration : chosen?.track.duration) || 0;
    }
    return { cover, coverFile, count, seconds };
  }, [rows]);

  return (
    <div data-music-mode="true" className="flex flex-col">
      <div className="-mx-6 [--music-surface:#181818] [mask-image:linear-gradient(to_bottom,transparent,black_24px)]">
        <MusicPlaylistHeader
          title={name.trim() || DEFAULT_IMPORT_NAME}
          tracks={[]}
          coverFile={hero.coverFile}
          coverSrc={hero.cover}
          meta={
            <>
              {hero.count} {hero.count === 1 ? "song" : "songs"}
              {hero.seconds > 0 && `, ${formatPlaylistLength(hero.seconds)}`}
            </>
          }
          startEditing={false}
          onRename={(next) => useImportSession.setState({ name: next })}
        />
      </div>
      <div ref={headerRef} className="flex flex-col gap-3 pb-3">
        {mergeTarget && (
          <p className="text-[12px] text-white/50">
            You already have a playlist called “{mergeTarget.title}”. Saving adds these songs to it and skips any it has.
            Click the title to rename this one and keep them apart.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All ${rows.length}`} />
          <FilterChip
            active={filter === "check"}
            onClick={() => setFilter("check")}
            label={`To check ${counts.check}`}
            disabled={!counts.check && filter !== "check"}
          />
          <FilterChip
            active={filter === "missing"}
            onClick={() => setFilter("missing")}
            label={`Not found ${counts.missing}`}
            disabled={!counts.missing && filter !== "missing"}
          />
          <span className="ml-auto flex items-center gap-2 text-[12px] text-white/50" aria-live="polite">
            {matching ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Finding songs {counts.done} of {rows.length}
              </>
            ) : (
              `Searched ${rows.length} ${rows.length === 1 ? "song" : "songs"}`
            )}
          </span>
        </div>
        {!matching && counts.failed > 0 ? (
          <div className="flex items-center gap-3 text-[12px]">
            <p className={cn("min-w-0 flex-1", stopped ? "text-[#ff5c7a]" : "text-white/50")}>
              {stopped ?? `${counts.failed} ${counts.failed === 1 ? "search" : "searches"} failed`}
            </p>
            <button
              type="button"
              onClick={retryPlaylistImport}
              className="h-7 shrink-0 rounded-full bg-white/[0.08] px-3 text-[12px] font-bold text-white transition-[background-color,transform] hover:bg-white/[0.12] active:scale-[0.97]"
            >
              Retry
            </button>
          </div>
        ) : null}
        {notes.length ? (
          <div className="flex flex-col gap-1 text-[12px] text-white/50">
            {notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        ) : null}
      </div>
      {visible.length ? <ImportColumnHeader /> : null}

      {visible.length ? (
        <ul className="flex flex-col gap-0.5">
          {visible.map(({ row, index }) => (
            <ImportRowView
              key={index}
              row={row}
              index={index}
              altOpen={openAlt === index}
              onToggleAlt={() => setOpenAlt(openAlt === index ? null : index)}
              onPicked={() => {
                setOpenAlt(null);
                if (filter !== "all") setPinned((prev) => new Set(prev).add(index));
              }}
            />
          ))}
        </ul>
      ) : filter !== "all" ? (
        <p className="py-10 text-center text-[13px] text-white/50">
          {filter === "check" ? "Nothing left to double-check." : "Everything turned up."}
        </p>
      ) : null}
      <ImportLibraryGroup items={libraryRows} />
      {/* Sticky insets stop at the body's padding, so the fade hangs below its zero-height anchor to reach the real edge. */}
      <div aria-hidden className="pointer-events-none sticky bottom-0 h-0">
        <div
          className="absolute -inset-x-6 -bottom-4 h-8 transition-opacity duration-200"
          style={{
            opacity: moreBelow ? 1 : 0,
            background: "linear-gradient(0deg, rgb(24 24 24 / 0.85) 0%, rgb(24 24 24 / 0) 100%)",
          }}
        />
      </div>
    </div>
  );
}

/** Same header as a playlist: sticks to the top and lifts onto a raised surface once rows scroll under it. */
function ImportColumnHeader() {
  const { sentinelRef, stuck } = useStuckHeader();
  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
      <div
        className={cn(
          "sticky top-0 z-10 -mx-6 mb-1 px-6 transition-colors duration-200",
          stuck ? "bg-[#212121]" : "bg-[#181818]",
        )}
      >
        <div
          className={cn(
            IMPORT_ROW_GRID,
            "h-9 border-b px-2 text-sm text-white/60 transition-colors duration-200",
            stuck ? "border-transparent" : "border-white/10",
          )}
        >
          <span />
          <span>Title</span>
          <span>Match</span>
        </div>
      </div>
    </>
  );
}

/** Tracks the modal body's scroll so the bottom fades only while there is more below. */
function useMoreBelow() {
  const headerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ moreBelow: false });

  useEffect(() => {
    const scroller = headerRef.current?.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) return;
    const measure = () => {
      const moreBelow = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
      setState((p) => (p.moreBelow === moreBelow ? p : { moreBelow }));
    };
    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

  return { headerRef, ...state };
}

function FilterChip({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,color,transform] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
        active ? "bg-white text-black" : "bg-white/[0.08] text-white hover:bg-white/[0.12]",
      )}
    >
      {label}
    </button>
  );
}

function ReviewFooter() {
  const rows = useImportSession((s) => s.rows);
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const entries = useRuforgeStore((s) => s.entries);
  const byId = useMemo(() => libraryByVideoId(), [entries]);
  const picked = rows.filter(importRowSaveable);
  const owned = picked.filter((r) => importRowOwnedFile(r, byId)).length;
  const downloads = picked.length - owned;

  const save = () => {
    const res = savePlaylistImport();
    if (!res) return;
    openMusicPlaylist(res.playlistId);
    const lead = res.merged
      ? res.alreadyIn
        ? `Added to your playlist, ${res.alreadyIn} already there.`
        : "Added to your playlist."
      : "Playlist created.";
    showMusicToast(
      res.queued
        ? `${lead} ${res.queued} ${res.queued === 1 ? "song joins" : "songs join"} it as ${res.queued === 1 ? "it downloads" : "they download"}.`
        : lead,
    );
  };

  return (
    <>
      <span className="mr-auto pl-1 text-[12px] text-white/50">
        {picked.length
          ? [downloads ? `${downloads} to download` : "", owned ? `${owned} already in your library` : ""]
              .filter(Boolean)
              .join(" · ")
          : "Tick the songs to save"}
      </span>
      <button type="button" onClick={resetPlaylistImport} className={cn(GHOST, "h-9 px-4 text-[13px]")}>
        Start over
      </button>
      <button type="button" onClick={save} disabled={!picked.length} className={cn(PRIMARY, "h-9 px-5 text-[13px]")}>
        Save {picked.length || ""} {picked.length === 1 ? "song" : "songs"}
      </button>
    </>
  );
}
