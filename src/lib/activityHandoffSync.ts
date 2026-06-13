import { emitTo } from "@tauri-apps/api/event";

import type { ActivityHandoffSyncPayload } from "@/lib/activityTypes";
import type { MediaFile } from "@/types";

export function emitActivityHandoffSync(
  surface: ActivityHandoffSyncPayload["surface"],
  file: MediaFile,
  startTime: number,
  paused: boolean,
): void {
  const payload: ActivityHandoffSyncPayload = {
    surface,
    file,
    startTime: Math.max(0, startTime),
    paused,
  };
  void emitTo("main", "activity-handoff-sync", payload).catch(() => null);
}
