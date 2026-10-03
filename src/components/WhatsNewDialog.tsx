import { useMemo } from "react";
import {
  ArrowUpRight,
  Bell,
  BellRing,
  Download,
  ExternalLink,
  LayoutGrid,
  Music,
  PanelTop,
  Play,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { parseWhatsNew, type WhatsNewTile } from "@/lib/whatsNew";
import { setNotificationPopoverOpen, setNotificationTab } from "@/notifications/notificationCenterStore";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalShell,
} from "./settings/SettingsModalShell";
import { UpdaterReleaseNotesMarkdown } from "./UpdaterLayers";

type Area = { Icon: LucideIcon; go?: () => void; cta?: string };

function toLibrary(): void {
  const s = useRuforgeStore.getState();
  s.setNavMode("default");
  s.setActiveTab("media");
}

/** Keyed by the lowercased `**Area**` label in release notes. Unknown areas get a plain tile. */
const AREAS: Record<string, Area> = {
  library: { Icon: LayoutGrid, go: toLibrary, cta: "Open library" },
  follow: {
    Icon: BellRing,
    go: () => {
      setNotificationTab("channels");
      setNotificationPopoverOpen(true);
    },
    cta: "Manage channels",
  },
  notifications: {
    Icon: Bell,
    go: () => {
      setNotificationTab("feed");
      setNotificationPopoverOpen(true);
    },
    cta: "Open notifications",
  },
  music: { Icon: Music, go: () => useRuforgeStore.getState().setNavMode("music"), cta: "Open Music" },
  downloads: {
    Icon: Download,
    go: () => {
      useRuforgeStore.getState().setNavMode("default");
      useRuforgeStore.getState().openDownloader();
    },
    cta: "Open downloader",
  },
  island: { Icon: PanelTop },
  playback: { Icon: Play },
  player: { Icon: Play },
  settings: { Icon: Settings2, go: () => useRuforgeStore.getState().openSettings(), cta: "Open Settings" },
};

const FALLBACK: Area = { Icon: Sparkles };

function Tile({ tile, wide, onGo }: { tile: WhatsNewTile; wide: boolean; onGo: (go: () => void) => void }) {
  const { Icon, go, cta } = AREAS[tile.key] ?? FALLBACK;
  const body = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]">
        <Icon size={16} strokeWidth={2.25} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-100">
          {tile.label}
          {go ? (
            <ArrowUpRight
              size={13}
              strokeWidth={2.5}
              className="text-stone-600 transition-[color,transform] duration-150 group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-[color:var(--accent)]"
              aria-hidden
            />
          ) : null}
        </span>
        <span className="mt-1 block text-[12px] leading-relaxed text-stone-400">{tile.text}</span>
      </span>
    </>
  );
  const shell = `flex items-start gap-3 rounded-[var(--radius-input)] bg-[#261d18] p-3.5 text-left ${wide ? "col-span-2" : ""}`;
  if (!go) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      data-tooltip={cta}
      onClick={() => onGo(go)}
      className={`group ${shell} transition-[background-color,transform] duration-150 hover:bg-[#2e231d] active:scale-[0.99] focus-visible:bg-[#2e231d] focus-visible:outline-none`}
    >
      {body}
    </button>
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
  const go = (fn: () => void) => {
    onDismiss();
    fn();
  };

  return (
    <SettingsModalShell
      open={open}
      onClose={onDismiss}
      titleId="ruforge-whats-new-title"
      title={headline ?? "What's New"}
      eyebrow={version ? `What's new in RuForge ${version}` : "What's new"}
      bezel
      maxWidthClass="max-w-2xl"
      footerClassName="justify-between"
      footer={
        <>
          <SettingsModalBtnSecondary onClick={onOpenChangelog} className="-ml-5 gap-2">
            <ExternalLink size={13} strokeWidth={2.5} aria-hidden />
            Full changelog
          </SettingsModalBtnSecondary>
          <SettingsModalBtnPrimary onClick={onDismiss}>Got it</SettingsModalBtnPrimary>
        </>
      }
    >
      {tiles.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {tiles.map((tile, i) => (
              <Tile
                key={tile.key + i}
                tile={tile}
                wide={tiles.length % 2 === 1 && i === tiles.length - 1}
                onGo={go}
              />
            ))}
          </div>
          {extras.length > 0 ? (
            <p className="mt-4 px-1 text-[12px] leading-relaxed text-stone-500">
              <span className="font-semibold text-stone-300">Plus </span>
              {extras.map((e) => e.charAt(0).toLowerCase() + e.slice(1)).join(" ")}
            </p>
          ) : null}
        </>
      ) : notes.trim() ? (
        <UpdaterReleaseNotesMarkdown markdown={notes.trim()} className="text-[12px] leading-relaxed text-stone-400" />
      ) : (
        <p className="text-[12px] leading-relaxed text-stone-500">
          RuForge is up to date. See the full changelog for everything in this release.
        </p>
      )}
    </SettingsModalShell>
  );
}
