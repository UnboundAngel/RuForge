import { Icon } from "@iconify/react";
import Markdown from "markdown-to-jsx";

const TEASER_MARKDOWN_OPTIONS = {
  overrides: {
    h1: { props: { className: "mb-0.5 text-[11px] font-semibold text-zinc-300" } },
    h2: { props: { className: "mb-0.5 text-[11px] font-semibold text-zinc-300" } },
    h3: { props: { className: "mb-0.5 text-[10px] font-medium text-zinc-400" } },
    p: { props: { className: "mb-1 last:mb-0 text-[11px] leading-snug text-zinc-400" } },
    ul: {
      props: {
        className: "mb-0 list-none space-y-1.5 pl-0 last:mb-0 text-[11px] text-zinc-400",
      },
    },
    ol: {
      props: {
        className: "mb-0 list-decimal space-y-1 pl-3.5 last:mb-0 text-[11px] leading-snug text-zinc-400",
      },
    },
    li: {
      props: {
        className:
          "relative pl-3.5 leading-snug before:absolute before:left-0 before:top-[0.45em] before:h-1 before:w-1 before:rounded-full before:bg-[color:var(--accent)]/70 before:content-['']",
      },
    },
    strong: { props: { className: "font-semibold text-zinc-300" } },
  },
} as const;

const EMPTY_NOTES_FALLBACK = "Install and restart to get the latest build.";

export function islandUpdateCollapsedWidth(version: string): number {
  const label = `update ${version.trim() || "…"}`;
  return Math.min(240, Math.max(128, Math.ceil(label.length * 6) + 24));
}

export type IslandUpdateContentProps = {
  version: string;
  notes: string;
  compact: boolean;
  onInstallRestart: () => void;
};

export function IslandUpdateCompactContent({ version }: Pick<IslandUpdateContentProps, "version">) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center px-3"
      aria-label={`Update available, version ${version}`}
    >
      <span className="truncate text-[11px] font-medium leading-none lowercase tabular-nums text-zinc-300">
        update {version}
      </span>
    </div>
  );
}

export function IslandUpdateExpandedContent({
  version,
  notes,
  onInstallRestart,
}: Omit<IslandUpdateContentProps, "compact">) {
  const notesTrim = notes.trim();
  const hasNotes = notesTrim.length > 0;

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex flex-col justify-between p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-3 px-0.5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center">
          <Icon icon="tabler:download" width={28} height={28} className="text-zinc-300" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-[12px] uppercase tracking-wide text-zinc-500">Update available</p>
          <p className="mt-0.5 truncate text-[16px] font-medium leading-tight text-white tabular-nums">
            RuForge {version}
          </p>
        </div>
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto px-0.5 rf-scrollbar ${
          hasNotes ? "mt-2" : "mt-2 flex items-center justify-center"
        }`}
      >
        {hasNotes ? (
          <Markdown options={TEASER_MARKDOWN_OPTIONS}>{notesTrim}</Markdown>
        ) : (
          <p className="text-center text-[11px] leading-snug text-zinc-400">{EMPTY_NOTES_FALLBACK}</p>
        )}
      </div>

      <div className="mt-auto shrink-0 px-0.5 pt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInstallRestart();
          }}
          className="flex h-9 w-full items-center justify-center rounded-[12px] bg-[color:var(--accent)] text-[11px] font-semibold uppercase tracking-wide text-[#1D1613] transition-[transform,opacity] duration-150 hover:brightness-105 active:scale-[0.97]"
        >
          Install &amp; Restart
        </button>
      </div>
    </div>
  );
}
