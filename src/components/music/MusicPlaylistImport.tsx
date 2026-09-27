import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCopy, Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { IMPORT_PROMPT } from "@/playlistImport/importPrompt";
import { parseImport } from "@/playlistImport/parseImport";
import {
  closePlaylistImport,
  importMergeTarget,
  importRowSaveable,
  resetPlaylistImport,
  savePlaylistImport,
  startPlaylistImport,
  useImportSession,
} from "@/playlistImport/importSession";
import { SettingsModalShell } from "@/components/settings/SettingsModalShell";
import { useMusicPreviewBridge } from "./MusicPreviewButton";
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
  const { headerRef, scrolled, moreBelow } = useScrollShadow();

  const counts = useMemo(() => {
    let done = 0;
    let check = 0;
    let missing = 0;
    for (const r of rows) {
      if (r.state === "done" || r.state === "failed") done++;
      if (r.state === "done" && r.bucket === "check") check++;
      if ((r.state === "done" || r.state === "failed") && r.bucket === "missing") missing++;
    }
    return { done, check, missing };
  }, [rows]);

  const indexed = rows.map((row, index) => ({ row, index }));
  const libraryRows = filter === "all" ? indexed.filter(({ row }) => row.library) : [];
  const visible = indexed.filter(({ row, index }) => {
    if (row.library) return false;
    if (filter === "all" || pinned.has(index)) return true;
    return row.state !== "waiting" && row.state !== "searching" && row.bucket === filter;
  });
  const matching = counts.done < rows.length;

  return (
    <div data-music-mode="true" className="flex flex-col">
      <div
        ref={headerRef}
        className="sticky top-0 z-10 -mx-6 flex flex-col gap-3 bg-[#181818] px-6 pb-3 pt-1 transition-shadow duration-150"
        style={{ boxShadow: scrolled ? "0 8px 16px rgb(0 0 0 / 0.55)" : "none" }}
      >
        <input
          value={name}
          maxLength={100}
          onChange={(e) => useImportSession.setState({ name: e.target.value })}
          placeholder="Playlist name"
          aria-label="Playlist name"
          className={cn(FIELD, "h-10 font-semibold")}
        />
        {mergeTarget && (
          <p className="-mt-1 px-1 text-[12px] text-white/50">
            You already have a playlist called “{mergeTarget.title}”. Saving adds these songs to it and skips any it has.
            Rename this one to keep them apart.
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
        {notes.length || stopped ? (
          <div className="flex flex-col gap-1 text-[12px] text-white/50">
            {stopped ? <p className="text-[#ff5c7a]">{stopped}</p> : null}
            {notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        ) : null}
        {visible.length ? (
          <div className={cn(IMPORT_ROW_GRID, "px-2 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/40")}>
            <span />
            <span>From your list</span>
            <span>Match</span>
            <span />
          </div>
        ) : null}
      </div>

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
      <div
        aria-hidden
        className="pointer-events-none sticky bottom-0 -mx-6 -mb-4 h-10 shrink-0 transition-opacity duration-200"
        style={{
          opacity: moreBelow ? 1 : 0,
          background: "linear-gradient(0deg, #181818 0%, rgb(24 24 24 / 0) 100%)",
        }}
      />
    </div>
  );
}

/** Tracks the modal body's scroll so the sticky header lifts and the bottom fades only when there is more. */
function useScrollShadow() {
  const headerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ scrolled: false, moreBelow: false });

  useEffect(() => {
    const scroller = headerRef.current?.closest<HTMLElement>(".overflow-y-auto");
    if (!scroller) return;
    const measure = () => {
      const scrolled = scroller.scrollTop > 1;
      const moreBelow = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
      setState((p) => (p.scrolled === scrolled && p.moreBelow === moreBelow ? p : { scrolled, moreBelow }));
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
  const picked = rows.filter(importRowSaveable);
  const owned = picked.filter((r) => r.library).length;
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
