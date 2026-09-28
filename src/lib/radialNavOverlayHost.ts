import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Webview } from "@tauri-apps/api/webview";
import {
  cursorPosition,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
} from "@tauri-apps/api/window";

import { debugLog } from "@/debug/debugLog";
import { MUSIC_EXPLORE_WEBVIEW_LABEL } from "@/explorerProfileScript";
import { EMBEDDED_EXPLORER_WEBVIEW_LABEL } from "@/explorerWebviewLifecycle";
import { radialMenuHalfExtent } from "@/lib/radialMenuAnchor";
import {
  RADIAL_NAV_FOCUSED_EVENT,
  RADIAL_NAV_OVERLAY_LABEL,
  RADIAL_NAV_OVERLAY_QUERY,
  RADIAL_NAV_READY_EVENT,
  RADIAL_NAV_STATE_EVENT,
  type RadialNavStatePayload,
} from "@/lib/radialNavOverlayEvents";
import type { NavMode } from "@/store/types";

const OVERLAY_SIDE = Math.ceil(radialMenuHalfExtent() * 2);
const SURFACE_LABELS = [EMBEDDED_EXPLORER_WEBVIEW_LABEL, MUSIC_EXPLORE_WEBVIEW_LABEL];

const activeSurfaces = new Set<string>();
let overlay: Webview | null = null;
// Child webviews stack in creation order, so the overlay only covers surfaces that existed before it.
let stackedAbove = new Set<string>();
let pendingEnsure: Promise<Webview | null> | null = null;
let overlayReady = false;
let overlayFocused = false;
let lastState: RadialNavStatePayload | null = null;
let visibilitySeq = 0;
let listenersInstalled = false;

export function setRadialNavSurfaceActive(label: string, active: boolean): void {
  if (active) activeSurfaces.add(label);
  else activeSurfaces.delete(label);
}

export function activeRadialNavSurface(): string | null {
  return SURFACE_LABELS.find((label) => activeSurfaces.has(label)) ?? null;
}

function installListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  void listen(RADIAL_NAV_READY_EVENT, () => {
    overlayReady = true;
    if (lastState) void emit(RADIAL_NAV_STATE_EVENT, lastState);
  });
  void listen(RADIAL_NAV_FOCUSED_EVENT, () => {
    overlayFocused = true;
  });
}

async function liveSurfaceLabels(): Promise<string[]> {
  const found = await Promise.all(
    SURFACE_LABELS.map(async (label) =>
      (await Webview.getByLabel(label).catch(() => null)) ? label : null,
    ),
  );
  return found.filter((label): label is string => label !== null);
}

async function createOverlay(): Promise<Webview> {
  const additionalBrowserArgs = await invoke<string | null>(
    "get_hardware_acceleration_browser_args",
  ).catch(() => null);
  return new Promise((resolve, reject) => {
    const webview = new Webview(getCurrentWindow(), RADIAL_NAV_OVERLAY_LABEL, {
      url: `index.html?rfWindow=${RADIAL_NAV_OVERLAY_QUERY}`,
      x: -OVERLAY_SIDE * 2,
      y: -OVERLAY_SIDE * 2,
      width: OVERLAY_SIDE,
      height: OVERLAY_SIDE,
      transparent: true,
      focus: false,
      ...(additionalBrowserArgs ? { additionalBrowserArgs } : {}),
    });
    webview.once("tauri://created", () => {
      void webview.hide().catch(() => {});
      resolve(webview);
    });
    webview.once("tauri://error", (e) => reject(e.payload));
  });
}

/** Create the overlay, or recreate it when a YouTube webview was created after it. */
export function ensureRadialNavOverlay(): Promise<Webview | null> {
  installListeners();
  if (pendingEnsure) return pendingEnsure;
  pendingEnsure = (async () => {
    try {
      const surfaces = await liveSurfaceLabels();
      const existing =
        overlay
        ?? (await Webview.getByLabel(RADIAL_NAV_OVERLAY_LABEL).catch(() => null));
      if (existing) {
        if (!overlay) {
          overlay = existing;
          overlayReady = true;
          stackedAbove = new Set(surfaces);
        }
        if (surfaces.every((label) => stackedAbove.has(label))) return existing;
        overlay = null;
        overlayReady = false;
        await existing.close().catch(() => {});
      }
      const created = await createOverlay();
      overlay = created;
      stackedAbove = new Set(surfaces);
      return created;
    } catch (e) {
      debugLog("radial-nav", "warn", "overlay webview unavailable", e);
      return null;
    } finally {
      pendingEnsure = null;
    }
  })();
  return pendingEnsure;
}

export function pushRadialNavState(state: RadialNavStatePayload): void {
  lastState = state;
  if (overlayReady) void emit(RADIAL_NAV_STATE_EVENT, state);
}

export async function showRadialNavOverlay(
  anchor: { x: number; y: number },
  navMode: NavMode,
): Promise<boolean> {
  const seq = ++visibilitySeq;
  const webview = await ensureRadialNavOverlay();
  if (!webview || seq !== visibilitySeq) return false;
  const half = OVERLAY_SIDE / 2;
  try {
    await Promise.all([
      webview.setPosition(
        new LogicalPosition(Math.round(anchor.x - half), Math.round(anchor.y - half)),
      ),
      webview.setSize(new LogicalSize(OVERLAY_SIDE, OVERLAY_SIDE)),
    ]);
    if (seq !== visibilitySeq) return false;
    pushRadialNavState({ open: true, navMode });
    await webview.show();
    return true;
  } catch (e) {
    debugLog("radial-nav", "warn", "overlay show failed", e);
    return false;
  }
}

export async function hideRadialNavOverlay(navMode: NavMode): Promise<void> {
  visibilitySeq += 1;
  pushRadialNavState({ open: false, navMode });
  const webview = overlay;
  if (!webview) return;
  const restoreFocus = overlayFocused;
  overlayFocused = false;
  await webview.hide().catch(() => {});
  if (!restoreFocus) return;
  const surface = activeRadialNavSurface();
  if (!surface) return;
  const target = await Webview.getByLabel(surface).catch(() => null);
  await target?.setFocus().catch(() => {});
}

/** Cursor in main-window client coordinates, readable while a child webview owns the pointer. */
export async function radialNavCursorClientPoint(): Promise<{ x: number; y: number } | null> {
  try {
    const win = getCurrentWindow();
    const [cursor, inner, scale] = await Promise.all([
      cursorPosition(),
      win.innerPosition(),
      win.scaleFactor(),
    ]);
    return { x: (cursor.x - inner.x) / scale, y: (cursor.y - inner.y) / scale };
  } catch {
    return null;
  }
}
