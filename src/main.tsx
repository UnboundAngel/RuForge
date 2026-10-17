import "./frameGuard";
import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import IslandOverlayApp from "./IslandOverlayApp";
import NotifyOverlayApp from "./NotifyOverlayApp";
import RadialNavOverlayApp from "./RadialNavOverlayApp";
import RootErrorBoundary from "./components/RootErrorBoundary";
import {
  gamesWindowLabelFromDocument,
  renderGamesWindow,
} from "@games";
import { isNotifyOverlayDocument, NOTIFY_OVERLAY_QUERY } from "./lib/notifyOverlayEvents";
import {
  isRadialNavOverlayDocument,
  RADIAL_NAV_OVERLAY_QUERY,
} from "./lib/radialNavOverlayEvents";
import { clearRuforgeNotificationDismissTimers, useRuforgeStore } from "./store/ruforgeStore";
import { hydrateSettingsFromFile } from "./store/settingsFileSync";
import {
  dismissBootSplash,
  hideBootSplashImmediate,
  isBootSplashSkipped,
  syncBootNavMode,
} from "./lib/bootSplash";
import { syncMainWindowTransparentFrame } from "./lib/mainWindowFrame";
import { syncRuforgeAccentCss } from "./accentCss";
import { loadMergedSettings } from "./store/types";
import "./index.css";

window.addEventListener("beforeunload", clearRuforgeNotificationDismissTimers);

// No native webview menu; surfaces that want one render a house menu. Text fields keep
// cut/copy/paste until they get a custom menu, and Shift still reaches Inspect in dev.
window.addEventListener("contextmenu", (e) => {
  if (import.meta.env.DEV && e.shiftKey) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable=''], [contenteditable='true']")) return;
  e.preventDefault();
});
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearRuforgeNotificationDismissTimers();
  });
}

const rootEl = document.getElementById("root") as HTMLElement;
const gamesLabel = gamesWindowLabelFromDocument();
const label = isRadialNavOverlayDocument()
  ? RADIAL_NAV_OVERLAY_QUERY
  : isNotifyOverlayDocument()
    ? NOTIFY_OVERLAY_QUERY
    : gamesLabel ?? getCurrentWindow().label;

syncBootNavMode();
// Before first render: the crash screen can mount before App's accent effect ever runs.
syncRuforgeAccentCss(loadMergedSettings().accentColor);

if (label !== "main") {
  hideBootSplashImmediate();
}

if (label === "main") {
  syncMainWindowTransparentFrame(true);
}

// React dev builds log a performance.measure per component render and the browser never
// evicts them; an hour of video playback piled up millions and froze the webview at 12 GB.
if (import.meta.env.DEV) {
  window.setInterval(() => performance.clearMeasures(), 10_000);
}

if (import.meta.env.DEV && label === "main") {
  void import("./devScreenshotFrame").then(({ installDevScreenshotFrame }) => {
    installDevScreenshotFrame();
  });
  void import("./devExportBundle").then(({ installDevExportBundleTest }) => {
    installDevExportBundleTest();
  });
}

/** The app-data settings file is the truth; localStorage is a cache that can be wiped or differ per origin. */
async function syncSettingsFile(): Promise<void> {
  if (label !== "main") return;
  if (await hydrateSettingsFromFile()) {
    await useRuforgeStore.persist.rehydrate();
    syncRuforgeAccentCss(loadMergedSettings().accentColor);
  }
}

function removeBootDragStrip(): void {
  document.getElementById("rf-boot-drag")?.remove();
}

function renderRoot(): void {
  const gamesTree = renderGamesWindow(label);
  const tree =
    label === "island" ? (
      <IslandOverlayApp />
    ) : gamesTree ? (
      gamesTree
    ) : label === RADIAL_NAV_OVERLAY_QUERY ? (
      <RadialNavOverlayApp />
    ) : label === NOTIFY_OVERLAY_QUERY ? (
      <NotifyOverlayApp />
    ) : (
      <App />
    );

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <RootErrorBoundary>{tree}</RootErrorBoundary>
    </React.StrictMode>,
  );

  // Two frames so React's title bar is committed before the boot strip stops catching drags.
  requestAnimationFrame(() => {
    requestAnimationFrame(removeBootDragStrip);
  });

  if (label === "main" && !isBootSplashSkipped()) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dismissBootSplash();
      });
    });
  }
}

void syncSettingsFile().then(renderRoot, renderRoot);
