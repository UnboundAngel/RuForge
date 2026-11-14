import { Switch } from "../../ui/Switch";
import { SettingItem } from "../settingsChrome";
import { useUpdateAvailableStore } from "@/store/updateAvailableStore";

const SAMPLE_VERSION = "0.9.0";

/** Shows the persistent update chip without a real update. */
export function UpdateChipPreviewRow() {
  const previewing = useUpdateAvailableStore((s) => s.previewVersion !== null);

  return (
    <SettingItem
      title="Preview update chip"
      description="Show the persistent Update chip in the rail and Music library panel with a sample version."
      keywords="update available chip rail persistent"
      active={previewing}
      control={
        <Switch
          checked={previewing}
          onChange={() => useUpdateAvailableStore.setState({ previewVersion: previewing ? null : SAMPLE_VERSION })}
        />
      }
    />
  );
}
