import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RadialMenu } from "@/components/ui/radial-menu";
import type { RadialNavPresentation } from "@/hooks/useAltRadialNav";
import { radialMenuItemsForMode, radialNavActionForItem } from "@/lib/radialNavItems";
import {
  RADIAL_NAV_CENTER_EVENT,
  RADIAL_NAV_SELECT_EVENT,
  type RadialNavSelectPayload,
} from "@/lib/radialNavOverlayEvents";
import {
  hideRadialNavOverlay,
  pushRadialNavState,
  showRadialNavOverlay,
} from "@/lib/radialNavOverlayHost";
import { mainWindowPortalRoot } from "@/lib/mainWindowFrame";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { ActiveTab } from "@/store/types";

type RadialNavOverlayProps = {
  open: boolean;
  anchor: { x: number; y: number };
  presentation: RadialNavPresentation;
  onNavigate: (tab: ActiveTab) => void;
  onCenterClick?: () => void;
};

export function RadialNavOverlay({
  open,
  anchor,
  presentation,
  onNavigate,
  onCenterClick,
}: RadialNavOverlayProps) {
  const navMode = useRuforgeStore((s) => s.navMode);
  const cycleNavMode = useRuforgeStore((s) => s.cycleNavMode);
  const setNavMode = useRuforgeStore((s) => s.setNavMode);
  const setMusicView = useRuforgeStore((s) => s.setMusicView);

  const menuItems = radialMenuItemsForMode(navMode);

  const handleSelect = (item: { id: string }) => {
    const action = radialNavActionForItem(navMode, item.id);
    if (!action) return;
    if (action.kind === "tab") { onNavigate(action.tab); return; }
    if (action.kind === "music") { setMusicView(action.view); return; }
    setNavMode("default");
    onNavigate("settings");
  };

  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;
  const centerClickRef = useRef(onCenterClick ?? cycleNavMode);
  centerClickRef.current = onCenterClick ?? cycleNavMode;
  const navModeRef = useRef(navMode);
  navModeRef.current = navMode;

  useEffect(() => {
    const unlisteners = [
      listen<RadialNavSelectPayload>(RADIAL_NAV_SELECT_EVENT, (event) => {
        handleSelectRef.current({ id: event.payload.itemId });
      }),
      listen(RADIAL_NAV_CENTER_EVENT, () => centerClickRef.current()),
    ];
    return () => {
      for (const u of unlisteners) void u.then((off) => off());
    };
  }, []);

  useEffect(() => {
    if (presentation !== "overlay") return;
    if (open) void showRadialNavOverlay(anchor, navModeRef.current);
    else void hideRadialNavOverlay(navModeRef.current);
  }, [open, presentation, anchor]);

  useEffect(() => {
    if (presentation === "overlay" && open) pushRadialNavState({ open: true, navMode });
  }, [navMode, open, presentation]);

  return createPortal(
    <div
      className="fixed inset-0 z-[260] pointer-events-none"
      style={{ display: open && presentation === "dom" ? undefined : "none" }}
      role="dialog"
      aria-modal="false"
      aria-label="Quick navigation"
    >
      <div
        className="pointer-events-auto fixed"
        style={{
          left: anchor.x,
          top: anchor.y,
          transform: "translate(-50%, -50%)",
        }}
      >
        <RadialMenu
          open={open && presentation === "dom"}
          navMode={navMode}
          menuItems={menuItems}
          onCenterClick={onCenterClick ?? cycleNavMode}
          onSelect={handleSelect}
        />
      </div>
    </div>,
    mainWindowPortalRoot(),
  );
}
