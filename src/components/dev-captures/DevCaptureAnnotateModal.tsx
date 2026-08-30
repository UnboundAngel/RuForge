import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  drawDevCaptureAnnotation,
  drawSelectionHandles,
  mapPointerToImage,
} from "./devCaptureAnnotateDraw";
import {
  applyDrag,
  cloneAnnotation,
  hitTestAnnotation,
  type AnnotationRef,
  type HitTarget,
} from "./devCaptureAnnotateHit";
import { measureTextLabel } from "./devCaptureTextBounds";
import type {
  DevCaptureAnnotation,
  DevCaptureAnnotateTool,
  DevCaptureEntry,
  DevCaptureSegment,
} from "../../lib/devCapturesTypes";
import { emptyDevCaptureAnnotation } from "../../lib/devCapturesTypes";
import {
  motionDuration,
  overlayFadeTransition,
} from "../../lib/overlayMotion";

type DevCaptureAnnotateModalProps = {
  entry: DevCaptureEntry | null;
  onClose: () => void;
  onSaved: (path: string) => void;
};

type SegmentTool = "line" | "arrow" | "box";

const TOOL_BUTTON =
  "px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest border transition-colors active:scale-95";
const TOOL_ACTIVE =
  "bg-[color:var(--accent)] text-[#1D1613] border-[color:var(--accent)]";
const TOOL_IDLE = "bg-[#1D1613] text-stone-400 border-white/10 hover:text-stone-200";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

/** Matches main-window `WindowControls` cluster width so annotate chrome does not sit under maximize. */
const WINDOW_CONTROLS_RESERVE_PX = 148;

function isSegmentTool(tool: DevCaptureAnnotateTool): tool is SegmentTool {
  return tool === "line" || tool === "arrow" || tool === "box";
}

function segmentBox(seg: DevCaptureSegment) {
  const x = Math.min(seg.x1, seg.x2);
  const y = Math.min(seg.y1, seg.y2);
  return {
    x,
    y,
    w: Math.abs(seg.x2 - seg.x1),
    h: Math.abs(seg.y2 - seg.y1),
  };
}

