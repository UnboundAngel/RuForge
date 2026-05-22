import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import NotifyOverlayApp from "./NotifyOverlayApp";
import { clearRuforgeNotificationDismissTimers } from "./store/ruforgeStore";
import "./index.css";

window.addEventListener("beforeunload", clearRuforgeNotificationDismissTimers);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearRuforgeNotificationDismissTimers();
  });
}

const rootEl = document.getElementById("root") as HTMLElement;
const label = getCurrentWindow().label;

if (import.meta.env.DEV && label === "main") {
  void import("./devScreenshotFrame").then(({ installDevScreenshotFrame }) => {
    installDevScreenshotFrame();
  });
}

const tree = label === "notify" ? <NotifyOverlayApp /> : <App />;

ReactDOM.createRoot(rootEl).render(<React.StrictMode>{tree}</React.StrictMode>);
