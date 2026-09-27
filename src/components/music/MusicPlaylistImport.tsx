import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ClipboardCopy, Library, Loader2, Pause, Play } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { IMPORT_PROMPT } from "@/playlistImport/importPrompt";
import { formatDuration } from "@/playlistImport/normalize";
import { parseImport } from "@/playlistImport/parseImport";
import {
  type ImportRow,
  chooseImportCandidate,
  closePlaylistImport,
  importMergeTarget,
  importRowSaveable,
  outsideTrackFor,
  resetPlaylistImport,
  savePlaylistImport,
  setImportRow,
  startPlaylistImport,
  useImportSession,
} from "@/playlistImport/importSession";
import { SettingsModalShell } from "@/components/settings/SettingsModalShell";
import { useMusicPreviewBridge, useSongPreview } from "./MusicPreviewButton";
import { type PreviewSource, toggleMusicPreview } from "./musicPreview";
import { showMusicToast } from "./musicToast";
import { useMusicLibraryTracks } from "./useMusicPlaylists";

const FIELD =
  "w-full rounded-xl border border-transparent bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-white/40 outline-none transition-colors hover:bg-white/[0.08] focus:border-white/[0.16] focus:bg-white/[0.1] caret-[#ff0033]";
const GHOST =
  "h-10 rounded-full px-5 text-sm font-bold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white";
const PRIMARY =
  "h-10 rounded-full bg-[#ff0033] px-6 text-sm font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

type Filter = "all" | "check" | "missing";

/** Same meaning everywhere in the list: green is safe to save, amber wants a look, grey found nothing. */
const DOT: Record<ImportRow["bucket"], { cls: string; label: string }> = {
  library: { cls: "bg-sky-400", label: "Already in your library" },
  matched: { cls: "bg-emerald-400", label: "Good match" },
  check: { cls: "bg-amber-400", label: "Check this match" },
  missing: { cls: "bg-white/25", label: "Not found" },
};

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
  const [filter, setFilter] = useState<Filter>("all");
  const [openAlt, setOpenAlt] = useState<number | null>(null);
  const mergeTarget = useMemo(() => importMergeTarget(name), [name]);

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

  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => filter === "all" || (row.state !== "waiting" && row.state !== "searching" && row.bucket === filter));
  const matching = counts.done < rows.length;

  return (
    <div data-music-mode="true" className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-col gap-3 bg-[#181818] pb-3 pt-1">
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
              onPicked={() => setOpenAlt(null)}
            />
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-[13px] text-white/50">
          {filter === "check" ? "nothing to double-check here, nice" : "everything turned up, nothing missing"}
        </p>
      )}
    </div>
  );
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

