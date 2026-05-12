/** Reads persisted RuForge playback prefs (nested under `ruforge-settings` JSON). */

function readRuforgeSettingsRecord(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem("ruforge-settings");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed != null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readAudioAutoAdvanceFolder(): boolean {
  return readRuforgeSettingsRecord().audioAutoAdvanceFolder !== false;
}

export function readAudioPrefetchNext(): boolean {
  return readRuforgeSettingsRecord().audioPrefetchNext !== false;
}
