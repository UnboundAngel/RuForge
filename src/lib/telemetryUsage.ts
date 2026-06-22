import { getOrCreateInstallId } from "@/lib/telemetryInstallId";
import { trackTelemetryEvent } from "@/lib/telemetryTrack";
import { loadMergedSettings } from "@/store/types";

let firedThisSession = false;

export function fireAppActive(): void {
  if (firedThisSession) return;
  firedThisSession = true;

  const settings = loadMergedSettings();
  if (!settings.showDebuggingSettings) return;
  if (!settings.telemetryUsageEnabled) return;

  const installId = getOrCreateInstallId();
  void trackTelemetryEvent("app_active", { install_id: installId });
}
