import { trackEvent } from "@aptabase/tauri";

import { getOrCreateInstallId } from "@/lib/telemetryInstallId";
import { loadMergedSettings } from "@/store/types";

let firedThisSession = false;

export function fireAppActive(): void {
  if (firedThisSession) return;
  firedThisSession = true;

  const settings = loadMergedSettings();
  if (!settings.telemetryUsageEnabled) return;

  const installId = getOrCreateInstallId();
  void trackEvent("app_active", { install_id: installId });
}
