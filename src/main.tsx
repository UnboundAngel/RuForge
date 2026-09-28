import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import IslandOverlayApp from "./IslandOverlayApp";
import RadialNavOverlayApp from "./RadialNavOverlayApp";
import RootErrorBoundary from "./components/RootErrorBoundary";
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
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearRuforgeNotificationDismissTimers();
  });
}

const rootEl = document.getElementById("root") as HTMLElement;
const label = isRadialNavOverlayDocument()
  ? RADIAL_NAV_OVERLAY_QUERY
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
