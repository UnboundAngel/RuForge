import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MediaFile } from "../types";
import type { RuforgeSettings } from "../store/types";
import { SB_DEMOTE_UNDO_WINDOW_SEC, SB_UNSKIP_PROMPT_MS } from "../sponsorBlockConstants";
import { startFastForward } from "./sponsorBlockFastForward";
import {
  activeSkipSegments,
  categoryLabel,
  effectiveCategoryMode,
  isSkipCategory,
  segmentDedupeKey,
  skipSeekTarget,
  type SponsorBlockSegment,
  type SponsorBlockSkipCategory,
} from "../sponsorBlock";

type EnsurePayload = {
  segments?: Array<Record<string, unknown>>;
  fromCache?: boolean;
};

function mapSegments(raw: Array<Record<string, unknown>> | undefined): SponsorBlockSegment[] {
  if (!raw?.length) return [];
  const out: SponsorBlockSegment[] = [];
  for (const row of raw) {
    const seg = row.segment;
    if (!Array.isArray(seg) || seg.length < 2) continue;
    const a = Number(seg[0]);
    const b = Number(seg[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const uuid = String(row.UUID ?? row.uuid ?? "");
    const category = String(row.category ?? "");
    const actionType = String(row.actionType ?? row.action_type ?? "skip")
      .trim()
      .toLowerCase();
    out.push({
      segment: [a, b],
      UUID: uuid,
      category,
      actionType,
      locked: typeof row.locked === "number" ? row.locked : undefined,
      votes: typeof row.votes === "number" ? row.votes : undefined,
      videoDuration:
        typeof row.videoDuration === "number"
          ? row.videoDuration
          : typeof row.video_duration === "number"
            ? row.video_duration
            : undefined,
      description:
        typeof row.description === "string" && row.description.trim()
          ? row.description
          : undefined,
    });
  }
  return out;
}

export type UseSponsorBlockPlaybackArgs = {
  file: MediaFile;
  currentTime: number;
  enabled: boolean;
  settings: RuforgeSettings;
  seekTo: (seconds: number) => void;
  onManualSkip: (category: SponsorBlockSkipCategory) => void;
  onAppearance: (category: SponsorBlockSkipCategory) => void;
  onDemoteUndo: (category: SponsorBlockSkipCategory) => void;
  /** Element to sprint through skips on; omit (or return null) to jump instead, e.g. audio-only or delegated audio. */
  getMediaElement?: () => HTMLMediaElement | null;
};

/** Shared so callers that depend on `segments` don't see a new array every render. */
const NO_SEGMENTS: SponsorBlockSegment[] = [];

export type SponsorBlockSkipPrompt = {
  kind: "skip" | "unskip";
  category: SponsorBlockSkipCategory;
  label: string;
};

type UnskipTarget = { start: number; end: number; category: SponsorBlockSkipCategory };

/** How far past the skipped segment the unskip prompt survives before a seek elsewhere drops it. */
const UNSKIP_TRAIL_SEC = 15;

export function useSponsorBlockPlayback({
  file,
  currentTime,
  enabled,
  settings,
  seekTo,
  onManualSkip,
  onAppearance,
  onDemoteUndo,
  getMediaElement,
}: UseSponsorBlockPlaybackArgs) {
  const getMediaElementRef = useRef(getMediaElement);
  getMediaElementRef.current = getMediaElement;
  const sprintCancelRef = useRef<(() => void) | null>(null);
  /** True while a skip plays through, so the skip button does not linger over its own animation. */
  const [sprinting, setSprinting] = useState(false);
  const cancelSprint = useCallback(() => {
    sprintCancelRef.current?.();
    sprintCancelRef.current = null;
    setSprinting(false);
  }, []);
  useEffect(() => cancelSprint, [cancelSprint]);
  const sprintTo = useCallback(
    (from: number, to: number, onLand?: () => void) => {
      cancelSprint();
      setSprinting(true);
      sprintCancelRef.current = startFastForward({
        el: getMediaElementRef.current?.() ?? null,
        from,
        to,
        seekTo,
        onLand: () => {
          sprintCancelRef.current = null;
          setSprinting(false);
          onLand?.();
        },
      });
    },
    [cancelSprint, seekTo],
  );
  const [segments, setSegments] = useState<SponsorBlockSegment[]>([]);
  /** Path segments were loaded for; null while loading / cleared on track change. */
  const segmentsPathRef = useRef<string | null>(null);
  const [segmentsPath, setSegmentsPath] = useState<string | null>(null);
  const seenAppearanceRef = useRef<Set<string>>(new Set());
  const autoSkippedRef = useRef<Set<string>>(new Set());
  const lastAutoSkipRef = useRef<{ end: number; at: number; category: SponsorBlockSkipCategory } | null>(
    null,
  );
  /** Bumped whenever `autoSkippedRef` grows so memos reading it recompute. */
  const [autoSkipTick, setAutoSkipTick] = useState(0);
  const [unskip, setUnskip] = useState<UnskipTarget | null>(null);

  useEffect(() => {
    cancelSprint();
    seenAppearanceRef.current.clear();
    autoSkippedRef.current.clear();
    lastAutoSkipRef.current = null;
    setUnskip(null);
    // Drop prior-track segments immediately so skip effects cannot seek using them.
    segmentsPathRef.current = null;
    setSegmentsPath(null);
    setSegments([]);

    if (!enabled || !file.sourceId?.trim()) {
      return;
    }
    const path = file.path;
    let cancelled = false;
    void invoke<EnsurePayload>("ensure_sponsorblock_segments", {
      mediaPath: path,
      force: false,
    })
      .then((r) => {
        if (cancelled) return;
        segmentsPathRef.current = path;
        setSegmentsPath(path);
        setSegments(mapSegments(r.segments));
      })
      .catch(() => {
        if (cancelled) return;
        segmentsPathRef.current = path;
        setSegmentsPath(path);
        setSegments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [file.path, file.sourceId, enabled, cancelSprint]);

  const segmentsForCurrentFile =
    enabled && segmentsPath === file.path && segmentsPathRef.current === file.path;

  const activeSkip = useMemo(
    () => (segmentsForCurrentFile ? activeSkipSegments(segments, currentTime) : []),
    [segments, currentTime, segmentsForCurrentFile],
  );

  const primarySkip = activeSkip[0] ?? null;

  useEffect(() => {
    if (!segmentsForCurrentFile || !primarySkip || !isSkipCategory(primarySkip.category)) return;
    const key = segmentDedupeKey(primarySkip);
    if (!key || seenAppearanceRef.current.has(key)) return;
    seenAppearanceRef.current.add(key);
    onAppearance(primarySkip.category);
  }, [segmentsForCurrentFile, primarySkip, onAppearance]);

  useEffect(() => {
    if (!segmentsForCurrentFile) return;
    const last = lastAutoSkipRef.current;
    if (!last) return;
    if (performance.now() - last.at > SB_DEMOTE_UNDO_WINDOW_SEC * 1000) return;
    if (currentTime < last.end - 1.5 && currentTime >= last.end - 8) {
      onDemoteUndo(last.category);
      lastAutoSkipRef.current = null;
    }
  }, [currentTime, segmentsForCurrentFile, onDemoteUndo]);

  useEffect(() => {
    if (!segmentsForCurrentFile) return;
    for (const s of activeSkip) {
      if (!isSkipCategory(s.category)) continue;
      const action = s.actionType.trim().toLowerCase();
      if (action !== "skip") continue;
      if (effectiveCategoryMode(settings, s.category) !== "auto") continue;
      const key = segmentDedupeKey(s);
      if (!key || autoSkippedRef.current.has(key)) continue;
      const end = s.segment[1];
      if (currentTime >= end - 0.25) continue;
      const category = s.category;
      autoSkippedRef.current.add(key);
      setAutoSkipTick((n) => n + 1);
      setUnskip({ start: s.segment[0], end, category });
      // Armed only once playback lands, or the ramp's own in-between positions would read as a rewind.
      const land = () => {
        lastAutoSkipRef.current = { end, at: performance.now(), category };
      };
      sprintTo(currentTime, end, land);
      return;
    }
  }, [currentTime, activeSkip, segmentsForCurrentFile, settings, sprintTo]);

  useEffect(() => {
    if (!unskip) return;
    const t = window.setTimeout(() => setUnskip(null), SB_UNSKIP_PROMPT_MS);
    return () => window.clearTimeout(t);
  }, [unskip]);

  const skipPrompt = useMemo((): SponsorBlockSkipPrompt | null => {
    if (!segmentsForCurrentFile) return null;
    // The seek to the segment end lands a tick later, so the segment itself still counts as "after the skip".
    if (unskip && currentTime >= unskip.start - 0.5 && currentTime <= unskip.end + UNSKIP_TRAIL_SEC) {
      return {
        kind: "unskip",
        category: unskip.category,
        label: `Unskip ${categoryLabel(unskip.category).toLowerCase()}`,
      };
    }
    if (sprinting) return null;
    // Auto categories fall back to a button once skipped, so rewinding into one never re-skips silently.
    const seg = activeSkip.find((s) => {
      if (!isSkipCategory(s.category)) return false;
      const mode = effectiveCategoryMode(settings, s.category);
      if (mode === "button") return true;
      return mode === "auto" && autoSkippedRef.current.has(segmentDedupeKey(s));
    });
    if (!seg || !isSkipCategory(seg.category)) return null;
    return {
      kind: "skip",
      category: seg.category,
      label: `Skip ${categoryLabel(seg.category).toLowerCase()}`,
    };
    // autoSkipTick stands in for the ref it guards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentsForCurrentFile, unskip, currentTime, activeSkip, settings, autoSkipTick, sprinting]);

  const handleSkipClick = useCallback(() => {
    if (!segmentsForCurrentFile) return;
    const target = skipSeekTarget(segments, currentTime);
    if (target == null) return;
    const active = activeSkipSegments(segments, currentTime);
    const cat = active[0]?.category;
    if (cat && isSkipCategory(cat)) onManualSkip(cat);
    sprintTo(currentTime, target);
  }, [segmentsForCurrentFile, segments, currentTime, sprintTo, onManualSkip]);

  const handleSkipPromptClick = useCallback(() => {
    if (skipPrompt?.kind !== "unskip" || !unskip) {
      handleSkipClick();
      return;
    }
    // Explicit undo; drop the rewind heuristic so the same act is not counted twice.
    cancelSprint();
    lastAutoSkipRef.current = null;
    setUnskip(null);
    onDemoteUndo(unskip.category);
    seekTo(unskip.start);
  }, [skipPrompt, unskip, handleSkipClick, onDemoteUndo, seekTo, cancelSprint]);

  const sbChapterLabel = useMemo(() => {
    if (!segmentsForCurrentFile) return null;
    for (const s of segments) {
      if (s.category !== "chapter" || s.actionType !== "chapter") continue;
      const [a, b] = s.segment;
      if (currentTime >= a && currentTime < b) return s.description?.trim() || null;
    }
    return null;
  }, [segments, currentTime, segmentsForCurrentFile]);

  const poiMarkers = useMemo(() => {
    if (!segmentsForCurrentFile) return [] as number[];
    return segments
      .filter((s) => s.category === "poi_highlight" && s.actionType === "poi")
      .map((s) => s.segment[0])
      .filter((t) => Number.isFinite(t) && t >= 0);
  }, [segments, segmentsForCurrentFile]);

  const chapterRanges = useMemo(() => {
    if (!segmentsForCurrentFile) return [] as { start: number; end: number }[];
    return segments
      .filter((s) => s.category === "chapter" && s.actionType === "chapter")
      .map((s) => ({ start: s.segment[0], end: s.segment[1] }))
      .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  }, [segments, segmentsForCurrentFile]);

  const scrubOverlay = useMemo(() => {
    if (!segmentsForCurrentFile) {
      return {
        skipRanges: [],
        chapterRanges: [],
        poiTimes: [],
      };
    }
    const skipRanges = segments
      .filter((s) => s.actionType === "skip")
      .map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category }))
      .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);

    const chapterRanges = segments
      .filter((s) => s.category === "chapter" && s.actionType === "chapter")
      .map((s) => ({
        start: s.segment[0],
        end: s.segment[1],
        description: s.description,
      }))
      .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);

    const poiTimes = segments
      .filter((s) => s.category === "poi_highlight" && s.actionType === "poi")
      .map((s) => ({ time: s.segment[0], description: s.description }))
      .filter((p) => Number.isFinite(p.time) && p.time >= 0);

    return { skipRanges, chapterRanges, poiTimes };
  }, [segments, segmentsForCurrentFile]);

  const refreshSegments = useCallback(() => {
    if (!file.sourceId?.trim()) return;
    const path = file.path;
    void invoke<EnsurePayload>("ensure_sponsorblock_segments", {
      mediaPath: path,
      force: true,
    })
      .then((r) => {
        segmentsPathRef.current = path;
        setSegmentsPath(path);
        setSegments(mapSegments(r.segments));
      })
      .catch(() => {});
  }, [file.path, file.sourceId]);

  return {
    segments: segmentsForCurrentFile ? segments : NO_SEGMENTS,
    segmentsPath,
    skipPrompt,
    handleSkipPromptClick,
    sbChapterLabel,
    poiMarkers,
    chapterRanges,
    refreshSegments,
    scrubOverlay,
  };
}
