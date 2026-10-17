import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import App from "./App";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
  // The shell opens from cache, so a new build would otherwise wait for the launch after next.
  // Reload as soon as nothing is playing; never cut off a song.
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type !== "shell-updated") return;
    const playing = () => [...document.querySelectorAll("audio, video")].some((el) => !(el as HTMLMediaElement).paused);
    const reload = () => window.location.reload();
    if (!playing()) {
      reload();
      return;
    }
    document.addEventListener("pause", () => { if (!playing()) reload(); }, { capture: true });
  });
}

const root =document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(
  <StrictMode>
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
