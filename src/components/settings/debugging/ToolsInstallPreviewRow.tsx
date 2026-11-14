import { Switch } from "../../ui/Switch";
import { SettingItem } from "../settingsChrome";
import { startToolsPreview, stopToolsPreview } from "@/lib/toolsInstallPreview";
import { useToolsInstallStore } from "@/store/toolsInstallStore";

/** Fakes a tools install (0 to 1 over 8 s) so the rail ring can be seen without missing tools. */
export function ToolsInstallPreviewRow() {
  const previewing = useToolsInstallStore((s) => s.previewing);

  return (
    <SettingItem
      title="Preview tools install ring"
      description="Fake a download of ffmpeg and yt-dlp, then a yt-dlp update, for 15 seconds so the progress ring on the Download rail icon can be checked."
      keywords="tools ffmpeg yt-dlp install progress ring rail"
      active={previewing}
      control={
        <Switch
          checked={previewing}
          onChange={() => (previewing ? stopToolsPreview() : startToolsPreview())}
        />
      }
    />
  );
}
