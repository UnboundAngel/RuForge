import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@iconify/react";
import { RuForgeCaptureTrigger } from "@/components/dev-captures/RuForgeCaptureTrigger";
import { Home, Library, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

import type { MusicView } from "@/store/types";

export type { MusicView };

type NavItem = { id: MusicView; label: string; icon: ReactNode; ytm?: boolean };

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: <Home size={19} /> },
  {
    id: "explore",
    label: "Explore",
    ytm: true,
    icon: <Icon icon="material-symbols:youtube-music" width={19} height={19} aria-hidden />,
  },
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

const NAV_SHORTCUT_LABELS: Record<MusicView, string> = {
  home: "Alt+1",
  explore: "Alt+2",
  library: "Alt+3",
};

type Props = {
  activeView: MusicView;
  captureScreenLabel: string;
  onSelect: (view: MusicView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  shellFrame?: boolean;
  /**
   * Stacked left column: nav gets top-left radius only; MusicNavBackCell below owns bottom-left.
   */
  sideColumn?: boolean;
  /** Nav sits inside the shared left L-column shell (no own fill/radius). */
  inLeftStack?: boolean;
  panelSlot?: ReactNode;
  /** Rendered above Back button (e.g. minimized download dock chip). */
  footerSlot?: ReactNode;
};

export function MusicNav({
  activeView,
  captureScreenLabel,
  onSelect,
  collapsed,
  onToggleCollapse,
  shellFrame = false,
  sideColumn = false,
  inLeftStack = false,
  panelSlot,
  footerSlot,
}: Props) {
  const baseStyle = shellFrame ? musicFrameStyle : musicContentStyle;
  const borderRadius = inLeftStack
    ? 0
    : sideColumn
      ? "var(--music-panel-radius) 0 0 0"
      : baseStyle.borderRadius;
  const collapsedPill = collapsed && inLeftStack;
  const navStyle: CSSProperties = collapsedPill
    ? {
        width: "var(--music-sidebar-collapsed-width)",
        background: shellFrame ? "var(--music-bg)" : "var(--music-surface)",
        borderRadius: "var(--music-panel-radius)",
      }
    : inLeftStack
      ? { width: "100%", background: "transparent", borderRadius: 0 }
      : {
          width: collapsed ? "var(--music-sidebar-collapsed-width)" : "var(--music-sidebar-width)",
          ...baseStyle,
          borderRadius,
        };
  return (
    <nav
      className={cn(
        "flex flex-col transition-[width] duration-200 ease-out",
        collapsedPill ? "h-auto shrink-0 overflow-visible" : "h-full overflow-hidden",
      )}
      style={navStyle}
    >
      <div
        className={cn(
          "relative z-[100] pointer-events-auto flex items-center shrink-0 h-12",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {collapsed ? (
          <span
            className="rf-music-tooltip-anchor inline-flex"
            data-tooltip="RuForge Music"
          >
            <RuForgeCaptureTrigger
              screenLabel={captureScreenLabel}
              imgClassName="h-7 w-7 rounded-md object-cover"
            />
          </span>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <RuForgeCaptureTrigger
                screenLabel={captureScreenLabel}
                imgClassName="h-6 w-6 rounded-md object-cover"
              />
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
              className="rf-music-tooltip-anchor shrink-0 w-7 h-7 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: "var(--music-text-secondary)" }}
              aria-label="Collapse navigation (Ctrl+B)"
              data-tooltip="Collapse navigation (Ctrl+B)"
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
            className="rf-music-tooltip-anchor w-8 h-8 flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Expand navigation (Ctrl+B)"
            data-tooltip="Expand navigation (Ctrl+B)"
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
              data-active={active ? "true" : "false"}
              data-ytm={item.ytm ? "true" : undefined}
              className={cn(
                "rf-music-nav-item relative flex items-center text-sm font-medium text-left",
                item.ytm && "rf-music-nav-item-ytm",
                collapsed
                  ? "rf-music-tooltip-anchor justify-center w-10 h-10 p-0"
                  : "gap-3 px-3 py-2.5 w-full",
              )}
              aria-label={collapsed ? `${item.label} (${NAV_SHORTCUT_LABELS[item.id]})` : undefined}
              data-tooltip={collapsed ? `${item.label} (${NAV_SHORTCUT_LABELS[item.id]})` : undefined}
            >
              {active && !collapsed && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                  style={{ background: "var(--music-accent)" }}
                />
              )}
              <span data-nav-icon className="inline-flex w-5 h-5 items-center justify-center shrink-0">
                {item.icon}
              </span>
              {!collapsed && item.label}
            </button>
          );
        })}
      </div>

      {panelSlot && !collapsedPill ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{panelSlot}</div>
      ) : !collapsedPill ? (
        <div className="flex-1 min-h-0" />
      ) : null}

      {footerSlot ? (
        <div
          className={cn(
            "shrink-0 pb-2",
            !collapsedPill && "mt-auto",
            collapsed ? "px-1.5 flex justify-center" : "px-2 w-full",
          )}
        >
          {footerSlot}
        </div>
      ) : null}
    </nav>
  );
}
