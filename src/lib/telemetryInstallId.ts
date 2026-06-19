const INSTALL_ID_KEY = "ruforge-telemetry-install-id";

export function getOrCreateInstallId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(INSTALL_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
