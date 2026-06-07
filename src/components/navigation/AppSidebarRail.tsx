import logo from "@/assets/neotubeIcon.png";
import { SIDEBAR_RAIL_PX } from "@/lib/sidebarLayout";
import { cn } from "@/lib/utils";
import { RadialNavIcon, type RadialNavIconId } from "@/components/navigation/RadialNavIcon";
import { StorageGlyph } from "@/components/navigation/StorageGlyph";
import { YouTubeProfileChip } from "@/components/music/YouTubeProfileChip";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { ActiveTab } from "@/store/types";
import type { NavMode } from "@/store/types";

type RailItem = {
  id: ActiveTab;
  iconId: RadialNavIconId;
  label: string;
};

const RAIL_ITEMS: RailItem[] = [
  { id: "downloader", iconId: "download", label: "Download" },
  { id: "media", iconId: "videos", label: "Videos" },
  { id: "explorer", iconId: "explorer", label: "YouTube" },
  { id: "settings", iconId: "settings", label: "System" },
];

type AppSidebarRailProps = {
  activeTab: ActiveTab;
  navMode: NavMode;
  disabled?: boolean;
  onSelectTab: (tab: ActiveTab) => void;
};

export function AppSidebarRail({
  activeTab,
  navMode,
  disabled,
  onSelectTab,
}: AppSidebarRailProps) {
  const youtubeProfile = useRuforgeStore((s) => s.youtubeExplorerProfile);
  const openProfilePage = useRuforgeStore((s) => s.openProfilePage);

  return (
    <div
      className={cn(
        "rf-sidebar relative z-40 flex shrink-0 flex-col overflow-visible",
        disabled && "pointer-events-none opacity-30 grayscale-[50%]",
      )}
      style={{ width: SIDEBAR_RAIL_PX }}
      data-nav-mode={navMode}
    >
      <div
        className="flex h-14 shrink-0 cursor-default items-center justify-center"
        data-tauri-drag-region
      >
        <img src={logo} className="h-8 w-8 rounded-lg object-cover" alt="RuForge" />
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1 px-1 py-2">
        {RAIL_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group/rail relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-150",
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
              <span className="rf-rail-tooltip absolute left-[calc(100%+10px)] top-1/2 z-[280] -translate-y-1/2 opacity-0 group-hover/rail:opacity-100">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-3 pb-4">
        {navMode !== "music" && youtubeProfile && (
          <YouTubeProfileChip
            size="sm"
            onClick={openProfilePage}
            className="opacity-80 hover:opacity-100 transition-opacity"
          />
        )}
        <StorageGlyph />
      </div>
    </div>
  );
}
