import { useRuforgeStore } from "@/store/ruforgeStore";
import { Switch } from "../ui/Switch";
import { SettingItem } from "./settingsChrome";

export function PlaylistWatchSettingItem() {
  const on = useRuforgeStore((s) => s.settings.playlistWatchEnabled !== false);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  return (
    <SettingItem
      title="Watch downloaded playlists"
      description="Checks YouTube playlists you downloaded and adds a bell notice when someone adds videos, with a button to download them."
      active={on}
      control={<Switch checked={on} onChange={() => updateSetting("playlistWatchEnabled", !on)} />}
    />
  );
}
