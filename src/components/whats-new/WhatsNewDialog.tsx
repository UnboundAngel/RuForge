import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ExternalLink, Play } from "lucide-react";
import { parseWhatsNew, type WhatsNewTile } from "@/lib/whatsNew";
import { PageSwap, type SwapDirection } from "../motion/PageSwap";
import { SettingsModalShell } from "../settings/SettingsModalShell";
import { UpdaterReleaseNotesMarkdown } from "../UpdaterLayers";
import { AREAS, FALLBACK_AREA } from "./areas";
import { WhatsNewPreview } from "./WhatsNewPreview";

function Row({
  tile,
  onGo,
  onPreview,
}: {
  tile: WhatsNewTile;
  onGo: (go: () => void) => void;
  onPreview: (key: string) => void;
}) {
  const { Icon, go, cta, clip } = AREAS[tile.key] ?? FALLBACK_AREA;
  const body = (
    <>
      <Icon size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-[color:var(--accent)]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-stone-50">
          {tile.label}
          {clip ? (
            <Play
              size={11}
              strokeWidth={2.5}
              fill="currentColor"
              className="text-stone-600 transition-colors duration-150 group-hover:text-[color:var(--accent)]"
              aria-hidden
            />
          ) : go ? (
            <ArrowUpRight
              size={13}
              strokeWidth={2.5}
              className="text-stone-600 transition-colors duration-150 group-hover:text-[color:var(--accent)]"
              aria-hidden
            />
          ) : null}
        </span>
        <span className="mt-1 block text-[12px] leading-relaxed text-stone-400">{tile.text}</span>
      </span>
    </>
  );
  const shell = "flex items-start gap-3 rounded-[var(--radius-input)] bg-[color:var(--rf-field)] p-3.5 text-left";
  if (!go && !clip) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      data-tooltip={clip ? "Watch preview" : cta}
      onClick={() => (clip ? onPreview(tile.key) : go && onGo(go))}
      className={`group ${shell} transition-colors duration-150 hover:bg-[color:var(--rf-field-raised)] focus-visible:bg-[color:var(--rf-field-raised)] focus-visible:outline-none`}
    >
      {body}
    </button>
  );
}

const FADE_TOP = "[mask-image:linear-gradient(to_bottom,transparent_0,black_28px)]";
const FADE_BOTTOM = "[mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]";
const FADE_BOTH = "[mask-image:linear-gradient(to_bottom,transparent_0,black_28px,black_calc(100%-28px),transparent)]";

/** Own scroller so the edge fades appear only on the sides that still have hidden content. */
function FadeScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);
  const fade = edges.top && edges.bottom ? FADE_BOTH : edges.top ? FADE_TOP : edges.bottom ? FADE_BOTTOM : "";
  return (
    <div ref={ref} onScroll={measure} className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 rf-scrollbar ${fade}`}>
      <div>{children}</div>
    </div>
  );
}

type Props = {
  open: boolean;
  version: string;
  notes: string;
  onDismiss: () => void;
  onOpenChangelog: () => void;
};

/** In-app release notes: one tile per area that jumps to it, fixes folded into one line. */
export function WhatsNewDialog({ open, version, notes, onDismiss, onOpenChangelog }: Props) {
  const content = useMemo(() => parseWhatsNew(notes), [notes]);
  const { headline, tiles, extras } = content;
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<SwapDirection>("forward");
  const gridRef = useRef<HTMLDivElement>(null);
  const gridHeight = useRef(0);
  const go = (fn: () => void) => {
    onDismiss();
    fn();
  };
  const openPreview = (key: string) => {
    gridHeight.current = gridRef.current?.offsetHeight ?? 0;
    setDirection("forward");
    setPreviewKey(key);
  };
  const closePreview = useCallback(() => {
    setDirection("back");
    setPreviewKey(null);
  }, []);

  useEffect(() => {
    if (!open) setPreviewKey(null);
  }, [open]);

  // Escape steps back to the grid first; the dialog itself closes through its backdrop, X and Got it.
  useEffect(() => {
    if (!open || previewKey == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closePreview();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, previewKey, closePreview]);

  const previewTile = previewKey != null ? tiles.find((t) => t.key === previewKey) : undefined;

  return (
    <SettingsModalShell
      open={open}
      onClose={onDismiss}
      titleId="ruforge-whats-new-title"
      title={headline ?? (version ? `What's new in ${version}` : "What's New")}
      titleClassName="rf-settings-page-title text-[1.5rem] font-normal leading-tight"
      eyebrow={null}
      bodyClassName="flex flex-col overflow-hidden !p-0"
      maxWidthClass="max-w-2xl"
      footerClassName="justify-between !px-6 !pb-4 !pt-1"
      footer={
        <>
          <span className="flex items-center gap-3 text-[12px] text-stone-500">
            <button
              type="button"
              onClick={onOpenChangelog}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-200"
            >
              Full changelog
              <ExternalLink size={11} strokeWidth={2.25} aria-hidden />
            </button>
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-[var(--radius-input)] bg-[color:var(--accent)] px-4 py-1.5 text-[11px] font-bold text-[color:var(--rf-on-accent)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
          >
            Got it
          </button>
        </>
      }
    >
      <FadeScroll>
        <PageSwap swapKey={previewTile ? `preview-${previewTile.key}` : "grid"} direction={direction}>
        {previewTile ? (
          <WhatsNewPreview
            tile={previewTile}
            area={AREAS[previewTile.key] ?? FALLBACK_AREA}
            onBack={closePreview}
            onGo={go}
            minHeight={gridHeight.current}
          />
        ) : tiles.length > 0 ? (
          <div ref={gridRef}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {tiles.map((tile, i) => (
                <Row key={tile.key + i} tile={tile} onGo={go} onPreview={openPreview} />
              ))}
            </div>
            {extras.length > 0 ? (
              <p className="mt-4 px-1 text-[11px] leading-relaxed text-stone-600">
                <span className="text-stone-600">Plus </span>
                {extras.map((e) => e.charAt(0).toLowerCase() + e.slice(1)).join(" ")}
              </p>
            ) : null}
          </div>
        ) : notes.trim() ? (
          <UpdaterReleaseNotesMarkdown markdown={notes.trim()} className="px-2 text-[12px] leading-relaxed text-stone-400" />
        ) : (
          <p className="px-2 text-[12px] leading-relaxed text-stone-500">
            RuForge is up to date. See the full changelog for everything in this release.
          </p>
        )}
        </PageSwap>
      </FadeScroll>
    </SettingsModalShell>
  );
}
