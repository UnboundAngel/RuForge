import type { NavMode } from "@/store/types";

/** Child webview in `main` that paints the Alt radial menu above the YouTube webviews. */
export const RADIAL_NAV_OVERLAY_LABEL = "radial-nav-overlay";
/** `?rfWindow=` value; inside a child webview `getCurrentWindow().label` is still `main`. */
export const RADIAL_NAV_OVERLAY_QUERY = "radial-nav";

/** Must match the event name in `src-tauri/src/radial_nav_bridge.js`. */
export const RADIAL_NAV_ALT_EVENT = "radial-nav:alt";
export const RADIAL_NAV_STATE_EVENT = "radial-nav:state";
export const RADIAL_NAV_SELECT_EVENT = "radial-nav:select";
export const RADIAL_NAV_CENTER_EVENT = "radial-nav:center";
export const RADIAL_NAV_READY_EVENT = "radial-nav:ready";
export const RADIAL_NAV_FOCUSED_EVENT = "radial-nav:focused";

export type RadialNavAltPayload = { down: boolean };
export type RadialNavStatePayload = { open: boolean; navMode: NavMode };
export type RadialNavSelectPayload = { itemId: string };

export function isRadialNavOverlayDocument(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).get("rfWindow")
      === RADIAL_NAV_OVERLAY_QUERY
    );
  } catch {
    return false;
  }
}
