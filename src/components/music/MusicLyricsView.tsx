import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  ensureLyrics,
  payloadFromSidecar,
  readLyrics,
  type LyricsLine,
  type LyricsPayload,
} from "@/lib/lyrics";
import { useLyricsActiveLine } from "./useLyricsActiveLine";

type Props = {
  mediaPath: string;
  audioEl: HTMLAudioElement | null;
  title: string;
  artist: string;
  onSeek?: (seconds: number) => void;
  onAvailabilityChange?: (available: boolean) => void;
};

function SyncedLyrics({
  lines,
  activeIndex,
  reduceMotion,
  onSeek,
}: {
  lines: LyricsLine[];
  activeIndex: number;
  reduceMotion: boolean;
  onSeek?: (seconds: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const userPinnedRef = useRef(false);
  const pinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, lines.length);
  }, [lines.length]);

  useLayoutEffect(() => {
    if (userPinnedRef.current) return;
    const el = activeIndex >= 0 ? lineRefs.current[activeIndex] : lineRefs.current[0];
    if (!el || !scrollerRef.current) return;
    el.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeIndex, reduceMotion]);

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

  return (
    <div
      ref={scrollerRef}
      className="rf-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden"
      onWheel={onUserScroll}
      onPointerDown={onUserScroll}
    >
      <div className="flex min-h-full flex-col justify-center px-8 py-[38vh] sm:px-12 md:px-16">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {lines.map((line, i) => {
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
                  "text-left text-[clamp(1.35rem,2.6vw,2.15rem)] font-semibold leading-snug tracking-tight transition-[color,opacity,transform] duration-200 ease-out border-0 bg-transparent p-0",
                  onSeek ? "cursor-pointer" : "cursor-default",
                  active && "text-[var(--music-text-primary)] scale-[1.02] origin-left",
                  !active && past && "text-[var(--music-text-muted)] opacity-55",
                  !active && !past && "text-[var(--music-text-secondary)] opacity-70",
                )}
                tabIndex={-1}
                aria-current={active ? "true" : undefined}
                onClick={() => onSeek?.(line.time)}
              >
                {line.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlainLyrics({ text }: { text: string }) {
  return (
    <div className="rf-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-16 sm:px-12 md:px-16">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "var(--music-text-muted)" }}
        >
          Lyrics · not synced
        </p>
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

function EmptyLyrics({
  refetching,
  onRefetch,
}: {
  refetching: boolean;
  onRefetch: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-8">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
        <p
          className="text-[clamp(1.15rem,2vw,1.5rem)] font-semibold tracking-tight"
          style={{ color: "var(--music-text-primary)" }}
        >
          No lyrics for this one
        </p>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--music-text-muted)" }}
        >
          Most tracks won&apos;t have a match. You can try again if the sidecar is stale or the
          title cleaned up since last time.
        </p>
        <button
          type="button"
          disabled={refetching}
          onClick={onRefetch}
          className="mt-2 rounded-xl px-4 py-2 text-[12px] font-semibold transition-opacity disabled:opacity-45"
          style={{
            background: "var(--music-surface-raised)",
            color: "var(--music-text-primary)",
            border: "1px solid var(--music-border)",
          }}
        >
          {refetching ? "Looking up…" : "Look up lyrics"}
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
}: Props) {
  const reduceMotion = useReducedMotion() ?? false;
  const [payload, setPayload] = useState<LyricsPayload | null>(null);
  const [refetching, setRefetching] = useState(false);
  const loadGenRef = useRef(0);
  const onAvailRef = useRef(onAvailabilityChange);
  onAvailRef.current = onAvailabilityChange;

  const applyPayload = useCallback((next: LyricsPayload) => {
    setPayload(next);
    onAvailRef.current?.(next.kind !== "empty");
  }, []);

  useEffect(() => {
    setPayload(null);
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

  const handleRefetch = useCallback(async () => {
    if (refetching) return;
    setRefetching(true);
    const gen = ++loadGenRef.current;
    try {
      const result = await ensureLyrics(mediaPath, true);
      if (gen !== loadGenRef.current) return;
      applyPayload(payloadFromSidecar(result?.sidecar ?? null));
    } finally {
      if (gen === loadGenRef.current) setRefetching(false);
    }
  }, [mediaPath, refetching, applyPayload]);

  return (
    <div className="absolute inset-0 z-[2] overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0.72) 40%, rgb(0 0 0 / 0.82) 100%)",
        }}
      />
      <div className="absolute left-0 right-0 top-0 z-10 px-8 pt-8 sm:px-12">
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
        </div>
      </div>

      {payload === null ? (
        <div className="absolute inset-0 flex items-center justify-center">
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
        />
      ) : payload.kind === "plain" ? (
        <PlainLyrics text={payload.text} />
      ) : (
        <EmptyLyrics refetching={refetching} onRefetch={() => void handleRefetch()} />
      )}
    </div>
  );
}
