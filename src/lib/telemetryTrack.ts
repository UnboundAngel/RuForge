import { loadMergedSettings } from "@/store/types";

export function telemetryDevGateOpen(): boolean {
  return loadMergedSettings().showDebuggingSettings === true;
}

export async function trackTelemetryEvent(
  name: string,
  props?: Record<string, string | number>,
): Promise<void> {
  if (!telemetryDevGateOpen()) return;
  const { trackEvent } = await import("@aptabase/tauri");
  void trackEvent(name, props);
}
