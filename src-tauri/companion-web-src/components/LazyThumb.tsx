import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  id: string;
  hasThumb: boolean;
  thumbV?: number;
  className?: string;
  children?: ReactNode;
};

/** Cookie-authenticated, so no token round trip; `v` makes the URL immutable for the HTTP and service worker caches. */
export function artUrl(id: string, v?: number): string {
  // `sq` retires covers cached before they were cut square; the phone keeps `v` URLs forever.
  return `/art/${encodeURIComponent(id)}?v=${v ?? 0}&sq=1`;
}

// Loads run a few at a time: a fast scroll past a long grid would otherwise fire every request at once and stall the ones on screen.
const MAX_ACTIVE = 4;
const SLOT_TIMEOUT_MS = 8000;
let active = 0;
const queue: Array<(release: () => void) => void> = [];

function pump() {
  while (active < MAX_ACTIVE && queue.length > 0) {
    // Newest first: after a scroll, what is on screen now matters more than what was passed.
    const grant = queue.pop()!;
    active++;
    let done = false;
    const timer = window.setTimeout(() => release(), SLOT_TIMEOUT_MS);
    const release = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      active--;
      pump();
    };
    grant(release);
  }
}

/** Returns a cancel that only drops the request while it is still waiting for a slot. */
function acquireSlot(grant: (release: () => void) => void): () => void {
  queue.push(grant);
  pump();
  return () => {
    const i = queue.indexOf(grant);
    if (i >= 0) queue.splice(i, 1);
  };
}

export function LazyThumb({ id, hasThumb, thumbV, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const release = useRef<(() => void) | null>(null);

  const settle = () => {
    release.current?.();
    release.current = null;
  };

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    if (!hasThumb) {
      setSrc(null);
      return;
    }
    setSrc(null);

    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let cancelSlot: (() => void) | null = null;
    let started = false;
    const load = () => {
      cancelSlot = acquireSlot((done) => {
        cancelSlot = null;
        started = true;
        release.current = done;
        if (!cancelled) setSrc(artUrl(id, thumbV));
      });
    };

    if (!("IntersectionObserver" in window)) {
      load();
      return () => { cancelled = true; cancelSlot?.(); settle(); };
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries[entries.length - 1]?.isIntersecting;
        if (visible && !cancelSlot && !started && !cancelled) load();
        else if (!visible && cancelSlot) {
          cancelSlot();
          cancelSlot = null;
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => {
      cancelled = true;
      cancelSlot?.();
      obs.disconnect();
      settle();
    };
  }, [id, hasThumb, thumbV]);

  const showImg = src !== null && !failed;
  const waiting = hasThumb && !failed && !loaded;

  return (
    <div ref={ref} className={className}>
      {showImg ? (
        <img
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setLoaded(true);
          }}
          className={`thumb-img${loaded ? " thumb-img--in" : " thumb-img--wait"}`}
          src={src}
          alt=""
          draggable={false}
          onLoad={() => {
            setLoaded(true);
            settle();
          }}
          onError={() => {
            setFailed(true);
            settle();
          }}
        />
      ) : null}
      {waiting ? <span className="ph-skel" aria-hidden /> : null}
      {!hasThumb || failed ? children : null}
    </div>
  );
}
