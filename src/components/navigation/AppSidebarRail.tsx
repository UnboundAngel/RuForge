import { RuForgeCaptureTrigger } from "@/components/dev-captures/RuForgeCaptureTrigger";
import { VideoDownloadRailButton } from "@/components/downloader/VideoDownloadDockChip";
import { StorageRailMeter } from "@/components/navigation/StorageRailMeter";
import { SIDEBAR_RAIL_W } from "@/lib/sidebarLayout";
import { cn } from "@/lib/utils";
import { RadialNavIcon, type RadialNavIconId } from "@/components/navigation/RadialNavIcon";
import type { ActiveTab } from "@/store/types";
import type { NavMode } from "@/store/types";
import { GAMES_RAIL_ITEM } from "@games";

type RailItem = {
  id: ActiveTab;
  iconId: RadialNavIconId;
  label: string;
};

const RAIL_ITEMS: RailItem[] = [
  { id: "downloader", iconId: "download", label: "Download" },
  { id: "media", iconId: "videos", label: "Videos" },
  { id: "explorer", iconId: "explorer", label: "YouTube" },
  ...(GAMES_RAIL_ITEM
    ? [{ id: GAMES_RAIL_ITEM.id, iconId: GAMES_RAIL_ITEM.iconId, label: GAMES_RAIL_ITEM.label }]
    : []),
  { id: "settings", iconId: "settings", label: "Settings" },
];

type AppSidebarRailProps = {
  activeTab: ActiveTab;
  settingsOpen?: boolean;
  downloaderOpen?: boolean;
  navMode: NavMode;
  captureScreenLabel: string;
  disabled?: boolean;
  onSelectTab: (tab: ActiveTab) => void;
};

export function AppSidebarRail({
  activeTab,
  settingsOpen = false,
  downloaderOpen = false,
  navMode,
  captureScreenLabel,
  disabled,
  onSelectTab,
}: AppSidebarRailProps) {
  return (
    <div
      className={cn(
        "rf-sidebar rf-autohide-chrome relative z-40 flex shrink-0 flex-col overflow-visible",
        disabled && "pointer-events-none opacity-30 grayscale-[50%]",
      )}
      style={{ width: SIDEBAR_RAIL_W }}
      data-nav-mode={navMode}
    >
      <div className="pointer-events-auto relative z-[100] flex h-[var(--rf-titlebar-h)] shrink-0 items-center justify-center">
        <RuForgeCaptureTrigger
          screenLabel={captureScreenLabel}
          imgClassName="h-[var(--rf-rail-logo)] w-[var(--rf-rail-logo)] rounded-lg object-cover"
        />
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1 py-2">
        {RAIL_ITEMS.map((item) => {
          if (item.id === "downloader") {
            return (
              <VideoDownloadRailButton
                key={item.id}
                overlayOpen={downloaderOpen}
                disabled={disabled}
                onToggle={() => onSelectTab("downloader")}
              />
            );
          }
          const isActive =
            item.id === "settings"
              ? settingsOpen
              : !settingsOpen && !downloaderOpen && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-rail-tab={item.id}
              data-tooltip={item.label}
              data-tooltip-side="right"
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group/rail relative flex h-[var(--rf-rail-btn)] w-[var(--rf-rail-btn)] items-center justify-center rounded-xl transition-colors duration-150",
                isActive
                  ? "text-[color:var(--accent)]"
                  : "text-stone-500 hover:text-stone-200",
              )}
            >
              {isActive ? (
                <span
                  className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[color:var(--accent)]"
                  aria-hidden
                />
              ) : null}
              <RadialNavIcon id={item.iconId} size={20} />
            </button>
          );
        })}
      </nav>

      <div className="flex shrink-0 justify-center pb-2">
        <StorageRailMeter />
      </div>
    </div>
  );
}
