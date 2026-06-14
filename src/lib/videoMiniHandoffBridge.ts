import { emit, listen } from "@tauri-apps/api/event";
import type { PlayInMiniPayload } from "../playerHandoff";

type HandoffSink = (payload: PlayInMiniPayload) => void;

let sink: HandoffSink | null = null;
let pendingHandoff: PlayInMiniPayload | null = null;
let readySignaled = false;

void listen<PlayInMiniPayload>("play-in-mini", (event) => {
  pendingHandoff = event.payload;
  sink?.(pendingHandoff);
}).then(() => {
  if (readySignaled) return;
  readySignaled = true;
  void emit("mini-player-ready");
});

export function registerVideoMiniHandoffSink(fn: HandoffSink): () => void {
  sink = fn;
  if (pendingHandoff) {
    fn(pendingHandoff);
  }
  return () => {
    if (sink === fn) sink = null;
  };
}
