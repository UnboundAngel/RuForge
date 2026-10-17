import { emit } from "@tauri-apps/api/event";
import { SettingItem, SettingsSection } from "../settingsChrome";
import { DebugUpdatePreviewRows } from "../DebugUpdatePreviewRows";
import { DebugButton } from "./DebugButton";

const KEYWORDS = "updater update release notes whats new changelog draft preview";

export function UpdatesPreviewSection() {
  return (
    <SettingsSection variant="group" title="Updates and release preview" keywords={KEYWORDS}>
      <SettingItem
        title="Cycle updater UI"
        description="Step through Available, Downloading, Installing, and Post-Install updater phases."
        keywords="updater phases install"
        control={<DebugButton label="Cycle phases" onClick={() => void emit("debug-cycle-updater")} />}
      />
      <SettingItem
        title="Preview What's New"
        description="Open the post-update release notes dialog with sample notes."
        keywords="release notes changelog"
        control={<DebugButton label="Preview" onClick={() => void emit("debug-preview-whats-new")} />}
      />
      {import.meta.env.DEV && <DebugUpdatePreviewRows />}
    </SettingsSection>
  );
}
