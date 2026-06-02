import { type RefCallback, useCallback, useEffect, useRef, useState } from "react";
import {
  filterSupportedYouTubeUrls,
  mimeTypesMayCarryUri,
  parseDroppedUrls,
} from "./dropIntake";
import { debugLog } from "@/debug/debugLog";

export type DropIntakeReason = "no-url" | "wrong-host" | "modal-conflict" | "accepted";

type UseUrlDropIntakeArgs = {
  duplicateModalOpen: boolean;
  onDroppedYoutubeUrls: (urls: readonly string[]) => void | Promise<void>;
  toastNoSupportedUrl: () => void;
  toastModalBlocked: () => void;
};

function logDropOutcome(
  reason: DropIntakeReason,
  parsedRawCount: number,
  youtubeCount: number,
) {
  if (!import.meta.env.DEV) return;
  let accepted = 0;
  let rejected = parsedRawCount;
  if (reason === "accepted") {
    accepted = youtubeCount;
    rejected = parsedRawCount - youtubeCount >= 0 ? parsedRawCount - youtubeCount : 0;
  } else if (reason === "modal-conflict" || reason === "wrong-host") {
    rejected = parsedRawCount;
  } else if (reason === "no-url") {
    rejected = 0;
  }
  debugLog("devtools.drop", "debug", "drop intake", {
    count: parsedRawCount,
    accepted,
    rejected,
    reason,
  });
}

export function useUrlDropIntake({
  duplicateModalOpen,
  onDroppedYoutubeUrls,
  toastNoSupportedUrl,
  toastModalBlocked,
}: UseUrlDropIntakeArgs) {
  const [attachTarget, setAttachTarget] = useState<HTMLElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const onDroppedRef = useRef(onDroppedYoutubeUrls);
  onDroppedRef.current = onDroppedYoutubeUrls;

  const duplicateModalOpenRef = useRef(duplicateModalOpen);
  duplicateModalOpenRef.current = duplicateModalOpen;

  const toastNoSupportedUrlRef = useRef(toastNoSupportedUrl);
  toastNoSupportedUrlRef.current = toastNoSupportedUrl;

  const toastModalBlockedRef = useRef(toastModalBlocked);
  toastModalBlockedRef.current = toastModalBlocked;

  const bindRef: RefCallback<HTMLElement> = useCallback((node) => {
    setAttachTarget(node);
  }, []);

  useEffect(() => {
    const el = attachTarget;
    if (!el) return;

    const isInsideRect = (e: DragEvent) => {
      const r = el.getBoundingClientRect();
      const { clientX: x, clientY: y } = e;
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (mimeTypesMayCarryUri(e.dataTransfer)) {
        setIsDragOver(true);
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (!isInsideRect(e)) {
        setIsDragOver(false);
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const dt = e.dataTransfer;
      if (!dt) {
        logDropOutcome("no-url", 0, 0);
        toastNoSupportedUrlRef.current();
        return;
      }

      if (duplicateModalOpenRef.current) {
        const parsed = parseDroppedUrls(dt);
        toastModalBlockedRef.current();
        logDropOutcome("modal-conflict", parsed.length, 0);
        return;
      }

      const raw = parseDroppedUrls(dt);
      const youtubeUrls = filterSupportedYouTubeUrls(raw);

      if (youtubeUrls.length === 0) {
        const reason = raw.length === 0 ? "no-url" : "wrong-host";
        logDropOutcome(reason, raw.length, 0);
        toastNoSupportedUrlRef.current();
        return;
      }

      logDropOutcome("accepted", raw.length, youtubeUrls.length);
      void onDroppedRef.current(youtubeUrls);
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);

    return () => {
      setIsDragOver(false);
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
    };
  }, [attachTarget]);

  return {
    bindRef,
    /** True when hovering the drop zone with a drag that declares URI/plain MIME hints. */
    isDragOver,
  };
}
