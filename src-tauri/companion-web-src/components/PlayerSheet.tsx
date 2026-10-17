import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type RefObject, type TouchEvent, type VideoHTMLAttributes } from "react";
import { AnimatePresence, animate, m, useMotionValue, useTransform, type AnimationPlaybackControls, type MotionStyle, type PanInfo } from "motion/react";
import { Art } from "./Cards";
import { PRESS_SPRING, SHEET_CLOSE_FRACTION, SHEET_CLOSE_VELOCITY, SHEET_DURATION, SHEET_TRANSITION, pageTransition, staggerDelay } from "../motion";
import { ScrubBar } from "./ScrubBar";
import { SpeedMenu } from "./SpeedMenu";
import { SaveButton } from "./SaveButton";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Lock, Maximize, Minimize, Play, PlayPauseMorphIcon, Repeat1, RfIcon, Settings, Unlock } from "./icons";
import { addedAgo } from "../library";
import { getClock, useClock } from "../playbackClock";
import { readSettings, writeSettings } from "../settings";
import { MarqueeText } from "./MarqueeText";
import { fmtDuration, type CompanionItem, type MediaMode, type SponsorSegment } from "../types";

type Props = {
  open: boolean;
  item: CompanionItem | null;
  kind: MediaMode;
  context: string;
  /** 1 when the track moved forward, -1 for previous; sets the art slide direction. */
  direction: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Mini player card the sheet grows out of and collapses into. */
  originRef: RefObject<HTMLDivElement | null>;
  videoProps: VideoHTMLAttributes<HTMLVideoElement>;
  paused: boolean;
  duration: number;
  loop: boolean;
  shuffle: boolean;
  speed: number;
  speeds: readonly number[];
  sbEnabled: boolean;
  sbSegments: SponsorSegment[];
  spriteCount: number;
  activeSbSegment: SponsorSegment | null;
  hasPrev: boolean;
  hasNext: boolean;
  upNext: CompanionItem[];
  error: string | null;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onLoop: (on: boolean) => void;
  onShuffle: (on: boolean) => void;
  onSpeed: (s: number) => void;
  onSbEnabled: (on: boolean) => void;
  onSkipSegment: () => void;
  onOpenQueue: () => void;
  onPlayQueued: (item: CompanionItem) => void;
};

const SWAP_ENTER = { opacity: 0, rotate: -20, scale: 0.8 };
const SWAP_REST = { opacity: 1, rotate: 0, scale: 1 };
const SWAP_EXIT = { opacity: 0, rotate: 20, scale: 0.8 };
const CHROME_HIDE_MS = 3000;
const FULL_CLIP = "inset(0px 0px 0px 0px round 0px)";
const CARD_RADIUS = 12;

const DOUBLE_TAP_MS = 300;
/** Taps on the same side inside this window keep adding to the running skip total. */
const FS_SWIPE_PX = 70;
const LAYOUT_SETTLE_MS = 450;
const SEEK_CHAIN_MS = 700;
const AUTOPLAY_LABEL_MS = 1600;
const LOCK_HINT_MS = 2500;
const SEEK_STEP = 10;

type SettingsPage = "main" | "speed";
type SeekRipple = { side: number; total: number; pulse: number };
const MINI_THUMB_H = 40;
const MINI_PAD = 8;

type UpNextFilter = "all" | "artist" | "short" | "long";
const SHORT_SECS = 300;

const stop = (e: MouseEvent) => e.stopPropagation();
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type CardBox = { top: number; right: number; bottom: number; left: number };
/** Where the picture lands inside the mini card, relative to its resting spot. */
type ThumbTarget = { x: number; y: number; scale: number };

/** Insets that clip the sheet down to the card. */
function toCardBox(card: DOMRect, sheet: HTMLElement): CardBox {
  return {
    top: card.top,
    right: sheet.offsetWidth - card.right,
    bottom: sheet.offsetHeight - card.bottom,
    left: card.left,
  };
}

function ClockText() {
  return <>{fmtDuration(useClock())}</>;
}