export function DevCaptureAnnotateModal({
  entry,
  onClose,
  onSaved,
}: DevCaptureAnnotateModalProps) {
  const lastEntryRef = useRef<DevCaptureEntry | null>(entry);
  if (entry) lastEntryRef.current = entry;
  const shown = entry ?? lastEntryRef.current;
  const reduceMotion = useReducedMotion();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const displayScaleRef = useRef(1);
  const textInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    hit: HitTarget;
    originX: number;
    originY: number;
    snapshot: DevCaptureAnnotation;
  } | null>(null);

  const [tool, setTool] = useState<DevCaptureAnnotateTool>("line");
  const [annotation, setAnnotation] = useState<DevCaptureAnnotation>(emptyDevCaptureAnnotation);
  const [selection, setSelection] = useState<AnnotationRef | null>(null);
  const [segmentDraft, setSegmentDraft] = useState<DevCaptureSegment | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedName, setCopiedName] = useState(false);
  const [textDraft, setTextDraft] = useState<{
    x: number;
    y: number;
    left: number;
    top: number;
    value: string;
  } | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    const canvasHost = canvasHostRef.current;
    const img = imageRef.current;
    if (!canvas || !viewport || !canvasHost || !img || !imageSize) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw <= 0 || vh <= 0) return;

    const fitScale = Math.min(vw / imageSize.w, vh / imageSize.h);
    const drawW = imageSize.w * fitScale;
    const drawH = imageSize.h * fitScale;

    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;
    canvas.width = Math.round(drawW);
    canvas.height = Math.round(drawH);
    canvasHost.style.width = `${drawW}px`;
    canvasHost.style.height = `${drawH}px`;

    const displayScale = drawW / imageSize.w;
    displayScaleRef.current = displayScale;

    ctx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
    ctx.clearRect(0, 0, imageSize.w, imageSize.h);
    ctx.drawImage(img, 0, 0, imageSize.w, imageSize.h);

    drawDevCaptureAnnotation(ctx, annotation, displayScale, {
      segment: segmentDraft,
      segmentTool: isSegmentTool(tool) ? tool : null,
    });
    drawSelectionHandles(ctx, annotation, selection, displayScale);
  }, [annotation, imageSize, segmentDraft, selection, tool]);

  useEffect(() => {
    const path = shown?.path;
    if (!path) return;
    let cancelled = false;
    void (async () => {
      try {
        const bytes = await invoke<number[]>("read_dev_capture_png", { path });
        if (cancelled) return;
        const blob = new Blob([Uint8Array.from(bytes)], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          imageRef.current = img;
          setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
          console.error("[dev-captures] blob image load failed");
        };
        img.src = url;
      } catch (e) {
        console.error("[dev-captures] read png failed", e);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      imageRef.current = null;
    };
  }, [shown?.path]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw]);

  useEffect(() => {
    if (!textDraft) return;
    requestAnimationFrame(() => textInputRef.current?.focus());
  }, [textDraft]);

  useEffect(() => {
    if (!copiedName) return;
    const t = window.setTimeout(() => setCopiedName(false), 1500);
    return () => window.clearTimeout(t);
  }, [copiedName]);

  const commitSegment = (seg: DevCaptureSegment) => {
    if (tool === "line") {
      setAnnotation((prev) => ({ ...prev, lines: [...prev.lines, seg] }));
    } else if (tool === "arrow") {
      setAnnotation((prev) => ({ ...prev, arrows: [...prev.arrows, seg] }));
    } else if (tool === "box") {
      const box = segmentBox(seg);
      if (box.w < 1 && box.h < 1) return;
      setAnnotation((prev) => ({ ...prev, boxes: [...prev.boxes, box] }));
    }
    setSegmentDraft(null);
  };

  const commitTextDraft = () => {
    if (!textDraft) return;
    const trimmed = textDraft.value.trim();
    if (trimmed) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d") ?? undefined;
      const { w, h } = measureTextLabel(trimmed, displayScaleRef.current, ctx);
      setAnnotation((prev) => ({
        ...prev,
        texts: [
          ...prev.texts,
          { x: textDraft.x, y: textDraft.y, text: trimmed, w, h },
        ],
      }));
    }
    setTextDraft(null);
  };

  const copyFilename = async () => {
    const target = entry ?? lastEntryRef.current;
    if (!target) return;
    try {
      await writeText(target.name);
    } catch {
      await navigator.clipboard.writeText(target.name);
    }
    setCopiedName(true);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageSize || saving || textDraft) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = mapPointerToImage(canvas, e.clientX, e.clientY, imageSize.w, imageSize.h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (tool === "text") {
      const rect = canvas.getBoundingClientRect();
      setTextDraft({
        x,
        y,
        left: e.clientX - rect.left,
        top: e.clientY - rect.top,
        value: "",
      });
      return;
    }

    if (tool === "pin") {
      setAnnotation((prev) => ({
        ...prev,
        pins: [...prev.pins, { x, y, n: prev.pins.length + 1 }],
      }));
      return;
    }

    if (tool === "select") {
      const hit = hitTestAnnotation(annotation, x, y, displayScaleRef.current, ctx);
      if (hit) {
        setSelection({ kind: hit.kind, index: hit.index });
        dragRef.current = {
          hit,
          originX: x,
          originY: y,
          snapshot: cloneAnnotation(annotation),
        };
        canvas.setPointerCapture(e.pointerId);
      } else {
        setSelection(null);
      }
      return;
    }

    if (isSegmentTool(tool)) {
      canvas.setPointerCapture(e.pointerId);
      setSegmentDraft({ x1: x, y1: y, x2: x, y2: y });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSize) return;
    const { x, y } = mapPointerToImage(canvas, e.clientX, e.clientY, imageSize.w, imageSize.h);

    if (dragRef.current) {
      const { hit, originX, originY, snapshot } = dragRef.current;
      setAnnotation(applyDrag(snapshot, hit, x, y, originX, originY));
      return;
    }

    if (!segmentDraft || !isSegmentTool(tool)) return;
    setSegmentDraft({ ...segmentDraft, x2: x, y2: y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSize) return;

    if (dragRef.current) {
      canvas.releasePointerCapture(e.pointerId);
      dragRef.current = null;
      return;
    }

    if (!segmentDraft || !isSegmentTool(tool)) return;
    canvas.releasePointerCapture(e.pointerId);
    const { x, y } = mapPointerToImage(canvas, e.clientX, e.clientY, imageSize.w, imageSize.h);
    commitSegment({ x1: segmentDraft.x1, y1: segmentDraft.y1, x2: x, y2: y });
  };

  const handleSave = async () => {
    const img = imageRef.current;
    const target = entry ?? lastEntryRef.current;
    if (!img || !imageSize || saving || !target) return;
    setSaving(true);
    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = imageSize.w;
      offscreen.height = imageSize.h;
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("canvas unsupported");
      ctx.drawImage(img, 0, 0, imageSize.w, imageSize.h);
      drawDevCaptureAnnotation(ctx, annotation, displayScaleRef.current);

      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        offscreen.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("png encode failed"));
              return;
            }
            void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
          },
          "image/png",
        );
      });

      await invoke("write_dev_capture_png", {
        path: target.path,
        bytes: Array.from(bytes),
      });
      onSaved(target.path);
    } catch (e) {
      console.error("[dev-captures] save failed", e);
      setSaving(false);
    }
  };

  const tools: { id: DevCaptureAnnotateTool; label: string }[] = [
    { id: "select", label: "SELECT" },
    { id: "line", label: "LINE" },
    { id: "arrow", label: "ARROW" },
    { id: "box", label: "BOX" },
    { id: "text", label: "TEXT" },
    { id: "pin", label: "PIN" },
  ];

  return createPortal(
    <AnimatePresence>
      {entry ? (
    <motion.div
      key={entry.path}
      className="fixed inset-0 z-[400] flex flex-col bg-[#110D0B] pt-[var(--rf-titlebar-h)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={motionDuration(reduceMotion, overlayFadeTransition)}
    >
      <div
        className="fixed top-0 inset-x-0 z-[401] flex h-[var(--rf-titlebar-h)] items-center gap-2 bg-[#110D0B] pl-5"
        style={{ paddingRight: WINDOW_CONTROLS_RESERVE_PX + 20 }}
      >
        <div
          className="absolute inset-0"
          style={{ paddingRight: WINDOW_CONTROLS_RESERVE_PX }}
          data-tauri-drag-region
        />
        <div
          className="relative z-10 w-[min(34%,20rem)] shrink-0 min-w-0"
          style={noDragStyle}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            Dev captures
          </p>
          <button
            type="button"
            onClick={() => void copyFilename()}
            className="block min-w-0 max-w-full text-left"
          >
            <div className="h-5 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {copiedName ? (
                  <motion.span
                    key="copied-toast"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-1 text-sm font-medium leading-5 text-[color:var(--accent)]"
                  >
                    <Check size={14} strokeWidth={2.5} className="shrink-0" />
                    copied
                  </motion.span>
                ) : (
                  <motion.span
                    key="filename"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="block truncate text-sm font-medium leading-5 text-stone-200 hover:text-stone-50"
                  >
                    {entry.name}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </button>
        </div>
        <div className="relative z-10 min-w-0 flex-1" data-tauri-drag-region />
        <div
          className="relative z-10 flex shrink-0 items-center gap-1.5"
          style={noDragStyle}
        >
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTool(t.id);
                setSegmentDraft(null);
                setTextDraft(null);
                dragRef.current = null;
              }}
              className={`${TOOL_BUTTON} ${tool === t.id ? TOOL_ACTIVE : TOOL_IDLE}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="fixed top-0 right-0 z-[405] h-[var(--rf-titlebar-h)] bg-[#110D0B] pointer-events-auto"
        style={{ width: WINDOW_CONTROLS_RESERVE_PX }}
        aria-hidden
      />

      <div
        ref={viewportRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
      >
        <div ref={canvasHostRef} className="relative shrink-0">
          <canvas
            ref={canvasRef}
            className={`block touch-none ${
              tool === "select" ? "cursor-default" : "cursor-crosshair"
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {textDraft ? (
            <input
              ref={textInputRef}
              type="text"
              value={textDraft.value}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              onBlur={() => commitTextDraft()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTextDraft();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTextDraft(null);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-20 min-w-[8rem] max-w-[min(24rem,50vw)] border border-[color:var(--accent)] bg-[#1D1613]/95 px-2 py-1 text-sm text-stone-100 outline-none"
              style={{
                left: textDraft.left,
                top: textDraft.top,
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-3 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 hover:text-stone-200 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !imageSize}
          className="px-5 py-2.5 rounded-[12px] bg-[color:var(--accent)] text-[10px] font-black uppercase tracking-[0.2em] text-[#1D1613] disabled:opacity-40 active:scale-[0.98]"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
