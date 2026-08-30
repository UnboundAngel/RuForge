import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ensureLyrics,
  lookupLyrics,
  payloadFromSidecar,
  readLyrics,
  type LyricsLine,
  type LyricsPayload,
} from "@/lib/lyrics";
import { useLyricsActiveLine } from "./useLyricsActiveLine";

type LyricsVariant = "fullscreen" | "rail";

type Props = {
  mediaPath: string;
  audioEl: HTMLAudioElement | null;
  title: string;
  artist: string;
  onSeek?: (seconds: number) => void;
  onAvailabilityChange?: (available: boolean) => void;
  /** fullscreen = expanded player overlay; rail = Now Playing sidebar body */
  variant?: LyricsVariant;
};

function SyncedLyrics({
  lines,
  activeIndex,
  reduceMotion,
  onSeek,
  variant,
  railExpanded,
  onExpandRail,
}: {
  lines: LyricsLine[];
  activeIndex: number;
  reduceMotion: boolean;
  onSeek?: (seconds: number) => void;
  variant: LyricsVariant;
  railExpanded?: boolean;
  onExpandRail?: () => void;
}) {
  const rail = variant === "rail";
  const peek = rail && !railExpanded;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const userPinnedRef = useRef(false);
  const pinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = useMemo(() => {
    if (!peek) {
      return lines.map((line, i) => ({ line, i }));
    }
    const start = activeIndex >= 0 ? activeIndex : 0;
    const end = Math.min(lines.length, start + 3);
    const out: { line: LyricsLine; i: number }[] = [];
    for (let i = start; i < end; i++) out.push({ line: lines[i]!, i });
    return out;
  }, [peek, lines, activeIndex]);

  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, lines.length);
  }, [lines.length]);

  useLayoutEffect(() => {
    if (peek) return;
    if (userPinnedRef.current) return;
    const el = activeIndex >= 0 ? lineRefs.current[activeIndex] : lineRefs.current[0];
    if (!el || !scrollerRef.current) return;
    el.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeIndex, reduceMotion, peek]);

  const onUserScroll = useCallback(() => {
    userPinnedRef.current = true;
    if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
    pinTimerRef.current = setTimeout(() => {
      userPinnedRef.current = false;
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
    };
  }, []);

  const lineClass = rail
    ? "text-left text-[15px] font-semibold leading-snug tracking-tight transition-[color,opacity,transform] duration-200 ease-out border-0 bg-transparent p-0"
    : "text-left text-[clamp(1.35rem,2.6vw,2.15rem)] font-semibold leading-snug tracking-tight transition-[color,opacity,transform] duration-200 ease-out border-0 bg-transparent p-0";

  const body = (
    <div className={cn("flex flex-col", rail ? "gap-2.5 py-0.5" : "min-h-full flex-col justify-center px-8 py-[38vh] sm:px-12 md:px-16")}>
      <div className={cn("flex w-full flex-col", rail ? "gap-2.5" : "mx-auto max-w-2xl gap-5")}>
        {visible.map(({ line, i }) => {
          const active = i === activeIndex;
          const past = activeIndex >= 0 && i < activeIndex;
          return (
            <button
              key={`${line.time}-${i}`}
              type="button"
              ref={(node) => {
                lineRefs.current[i] = node;
              }}
              className={cn(
                lineClass,
                !peek && onSeek ? "cursor-pointer" : peek ? "cursor-pointer" : "cursor-default",
                active && "text-[var(--music-text-primary)] scale-[1.02] origin-left",
                !active && past && "text-[var(--music-text-muted)] opacity-55",
                !active && !past && "text-[var(--music-text-secondary)] opacity-70",
              )}
              tabIndex={-1}
              aria-current={active ? "true" : undefined}
              onClick={() => {
                if (peek) {
                  onExpandRail?.();
                  return;
                }
                onSeek?.(line.time);
              }}
            >
              {line.text}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (rail) {
    return (
      <div ref={scrollerRef}>
        {body}
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="rf-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden"
      onWheel={onUserScroll}
      onPointerDown={onUserScroll}
    >
      {body}
    </div>
  );
}

function PlainLyrics({
  text,
  variant,
  railExpanded,
  onExpandRail,
}: {
  text: string;
  variant: LyricsVariant;
  railExpanded?: boolean;
  onExpandRail?: () => void;
}) {
  if (variant === "rail") {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const peek = !railExpanded;
    const shown = peek ? lines.slice(0, 3) : lines;
    return (
      <button
        type="button"
        className="w-full border-0 bg-transparent p-0 text-left"
        onClick={() => {
          if (peek) onExpandRail?.();
        }}
      >
        <p
          className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "var(--music-text-muted)" }}
        >
          Lyrics · not synced
        </p>
        <div
          className="whitespace-pre-wrap text-[13px] font-medium leading-relaxed"
          style={{ color: "var(--music-text-secondary)" }}
        >
          {shown.join("\n")}
          {peek && lines.length > 3 ? "\n…" : ""}
        </div>
      </button>
    );
  }

  return (
    <div className="rf-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-2xl px-8 pb-16 pt-28 sm:px-12 md:px-16">
        <div
          className="whitespace-pre-wrap text-[clamp(1.05rem,1.8vw,1.35rem)] font-medium leading-relaxed"
          style={{ color: "var(--music-text-secondary)" }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

type LookupCtaPhase = "idle" | "looking" | "miss";

function EmptyLyrics({
  artist,
  title,
  mediaPath,
  refetching,
  onLookup,
  variant,
}: {
  artist: string;
  title: string;
  mediaPath: string;
  refetching: boolean;
  onLookup: (artist: string, title: string) => void;
  variant: LyricsVariant;
}) {
  const rail = variant === "rail";
  const [queryArtist, setQueryArtist] = useState(artist);
  const [queryTitle, setQueryTitle] = useState(title);
  const [ctaPhase, setCtaPhase] = useState<LookupCtaPhase>("idle");
  const wasRefetchingRef = useRef(false);
  const missTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQueryArtist(artist);
    setQueryTitle(title);
    setCtaPhase("idle");
    if (missTimerRef.current) {
      clearTimeout(missTimerRef.current);
      missTimerRef.current = null;
    }
  }, [artist, title, mediaPath]);

  useEffect(() => {
    if (refetching) {
      if (missTimerRef.current) {
        clearTimeout(missTimerRef.current);
        missTimerRef.current = null;
      }
      setCtaPhase("looking");
      wasRefetchingRef.current = true;
      return;
    }
    if (wasRefetchingRef.current) {
      wasRefetchingRef.current = false;
      setCtaPhase("miss");
      missTimerRef.current = setTimeout(() => {
        missTimerRef.current = null;
        setCtaPhase("idle");
      }, 3000);
    }
  }, [refetching]);

  useEffect(() => {
    return () => {
      if (missTimerRef.current) clearTimeout(missTimerRef.current);
    };
  }, []);

  const fieldsReady =
    queryArtist.trim().length > 0 && queryTitle.trim().length > 0;
  const canLookup = fieldsReady && ctaPhase === "idle" && !refetching;

  const ctaLabel =
    ctaPhase === "looking"
      ? "Looking up"
      : ctaPhase === "miss"
        ? "No lyrics found"
        : "Look up lyrics";

  return (
    <div
      className={cn(
        rail
          ? "flex w-full flex-col items-stretch gap-2 py-1"
          : "absolute inset-0 flex items-center justify-center px-8",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col gap-3",
          rail ? "items-stretch text-left" : "mx-auto max-w-md items-center text-center",
        )}
      >
        <p
          className={cn(
            "font-semibold tracking-tight",
            rail ? "text-[15px]" : "text-[clamp(1.15rem,2vw,1.5rem)]",
          )}
          style={{ color: "var(--music-text-secondary)" }}
        >
          No lyrics found
        </p>
        <p
          className={cn("leading-relaxed", rail ? "text-[12px]" : "mt-1 max-w-md text-[13px]")}
          style={{ color: "var(--music-text-muted)" }}
        >
          Most tracks won&apos;t have a match. Edit the fields if the title or artist is off, then
          look it up.
        </p>
        <div className={cn("flex w-full flex-col gap-2 text-left", !rail && "mt-3")}>
          <label className="flex flex-col gap-1">
            <span
              className="text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: "var(--music-text-muted)" }}
            >
              Artist
            </span>
            <input
              type="text"
              value={queryArtist}
              onChange={(e) => setQueryArtist(e.target.value)}
              disabled={refetching || ctaPhase === "looking"}
              className={cn(
                "w-full rounded-xl border outline-none transition-[border-color,background-color] disabled:opacity-50",
                rail ? "px-2.5 py-2 text-[12px]" : "px-3 py-2.5 text-[13px]",
              )}
              style={{
                color: "var(--music-text-primary)",
                background: "var(--music-surface-raised)",
                borderColor: "var(--music-border)",
              }}
              placeholder="Artist"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span
              className="text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: "var(--music-text-muted)" }}
            >
              Title
            </span>
            <input
              type="text"
              value={queryTitle}
              onChange={(e) => setQueryTitle(e.target.value)}
              disabled={refetching || ctaPhase === "looking"}
              className={cn(
                "w-full rounded-xl border outline-none transition-[border-color,background-color] disabled:opacity-50",
                rail ? "px-2.5 py-2 text-[12px]" : "px-3 py-2.5 text-[13px]",
              )}
              style={{
                color: "var(--music-text-primary)",
                background: "var(--music-surface-raised)",
                borderColor: "var(--music-border)",
              }}
              placeholder="Title"
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canLookup) {
                  e.preventDefault();
                  onLookup(queryArtist.trim(), queryTitle.trim());
                }
              }}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!canLookup}
          onClick={() => onLookup(queryArtist.trim(), queryTitle.trim())}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl text-[12px] font-semibold",
            "transition-[opacity,transform,filter] duration-200 ease-out",
            rail ? "mt-1 self-start px-3 py-2" : "mt-3 px-4 py-2.5",
            canLookup && "hover:brightness-110 hover:scale-[1.02] active:scale-[0.97]",
            !canLookup && "opacity-45 cursor-not-allowed",
          )}
          style={{
            color: "var(--music-accent)",
            background: "#000000",
            border: "2px solid var(--music-accent)",
          }}
        >
          <span>{ctaLabel}</span>
          {ctaPhase === "idle" ? (
            <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
          ) : null}
        </button>
      </div>
    </div>
  );
}

