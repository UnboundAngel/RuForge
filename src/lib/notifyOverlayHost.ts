import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";

import { debugLog } from "@/debug/debugLog";
import { MUSIC_EXPLORE_WEBVIEW_LABEL } from "@/explorerProfileScript";
import { EMBEDDED_EXPLORER_WEBVIEW_LABEL } from "@/explorerWebviewLifecycle";
import {
  NOTIFY_OVERLAY_ACTION_EVENT,
  NOTIFY_OVERLAY_CLOSE_EVENT,
  NOTIFY_OVERLAY_LABEL,
  NOTIFY_OVERLAY_PANEL_WIDTH,
  NOTIFY_OVERLAY_QUERY,
  NOTIFY_OVERLAY_READY_EVENT,
  NOTIFY_OVERLAY_SHADOW_PAD,
  NOTIFY_OVERLAY_SIZE_EVENT,
  NOTIFY_OVERLAY_STATE_EVENT,
  type NotifyOverlayAction,
  type NotifyOverlayClose,
  type NotifyOverlaySize,
  type NotifyOverlayState,
} from "@/lib/notifyOverlayEvents";
import { listenPrivateQueue, postPrivateState } from "@/lib/privateMailbox";
import { activeRadialNavSurface } from "@/lib/radialNavOverlayHost";

/** Panel placement in main-window client coordinates (CSS px equal logical px). */
export type NotifyOverlayAnchor = { top: number; right: number };

export type NotifyOverlayShowResult = "shown" | "superseded" | "unavailable";

type Handlers = { onAction: (action: NotifyOverlayAction) => void; onClose: () => void };

const SURFACE_LABELS = [EMBEDDED_EXPLORER_WEBVIEW_LABEL, MUSIC_EXPLORE_WEBVIEW_LABEL];
const OVERLAY_TARGET = { kind: "Webview", label: NOTIFY_OVERLAY_LABEL } as const;
const WIDTH = NOTIFY_OVERLAY_PANEL_WIDTH + NOTIFY_OVERLAY_SHADOW_PAD * 2;
/** Blur closes the overlay a beat before the bell's click lands; that click must not reopen it. */
const BELL_REOPEN_GUARD_MS = 250;

let overlay: Webview | null = null;
// Child webviews stack in creation order, so the overlay only covers surfaces that existed before it.
let stackedAbove = new Set<string>();
let pendingEnsure: Promise<Webview | null> | null = null;
let overlayReady = false;
let lastState: NotifyOverlayState | null = null;
let visible = false;
let visibilitySeq = 0;
let panelHeight: number | null = null;
let listenersInstalled = false;
let handlers: Handlers | null = null;
let closedAt = 0;

export function setNotifyOverlayHandlers(next: Handlers | null): void {
  handlers = next;
}

/** True right after the overlay closed itself on blur; the bell ignores that click. */
export function notifyOverlayJustClosed(): boolean {
  return Date.now() - closedAt < BELL_REOPEN_GUARD_MS;
}

function sizeFor(height: number): LogicalSize {
  return new LogicalSize(WIDTH, Math.max(1, Math.ceil(height)) + NOTIFY_OVERLAY_SHADOW_PAD);
}

function installListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  void listen(NOTIFY_OVERLAY_READY_EVENT, () => {
    overlayReady = true;
    if (lastState) sendState(lastState);
  });
  void listen<NotifyOverlaySize>(NOTIFY_OVERLAY_SIZE_EVENT, (e) => {
    panelHeight = e.payload.height;
    if (visible) void overlay?.setSize(sizeFor(panelHeight)).catch(() => {});
  });
  void listen<NotifyOverlayClose>(NOTIFY_OVERLAY_CLOSE_EVENT, (e) => {
    if (!visible) return;
    if (e.payload.reason === "blur") closedAt = Date.now();
    handlers?.onClose();
  });
  void listenPrivateQueue<NotifyOverlayAction>("notify-overlay-action", NOTIFY_OVERLAY_ACTION_EVENT, (action) => {
    if (visible && action && typeof action === "object") handlers?.onAction(action);
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
    const webview = new Webview(getCurrentWindow(), NOTIFY_OVERLAY_LABEL, {
      url: `index.html?rfWindow=${NOTIFY_OVERLAY_QUERY}`,
      x: -WIDTH * 2,
      y: -WIDTH * 2,
      width: WIDTH,
      height: WIDTH,
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
export function ensureNotifyOverlay(): Promise<Webview | null> {
  installListeners();
  if (pendingEnsure) return pendingEnsure;
  pendingEnsure = (async () => {
    try {
      const surfaces = await liveSurfaceLabels();
      const existing =
        overlay ?? (await Webview.getByLabel(NOTIFY_OVERLAY_LABEL).catch(() => null));
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
      debugLog("explorer.webview", "warn", "notify overlay webview unavailable", e);
      return null;
    } finally {
      pendingEnsure = null;
    }
  })();
  return pendingEnsure;
}

function sendState(state: NotifyOverlayState): void {
  void postPrivateState("notify-overlay-state", OVERLAY_TARGET, NOTIFY_OVERLAY_STATE_EVENT, state).catch(
    () => {},
  );
}

export function pushNotifyOverlayState(state: NotifyOverlayState): void {
  lastState = state;
  if (overlayReady) sendState(state);
}

function positionFor(anchor: NotifyOverlayAnchor): LogicalPosition {
  const x = window.innerWidth - anchor.right - NOTIFY_OVERLAY_PANEL_WIDTH - NOTIFY_OVERLAY_SHADOW_PAD;
  return new LogicalPosition(Math.round(Math.max(0, x)), Math.round(anchor.top));
}

export async function showNotifyOverlay(
  anchor: NotifyOverlayAnchor,
  maxHeight: number,
): Promise<NotifyOverlayShowResult> {
  const seq = ++visibilitySeq;
  const webview = await ensureNotifyOverlay();
  if (seq !== visibilitySeq) return "superseded";
  if (!webview) return "unavailable";
  try {
    await Promise.all([
      webview.setPosition(positionFor(anchor)),
      webview.setSize(sizeFor(Math.min(panelHeight ?? maxHeight, maxHeight))),
    ]);
    if (seq !== visibilitySeq) return "superseded";
    visible = true;
    await webview.show();
    await webview.setFocus().catch(() => {});
    return "shown";
  } catch (e) {
    debugLog("explorer.webview", "warn", "notify overlay show failed", e);
    return "unavailable";
  }
}

export async function moveNotifyOverlay(anchor: NotifyOverlayAnchor): Promise<void> {
  if (!visible || !overlay) return;
  await overlay.setPosition(positionFor(anchor)).catch(() => {});
}

/** `restoreFocus` hands keyboard focus back to the YouTube page unless the user already clicked elsewhere. */
export async function hideNotifyOverlay(restoreFocus: boolean): Promise<void> {
  visibilitySeq += 1;
  const wasVisible = visible;
  visible = false;
  if (lastState?.open) pushNotifyOverlayState({ ...lastState, open: false });
  const webview = overlay;
  if (!webview || !wasVisible) return;
  await webview.hide().catch(() => {});
  if (!restoreFocus || notifyOverlayJustClosed()) return;
  const surface = activeRadialNavSurface();
  if (!surface) return;
  const target = await Webview.getByLabel(surface).catch(() => null);
  await target?.setFocus().catch(() => {});
}
