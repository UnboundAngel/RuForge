import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MediaFile } from "../types";
import type { RuforgeSettings } from "../store/types";
import { SB_DEMOTE_UNDO_WINDOW_SEC } from "../sponsorBlockConstants";
import {
  activeSkipSegments,
  effectiveCategoryMode,
  isSkipCategory,
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
    const actionType = String(row.actionType ?? row.action_type ?? "skip");
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
};

export function useSponsorBlockPlayback({
  file,
  currentTime,
  enabled,
  settings,
  seekTo,
  onManualSkip,
  onAppearance,
  onDemoteUndo,
}: UseSponsorBlockPlaybackArgs) {
  const [segments, setSegments] = useState<SponsorBlockSegment[]>([]);
  const seenAppearanceRef = useRef<Set<string>>(new Set());
  const autoSkippedRef = useRef<Set<string>>(new Set());
  const lastAutoSkipRef = useRef<{ end: number; at: number; category: SponsorBlockSkipCategory } | null>(
    null,
  );

  useEffect(() => {
    seenAppearanceRef.current.clear();
    autoSkippedRef.current.clear();
    lastAutoSkipRef.current = null;
    if (!enabled || !file.sourceId?.trim()) {
      setSegments([]);
      return;
    }
    let cancelled = false;
    void invoke<EnsurePayload>("ensure_sponsorblock_segments", {
      mediaPath: file.path,
      force: false,
    })
      .then((r) => {
        if (!cancelled) setSegments(mapSegments(r.segments));
      })
      .catch(() => {
        if (!cancelled) setSegments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [file.path, file.sourceId, enabled]);

  const activeSkip = useMemo(
    () => (enabled ? activeSkipSegments(segments, currentTime) : []),
    [segments, currentTime, enabled],
  );

  const primarySkip = activeSkip[0] ?? null;

  useEffect(() => {
    if (!enabled || !primarySkip || !isSkipCategory(primarySkip.category)) return;
    const key = primarySkip.UUID;
    if (!key || seenAppearanceRef.current.has(key)) return;
    seenAppearanceRef.current.add(key);
    onAppearance(primarySkip.category);
  }, [enabled, primarySkip, onAppearance]);

  useEffect(() => {
    if (!enabled) return;
    const last = lastAutoSkipRef.current;
    if (!last) return;
    if (performance.now() - last.at > SB_DEMOTE_UNDO_WINDOW_SEC * 1000) return;
    if (currentTime < last.end - 1.5 && currentTime >= last.end - 8) {
      onDemoteUndo(last.category);
      lastAutoSkipRef.current = null;
    }
  }, [currentTime, enabled, onDemoteUndo]);

  useEffect(() => {
    if (!enabled) return;
    for (const s of activeSkip) {
      if (!isSkipCategory(s.category) || s.actionType !== "skip") continue;
      if (effectiveCategoryMode(settings, s.category) !== "auto") continue;
      const key = s.UUID;
      if (!key || autoSkippedRef.current.has(key)) continue;
      const end = s.segment[1];
      if (currentTime >= end - 0.25) continue;
      autoSkippedRef.current.add(key);
      lastAutoSkipRef.current = {
        end,
        at: performance.now(),
        category: s.category,
      };
      seekTo(end);
      return;
    }
  }, [currentTime, activeSkip, enabled, settings, seekTo]);

  const activeButtonSkipSegment = useMemo(() => {
    if (!enabled || activeSkip.length === 0) return null;
    return activeSkip.find((s) => {
      return (
        isSkipCategory(s.category) &&
        s.actionType === "skip" &&
        effectiveCategoryMode(settings, s.category) === "button"
      );
    }) ?? null;
  }, [enabled, activeSkip, settings]);

  const handleSkipClick = useCallback(() => {
    const target = skipSeekTarget(segments, currentTime);
    if (target == null) return;
    const active = activeSkipSegments(segments, currentTime);
    const cat = active[0]?.category;
    if (cat && isSkipCategory(cat)) onManualSkip(cat);
    seekTo(target);
  }, [segments, currentTime, seekTo, onManualSkip]);

  const sbChapterLabel = useMemo(() => {
    if (!enabled) return null;
    for (const s of segments) {
      if (s.category !== "chapter" || s.actionType !== "chapter") continue;
      const [a, b] = s.segment;
      if (currentTime >= a && currentTime < b) return s.description?.trim() || null;
    }
    return null;
  }, [segments, currentTime, enabled]);

  const poiMarkers = useMemo(() => {
    if (!enabled) return [] as number[];
    return segments
      .filter((s) => s.category === "poi_highlight" && s.actionType === "poi")
      .map((s) => s.segment[0])
      .filter((t) => Number.isFinite(t) && t >= 0);
  }, [segments, enabled]);

  const chapterRanges = useMemo(() => {
    if (!enabled) return [] as { start: number; end: number }[];
    return segments
      .filter((s) => s.category === "chapter" && s.actionType === "chapter")
      .map((s) => ({ start: s.segment[0], end: s.segment[1] }))
      .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  }, [segments, enabled]);

  const showSkipButton = useMemo(() => {
    if (!enabled) return false;
    return activeButtonSkipSegment !== null;
  }, [enabled, activeButtonSkipSegment]);

  const activeSkipCategory = useMemo(() => {
    return activeButtonSkipSegment?.category as SponsorBlockSkipCategory | null;
  }, [activeButtonSkipSegment]);

  const skipButtonLabel = useMemo(() => {
    const cat = activeSkipCategory;
    if (!cat || !isSkipCategory(cat)) return "Skip";
    const labels: Record<SponsorBlockSkipCategory, string> = {
      sponsor: "Sponsor",
      selfpromo: "Self-promo",
      interaction: "Interaction",
      intro: "Intro",
      outro: "Outro",
      preview: "Preview",
      filler: "Filler",
    };
    return `Skip ${labels[cat]}`;
  }, [activeSkipCategory]);

  const scrubOverlay = useMemo(() => {
    if (!enabled) {
      return {
        skipRanges: [],
        chapterRanges: [],
        poiTimes: [],
      };
    }
    const skipRanges = segments
      .filter((s) => isSkipCategory(s.category) && s.actionType === "skip")
      .map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category }))
      .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);

    const chapterRanges = segments
      .filter((s) => s.category === "chapter" && s.actionType === "chapter")
      .map((s) => ({ start: s.segment[0], end: s.segment[1] }))
      .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);

    const poiTimes = segments
      .filter((s) => s.category === "poi_highlight" && s.actionType === "poi")
      .map((s) => ({ time: s.segment[0], description: s.description }))
      .filter((p) => Number.isFinite(p.time) && p.time >= 0);

    return { skipRanges, chapterRanges, poiTimes };
  }, [segments, enabled]);

  const refreshSegments = useCallback(() => {
    if (!file.sourceId?.trim()) return;
    void invoke<EnsurePayload>("ensure_sponsorblock_segments", {
      mediaPath: file.path,
      force: true,
    })
      .then((r) => setSegments(mapSegments(r.segments)))
      .catch(() => {});
  }, [file.path, file.sourceId]);

  return {
    segments,
    showSkipButton,
    skipButtonLabel,
    handleSkipClick,
    sbChapterLabel,
    poiMarkers,
    chapterRanges,
    refreshSegments,
    activeSkipCategory,
    scrubOverlay,
  };
}
