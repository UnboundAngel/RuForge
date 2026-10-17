import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { openCreatorPage } from "./creatorPageStore";

/** A cold library can name dozens of channels at once; YouTube throttles a burst of page loads. */
const MAX_AVATAR_FETCHES = 4;
const avatarRequests = new Map<string, Promise<string | null>>();
let activeFetches = 0;
const waiting: (() => void)[] = [];

async function withFetchSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeFetches >= MAX_AVATAR_FETCHES) await new Promise<void>((resolve) => waiting.push(resolve));
  activeFetches += 1;
  try {
    return await task();
  } finally {
    activeFetches -= 1;
    waiting.shift()?.();
  }
}

export function channelAvatarPath(channelId: string): Promise<string | null> {
  let request = avatarRequests.get(channelId);
  if (!request) {
    request = withFetchSlot(() => invoke<string | null>("get_channel_avatar", { channelId })).catch(() => null);
    avatarRequests.set(channelId, request);
  }
  return request;
}

export function ChannelAvatar({
  channelId,
  channel,
  className = "mt-0.5 h-9 w-9",
}: {
  channelId: string | null | undefined;
  channel: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(null);
    if (!channelId) return;
    let live = true;
    void channelAvatarPath(channelId).then((path) => {
      if (live && path) setSrc(convertFileSrc(path));
    });
    return () => {
      live = false;
    };
  }, [channelId]);

  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.08] text-[13px] font-bold text-stone-300`}
    >
      <FallbackImg src={src} className="h-full w-full object-cover" fallback={channel.trim().charAt(0).toUpperCase()} />
    </div>
  );
}

export function VerifiedMark({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`${className} shrink-0`} aria-label="Verified" role="img">
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path d="M4.75 8.25 7 10.5l4.25-4.75" fill="none" stroke="#1c1917" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Dot-separated inline parts; falsy entries drop out so callers can pass optional stats. */
export function MetaParts({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter(Boolean);
  return (
    <>
      {shown.map((part, i) => (
        <span key={i}>
          {i > 0 ? <span className="mx-1.5 text-stone-600">·</span> : null}
          {part}
        </span>
      ))}
    </>
  );
}

/** Opens the creator's page; stops the click so the card under it doesn't play. */
function ChannelLink({
  channelId,
  channel,
  className,
  children,
}: {
  channelId: string;
  channel: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={`Open ${channel}'s page`}
      onClick={(e) => {
        e.stopPropagation();
        openCreatorPage(channelId, channel);
      }}
      className={className}
    >
      {children}
    </button>
  );
}

/** A short eased glide reads calmer than a slow crawl, which steps or blurs at low pixel speeds. */
const PING_PONG_GLIDE_PX_PER_SEC = 140;
const PING_PONG_HOLD_MS = 1800;
const PING_PONG_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

/** Truncated at rest; while `active`, an overflowing line glides to its end, rests, and glides back. */
function MarqueeLine({ active, rest, line }: { active: boolean; rest: ReactNode; line: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = lineRef.current;
    setShift(active && box && el ? Math.max(0, el.offsetWidth - box.clientWidth) : 0);
  }, [active]);

  useEffect(() => {
    const box = boxRef.current;
    const el = lineRef.current;
    if (!shift || !box || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const glide = (shift / PING_PONG_GLIDE_PX_PER_SEC) * 1000;
    const total = 2 * (PING_PONG_HOLD_MS + glide);
    const leave = PING_PONG_HOLD_MS / total;
    const arrive = (PING_PONG_HOLD_MS + glide) / total;
    const back = (2 * PING_PONG_HOLD_MS + glide) / total;
    const timing = { duration: total, iterations: Infinity };
    const start = `translateX(0)`;
    const end = `translateX(-${shift}px)`;
    const move = el.animate(
      [
        { transform: start, offset: 0 },
        { transform: start, offset: leave, easing: PING_PONG_EASE },
        { transform: end, offset: arrive },
        { transform: end, offset: back, easing: PING_PONG_EASE },
        { transform: start, offset: 1 },
      ],
      timing,
    );
    const atStart = { "--rf-ping-pong-fade-l": "0px", "--rf-ping-pong-fade-r": "0.5rem" };
    const atEnd = { "--rf-ping-pong-fade-l": "0.85rem", "--rf-ping-pong-fade-r": "0px" };
    const fade = box.animate(
      [
        { ...atStart, offset: 0 },
        { ...atStart, offset: leave, easing: PING_PONG_EASE },
        { ...atEnd, offset: arrive },
        { ...atEnd, offset: back, easing: PING_PONG_EASE },
        { ...atStart, offset: 1 },
      ],
      timing,
    );
    return () => {
      move.cancel();
      fade.cancel();
    };
  }, [shift]);

  return (
    <div
      ref={boxRef}
      className={cn("mt-1 overflow-hidden whitespace-nowrap text-[13px] text-stone-400", shift > 0 && "rf-ping-pong-fade")}
    >
      {active ? (
        <div ref={lineRef} className="flex w-max items-center">
          {line}
        </div>
      ) : (
        rest
      )}
    </div>
  );
}

/** YouTube-style text block under a thumbnail: avatar, title, then channel and `meta` on one line. */
export function VideoByline({
  channel,
  channelId,
  verified,
  title,
  meta,
  action,
  footer,
  active,
}: {
  channel: string | null | undefined;
  channelId: string | null | undefined;
  verified: boolean;
  title: ReactNode;
  meta: ReactNode;
  action?: ReactNode;
  /** Under the channel line, aligned with the title. */
  footer?: ReactNode;
  /** Card hover; omit to track hover on the byline itself. */
  active?: boolean;
}) {
  const [selfHovered, setSelfHovered] = useState(false);
  const hovered = active ?? selfHovered;
  const name = (
    <>
      <span className="truncate">{channel}</span>
      {verified ? <VerifiedMark /> : null}
    </>
  );
  const channelPart = (className: string) =>
    channel && channelId ? (
      <ChannelLink
        channelId={channelId}
        channel={channel}
        className={cn(className, "transition-colors duration-150 hover:text-stone-100")}
      >
        {name}
      </ChannelLink>
    ) : channel ? (
      <span className={className}>{name}</span>
    ) : null;
  const dot = channel && meta ? <span className="mx-1.5 shrink-0 text-stone-600">·</span> : null;
  return (
    <div
      className="flex gap-3 px-0.5"
      onMouseEnter={active === undefined ? () => setSelfHovered(true) : undefined}
      onMouseLeave={active === undefined ? () => setSelfHovered(false) : undefined}
    >
      {channel && channelId ? (
        <ChannelLink
          channelId={channelId}
          channel={channel}
          className="self-start rounded-full transition-[filter] duration-150 hover:brightness-125"
        >
          <ChannelAvatar channelId={channelId} channel={channel} />
        </ChannelLink>
      ) : channel ? (
        <ChannelAvatar channelId={channelId} channel={channel} />
      ) : null}
      <div className="min-w-0 flex-1">
        {title}
        <MarqueeLine
          active={hovered}
          rest={
            <div className="flex min-w-0 items-center">
              {channelPart("flex min-w-0 max-w-[60%] shrink-0 items-center gap-1")}
              {dot}
              <span className="min-w-0 truncate">{meta}</span>
            </div>
          }
          line={
            <>
              {channelPart("flex items-center gap-1")}
              {dot}
              <span>{meta}</span>
            </>
          }
        />
        {footer}
      </div>
      {action}
    </div>
  );
}
