import { setRecordingMode, useRecordingMode } from "@/lib/recordingMode";
import { Switch } from "../../ui/Switch";
import { SettingItem, SettingsSection } from "../settingsChrome";

export function RecordingModeSection() {
  const on = useRecordingMode();
  return (
    <SettingsSection variant="group" title="Recording" keywords="recording demo clip capture cursor smooth scroll">
      <SettingItem
        title="Recording mode"
        description="Hides the system cursor and draws a gliding one, and eases mouse wheel scrolling, for screen captures. Resets on restart."
        keywords="demo video cursor smooth scroll screen record"
        active={on}
        control={<Switch checked={on} onChange={setRecordingMode} />}
      />
    </SettingsSection>
  );
}
