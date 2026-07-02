import { Icon } from "@iconify/react";
import Markdown from "markdown-to-jsx";

/** Same icon family as {@link UpdaterFullWindowUpdate} prep/download states. */
const UPDATE_AVAILABLE_ICON = "line-md:downloading-loop";

const ISLAND_UPDATE_NOTES_MARKDOWN_OPTIONS = {
  overrides: {
    h1: { props: { className: "mb-1 text-[10px] font-bold text-stone-300" } },
    h2: { props: { className: "mb-1 text-[10px] font-bold text-stone-300" } },
    h3: { props: { className: "mb-0.5 text-[10px] font-semibold text-stone-400" } },
    p: { props: { className: "mb-1 last:mb-0 text-[10px] leading-snug text-stone-400" } },
    ul: {
      props: {
        className: "mb-0 list-none space-y-1 pl-0 last:mb-0 text-[10px] text-stone-400",
      },
    },
    ol: {
      props: {
        className: "mb-0 list-decimal space-y-1 pl-3 last:mb-0 text-[10px] leading-snug text-stone-400",
      },
    },
    li: {
      props: {
        className:
          "relative pl-3 leading-snug before:absolute before:left-0 before:top-[0.42em] before:h-1 before:w-1 before:rounded-full before:bg-[color:var(--accent)] before:content-['']",
      },
    },
    strong: { props: { className: "font-semibold text-stone-300" } },
  },
} as const;

const FALLBACK_NOTES = [
  "General stability improvements",
  "Bug fixes and performance enhancements",
  "Updated core dependencies",
] as const;

export const ISLAND_UPDATE_EXPANDED_DIMENSIONS = {
  width: 350,
  height: 232,
  borderRadius: 24,
} as const;

export function islandUpdateCollapsedWidth(): number {
  return 200;
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

export function IslandUpdateCompactContent() {
  return (
    <div
      className="pointer-events-none flex h-full w-full items-center justify-center gap-1.5 px-4"
      aria-label="Update available"
    >
      <Icon
        icon={UPDATE_AVAILABLE_ICON}
        width={13}
        height={13}
        className="shrink-0 text-[color:var(--accent)]"
        aria-hidden
      />
      <span className="shrink-0 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.08em] text-[#EDD79C]/90">
        Update available
      </span>
    </div>
  );
}

function IslandUpdateNotesPanel({ notes }: { notes: string }) {
  const hasNotes = notes.length > 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-[12px] border border-white/5 bg-white/[0.04] p-2.5 scrollbar-none">
      <p className="mb-1.5 text-[10px] font-semibold text-stone-400">What&apos;s included:</p>
      {hasNotes ? (
        <Markdown options={ISLAND_UPDATE_NOTES_MARKDOWN_OPTIONS}>{notes}</Markdown>
      ) : (
        <ul className="space-y-1 text-[10px] leading-snug text-stone-400">
          {FALLBACK_NOTES.map((line) => (
            <li
              key={line}
              className="relative pl-3 before:absolute before:left-0 before:top-[0.42em] before:h-1 before:w-1 before:rounded-full before:bg-[color:var(--accent)] before:content-['']"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IslandUpdateExpandedContent({
  installableVersion,
  selectedVersion,
  onHideUntilRestart,
  onInstallRestart,
  notes,
}: Omit<IslandUpdateContentProps, "compact" | "version" | "versionOptions" | "onSelectVersion"> & {
  notes: string;
}) {
  const displayNotes = islandUpdateNotesForDisplay(notes, selectedVersion);
  const canInstall = selectedVersion === installableVersion;

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex h-full min-h-0 flex-col p-3.5"
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex shrink-0 items-start gap-2.5">
        <Icon
          icon={UPDATE_AVAILABLE_ICON}
          width={18}
          height={18}
          className="mt-0.5 shrink-0 text-[color:var(--accent)]"
          aria-hidden
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[13px] font-bold leading-tight text-stone-100">RuForge</p>
          <p className="truncate text-[11px] leading-tight text-stone-500 tabular-nums">
            Version {selectedVersion}
          </p>
        </div>
      </header>

      <h2 className="mt-2 shrink-0 text-[14px] font-bold leading-tight text-stone-100">
        A new update is ready
      </h2>

      <div className="mt-2 min-h-0 flex flex-1 flex-col">
        <IslandUpdateNotesPanel notes={displayNotes} />
      </div>

      <footer className="mt-2 flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onHideUntilRestart();
          }}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 px-4 text-[11px] font-semibold text-stone-200 transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99]"
        >
          Later
        </button>
        <button
          type="button"
          disabled={!canInstall}
          title={
            canInstall
              ? undefined
              : `Only v${installableVersion} can install in-app. Use GitHub Releases for other versions.`
          }
          onClick={(e) => {
            e.stopPropagation();
            if (!canInstall) return;
            onInstallRestart();
          }}
          className="inline-flex h-9 min-w-0 flex-1 items-center justify-center rounded-[10px] bg-[color:var(--accent)] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#1D1613] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Install and restart"
        >
          Install &amp; Restart
        </button>
      </footer>
    </div>
  );
}
