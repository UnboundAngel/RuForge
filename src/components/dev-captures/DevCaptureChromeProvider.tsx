import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence } from "motion/react";
import { copyDevCapturePngBytesToClipboard } from "@/lib/copyDevCapturePng";
import { notifyDevCapturesChanged } from "@/lib/devCapturesEvents";
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

export type DevCaptureDelivery = "toast" | "island";

export type DevCaptureIslandResult = {
  entry: DevCaptureEntry;
  previewSrc: string;
  contextLabel: string;
};

type DevCaptureChromeContextValue = {
  captureFromTrigger: (
    fromRect: DOMRect,
    screenLabel: string,
    delivery?: DevCaptureDelivery,
  ) => Promise<DevCaptureEntry | DevCaptureIslandResult | null>;
  capturing: boolean;
  hasLastCapture: boolean;
  openLastCapture: () => Promise<void>;
  openCapture: (entry: DevCaptureEntry) => void;
  goToDevCaptures: () => void;
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
  const [lastCapture, setLastCapture] = useState<DevCaptureEntry | null>(null);
  const [capturing, setCapturing] = useState(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openAnnotate = useCallback((entry: DevCaptureEntry) => {
    setLastCapture(entry);
    setAnnotateEntry(entry);
  }, []);

  const openLastCapture = useCallback(async () => {
    if (lastCapture) {
      openAnnotate(lastCapture);
      return;
    }
    try {
      const list = await invoke<DevCaptureEntry[]>("list_dev_captures");
      if (list.length === 0) return;
      openAnnotate(list[0]);
    } catch (e) {
      console.error("[dev-capture] list for edit-last failed", e);
    }
  }, [lastCapture, openAnnotate]);

  const goToDevCaptures = useCallback(() => {
    const st = useRuforgeStore.getState();
    st.setActiveTab("settings");
    st.setSettingsTab("debugging");
  }, []);

  useEffect(() => {
    if (!chromeEnabled) {
      setLastCapture(null);
      return;
    }
    let cancelled = false;
    void invoke<DevCaptureEntry[]>("list_dev_captures")
      .then((list) => {
        if (!cancelled && list.length > 0) setLastCapture(list[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chromeEnabled]);

  const commitToast = useCallback((item: DevCaptureToastItem, blobUrl?: string) => {
    setToasts((prev) => [item, ...prev]);
    setMorphHandoffId(item.id);
    setMorph(null);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, []);

  const captureFromTrigger = useCallback(
    async (
      fromRect: DOMRect,
      screenLabel: string,
      delivery: DevCaptureDelivery = "toast",
    ): Promise<DevCaptureEntry | DevCaptureIslandResult | null> => {
      if (!chromeEnabled || capturing) return null;
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
        const pngBytes = Uint8Array.from(
          await invoke<number[]>("read_dev_capture_png", { path: result.path }),
        );
        void copyDevCapturePngBytesToClipboard(pngBytes).catch((e) => {
          console.error("[dev-capture] clipboard copy failed", e);
        });
        setLastCapture(entry);
        notifyDevCapturesChanged();

        const blobUrl = URL.createObjectURL(new Blob([pngBytes], { type: "image/png" }));

        if (delivery === "island") {
          return { entry, previewSrc: blobUrl, contextLabel: screenLabel };
        }

        const item: DevCaptureToastItem = {
          id: nextToastId(),
          entry,
          contextLabel: screenLabel,
          width: result.width,
          height: result.height,
        };
        setMorph((prev) => {
          if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
          return {
            previewSrc: blobUrl,
            blobUrl,
            item,
            from: fromRect,
          };
        });
        return entry;
      } catch (e) {
        console.error("[dev-capture] capture failed", e);
        return null;
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
    () => ({
      captureFromTrigger,
      capturing,
      hasLastCapture: lastCapture != null,
      openLastCapture,
      openCapture: openAnnotate,
      goToDevCaptures,
    }),
    [captureFromTrigger, capturing, lastCapture, openLastCapture, openAnnotate, goToDevCaptures],
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
