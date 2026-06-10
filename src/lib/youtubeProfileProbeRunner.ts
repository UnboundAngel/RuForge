import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  buildExplorerProfileProbeScript,
  EXPLORER_SESSION_PROBE_WEBVIEW_LABEL,
  MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT,
  MUSIC_EXPLORE_WEBVIEW_LABEL,
} from "@/explorerProfileScript";
import { profileNeedsIdentityProbe } from "@/lib/youtubeProfileSession";
import {
  EMBEDDED_EXPLORER_WEBVIEW_LABEL,
  ensureEmbeddedExplorerWebview,
  getEmbeddedExplorerWebview,
} from "@/explorerWebviewLifecycle";
import { useRuforgeStore } from "@/store/ruforgeStore";

const PROBE_INTERNAL_TICKS = 20;
const IDENTITY_PROBE_TICKS = 12;
const BOOT_INITIAL_WAIT_MS = 1200;

let bootProbeStarted = false;
let identityProbeInFlight = false;
let explorerProbeInFlight = false;

export function profileNeedsAvatarProbe(): boolean {
  const { youtubeSessionStatus, youtubeExplorerProfile } =
    useRuforgeStore.getState();
  if (youtubeSessionStatus === "signed-out") return true;
  if (youtubeSessionStatus === "pending") return true;
  if (youtubeSessionStatus === "signed-in" && !youtubeExplorerProfile?.avatarUrl) {
    return true;
  }
  return false;
}

function sessionNeedsExplorerProbe(reason: string): boolean {
  if (reason === "login-nav" || reason === "identity-followup") return true;
  const { youtubeSessionStatus, youtubeExplorerProfile } =
    useRuforgeStore.getState();
  if (profileNeedsAvatarProbe()) return true;
  return profileNeedsIdentityProbe(youtubeExplorerProfile, youtubeSessionStatus);
}

async function evalProfileProbe(label: string, script: string): Promise<boolean> {
  try {
    await invoke("eval_in_webview", { label, script });
    return true;
  } catch {
    return false;
  }
}

async function evalProbeOnce(label: string, script: string): Promise<boolean> {
  return evalProfileProbe(label, script);
}

async function hideWebview(label: string): Promise<void> {
  const wv = await getEmbeddedExplorerWebview(label);
  try {
    await wv?.hide();
  } catch {
    /* ok */
  }
}

/** Off-screen hidden webview; separate label so boot never paints into explorer-view. */
export async function ensureSessionProbeWebview(): Promise<boolean> {
  const existing = await getEmbeddedExplorerWebview(
    EXPLORER_SESSION_PROBE_WEBVIEW_LABEL,
  );
  if (existing) {
    try {
      await existing.hide();
    } catch {
      /* ok */
    }
    return true;
  }

  try {
    const appWindow = getCurrentWindow();
    const dataDir = await appDataDir();
    const explorerDataPath = await join(dataDir, "explorer-data");
    const extraBrowserArgs = await invoke<string | null>(
      "get_hardware_acceleration_browser_args",
    );
    const webview = await ensureEmbeddedExplorerWebview({
      window: appWindow,
      label: EXPLORER_SESSION_PROBE_WEBVIEW_LABEL,
      url: "https://www.youtube.com",
      x: -4096,
      y: -4096,
      width: 1,
      height: 1,
      dataDirectory: explorerDataPath,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      additionalBrowserArgs: extraBrowserArgs,
    });
    try {
      await webview.hide();
    } catch {
      /* ok */
    }
    return true;
  } catch {
    return false;
  }
}

export async function runExplorerProfileProbe(reason: string): Promise<void> {
  const needsProbe = sessionNeedsExplorerProbe(reason);
  const { youtubeSessionStatus, youtubeExplorerProfile } =
    useRuforgeStore.getState();
  if (!needsProbe) {
    return;
  }

  const isBoot = reason === "boot" || reason === "boot-identity";
  if (!isBoot) {
    if (explorerProbeInFlight) return;
    explorerProbeInFlight = true;
  }

  const identityOnly =
    !profileNeedsAvatarProbe()
    && profileNeedsIdentityProbe(youtubeExplorerProfile, youtubeSessionStatus);

  if (identityOnly) {
    if (identityProbeInFlight) {
      if (!isBoot) explorerProbeInFlight = false;
      return;
    }
    identityProbeInFlight = true;
  }

  const uiLabel = EMBEDDED_EXPLORER_WEBVIEW_LABEL;
  const bootLabel = EXPLORER_SESSION_PROBE_WEBVIEW_LABEL;
  const ticks = identityOnly ? IDENTITY_PROBE_TICKS : PROBE_INTERNAL_TICKS;
  const script = buildExplorerProfileProbeScript(ticks);

  try {
    if (isBoot) {
      const created = await ensureSessionProbeWebview();
      if (!created) return;
      await new Promise((r) => setTimeout(r, BOOT_INITIAL_WAIT_MS));
      await evalProbeOnce(bootLabel, script);
      await hideWebview(bootLabel);
      return;
    }

    const ui = await getEmbeddedExplorerWebview(uiLabel);
    if (!ui) {
      return;
    }
    await new Promise((r) => setTimeout(r, identityOnly ? 1200 : 900));
    await evalProbeOnce(uiLabel, script);
  } finally {
    if (identityOnly) {
      identityProbeInFlight = false;
    }
    if (!isBoot) {
      explorerProbeInFlight = false;
    }
  }
}

export async function runMusicExploreProfileProbe(_reason: string): Promise<void> {
  const { youtubeSessionStatus, youtubeExplorerProfile } =
    useRuforgeStore.getState();
  if (
    !profileNeedsAvatarProbe()
    && !profileNeedsIdentityProbe(youtubeExplorerProfile, youtubeSessionStatus)
  ) {
    return;
  }
  await evalProbeOnce(
    MUSIC_EXPLORE_WEBVIEW_LABEL,
    MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT,
  );
}

export async function runBootProfileProbeIfNeeded(
  _sessionStatus: string,
): Promise<void> {
  if (bootProbeStarted) return;
  const { youtubeExplorerProfile, youtubeSessionStatus } =
    useRuforgeStore.getState();

  const needsIdentity = profileNeedsIdentityProbe(
    youtubeExplorerProfile,
    youtubeSessionStatus,
  );
  const needsAvatar = profileNeedsAvatarProbe();

  if (!needsAvatar && !needsIdentity) {
    return;
  }

  bootProbeStarted = true;
  await runExplorerProfileProbe(needsIdentity && !needsAvatar ? "boot-identity" : "boot");
}

let identityFollowupArm = false;

export function maybeScheduleIdentityFollowupProbe(): void {
  if (identityFollowupArm) return;
  const { youtubeExplorerProfile, youtubeSessionStatus } =
    useRuforgeStore.getState();
  if (!profileNeedsIdentityProbe(youtubeExplorerProfile, youtubeSessionStatus)) {
    return;
  }
  identityFollowupArm = true;
  scheduleExplorerProfileProbeAfterShow("identity-followup");
  window.setTimeout(() => {
    identityFollowupArm = false;
  }, 20_000);
}
export function scheduleExplorerProfileProbeAfterShow(reason: string): void {
  if (!sessionNeedsExplorerProbe(reason)) return;
  window.setTimeout(() => {
    void runExplorerProfileProbe(reason);
  }, 400);
}