export function MusicLyricsView({
  mediaPath,
  audioEl,
  title,
  artist,
  onSeek,
  onAvailabilityChange,
  variant = "fullscreen",
}: Props) {
  const reduceMotion = useReducedMotion() ?? false;
  const rail = variant === "rail";
  const [payload, setPayload] = useState<LyricsPayload | null>(null);
  const [refetching, setRefetching] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const loadGenRef = useRef(0);
  const onAvailRef = useRef(onAvailabilityChange);
  onAvailRef.current = onAvailabilityChange;

  const applyPayload = useCallback((next: LyricsPayload) => {
    setPayload(next);
    onAvailRef.current?.(next.kind !== "empty");
  }, []);

  useEffect(() => {
    setPayload(null);
    setRailExpanded(false);
    const gen = ++loadGenRef.current;
    const path = mediaPath;
    void (async () => {
      const sidecar = await readLyrics(path);
      if (gen !== loadGenRef.current) return;
      applyPayload(payloadFromSidecar(sidecar));

      const result = await ensureLyrics(path, false);
      if (gen !== loadGenRef.current) return;
      applyPayload(payloadFromSidecar(result?.sidecar ?? null));
    })();
    return () => {
      loadGenRef.current += 1;
    };
  }, [mediaPath, applyPayload]);

  const syncedLines =
    payload?.kind === "synced" ? payload.lines : null;
  const activeIndex = useLyricsActiveLine(
    audioEl,
    syncedLines,
    payload?.kind === "synced",
  );

  const handleLookup = useCallback(
    async (lookupArtist: string, lookupTitle: string) => {
      if (refetching) return;
      setRefetching(true);
      const gen = ++loadGenRef.current;
      try {
        const result = await lookupLyrics(mediaPath, lookupArtist, lookupTitle);
        if (gen !== loadGenRef.current) return;
        applyPayload(payloadFromSidecar(result?.sidecar ?? null));
      } finally {
        if (gen === loadGenRef.current) setRefetching(false);
      }
    },
    [mediaPath, refetching, applyPayload],
  );

  const body =
    payload === null ? (
      <div className={cn(rail ? "py-4" : "absolute inset-0 flex items-center justify-center")}>
        <p className="text-[13px]" style={{ color: "var(--music-text-muted)" }}>
          Loading lyrics…
        </p>
      </div>
    ) : payload.kind === "synced" ? (
      <SyncedLyrics
        lines={payload.lines}
        activeIndex={activeIndex}
        reduceMotion={reduceMotion}
        onSeek={onSeek}
        variant={variant}
        railExpanded={railExpanded}
        onExpandRail={() => setRailExpanded(true)}
      />
    ) : payload.kind === "plain" ? (
      <PlainLyrics
        text={payload.text}
        variant={variant}
        railExpanded={railExpanded}
        onExpandRail={() => setRailExpanded(true)}
      />
    ) : (
      <EmptyLyrics
        title={title}
        artist={artist}
        mediaPath={mediaPath}
        refetching={refetching}
        onLookup={(a, t) => void handleLookup(a, t)}
        variant={variant}
      />
    );

  if (rail) {
    const canCollapse =
      railExpanded && payload != null && (payload.kind === "synced" || payload.kind === "plain");
    return (
      <div className="w-full">
        {body}
        {canCollapse ? (
          <button
            type="button"
            onClick={() => setRailExpanded(false)}
            className="mt-2 text-[11px] font-medium border-0 bg-transparent p-0 hover:underline"
            style={{ color: "var(--music-text-muted)" }}
          >
            Show less
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[2] overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0.72) 40%, rgb(0 0 0 / 0.82) 100%)",
        }}
      />
      <div className="absolute left-0 right-0 top-0 z-10 px-8 pt-8 sm:px-12 md:px-16">
        <div className="mx-auto w-full max-w-2xl">
          <p
            className="truncate text-sm font-semibold"
            style={{ color: "var(--music-text-primary)" }}
          >
            {title}
          </p>
          {artist ? (
            <p
              className="mt-0.5 truncate text-xs"
              style={{ color: "var(--music-text-secondary)" }}
            >
              {artist}
            </p>
          ) : null}
          {payload?.kind === "plain" ? (
            <p
              className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--music-text-muted)" }}
            >
              Lyrics · not synced
            </p>
          ) : null}
        </div>
      </div>
      {body}
    </div>
  );
}
