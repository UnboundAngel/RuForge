import { useEffect } from "react";
import { useRecordingMode } from "@/lib/recordingMode";
import "../../styles/recording-mode.css";
import { RecordingCursor } from "./RecordingCursor";
import { useSmoothWheel } from "./useSmoothWheel";

/** Mounted once in the main window. Renders nothing and attaches nothing while Recording mode is off. */
export function RecordingMode() {
  const on = useRecordingMode();
  useSmoothWheel(on);
  useEffect(() => {
    if (!on) return;
    document.documentElement.classList.add("rf-recording");
    return () => document.documentElement.classList.remove("rf-recording");
  }, [on]);
  return on ? <RecordingCursor /> : null;
}
