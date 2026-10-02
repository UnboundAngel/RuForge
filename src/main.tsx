import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import IslandOverlayApp from "./IslandOverlayApp";
import NotifyOverlayApp from "./NotifyOverlayApp";
import RadialNavOverlayApp from "./RadialNavOverlayApp";
import RootErrorBoundary from "./components/RootErrorBoundary";
import { isNotifyOverlayDocument, NOTIFY_OVERLAY_QUERY } from "./lib/notifyOverlayEvents";
import {
  isRadialNavOverlayDocument,
  RADIAL_NAV_OVERLAY_QUERY,
} from "./lib/radialNavOverlayEvents";
import { clearRuforgeNotificationDismissTimers } from "./store/ruforgeStore";
import {
  dismissBootSplash,
  hideBootSplashImmediate,
  isBootSplashSkipped,
  syncBootNavMode,
} from "./lib/bootSplash";
import { syncMainWindowTransparentFrame } from "./lib/mainWindowFrame";
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
const label = isRadialNavOverlayDocument()
  ? RADIAL_NAV_OVERLAY_QUERY
  : isNotifyOverlayDocument()
    ? NOTIFY_OVERLAY_QUERY
    : getCurrentWindow().label;

syncBootNavMode();

if (label !== "main") {
  hideBootSplashImmediate();
}

if (label === "main") {
  syncMainWindowTransparentFrame(true);
}

if (import.meta.env.DEV && label === "main") {
  void import("./devScreenshotFrame").then(({ installDevScreenshotFrame }) => {
    installDevScreenshotFrame();
  });
  void import("./devExportBundle").then(({ installDevExportBundleTest }) => {
    installDevExportBundleTest();
  });
}

const tree =
  label === "island" ? (
    <IslandOverlayApp />
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

if (label === "main" && !isBootSplashSkipped()) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dismissBootSplash();
    });
  });
}
