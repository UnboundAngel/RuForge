import { emit } from "@tauri-apps/api/event";
import {
  requestDiscordOnboardingPreview,
  requestReplayOnboardingPreview,
} from "../../../lib/onboardingDebugPreview";
import { requestStatsExtraSlotPreview } from "../../../lib/statsExtraSlotPreview";
import { ScheduledSlot } from "@/components/scheduled/ScheduledSlot";
import { SettingItem, SettingsSection } from "../settingsChrome";
import { previewUploadIsland } from "../previewUploadIsland";
import { DebugButton } from "./DebugButton";

export function ScreenPreviewsSection() {
  return (
    <SettingsSection variant="group"
      title="Screen previews"
      keywords="preview onboarding splash boot crash fatal island walkthrough overlay"
    >
      {import.meta.env.DEV ? (
        <div className="hidden" aria-hidden>
          <ScheduledSlot name="recap.extra" year={new Date().getFullYear()} />
        </div>
      ) : null}
      <SettingItem
        title="Replay onboarding"
        description="Open the welcome and feature walkthrough overlay."
        keywords="welcome tutorial first run"
        control={<DebugButton label="Replay" onClick={() => requestReplayOnboardingPreview()} />}
      />
      <SettingItem
        title="Preview Discord onboarding"
        description="Island walkthrough for Discord Rich Presence only (skips older steps)."
        keywords="rich presence walkthrough"
        control={<DebugButton label="Preview" onClick={() => requestDiscordOnboardingPreview()} />}
      />
      <SettingItem
        title="Preview boot splash"
        description="Show the startup screen with the current nav mode background. Click anywhere to dismiss."
        keywords="startup loading"
        control={<DebugButton label="Preview" onClick={() => void emit("debug-preview-boot-splash")} />}
      />
      <SettingItem
        title="Preview UI crash screen"
        description="React error boundary fallback. Only the dynamic island stays above the overlay. Hover it for the in-pill capture icon; after capture the island widens with the filename. Tap that row to annotate. Reload or Escape dismisses."
        keywords="error boundary react"
        control={<DebugButton label="Preview" onClick={() => void emit("debug-preview-crash-ui")} />}
      />
      <SettingItem
        title="Preview fatal crash screen"
        description="Renderer or out-of-memory fallback. Only the dynamic island stays above the overlay. Hover it for the in-pill capture icon; after capture the island widens with the filename. Tap that row to annotate. Reload or Escape dismisses."
        keywords="renderer out of memory oom"
        control={<DebugButton label="Preview" onClick={() => void emit("debug-preview-crash-fatal")} />}
      />
      <SettingItem
        title="Preview upload island"
        description="Stage the 3 newest unseen uploads on the island and minimize the main window. Marks nothing seen."
        keywords="channel uploads dynamic island"
        onClick={() => void previewUploadIsland()}
      />
      {import.meta.env.DEV ? (
        <SettingItem
          title="Preview stats extra slot"
          description="Open the scheduled slideshow on the stats extra mount (live stats when available, otherwise sample data)."
          keywords="scheduled slideshow stats extra"
          control={<DebugButton label="Open" onClick={() => requestStatsExtraSlotPreview()} />}
        />
      ) : null}
    </SettingsSection>
  );
}
