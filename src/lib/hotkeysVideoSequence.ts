import type { HotkeyAction } from "./hotkeys";

/** Next / previous video in the playlist, or in Next up when the video is not in a playlist. */
export const VIDEO_SEQUENCE_HOTKEYS: HotkeyAction[] = [
  {
    id: "player.nextVideo",
    label: "Next video",
    description: "Next video in the playlist or Next up. Queued videos play first.",
    group: "player",
    scope: "player",
    defaults: ["Shift+KeyN"],
  },
  {
    id: "player.prevVideo",
    label: "Previous video",
    description: "Previous video in the playlist or Next up.",
    group: "player",
    scope: "player",
    defaults: ["Shift+KeyP"],
  },
];
