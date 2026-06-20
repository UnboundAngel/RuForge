import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence } from "motion/react";
import { isDevCaptureEnabled } from "@/lib/devCaptureGate";
import type { DevCaptureEntry } from "@/lib/devCapturesTypes";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { DevCaptureAnnotateModal } from "./DevCaptureAnnotateModal";
import {
  DevCaptureSavedToast,
  type DevCaptureToastItem,
} from "./DevCaptureSavedToast";
import { DevCaptureToastMorph } from "./DevCaptureToastMorph";

type DevCaptureScreenshotResult = {
  path: string;
  name: string;
  width: number;
  height: number;
  modifiedMs: number;
};

type DevCaptureChromeContextValue = {
  captureFromTrigger: (fromRect: DOMRect, screenLabel: string) => Promise<void>;
  capturing: boolean;
};

const DevCaptureChromeContext = createContext<DevCaptureChromeContextValue | null>(
  null,
);

function nextToastId(): string {
  return `dc-toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useDevCaptureChrome(): DevCaptureChromeContextValue {
  const ctx = useContext(DevCaptureChromeContext);
  if (!ctx) {
    throw new Error("useDevCaptureChrome must be used within DevCaptureChromeProvider");
  }
  return ctx;
}

type MorphState = {
  previewSrc: string;
  blobUrl: string;
  item: DevCaptureToastItem;
  from: DOMRect;
};

export function DevCaptureChromeProvider({ children }: { children: ReactNode }) {
  const showDebuggingSettings = useRuforgeStore((s) => s.settings.showDebuggingSettings);
  const chromeEnabled = isDevCaptureEnabled(showDebuggingSettings);
  const stackRef = useRef<HTMLDivElement>(null);
  const [toasts, setToasts] = useState<DevCaptureToastItem[]>([]);
  const [morph, setMorph] = useState<MorphState | null>(null);
  const [morphHandoffId, setMorphHandoffId] = useState<string | null>(null);
  const [annotateEntry, setAnnotateEntry] = useState<DevCaptureEntry | null>(null);
  const [capturing, setCapturing] = useState(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openAnnotate = useCallback((entry: DevCaptureEntry) => {
    setAnnotateEntry(entry);
  }, []);

  const commitToast = useCallback((item: DevCaptureToastItem, blobUrl?: string) => {
    setToasts((prev) => [item, ...prev]);
    setMorphHandoffId(item.id);
    setMorph(null);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, []);

  const captureFromTrigger = useCallback(
    async (fromRect: DOMRect, screenLabel: string) => {
      if (!chromeEnabled || capturing) return;
      setCapturing(true);
      try {
        const result = await invoke<DevCaptureScreenshotResult>(
          "capture_main_window_dev",
          { contextLabel: screenLabel },
        );
        const entry: DevCaptureEntry = {
          path: result.path,
          name: result.name,
          modifiedMs: result.modifiedMs,
        };
        const item: DevCaptureToastItem = {
          id: nextToastId(),
          entry,
          contextLabel: screenLabel,
          width: result.width,
          height: result.height,
        };
        const bytes = await invoke<number[]>("read_dev_capture_png", { path: result.path });
        const blobUrl = URL.createObjectURL(
          new Blob([Uint8Array.from(bytes)], { type: "image/png" }),
        );
        setMorph((prev) => {
          if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
          return {
            previewSrc: blobUrl,
            blobUrl,
            item,
            from: fromRect,
          };
        });
      } catch (e) {
        console.error("[dev-capture] capture failed", e);
      } finally {
        setCapturing(false);
      }
    },
    [chromeEnabled, capturing],
  );

  const handleMorphDone = useCallback(() => {
    if (morph) commitToast(morph.item, morph.blobUrl);
  }, [morph, commitToast]);

  const value = useMemo(
    () => ({ captureFromTrigger, capturing }),
    [captureFromTrigger, capturing],
  );

  return (
    <DevCaptureChromeContext.Provider value={value}>
      {children}

      {chromeEnabled ? (
      <div
        ref={stackRef}
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-max max-w-[calc(100vw-2rem)] flex-col-reverse items-end gap-2"
      >
        <div
          data-dev-capture-toast-slot
          className="pointer-events-none h-0 w-0 shrink-0 opacity-0"
          aria-hidden
        />
        <AnimatePresence>
          {toasts.map((item) => (
            <DevCaptureSavedToast
              key={item.id}
              item={item}
              onOpen={openAnnotate}
              onDismiss={dismissToast}
              skipEntrance={item.id === morphHandoffId}
            />
          ))}
        </AnimatePresence>
      </div>
      ) : null}

      {chromeEnabled && morph ? (
        <DevCaptureToastMorph
          payload={{
            previewSrc: morph.previewSrc,
            item: morph.item,
            from: morph.from,
            stackEl: stackRef.current,
          }}
          onDone={handleMorphDone}
        />
      ) : null}

      {chromeEnabled && annotateEntry ? (
        <DevCaptureAnnotateModal
          entry={annotateEntry}
          onClose={() => setAnnotateEntry(null)}
          onSaved={() => setAnnotateEntry(null)}
        />
      ) : null}
    </DevCaptureChromeContext.Provider>
  );
}
