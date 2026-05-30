import { createPortal } from "react-dom";
import { RadialMenu, type RadialMenuItem } from "@/components/ui/radial-menu";

import { useRuforgeStore } from "@/store/ruforgeStore";
import type { ActiveTab } from "@/store/types";

type RadialNavOverlayProps = {
  open: boolean;
  anchor: { x: number; y: number };
  onNavigate: (tab: ActiveTab) => void;
};

const MENU_ITEMS: RadialMenuItem[] = [
  {
    id: "downloader",
    label: "Download",
    iconId: "download",
    hintPlacement: "top",
  },
  {
    id: "media",
    label: "Videos",
    iconId: "videos",
    hintPlacement: "right",
  },
  {
    id: "explorer",
    label: "YouTube",
    iconId: "explorer",
    hintPlacement: "bottom",
  },
  {
    id: "settings",
    label: "System",
    iconId: "settings",
    hintPlacement: "left",
  },
];

const TAB_BY_ITEM: Record<string, ActiveTab> = {
  downloader: "downloader",
  media: "media",
  explorer: "explorer",
  settings: "settings",
};

export function RadialNavOverlay({
  open,
  anchor,
  onNavigate,
}: RadialNavOverlayProps) {
  const navMode = useRuforgeStore((s) => s.navMode);
  const cycleNavMode = useRuforgeStore((s) => s.cycleNavMode);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[260] pointer-events-none"
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
          menuItems={MENU_ITEMS}
          onCenterClick={() => cycleNavMode()}
          onSelect={(item) => {
            const tab = TAB_BY_ITEM[item.id];
            if (tab) onNavigate(tab);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
