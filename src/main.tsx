import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import NotifyOverlayApp from "./NotifyOverlayApp";
import { clearRuforgeNotificationDismissTimers } from "./store/ruforgeStore";
import {
  dismissBootSplash,
  hideBootSplashImmediate,
  isBootSplashSkipped,
  syncBootNavMode,
} from "./lib/bootSplash";
import "./index.css";

window.addEventListener("beforeunload", clearRuforgeNotificationDismissTimers);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearRuforgeNotificationDismissTimers();
  });
}

const rootEl = document.getElementById("root") as HTMLElement;
const label = getCurrentWindow().label;

syncBootNavMode();

if (label !== "main") {
  hideBootSplashImmediate();
}

if (import.meta.env.DEV && label === "main") {
  void import("./devScreenshotFrame").then(({ installDevScreenshotFrame }) => {
    installDevScreenshotFrame();
  });
  void import("./devExportBundle").then(({ installDevExportBundleTest }) => {
    installDevExportBundleTest();
  });
}

const tree = label === "notify" ? <NotifyOverlayApp /> : <App />;

ReactDOM.createRoot(rootEl).render(<React.StrictMode>{tree}</React.StrictMode>);

if (label === "main" && !isBootSplashSkipped()) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dismissBootSplash();
    });
  });
}
