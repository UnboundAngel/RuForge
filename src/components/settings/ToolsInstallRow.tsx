import { useEffect } from "react";
import { motion } from "motion/react";
import { installTools, refreshToolsStatus } from "@/lib/toolsInstallFlow";
import { toolsMissing, toolsPercent, useToolsInstallStore } from "@/store/toolsInstallStore";
import { SettingItem } from "./settingsChrome";

/** Settings > Updates row for the ffmpeg and yt-dlp download that the installer no longer bundles. */
export function ToolsInstallRow() {
  const status = useToolsInstallStore((s) => s.status);
  const phase = useToolsInstallStore((s) => s.phase);
  const fraction = useToolsInstallStore((s) => s.fraction);
  const error = useToolsInstallStore((s) => s.error);

  useEffect(() => {
    void refreshToolsStatus();
  }, []);

  const installing = phase === "installing";
  const missing = toolsMissing(status);
  const label = (name: string, present: boolean | undefined) =>
    `${name} ${present ? "installed" : "missing"}`;
  const description = installing
    ? `Getting download tools ${toolsPercent(fraction)}%`
    : phase === "error" && error
      ? error.split("\n")[0]
      : status
        ? `${label("ffmpeg", status.ffmpeg && status.ffprobe)}, ${label("yt-dlp", status.ytdlp)}`
        : "Checking installed tools…";

  return (
    <SettingItem
      title="Download tools (ffmpeg, yt-dlp)"
      description={description}
      active={!installing}
      control={
        <motion.div layout className="flex min-w-[140px] flex-col items-end gap-2">
          {installing ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="h-1 w-full overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="h-full bg-[color:var(--accent)] transition-[width] duration-200"
                style={{ width: `${toolsPercent(fraction)}%` }}
              />
            </motion.div>
          ) : null}
          {missing || phase === "error" ? (
            <button
              type="button"
              disabled={installing}
              onClick={() => void installTools()}
              className="rf-settings-btn"
            >
              {installing ? "Installing…" : phase === "error" ? "Retry" : "Install"}
            </button>
          ) : null}
        </motion.div>
      }
    />
  );
}
