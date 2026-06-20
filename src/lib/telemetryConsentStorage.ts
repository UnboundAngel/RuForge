const CONSENT_SEEN_KEY = "ruforge-telemetry-consent-seen";

export function hasSeenTelemetryConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markTelemetryConsentSeen(): void {
  try {
    localStorage.setItem(CONSENT_SEEN_KEY, "true");
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearTelemetryConsentSeen(): void {
  try {
    localStorage.removeItem(CONSENT_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
