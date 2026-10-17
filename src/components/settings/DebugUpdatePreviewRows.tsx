import { emit } from "@tauri-apps/api/event";
import { SettingItem } from "./settingsChrome";

/** Dev builds only: previews the draft in docs/agents/release/notes-<version>.json through the real post-install path. */
export function DebugUpdatePreviewRows() {
  return (
    <>
      <SettingItem
        title="Preview draft release notes"
        description="Open What's New with the next release's notes from docs/agents/release."
        control={
          <button type="button" onClick={() => void emit("debug-preview-draft-whats-new")} className="rf-settings-btn">
            Preview
          </button>
        }
      />
      <SettingItem
        title="Cycle updater UI with draft"
        description="Step through the updater phases using the draft release notes."
        control={
          <button type="button" onClick={() => void emit("debug-cycle-updater-draft")} className="rf-settings-btn">
            Cycle phases
          </button>
        }
      />
    </>
  );
}
