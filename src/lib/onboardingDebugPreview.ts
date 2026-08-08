/** Same-window debug hooks for onboarding previews (avoids Tauri emit round-trip). */

type PreviewFn = () => void;

let discordPreview: PreviewFn | null = null;
let replayPreview: PreviewFn | null = null;

export function registerDiscordOnboardingPreview(fn: PreviewFn): () => void {
  discordPreview = fn;
  return () => {
    if (discordPreview === fn) discordPreview = null;
  };
}

export function registerReplayOnboardingPreview(fn: PreviewFn): () => void {
  replayPreview = fn;
  return () => {
    if (replayPreview === fn) replayPreview = null;
  };
}

export function requestDiscordOnboardingPreview(): void {
  discordPreview?.();
}

export function requestReplayOnboardingPreview(): void {
  replayPreview?.();
}
