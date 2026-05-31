import { createPortal } from "react-dom";
import { RadialMenu } from "@/components/ui/radial-menu";
import { radialMenuItemsForMode, radialNavActionForItem } from "@/lib/radialNavItems";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { ActiveTab } from "@/store/types";

type RadialNavOverlayProps = {
  open: boolean;
  anchor: { x: number; y: number };
  onNavigate: (tab: ActiveTab) => void;
};

export function RadialNavOverlay({ open, anchor, onNavigate }: RadialNavOverlayProps) {
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

  return createPortal(
    <div
      className="fixed inset-0 z-[260] pointer-events-none"
      style={{ display: open ? undefined : "none" }}
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
          open={open}
          navMode={navMode}
          menuItems={menuItems}
          onCenterClick={() => cycleNavMode()}
          onSelect={handleSelect}
        />
      </div>
    </div>,
    document.body,
  );
}