function ImportRowView({
  row,
  index,
  altOpen,
  onToggleAlt,
  onPicked,
}: {
  row: ImportRow;
  index: number;
  altOpen: boolean;
  onToggleAlt: () => void;
  onPicked: () => void;
}) {
  const settled = row.state === "done" || row.state === "failed";
  const canInclude = settled && (!!row.library || row.choice >= 0);
  const chosen = row.choice >= 0 ? row.candidates[row.choice] : undefined;
  const dot = DOT[row.bucket];

  return (
    <li className={cn("rounded-xl transition-colors", altOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]")}>
      <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-3 px-2 py-1.5">
        <IncludeToggle
          checked={row.include && canInclude}
          disabled={!canInclude}
          onChange={(v) => setImportRow(index, { include: v })}
          label={row.source.title}
        />
        <div className="min-w-0">
          <p className="truncate text-sm text-white">{row.source.title}</p>
          <p className="truncate text-[12px] text-white/50">
            {row.source.artists.join(", ")}
            {row.source.durationSec != null ? ` · ${formatDuration(row.source.durationSec)}` : ""}
            {row.source.unclear ? " · hard to read" : ""}
          </p>
        </div>

        {row.library ? (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-sky-300">
              <Library size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{row.library.canonicalTitle ?? row.library.name.replace(/\.[^.]+$/, "")}</p>
              <p className="truncate text-[12px] text-white/50">In your library, no download</p>
            </div>
            <ConfidenceDot cls={dot.cls} label={dot.label} />
          </div>
        ) : !settled ? (
          <div className="flex items-center gap-3 text-[12px] text-white/40">
            <span className="h-10 w-10 shrink-0 rounded-md bg-white/[0.04]" />
            {row.state === "searching" ? (
              <span className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" /> Searching
              </span>
            ) : (
              "Waiting"
            )}
          </div>
        ) : chosen ? (
          <div className="flex min-w-0 items-center gap-3">
            <CandidateThumb source={{ kind: "outside", track: outsideTrackFor(chosen) }} thumbnail={chosen.track.thumbnail} />
            <button
              type="button"
              onClick={onToggleAlt}
              aria-expanded={altOpen}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left"
              data-tooltip={row.candidates.length > 1 ? "Other results" : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{chosen.track.title}</p>
                <p className="truncate text-[12px] text-white/50">
                  {chosen.track.artist ?? "Unknown channel"}
                  {chosen.track.duration != null ? ` · ${formatDuration(chosen.track.duration)}` : ""}
                </p>
              </div>
              {row.candidates.length > 1 ? (
                <ChevronDown
                  size={16}
                  className={cn("shrink-0 text-white/50 transition-transform", altOpen && "rotate-180")}
                />
              ) : null}
            </button>
            <ConfidenceDot cls={dot.cls} label={dot.label} />
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[12px] text-white/50">
            <span className="h-10 w-10 shrink-0 rounded-md bg-white/[0.04]" />
            <span className="min-w-0 flex-1">{row.state === "failed" ? "Search failed" : "Nothing close turned up"}</span>
            <ConfidenceDot cls={dot.cls} label={dot.label} />
          </div>
        )}
      </div>

      {altOpen ? (
        <ul className="flex flex-col gap-0.5 px-2 pb-2 pl-[52px]" aria-label="Other results">
          {row.candidates.map((c, i) => (
            <li key={c.track.id}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5",
                  i === row.choice ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
                )}
              >
                <CandidateThumb source={{ kind: "outside", track: outsideTrackFor(c) }} thumbnail={c.track.thumbnail} small />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    chooseImportCandidate(index, i);
                    onPicked();
                  }}
                >
                  <p className={cn("truncate text-[13px]", i === row.choice ? "text-[#ff4d6a]" : "text-white")}>{c.track.title}</p>
                  <p className="truncate text-[12px] text-white/50">
                    {c.track.artist ?? "Unknown channel"}
                    {c.track.duration != null ? ` · ${formatDuration(c.track.duration)}` : ""}
                  </p>
                </button>
                {i === row.choice ? <Check size={15} className="shrink-0 text-[#ff4d6a]" /> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ConfidenceDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="rf-music-tooltip-anchor flex h-6 w-6 shrink-0 items-center justify-center" data-tooltip={label} aria-label={label} role="img">
      <span className={cn("h-2 w-2 rounded-full", cls)} />
    </span>
  );
}

function IncludeToggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Include ${label}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full transition-[background-color,transform] active:scale-90 disabled:opacity-30",
        checked ? "bg-[#ff0033] text-white" : "bg-white/[0.1] text-transparent hover:bg-white/[0.16]",
      )}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

/** Result art with a play button on hover that streams a short preview. */
function CandidateThumb({ source, thumbnail, small }: { source: PreviewSource; thumbnail: string | null; small?: boolean }) {
  const { status } = useSongPreview(source);
  const [broken, setBroken] = useState(false);
  const size = small ? "h-8 w-8" : "h-10 w-10";
  return (
    <button
      type="button"
      onClick={() => void toggleMusicPreview(source)}
      className={cn("group/thumb relative shrink-0 overflow-hidden rounded-md bg-white/[0.06]", size)}
      aria-label={status === "playing" ? "Pause preview" : "Preview"}
      data-tooltip={status === "playing" ? "Pause preview" : "Preview"}
    >
      {thumbnail && !broken ? (
        <img src={thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : null}
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-opacity",
          status ? "opacity-100" : "opacity-0 group-hover/thumb:opacity-100 focus-visible:opacity-100",
        )}
      >
        {status === "loading" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : status === "playing" ? (
          <Pause size={15} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-px" />
        )}
      </span>
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
      <span className="mr-auto text-[12px] text-white/50">
        {picked.length
          ? [downloads ? `${downloads} to download` : "", owned ? `${owned} already in your library` : ""]
              .filter(Boolean)
              .join(" · ")
          : "Tick the songs to save"}
      </span>
      <button type="button" onClick={resetPlaylistImport} className={GHOST}>
        Start over
      </button>
      <button type="button" onClick={save} disabled={!picked.length} className={PRIMARY}>
        Save {picked.length || ""} {picked.length === 1 ? "song" : "songs"}
      </button>
    </>
  );
}
