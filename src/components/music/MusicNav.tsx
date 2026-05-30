import type { CSSProperties } from "react";
import logo from "@/assets/neotubeIcon.png";
import { Home, Compass, Library, ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type MusicView = "home" | "explore" | "library";

type NavItem = { id: MusicView; label: string; icon: React.ReactNode };

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: <Home size={19} /> },
  { id: "explore", label: "Explore", icon: <Compass size={19} /> },
  { id: "library", label: "Library", icon: <Library size={19} /> },
];

/** Black shell frame: flush with window edge and bottom bar. */
export const musicFrameStyle: CSSProperties = {
  background: "var(--music-bg)",
};

/** Gray inner content island. */
export const musicContentStyle: CSSProperties = {
  background: "var(--music-surface)",
  borderRadius: "var(--music-panel-radius)",
};

/** @deprecated use musicFrameStyle or musicContentStyle */
export const musicPanelStyle = musicContentStyle;

/** @deprecated use musicFrameStyle */
export const musicSidebarGlassStyle = musicFrameStyle;

type Props = {
  activeView: MusicView;
  onSelect: (view: MusicView) => void;
  onBack: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  shellFrame?: boolean;
};

export function MusicNav({ activeView, onSelect, onBack, collapsed, onToggleCollapse, shellFrame = false }: Props) {
  return (
    <nav
      className="flex flex-col h-full overflow-hidden transition-[width] duration-150"
      style={{
        width: collapsed ? "var(--music-sidebar-collapsed-width)" : "var(--music-sidebar-width)",
        ...(shellFrame ? musicFrameStyle : musicContentStyle),
      }}
    >
      <div
        className={cn(
          "flex items-center shrink-0 h-12",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
        data-tauri-drag-region={collapsed ? undefined : true}
      >
        {collapsed ? (
          <img src={logo} alt="RuForge" className="w-7 h-7 rounded-md object-cover shrink-0" />
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <img src={logo} alt="RuForge" className="w-6 h-6 rounded-md object-cover shrink-0" />
              <span
                className="font-semibold text-sm tracking-wide truncate"
                style={{ color: "var(--music-accent)" }}
              >
                RuForge Music
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="shrink-0 w-7 h-7 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: "var(--music-text-secondary)" }}
              aria-label="Collapse navigation"
            >
              <PanelLeftClose size={16} />
            </button>
          </>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center py-2 shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-8 h-8 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Expand navigation"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      <div className={cn("flex flex-col gap-0.5 py-2", collapsed ? "px-1.5 items-center" : "px-2")}>
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              title={collapsed ? item.label : undefined}
              data-active={active ? "true" : "false"}
              className={cn(
                "rf-music-nav-item relative flex items-center text-sm font-medium text-left",
                collapsed ? "justify-center w-10 h-10 p-0" : "gap-3 px-3 py-2.5 w-full",
              )}
            >
              {active && !collapsed && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                  style={{ background: "var(--music-accent)" }}
                />
              )}
              <span data-nav-icon>{item.icon}</span>
              {!collapsed && item.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0" />

      <div className={cn("shrink-0 pb-3", collapsed ? "px-1.5 flex justify-center" : "px-2")}>
        <button
          type="button"
          onClick={onBack}
          title={collapsed ? "Back to RuForge" : undefined}
          className={cn(
            "rf-music-back-btn flex items-center text-sm text-left",
            collapsed ? "justify-center w-10 h-10" : "gap-3 px-3 py-2.5 w-full",
          )}
        >
          <ChevronLeft size={16} />
          {!collapsed && "Back to RuForge"}
        </button>
      </div>
    </nav>
  );
}
