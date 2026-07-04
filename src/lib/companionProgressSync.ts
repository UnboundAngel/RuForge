import { emit, listen } from "@tauri-apps/api/event";
import {
  readResumeSeconds,
  readStoredPlaybackDuration,
  writePlaybackPos,
} from "../playbackStorage";

type CompanionProgressWritePayload = {
  videoPath: string;
  positionSecs: number;
  durationSecs: number;
  playbackState?: string | null;
};

type CompanionProgressQueryPayload = {
  requestId: string;
  videoPath: string;
};

/** Bridges companion HTTP progress writes into path-keyed desktop localStorage. */
export function wireCompanionProgressSync(): () => void {
  let disposed = false;
  const unsubs: Array<() => void> = [];

  void listen<CompanionProgressWritePayload>("companion-playback-progress", (ev) => {
    if (disposed) return;
    const { videoPath, positionSecs, durationSecs } = ev.payload;
    if (!videoPath?.trim()) return;
    const dur =
      Number.isFinite(durationSecs) && durationSecs > 0 ? durationSecs : undefined;
    writePlaybackPos(videoPath, positionSecs, dur);
  }).then((un) => unsubs.push(un));

  void listen<CompanionProgressQueryPayload>("companion-progress-query", (ev) => {
    if (disposed) return;
    const { requestId, videoPath } = ev.payload;
    if (!requestId || !videoPath?.trim()) return;
    const storedDur = readStoredPlaybackDuration(videoPath);
    const positionSecs = readResumeSeconds(videoPath, storedDur);
    void emit("companion-progress-query-result", {
      requestId,
      positionSecs,
      durationSecs: storedDur,
    });
  }).then((un) => unsubs.push(un));

  return () => {
    disposed = true;
    for (const un of unsubs) un();
  };
}
