import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { clearRuforgeNotificationDismissTimers } from "./store/ruforgeStore";
import "./index.css";

window.addEventListener("beforeunload", clearRuforgeNotificationDismissTimers);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearRuforgeNotificationDismissTimers();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
