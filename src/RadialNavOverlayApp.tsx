import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";

import { RadialMenu } from "@/components/ui/radial-menu";
import { radialMenuItemsForMode } from "@/lib/radialNavItems";
import {
  RADIAL_NAV_ALT_EVENT,
  RADIAL_NAV_CENTER_EVENT,
  RADIAL_NAV_FOCUSED_EVENT,
  RADIAL_NAV_READY_EVENT,
  RADIAL_NAV_SELECT_EVENT,
  RADIAL_NAV_STATE_EVENT,
  type RadialNavAltPayload,
  type RadialNavSelectPayload,
  type RadialNavStatePayload,
} from "@/lib/radialNavOverlayEvents";

export default function RadialNavOverlayApp() {
  const [state, setState] = useState<RadialNavStatePayload>({
    open: false,
    navMode: "default",
  });

  useEffect(() => {
    document.documentElement.classList.add("ruforge-overlay-root");
    return () => {
      document.documentElement.classList.remove("ruforge-overlay-root");
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<RadialNavStatePayload>(RADIAL_NAV_STATE_EVENT, (event) => {
      setState(event.payload);
    });
    void unlisten.then(() => emit(RADIAL_NAV_READY_EVENT));
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Clicking the menu moves keyboard focus here, so Alt release has to be forwarded from this webview too.
  useEffect(() => {
    const sendAlt = (down: boolean) =>
      void emit(RADIAL_NAV_ALT_EVENT, { down } satisfies RadialNavAltPayload);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || e.repeat) return;
      e.preventDefault();
      sendAlt(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") sendAlt(false);
    };
    const onFocus = () => void emit(RADIAL_NAV_FOCUSED_EVENT);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const menuItems = useMemo(() => radialMenuItemsForMode(state.navMode), [state.navMode]);

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <RadialMenu
        open={state.open}
        navMode={state.navMode}
        menuItems={menuItems}
        onCenterClick={() => void emit(RADIAL_NAV_CENTER_EVENT)}
        onSelect={(item) =>
          void emit(RADIAL_NAV_SELECT_EVENT, { itemId: item.id } satisfies RadialNavSelectPayload)
        }
      />
    </div>
  );
}
