import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import logo from "./assets/neotubeIcon.png";

const PUSH_EVENT = "ruforge-background-notify";

type Kind = "info" | "warning" | "error";

export type BackgroundNotifyPayload = {
  id: string;
  title: string;
  body: string;
  kind: string;
};

type Item = BackgroundNotifyPayload & { kind: Kind };

const AUTO_MS: Record<Kind, number> = {
  info: 5200,
  warning: 7000,
  error: 9000,
};

function normalizeKind(raw: string): Kind {
  if (raw === "warning" || raw === "error") return raw;
  return "info";
}

function NotifyCard({
  item,
  onDismiss,
}: {
  item: Item;
  onDismiss: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => onDismiss(item.id), AUTO_MS[item.kind]);
  }, [clearTimer, item.id, item.kind, onDismiss]);

  useEffect(() => {
    if (!hover) armTimer();
    return clearTimer;
  }, [hover, armTimer, clearTimer]);

  const accent =
    item.kind === "error"
      ? "border-rose-500/35"
      : item.kind === "warning"
        ? "border-amber-400/35"
        : "border-stone-400/15";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 36, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      onMouseEnter={() => {
        setHover(true);
        clearTimer();
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
      onClick={() => onDismiss(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDismiss(item.id);
        }
      }}
      className={`w-full cursor-pointer select-none rounded-2xl border bg-[#271C18] px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${accent}`}
    >
      <div className="flex gap-3">
        <img src={logo} alt="" className="mt-0.5 h-9 w-9 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#EDD79C]/90">
            {item.title}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-stone-100/95">{item.body}</p>
        </div>
      </div>
    </motion.article>
  );
}

export default function NotifyOverlayApp() {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  itemsRef.current = items;

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("ruforge-notify-root");
    return () => {
      document.documentElement.classList.remove("ruforge-notify-root");
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<BackgroundNotifyPayload>(PUSH_EVENT, (e) => {
        const p = e.payload;
        setItems((prev) => [
          ...prev,
          {
            ...p,
            kind: normalizeKind(p.kind),
          },
        ]);
      });
      await invoke("notify_overlay_ready").catch(() => {});
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  const scheduleSyncBounds = useCallback(() => {
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      const el = stackRef.current;
      if (!el) return;
      const raw = el.scrollHeight;
      const capped = Math.min(Math.max(raw + 20, 96), window.screen.availHeight * 0.42);
      void invoke("sync_notify_overlay_bounds", { height: capped }).catch(() => {});
    }, 72);
  }, []);

  useLayoutEffect(() => {
    scheduleSyncBounds();
  }, [items, scheduleSyncBounds]);

  useEffect(() => {
    const el = stackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => scheduleSyncBounds());
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [scheduleSyncBounds]);

  const onExitComplete = useCallback(() => {
    if (itemsRef.current.length === 0) {
      void invoke("hide_notify_overlay_window").catch(() => {});
    }
  }, []);

  return (
    <div className="h-full w-full overflow-hidden bg-transparent p-3">
      <div ref={stackRef} className="flex w-[356px] flex-col gap-2.5">
        <AnimatePresence mode="popLayout" onExitComplete={onExitComplete}>
          {items.map((item) => (
            <NotifyCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
