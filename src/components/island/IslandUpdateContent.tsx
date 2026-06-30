import { Icon } from "@iconify/react";
import Markdown from "markdown-to-jsx";

import { IslandUpdateVersionPicker } from "./IslandUpdateVersionPicker";

/** Same icon family as {@link UpdaterFullWindowUpdate} prep/download states. */
const UPDATE_AVAILABLE_ICON = "line-md:downloading-loop";

const TEASER_MARKDOWN_OPTIONS = {
  overrides: {
    h1: { props: { className: "mb-1 text-[11px] font-bold text-stone-200" } },
    h2: { props: { className: "mb-1 text-[11px] font-bold text-stone-200" } },
    h3: { props: { className: "mb-0.5 text-[10px] font-semibold text-stone-300" } },
    p: { props: { className: "mb-1 last:mb-0 text-[11px] leading-snug text-stone-400" } },
    ul: {
      props: {
        className: "mb-0 list-none space-y-1.5 pl-0 last:mb-0 text-[11px] text-stone-400",
      },
    },
    ol: {
      props: {
        className: "mb-0 list-decimal space-y-1 pl-3.5 last:mb-0 text-[11px] leading-snug text-stone-400",
      },
    },
    li: {
      props: {
        className:
          "relative pl-3.5 leading-snug before:absolute before:left-0 before:top-[0.45em] before:h-1 before:w-1 before:rounded-full before:bg-[color:var(--accent)]/70 before:content-['']",
      },
    },
    strong: { props: { className: "font-semibold text-stone-200" } },
  },
} as const;

const ISLAND_UPDATE_CHIP =
  "h-8 shrink-0 rounded-[10px] border border-white/10 bg-[#271C18]/95 text-[10px] font-black uppercase tracking-widest text-[#EDD79C]/90 shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-[transform,background-color,filter] duration-150 hover:brightness-110 active:scale-[0.99]";

export function islandUpdateCompactLabel(version: string): string {
  const v = version.trim() || "…";
  return `new build · v${v}`;
}

export function islandUpdateCollapsedWidth(version: string): number {
  const label = islandUpdateCompactLabel(version);
  return Math.min(200, Math.max(132, Math.ceil(label.length * 6) + 28));
}

export function islandUpdateNotesForDisplay(notes: string, version: string): string {
  let trimmed = notes.trim();
  if (!trimmed) return "";

  const escaped = version.replace(/\./g, "\\.");
  trimmed = trimmed
    .replace(new RegExp(`^#+\\s*RuForge\\s*${escaped}\\s*\\n+`, "i"), "")
    .replace(new RegExp(`^#+\\s*RuForge\\s*${escaped}\\s*$`, "im"), "")
    .trim();

  return trimmed;
}

export type IslandUpdateContentProps = {
  version: string;
  notes: string;
  compact: boolean;
  onInstallRestart: () => void;
  installableVersion: string;
  versionOptions: readonly string[];
  selectedVersion: string;
  onSelectVersion: (version: string) => void;
  onHideUntilRestart: () => void;
};

export function IslandUpdateCompactContent({ version }: Pick<IslandUpdateContentProps, "version">) {
  const label = islandUpdateCompactLabel(version);
  return (
    <div
      className="pointer-events-none flex h-full w-full items-center justify-center gap-1.5 px-3"
      aria-label={`Update available, ${label}`}
    >
      <Icon
        icon={UPDATE_AVAILABLE_ICON}
        width={14}
        height={14}
        className="shrink-0 text-[color:var(--accent)]"
        aria-hidden
      />
      <span className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-[#EDD79C]/90 tabular-nums">
        {label}
      </span>
    </div>
  );
}

export function IslandUpdateExpandedContent({
  installableVersion,
  versionOptions,
  selectedVersion,
  onSelectVersion,
  onHideUntilRestart,
  onInstallRestart,
  notes,
}: Omit<IslandUpdateContentProps, "compact" | "version"> & { notes: string }) {
  const displayNotes = islandUpdateNotesForDisplay(notes, selectedVersion);
  const hasNotes = displayNotes.length > 0;
  const canInstall = selectedVersion === installableVersion;

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex flex-col px-4 pt-3 pb-0"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 flex-col items-center gap-1.5 text-center">
        <Icon
          icon={UPDATE_AVAILABLE_ICON}
          width={30}
          height={30}
          className="text-[color:var(--accent)]"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-stone-500">
            Update available
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-tight tracking-tight text-stone-100 tabular-nums">
            RuForge {selectedVersion}
          </p>
        </div>
      </div>

      {hasNotes ? (
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-0.5 rf-scrollbar">
          <Markdown options={TEASER_MARKDOWN_OPTIONS}>{displayNotes}</Markdown>
        </div>
      ) : (
        <div className="min-h-0 flex-1" aria-hidden />
      )}

      <div className="mt-2 shrink-0 -mx-4">
        <div className="flex items-center gap-2 px-4 pb-2">
          <IslandUpdateVersionPicker
            versions={versionOptions}
            value={selectedVersion}
            onChange={onSelectVersion}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onHideUntilRestart();
            }}
            className={`ml-auto px-2.5 ${ISLAND_UPDATE_CHIP}`}
            aria-label="Hide update until restart"
          >
            Hide
          </button>
        </div>
        <button
          type="button"
          disabled={!canInstall}
          title={
            canInstall
              ? undefined
              : `Only v${installableVersion} can install in-app. Pick that version or use GitHub Releases.`
          }
          onClick={(e) => {
            e.stopPropagation();
            if (!canInstall) return;
            onInstallRestart();
          }}
          className={`flex h-10 w-full items-center justify-center rounded-b-[40px] border-t border-white/10 bg-[#271C18] text-[10px] font-black uppercase tracking-[0.18em] text-[#EDD79C] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[transform,opacity,filter] duration-150 hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45`}
        >
          Install &amp; Restart
        </button>
      </div>
    </div>
  );
}
