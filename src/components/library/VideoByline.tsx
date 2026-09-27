import { useEffect, useState, type ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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

function channelAvatarPath(channelId: string): Promise<string | null> {
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
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setSrc(null)} />
      ) : (
        channel.trim().charAt(0).toUpperCase()
      )}
    </div>
  );
}

function VerifiedMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" aria-label="Verified" role="img">
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

/** YouTube-style text block under a thumbnail: avatar, title, then channel and `meta` on one line. */
export function VideoByline({
  channel,
  channelId,
  verified,
  title,
  meta,
  action,
}: {
  channel: string | null | undefined;
  channelId: string | null | undefined;
  verified: boolean;
  title: ReactNode;
  meta: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex gap-3 px-0.5">
      {channel ? <ChannelAvatar channelId={channelId} channel={channel} /> : null}
      <div className="min-w-0 flex-1">
        {title}
        <p className="mt-1 flex min-w-0 items-center text-[13px] text-stone-400">
          {channel ? (
            <span className="flex min-w-0 max-w-[60%] shrink-0 items-center gap-1">
              <span className="truncate">{channel}</span>
              {verified ? <VerifiedMark /> : null}
            </span>
          ) : null}
          {channel && meta ? <span className="mx-1.5 shrink-0 text-stone-600">·</span> : null}
          <span className="min-w-0 truncate">{meta}</span>
        </p>
      </div>
      {action}
    </div>
  );
}
