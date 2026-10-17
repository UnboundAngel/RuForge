import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { useRuforgeStore } from "../../../store/ruforgeStore";
import {
  clearLastDownloadBatchRecord,
  formatLastBatchSummary,
  getDevReplayMode,
  readLastDownloadBatchRecord,
  setDevReplayMode,
  type DevReplayMode,
} from "../../../lib/devLastDownloadBatch";
import { SettingItem, SettingsSection } from "../settingsChrome";
import { DebugButton } from "./DebugButton";

const MODE_ON =
  "bg-[color:var(--accent)] text-[color:var(--rf-set-on-accent)] border-[color:var(--accent)]";
const MODE_OFF =
  "bg-[color:var(--rf-set-well)] text-stone-400 border-white/10 hover:bg-[color:var(--rf-set-hover)]";
const MODE_BTN =
  "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all border active:scale-95";

/** Dev builds only. */
export function DownloadReplaySection({ active }: { active: boolean }) {
  const notify = useRuforgeStore((s) => s.notify);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const [mode, setModeState] = useState<DevReplayMode>(() => getDevReplayMode());
  const [summary, setSummary] = useState(() => formatLastBatchSummary(readLastDownloadBatchRecord()));
  const queueBusy = downloadJobs.some(
    (j) => j.status === "queued" || j.status === "downloading" || j.status === "paused",
  );
  const hasLastBatch = (readLastDownloadBatchRecord()?.items.length ?? 0) > 0;

  useEffect(() => {
    if (!active) return;
    setSummary(formatLastBatchSummary(readLastDownloadBatchRecord()));
  }, [active, downloadJobs.length]);

  const changeMode = (next: DevReplayMode) => {
    setDevReplayMode(next);
    setModeState(next);
  };

  return (
    <SettingsSection variant="group" title="Download replay" keywords="replay redownload batch simulate yt-dlp queue">
      <SettingItem
        title="Re-download replay mode"
        description="Real download runs yt-dlp then deletes resolved output paths. Simulate replays queue/UI paths without bandwidth."
        control={
          <div className="flex gap-2">
            <button type="button" onClick={() => changeMode("real")} className={`${MODE_BTN} ${mode === "real" ? MODE_ON : MODE_OFF}`}>
              REAL
            </button>
            <button type="button" onClick={() => changeMode("simulate")} className={`${MODE_BTN} ${mode === "simulate" ? MODE_ON : MODE_OFF}`}>
              SIMULATE
            </button>
          </div>
        }
      />
      <SettingItem
        title="Re-download last batch"
        description={summary}
        keywords="replay batch"
        control={
          <div className="flex flex-col items-end gap-2">
            <DebugButton
              label="Replay batch"
              disabled={!hasLastBatch || queueBusy}
              onClick={() => void emit("debug-replay-download-batch")}
            />
            <button
              type="button"
              disabled={!hasLastBatch}
              onClick={() => {
                clearLastDownloadBatchRecord();
                setSummary(formatLastBatchSummary(readLastDownloadBatchRecord()));
                notify("Last batch record cleared.", "info");
              }}
              className="text-[10px] font-bold tracking-wide text-stone-500 hover:text-stone-300 transition-colors disabled:opacity-40"
            >
              Clear record
            </button>
          </div>
        }
      />
    </SettingsSection>
  );
}
