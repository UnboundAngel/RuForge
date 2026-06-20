export const DEV_CAPTURES_CHANGED_EVENT = "ruforge-dev-captures-changed";

export function notifyDevCapturesChanged(): void {
  window.dispatchEvent(new CustomEvent(DEV_CAPTURES_CHANGED_EVENT));
}