export function PlayerSheet(props: Props) {
  const {
    open, item, kind, context, direction, videoRef, originRef, videoProps, paused, duration, loop, shuffle, speed,
    speeds, sbEnabled, sbSegments, spriteCount, activeSbSegment, hasPrev, hasNext, upNext, error,
    onClose, onTogglePlay, onPrev, onNext, onSeek, onLoop, onShuffle, onSpeed, onSbEnabled,
    onSkipSegment, onOpenQueue, onPlayQueued,
  } = props;
  const sheetRef = useRef<HTMLDivElement>(null);
  const video = kind === "video";
  // Rounded only while the sheet travels; at rest it is the screen.
  const [settled, setSettled] = useState(true);
  const [chrome, setChrome] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  // 0 = full screen, 1 = collapsed into the mini player card. Drag, open and close all move this one value.
  const progress = useMotionValue(open ? 0 : 1);
  // Only used when there is no mini card to collapse into.
  const y = useMotionValue(0);
  const cardBox = useRef<CardBox | null>(null);
  const slide = useTransform(progress, (v) => (cardBox.current ? cardBox.current.top * v : 0));
  const clip = useTransform(progress, (v) => {
    const b = cardBox.current;
    if (!b || !video) return FULL_CLIP;
    return `inset(${b.top * v}px ${b.right * v}px ${b.bottom * v}px ${b.left * v}px round ${CARD_RADIUS * v}px)`;
  });
  const fade = useMotionValue(open ? 1 : 0);
  // The mini bar's own parts ride inside the sheet and arrive as it shrinks, so nothing pops in at the end.
  const ghostBox = { top: useMotionValue(0), left: useMotionValue(0), width: useMotionValue(0), height: useMotionValue(0) };
  const ghostBg = useTransform(progress, (v) => clamp01((v - 0.15) / 0.6));
  const ghostArt = useTransform(progress, (v) => clamp01((v - 0.5) / 0.4));
  const ghostText = useTransform(progress, (v) => clamp01((v - 0.45) / 0.45));
  const mounted = useRef(false);
  const grabbed = useRef(false);
  const panning = useRef(false);
  const settle = useRef<AnimationPlaybackControls | null>(null);

  const [fullscreen, setFullscreen] = useState(false);
  const [autoplay, setAutoplay] = useState(() => readSettings().autoplay);
  const [autoplayLabel, setAutoplayLabel] = useState(false);
  const [menu, setMenu] = useState<SettingsPage | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockHint, setLockHint] = useState(false);
  const mediaBoxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const thumb = useRef<ThumbTarget | null>(null);
  const stageX = useTransform(progress, (v) => (thumb.current ? thumb.current.x * v : 0));
  const stageY = useTransform(progress, (v) => (thumb.current ? thumb.current.y * v : 0));
  const stageScale = useTransform(progress, (v) => (thumb.current ? 1 + (thumb.current.scale - 1) * v : 1));
  const [filter, setFilter] = useState<UpNextFilter>("all");
  const lastTap = useRef<{ t: number; side: number } | null>(null);
  const tapTimer = useRef<number | undefined>(undefined);
  const suppressTap = useRef(0);
  const [ripple, setRipple] = useState<SeekRipple | null>(null);
  const chain = useRef<{ side: number; total: number; at: number } | null>(null);
  const rippleTimer = useRef<number | undefined>(undefined);
  const labelTimer = useRef<number | undefined>(undefined);
  const lockTimer = useRef<number | undefined>(undefined);

  const measureCard = useCallback(() => {
    const sheet = sheetRef.current;
    if (!video && sheet) {
      // Music slides down whole, like Spotify; progress is the fraction of the screen travelled.
      cardBox.current = { top: sheet.offsetHeight, right: 0, bottom: 0, left: 0 };
      thumb.current = null;
      return cardBox.current;
    }
    const card = originRef.current?.getBoundingClientRect();
    cardBox.current =sheet && card && card.width > 0 ? toCardBox(card, sheet) : null;
    if (card) {
      ghostBox.top.set(card.top);
      ghostBox.left.set(card.left);
      ghostBox.width.set(card.width);
      ghostBox.height.set(card.height);
    }
    const stage = stageRef.current?.getBoundingClientRect();
    if (cardBox.current && card && stage && stage.width > 0) {
      const w = (MINI_THUMB_H * 16) / 9;
      thumb.current = {
        x: card.left + MINI_PAD - stage.left,
        y: card.top + (card.height - MINI_THUMB_H) / 2 - stage.top,
        scale: w / stage.width,
      };
    } else {
      thumb.current = null;
    }
    return cardBox.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originRef, video]);

  // The page scrim and the tab bar follow the sheet from outside this component.
  useEffect(() => {
    const root = document.documentElement;
    const publish = (v: number) => root.style.setProperty("--sheet-p", String(v));
    publish(progress.get());
    const off = progress.on("change", publish);
    return () => {
      off();
      root.style.removeProperty("--sheet-p");
    };
  }, [progress]);
  useEffect(() => {
    const root = document.documentElement;
    if (video) root.removeAttribute("data-sheet-rigid");
    else root.setAttribute("data-sheet-rigid", "");
    return () => root.removeAttribute("data-sheet-rigid");
  }, [video]);

  useEffect(() => () => {
    window.clearTimeout(tapTimer.current);
    window.clearTimeout(rippleTimer.current);
    window.clearTimeout(labelTimer.current);
    window.clearTimeout(lockTimer.current);
  }, []);
  useEffect(() => setFilter("all"), [item?.id]);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (!mounted.current) {
      mounted.current = true;
      if (!open) return;
    }
    const box = measureCard();
    setSettled(false);
    settle.current?.stop();
    let runs: AnimationPlaybackControls[];
    if (open) {
      fade.set(1);
      if (box) {
        progress.set(1);
        runs = [animate(progress, 0, SHEET_TRANSITION)];
      } else {
        progress.set(0);
        y.set(sheet.offsetHeight);
        runs = [animate(y, 0, SHEET_TRANSITION)];
      }
    } else if (box) {
      runs = [animate(progress, 1, SHEET_TRANSITION), animate(fade, 0, { duration: 0.1, delay: SHEET_DURATION - 0.1 })];
    } else {
      runs = [animate(y, sheet.offsetHeight, SHEET_TRANSITION), animate(fade, 0, { duration: 0.01, delay: SHEET_DURATION })];
    }
    let live = true;
    void Promise.all(runs).then(() => {
      if (live) setSettled(true);
    });
    return () => {
      live = false;
      for (const r of runs) r.stop();
    };
  }, [open, fade, measureCard, progress, y]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!video || !chrome || paused || scrubbing || menu) return;
    const id = window.setTimeout(() => setChrome(false), CHROME_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [video, chrome, paused, scrubbing, menu]);

  useEffect(() => {
    if (open) setChrome(true);
  }, [open, item?.id]);

  const onGrabDown = (e: PointerEvent<HTMLDivElement>) => {
    const t = e.target as Element;
    grabbed.current = !fullscreen && !t.closest("button, [role='slider'], .ph-watch, .ph-speed") && (video || !t.closest("video"));
  };
  const onPanStart = (_: unknown, info: PanInfo) => {
    const box = grabbed.current && Math.abs(info.delta.y) > Math.abs(info.delta.x) ? measureCard() : null;
    panning.current = box !== null;
    if (!panning.current) return;
    settle.current?.stop();
    setSettled(false);
  };
  const onPan = (_: unknown, info: PanInfo) => {
    const box = cardBox.current;
    if (!panning.current || !box) return;
    // The sheet's top edge follows the finger until it reaches the card's top.
    progress.set(Math.min(1, Math.max(0, info.offset.y / Math.max(1, box.top))));
  };
  const onPanEnd = (_: unknown, info: PanInfo) => {
    if (!panning.current) return;
    panning.current = false;
    const v = progress.get();
    if (v > SHEET_CLOSE_FRACTION || info.velocity.y > SHEET_CLOSE_VELOCITY) {
      onClose();
      return;
    }
    settle.current = animate(progress, 0, {
      ...SHEET_TRANSITION,
      velocity: -info.velocity.y / Math.max(1, cardBox.current?.top ?? 1),
      onComplete: () => setSettled(true),
    });
  };

  const seekBy = (side: number) => {
    const now = performance.now();
    const from = videoRef.current?.currentTime ?? getClock();
    onSeek(Math.max(0, Math.min(duration || Infinity, from + side * SEEK_STEP)));
    const run = chain.current && chain.current.side === side && now - chain.current.at < SEEK_CHAIN_MS ? chain.current : null;
    const total = (run?.total ?? 0) + SEEK_STEP;
    chain.current = { side, total, at: now };
    setRipple((r) => ({ side, total, pulse: (r?.side === side ? r.pulse : 0) + 1 }));
    window.clearTimeout(rippleTimer.current);
    rippleTimer.current = window.setTimeout(() => {
      chain.current = null;
      setRipple(null);
    }, SEEK_CHAIN_MS);
  };

  const onPictureTap = (e: MouseEvent<HTMLDivElement>) => {
    if (locked) {
      setLockHint(true);
      window.clearTimeout(lockTimer.current);
      lockTimer.current = window.setTimeout(() => setLockHint(false), LOCK_HINT_MS);
      return;
    }
    if (menu || performance.now() - suppressTap.current < 400) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const side = rel < 0.35 ? -1 : rel > 0.65 ? 1 : 0;
    const now = performance.now();
    const prev = lastTap.current;
    window.clearTimeout(tapTimer.current);
    lastTap.current = { t: now, side };
    const chaining = side !== 0 && chain.current?.side === side && now - chain.current.at < SEEK_CHAIN_MS;
    if (chaining || (side !== 0 && prev && prev.side === side && now - prev.t < DOUBLE_TAP_MS)) {
      seekBy(side);
      return;
    }
    tapTimer.current = window.setTimeout(() => setChrome((c) => !c), side === 0 ? 0 : DOUBLE_TAP_MS - 60);
  };

  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onFsTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    swipe.current = fullscreen && t && e.touches.length === 1 && !(e.target as Element).closest("[role='slider']") ? { x: t.clientX, y: t.clientY } : null;
  };
  const onFsTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const from = swipe.current;
    swipe.current = null;
    const t = e.changedTouches[0];
    if (!from || !t || locked) return;
    const dy = t.clientY - from.y;
    if (dy > FS_SWIPE_PX && Math.abs(t.clientX - from.x) < dy * 0.6) {
      suppressTap.current = performance.now();
      setFullscreen(false);
    }
  };

  // Rotating reflows the controls under a resting finger; taps right after are ghosts.
  const settleAt = useRef(0);
  useEffect(() => {
    const bump = () => { settleAt.current = performance.now(); };
    window.addEventListener("resize", bump);
    window.addEventListener("orientationchange", bump);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("orientationchange", bump);
    };
  }, []);
  const steady = () => performance.now() - settleAt.current > LAYOUT_SETTLE_MS;

  const toggleAutoplay = () => {
    const next = !autoplay;
    setAutoplay(next);
    writeSettings({ ...readSettings(), autoplay: next });
    setAutoplayLabel(true);
    window.clearTimeout(labelTimer.current);
    labelTimer.current = window.setTimeout(() => setAutoplayLabel(false), AUTOPLAY_LABEL_MS);
  };

  const lockScreen = () => {
    setMenu(null);
    setLocked(true);
    setChrome(false);
  };
  const unlockScreen = () => {
    setLocked(false);
    setLockHint(false);
    setChrome(true);
  };

  // The picture fills the viewport in whatever orientation the phone is held; it never turns itself.
  // Browsers that allow it also hide their own bars.
  const toggleFullscreen = () => {
    const next = !fullscreen;
    setFullscreen(next);
    if (!next) return;
    setChrome(true);
    void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [fullscreen]);

  useEffect(() => {
    if (open) return;
    setFullscreen(false);
    setMenu(null);
    setLocked(false);
  }, [open]);

  const onScrubbing = useCallback((active: boolean) => {
    setScrubbing(active);
    if (active) setChrome(true);
  }, []);

  const meta = item ? [item.artist, addedAgo(item.addedAt ?? undefined)].filter(Boolean).join(" · ") : "";

  const filters = useMemo(() => {
    const out: { id: UpNextFilter; label: string }[] = [{ id: "all", label: "All" }];
    if (item?.artist && upNext.some((n) => n.artist === item.artist)) out.push({ id: "artist", label: `From ${item.artist}` });
    if (upNext.some((n) => (n.durationSecs ?? 0) > 0 && (n.durationSecs ?? 0) < SHORT_SECS)) out.push({ id: "short", label: "Under 5 min" });
    if (upNext.some((n) => (n.durationSecs ?? 0) >= SHORT_SECS)) out.push({ id: "long", label: "Longer" });
    return out;
  }, [item, upNext]);
  const shownNext = useMemo(() => {
    if (filter === "artist") return upNext.filter((n) => n.artist === item?.artist);
    if (filter === "short") return upNext.filter((n) => (n.durationSecs ?? 0) > 0 && (n.durationSecs ?? 0) < SHORT_SECS);
    if (filter === "long") return upNext.filter((n) => (n.durationSecs ?? 0) >= SHORT_SECS);
    return upNext;
  }, [filter, upNext, item]);

  return (
    <m.div
      ref={sheetRef}
      className={fullscreen ? "ph-player ph-player--fs" : "ph-player"}
      data-mode={video ? "videos" : "music"}
      data-layout={video ? "watch" : "listen"}
      data-settled={settled && open ? "" : undefined}
      data-hidden={settled && !open ? "" : undefined}
      style={{ y: video ? y : slide, clipPath: clip, opacity: fade, "--p": progress } as MotionStyle}
      onPanStart={onPanStart}
      onPan={onPan}
      onPanEnd={onPanEnd}
      aria-hidden={!open}
      role="dialog"
      aria-label={video ? "Now watching" : "Now playing"}
      onPointerDown={onGrabDown}
    >
      <span className="ph-grabber" aria-hidden />
      {video ? null : (
        <div className="ph-player-top">
          <button type="button" className="ph-icon-btn" onClick={onClose} aria-label="Close player">
            <ChevronDown size={28} strokeWidth={2.25} />
          </button>
          <div className="ph-player-context">
            <span className="ph-player-context-name">{context}</span>
          </div>
          <span className="ph-icon-btn" aria-hidden />
        </div>
      )}

      {item && video ? (
        <m.div className="ph-mini ph-mini--ghost" style={{ ...ghostBox, position: "absolute" }} aria-hidden>
          <m.span className="ph-mini-ghost-bg" style={{ opacity: ghostBg }} />
          <span className="ph-mini-open">
            <span className="ph-mini-now">
              {video ? (
                <span className="ph-mini-art ph-mini-art--video ph-mini-ghost-hole" />
              ) : (
                <m.span className="ph-mini-ghost-art" style={{ opacity: ghostArt }}>
                  <Art item={item} className="ph-mini-art" iconSize={18} />
                </m.span>
              )}
              <m.span className="ph-mini-text" style={{ opacity: ghostText }}>
                <span className="ph-mini-title">{item.title}</span>
                {item.artist ? <span className="ph-mini-artist">{item.artist}</span> : null}
              </m.span>
            </span>
          </span>
          <m.span className="ph-icon-btn ph-mini-play" style={{ opacity: ghostText }}>
            <PlayPauseMorphIcon playing={!paused} size={24} />
          </m.span>
        </m.div>
      ) : null}

      <m.div
        ref={stageRef}
        className="ph-player-stage"
        style={video ? { x: stageX, y: stageY, scale: stageScale, transformOrigin: "0 0" } : undefined}
      >
        <div
          ref={mediaBoxRef}
          className={`ph-player-media${video ? " ph-player-media--video" : ""}${fullscreen ? " ph-fs" : ""}`}
          onClick={video ? onPictureTap : undefined}
          onTouchStart={video ? onFsTouchStart : undefined}
          onTouchEnd={video ? onFsTouchEnd : undefined}
        >
          <video ref={videoRef} className="ph-player-video" playsInline preload="metadata" {...videoProps} />
          {video ? (
            <div className={`ph-vchrome${chrome && !locked ? " ph-vchrome--on" : ""}${scrubbing ? " ph-vchrome--scrub" : ""}`} aria-hidden={!chrome || locked}>
              <div className="ph-vchrome-top">
                {fullscreen ? (
                  <div className="ph-vchrome-heading">
                    <span className="ph-vchrome-title">{item?.title ?? ""}</span>
                    {item?.artist ? <span className="ph-vchrome-sub">{item.artist}</span> : null}
                  </div>
                ) : (
                  <button type="button" className="ph-vchrome-btn" onClick={(e) => { stop(e); onClose(); }} aria-label="Close player">
                    <ChevronDown size={26} strokeWidth={2.25} />
                  </button>
                )}
                <div className="ph-vchrome-tools">
                  <button
                    type="button"
                    className="ph-vchrome-btn ph-autoplay-hit"
                    onClick={(e) => { stop(e); toggleAutoplay(); }}
                    role="switch"
                    aria-checked={autoplay}
                    aria-label="Autoplay"
                  >
                    <span className={`ph-autoplay${autoplay ? " ph-autoplay--on" : ""}`}>
                      <span className="ph-autoplay-knob">
                        {autoplay ? <Play size={11} fill="currentColor" strokeWidth={0} /> : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2.5" y="1.5" width="2.5" height="9" rx="0.6" fill="currentColor" /><rect x="7" y="1.5" width="2.5" height="9" rx="0.6" fill="currentColor" /></svg>}
                      </span>
                    </span>
                  </button>
                  <button type="button" className="ph-vchrome-btn" onClick={(e) => { stop(e); onOpenQueue(); }} aria-label="Queue">
                    <RfIcon name="queue" size={22} />
                  </button>
                  <button type="button" className="ph-vchrome-btn" onClick={(e) => { stop(e); setMenu("main"); }} aria-label="Settings" aria-haspopup="dialog">
                    <Settings size={21} strokeWidth={2} />
                  </button>
                </div>
              </div>
              <span className={`ph-autoplay-label${autoplayLabel && !menu ? " ph-autoplay-label--on" : ""}`} aria-live="polite">
                {autoplayLabel ? `Autoplay is ${autoplay ? "on" : "off"}` : ""}
              </span>
              <div className="ph-vchrome-mid">
                <button type="button" className="ph-vchrome-btn ph-vchrome-skip" onClick={(e) => { stop(e); if (steady()) onPrev(); }} disabled={!hasPrev} aria-label="Previous">
                  <RfIcon name="prev" size={26} />
                </button>
                <button type="button" className="ph-vchrome-btn ph-vchrome-play" onClick={(e) => { stop(e); onTogglePlay(); }} aria-label={paused ? "Play" : "Pause"}>
                  <PlayPauseMorphIcon playing={!paused} size={30} />
                </button>
                <button type="button" className="ph-vchrome-btn ph-vchrome-skip" onClick={(e) => { stop(e); if (steady()) onNext(); }} disabled={!hasNext} aria-label="Next">
                  <RfIcon name="next" size={26} />
                </button>
              </div>
              <div className="ph-vchrome-bottom">
                <div className="ph-vchrome-row">
                  <span className="ph-vchrome-time">
                    <ClockText />
                    <span className="ph-vchrome-total"> / {duration > 0 ? fmtDuration(duration) : "--:--"}</span>
                  </span>
                  <button type="button" className="ph-vchrome-btn" onClick={(e) => { stop(e); toggleFullscreen(); }} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
                    {fullscreen ? <Minimize size={18} strokeWidth={2.25} /> : <Maximize size={18} strokeWidth={2.25} />}
                  </button>
                </div>
                <div className="ph-vscrub" onClick={stop}>
                  <ScrubBar
                    variant="video"
                    duration={duration}
                    activeId={item?.id ?? null}
                    spriteCount={spriteCount}
                    sbSegments={sbEnabled ? sbSegments : []}
                    onSeek={onSeek}
                    onScrubbing={onScrubbing}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <AnimatePresence>
            {video && ripple ? (
              <m.span
                key={ripple.side}
                className={`ph-vtap ph-vtap--${ripple.side < 0 ? "l" : "r"}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
                transition={{ duration: 0.12 }}
                aria-hidden
              >
                <m.span
                  key={ripple.pulse}
                  className="ph-vtap-chev"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 + Math.min(ripple.total / SEEK_STEP - 1, 5) * 0.16 }}
                  transition={PRESS_SPRING}
                >
                  {ripple.side < 0 ? <ChevronLeft size={26} strokeWidth={2.5} /> : <ChevronRight size={26} strokeWidth={2.5} />}
                </m.span>
                <span>{ripple.side < 0 ? "-" : "+"}{ripple.total}</span>
              </m.span>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false} custom={direction}>
            {!video && item ? (
              <m.div
                key={item.id}
                className="ph-player-art-slide"
                custom={direction}
                variants={ART_SLIDE}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageTransition}
              >
                <Art item={item} className="ph-fill-art" iconSize={64} />
              </m.div>
            ) : null}
          </AnimatePresence>
          {activeSbSegment && sbEnabled ? (
            <button type="button" className="ph-skip" onClick={(e) => { stop(e); onSkipSegment(); }}>
              Skip sponsor
            </button>
          ) : null}
          {video && locked ? (
            <button
              type="button"
              className={`ph-vlock${lockHint ? " ph-vlock--on" : ""}`}
              onClick={(e) => { stop(e); unlockScreen(); }}
              aria-label="Unlock screen"
              tabIndex={lockHint ? 0 : -1}
            >
              <Unlock size={20} strokeWidth={2.25} />
              <span>Unlock</span>
            </button>
          ) : null}
          <AnimatePresence>
            {video && menu ? (
              <m.div
                key="menu"
                className="ph-vmenu-scrim"
                onClick={(e) => { stop(e); setMenu(null); }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <m.div
                  className="ph-vmenu"
                  role="dialog"
                  aria-label="Player settings"
                  onClick={stop}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.16 }}
                >
                  {menu === "main" ? (
                    <>
                      <button type="button" className="ph-vmenu-row" onClick={() => setMenu("speed")}>
                        <RfIcon name="gauge" size={20} />
                        <span className="ph-vmenu-label">Playback speed</span>
                        <span className="ph-vmenu-value">{speed === 1 ? "Normal" : `${speed}×`}</span>
                        <ChevronRight size={16} />
                      </button>
                      <button type="button" className="ph-vmenu-row" role="switch" aria-checked={loop} onClick={() => onLoop(!loop)}>
                        {loop ? <Repeat1 size={20} /> : <RfIcon name="loop" size={20} />}
                        <span className="ph-vmenu-label">Loop</span>
                        <span className="ph-vmenu-value">{loop ? "On" : "Off"}</span>
                      </button>
                      {sbSegments.length > 0 ? (
                        <button type="button" className="ph-vmenu-row" role="switch" aria-checked={sbEnabled} onClick={() => onSbEnabled(!sbEnabled)}>
                          <RfIcon name="next" size={20} />
                          <span className="ph-vmenu-label">Skip sponsors</span>
                          <span className="ph-vmenu-value">{sbEnabled ? "On" : "Off"}</span>
                        </button>
                      ) : null}
                      <button type="button" className="ph-vmenu-row" onClick={lockScreen}>
                        <Lock size={20} />
                        <span className="ph-vmenu-label">Lock screen</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="ph-vmenu-row ph-vmenu-back" onClick={() => setMenu("main")}>
                        <ChevronLeft size={20} />
                        <span className="ph-vmenu-label">Playback speed</span>
                      </button>
                      <div className="ph-vmenu-list">
                        {speeds.map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            className="ph-vmenu-row"
                            onClick={() => { onSpeed(sp); setMenu(null); }}
                            aria-pressed={sp === speed}
                          >
                            <span className="ph-vmenu-check">{sp === speed ? <Check size={18} strokeWidth={2.5} /> : null}</span>
                            <span className="ph-vmenu-label">{sp === 1 ? "Normal" : `${sp}×`}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </m.div>
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>
      </m.div>

      {video ? (
        <div className="ph-watch">
          <m.div
            key={item?.id ?? "none"}
            className="ph-watch-info"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={pageTransition}
          >
            <h2 className="ph-watch-title">{item?.title ?? ""}</h2>
            {meta ? <p className="ph-watch-meta">{meta}</p> : null}
          </m.div>

          {error ? <p className="ph-player-error" role="alert">{error}</p> : null}

          <div className="ph-watch-actions">
            <SpeedMenu speed={speed} speeds={speeds} grow="down" onSpeed={onSpeed} />
            <button
              type="button"
              className={`ph-util${loop ? " ph-util--on" : ""}`}
              onClick={() => onLoop(!loop)}
              aria-pressed={loop}
            >
              {loop ? <Repeat1 size={16} /> : <RfIcon name="loop" size={16} />}
              <span className="ph-cap">Loop</span>
            </button>
            {item ? <SaveButton item={item} size={20} /> : null}
            {sbSegments.length > 0 ? (
              <button
                type="button"
                className={`ph-util${sbEnabled ? " ph-util--on" : ""}`}
                onClick={() => onSbEnabled(!sbEnabled)}
                aria-pressed={sbEnabled}
              >
                <span className="ph-cap">Skip sponsors</span>
              </button>
            ) : null}
          </div>

          <div className="ph-watch-pills" role="tablist" aria-label={`Up next from ${context}`}>
            {filters.map((f) => (
              <m.button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`ph-watch-pill${filter === f.id ? " ph-watch-pill--on" : ""}`}
                onClick={() => setFilter(f.id)}
                whileTap={{ scale: 0.94 }}
                transition={PRESS_SPRING}
              >
                {f.label}
              </m.button>
            ))}
          </div>
          {shownNext.length === 0 ? (
            <p className="ph-empty">{upNext.length === 0 ? "Nothing queued after this one." : "Nothing matches that filter."}</p>
          ) : (
            <div className="ph-watch-list">
              <AnimatePresence mode="popLayout" initial={false}>
                {shownNext.map((next, i) => (
                  <m.button
                    key={next.id}
                    type="button"
                    className="ph-upnext"
                    onClick={() => onPlayQueued(next)}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0, transition: { ...pageTransition, delay: staggerDelay(i) } }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    whileTap={{ scale: 0.985 }}
                  >
                    <span className="ph-upnext-thumb">
                      <Art item={next} className="ph-fill-art" iconSize={32} />
                      {next.durationSecs ? <span className="ph-vcard-time">{fmtDuration(next.durationSecs)}</span> : null}
                    </span>
                    <span className="ph-upnext-text">
                      <span className="ph-upnext-title">{next.title}</span>
                      <span className="ph-upnext-meta">
                        {[next.artist, addedAgo(next.addedAt ?? undefined)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </m.button>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : (
        <div className="ph-player-body">
          <m.div
            key={item?.id ?? "none"}
            className="ph-player-info"
            initial={{ opacity: 0, x: direction * 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={pageTransition}
          >
            <div className="ph-player-heading">
              <div>
                <h2 className="ph-player-title"><MarqueeText text={item?.title ?? ""} /></h2>
                {item?.artist ? <p className="ph-player-artist">{item.artist}</p> : null}
              </div>
              {item ? <SaveButton item={item} size={26} /> : null}
            </div>
          </m.div>

          {error ? <p className="ph-player-error" role="alert">{error}</p> : null}

          <ScrubBar
            duration={duration}
            activeId={item?.id ?? null}
            spriteCount={0}
            sbSegments={sbEnabled ? sbSegments : []}
            onSeek={onSeek}
          />

          <div className="ph-transport">
            <button
              type="button"
              className={`ph-transport-side${shuffle ? " ph-transport-side--on" : ""}`}
              onClick={() => onShuffle(!shuffle)}
              aria-pressed={shuffle}
              aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
            >
              <RfIcon name="shuffle" size={24} />
            </button>
            <button type="button" className="ph-transport-btn" onClick={onPrev} disabled={!hasPrev} aria-label="Previous track">
              <RfIcon name="skipPrev" size={34} />
            </button>
            <m.button
              type="button"
              className="ph-play"
              onClick={onTogglePlay}
              aria-label={paused ? "Play" : "Pause"}
              whileTap={{ scale: 0.92 }}
              transition={PRESS_SPRING}
            >
              <PlayPauseMorphIcon playing={!paused} size={28} />
            </m.button>
            <button type="button" className="ph-transport-btn" onClick={onNext} disabled={!hasNext} aria-label="Next track">
              <RfIcon name="skipNext" size={34} />
            </button>
            <button
              type="button"
              className={`ph-transport-side${loop ? " ph-transport-side--on" : ""}`}
              onClick={() => onLoop(!loop)}
              aria-pressed={loop}
              aria-label={loop ? "Loop one" : "Loop off"}
            >
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={loop ? "one" : "off"}
                  className="ph-swap"
                  initial={SWAP_ENTER}
                  animate={SWAP_REST}
                  exit={SWAP_EXIT}
                  transition={{ duration: 0.15 }}
                >
                  {loop ? <Repeat1 size={22} /> : <RfIcon name="loop" size={22} />}
                </m.span>
              </AnimatePresence>
            </button>
          </div>

          <div className="ph-utils">
            <SpeedMenu speed={speed} speeds={speeds} grow="up" onSpeed={onSpeed} />
            <span className="ph-utils-spacer" />
            {sbSegments.length > 0 ? (
              <button
                type="button"
                className={`ph-util${sbEnabled ? " ph-util--on" : ""}`}
                onClick={() => onSbEnabled(!sbEnabled)}
                aria-pressed={sbEnabled}
              >
                <span className="ph-cap">Skip sponsors</span>
              </button>
            ) : null}
            <button type="button" className="ph-icon-btn ph-utils-queue" onClick={onOpenQueue} aria-label="Up next">
              <RfIcon name="queue" size={24} />
            </button>
          </div>
        </div>
      )}
    </m.div>
  );
}

const ART_SLIDE = {
  enter: (dir: number) => ({ opacity: 0, x: `${dir * 24}%` }),
  center: { opacity: 1, x: "0%" },
  exit: (dir: number) => ({ opacity: 0, x: `${dir * -24}%` }),
};
