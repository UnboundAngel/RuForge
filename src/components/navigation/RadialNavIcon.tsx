import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "@/lib/registerNavIcons";
import { Icon } from "@iconify/react";
import { seekLineMdToEnd, accelerateLineMdAnimations } from "@/lib/freezeLineMdIcon";
import { cn } from "@/lib/utils";

export type RadialNavIconId =
  | "download"
  | "videos"
  | "explorer"
  | "settings";

const ICON: Record<RadialNavIconId, string> = {
  download: "line-md:downloading",
  videos: "line-md:youtube-filled",
  explorer: "material-symbols:youtube-searched-for-rounded",
  settings: "line-md:cog",
};

const LINE_MD_ICON: Record<RadialNavIconId, boolean> = {
  download: true,
  videos: true,
  explorer: false,
  settings: true,
};

type RadialNavIconProps = {
  id: RadialNavIconId;
  size?: number;
  className?: string;
  playing: boolean;
};

export function RadialNavIcon({
  id,
  size = 22,
  className,
  playing,
}: RadialNavIconProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [mountKey, setMountKey] = useState(0);
  const prevPlaying = useRef(false);
  const isLineMd = LINE_MD_ICON[id];

  // Only remount (restart animation) on hover enter, not on exit.
  useLayoutEffect(() => {
    if (playing && !prevPlaying.current) {
      setMountKey((k) => k + 1);
    }
    prevPlaying.current = playing;
  }, [playing]);

  useLayoutEffect(() => {
    if (!playing || !isLineMd) return;
    const root = rootRef.current;
    if (!root) return;

    let rafId = 0;

    const applyAccelerate = () => {
      const svgs = root.querySelectorAll<SVGSVGElement>("svg");
      if (!svgs.length) return false;
      accelerateLineMdAnimations(root);
      svgs.forEach((svg) => {
        try { svg.setCurrentTime(0); } catch { /* ignore */ }
      });
      return true;
    };

    // Try immediately, then watch for SVG injection by Iconify (async).
    if (!applyAccelerate()) {
      const obs = new MutationObserver(() => {
        if (applyAccelerate()) obs.disconnect();
      });
      obs.observe(root, { childList: true, subtree: true });
      // Safety rAF in case mutation fires before our observer connects.
      rafId = requestAnimationFrame(() => {
        applyAccelerate();
        obs.disconnect();
      });
      return () => { obs.disconnect(); cancelAnimationFrame(rafId); };
    }
  }, [playing, mountKey, isLineMd]);

  // Idle: seek SVG to end state so the fully-drawn glyph shows, not t=0 blank.
  // Only runs when not hovering. Does NOT run on hover exit so mid-animation
  // frames are not interrupted.
  useEffect(() => {
    if (playing || !isLineMd) return;

    const seek = () => seekLineMdToEnd(rootRef.current);

    // Iconify injects the SVG asynchronously; try on next frame + watch for inject.
    const raf = requestAnimationFrame(seek);
    const root = rootRef.current;
    if (!root) return () => cancelAnimationFrame(raf);

    const obs = new MutationObserver(seek);
    obs.observe(root, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  // Re-run only when switching from playing→idle (mountKey ticks) or id changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountKey, id, isLineMd]);

  return (
    <span
      ref={rootRef}
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <Icon
        key={`${id}-${mountKey}`}
        icon={ICON[id]}
        width={size}
        height={size}
      />
    </span>
  );
}
