import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { primaryArtist, rawArtistFromFile } from "@/components/music/musicArtist";
import {
  getMainPlaybackBridge,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import type { ActivityRenderState } from "@/lib/activityTypes";
import { isAudioOnlyPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";

type DiscordActivityKind = "playing" | "listening" | "watching";

type DiscordActivityPayload = {
  kind: DiscordActivityKind;
  details: string | null;
  state: string | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  largeImage: string | null;
  largeText: string | null;
  smallImage: string | null;
  smallText: string | null;
};

/** Keep browse elapsed time across tab swaps (library ↔ explorer ↔ settings). */
let browseSessionStartedAt: number | null = null;

type MediaSessionAnchor = {
  identity: string;
  startTimestamp: number;
  endTimestamp: number | null;
};

/** Stable progress bar while the same track plays (ignore brief currentTime=0 flickers). */
let mediaSession: MediaSessionAnchor | null = null;

/** Must stay under Rust STALE_AFTER (3 × 15s floor). */
const HEARTBEAT_MS = 15_000;

function isMainPresenceWindow(): boolean {
  try {
    const label = getCurrentWindow().label;
    return label !== "mini" && label !== "music-mini" && label !== "island";
  } catch {
    return false;
  }
}

function resolveRenderState(
  activityOwner: ReturnType<typeof useRuforgeStore.getState>["activityOwner"],
  playingFile: MediaFile | null,
): ActivityRenderState {
  if (activityOwner === "video-mini" || activityOwner === "music-mini") {
    return "mini-owned";
  }
  if (!playingFile) return "idle";
  if (isAudioOnlyPath(playingFile.path)) return "main-music";
  return "main-video";
}

function mediaTitle(file: MediaFile): string {
  const canonical = file.canonicalTitle?.trim();
  if (canonical) return canonical;
  return file.name || "RuForge";
}

function musicArtist(file: MediaFile): string {
  const canonical = file.canonicalArtist?.trim();
  if (canonical) return primaryArtist(canonical);
  return primaryArtist(rawArtistFromFile(file));
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function resetPresenceSessions() {
  browseSessionStartedAt = null;
  mediaSession = null;
}

function baseAssets(): Pick<
  DiscordActivityPayload,
  "largeImage" | "largeText" | "smallImage" | "smallText"
> {
  // Omit portal art until Angel uploads the `ruforge` key. An unknown large_image
  // key can cause Discord to drop the entire SET_ACTIVITY (spike worked with no assets).
  return {
    largeImage: null,
    largeText: null,
    smallImage: null,
    smallText: null,
  };
}

function mediaPayload(
  kind: "listening" | "watching",
  details: string,
  state: string | null,
  paused: boolean,
  currentTime: number,
  duration: number,
): DiscordActivityPayload {
  browseSessionStartedAt = null;

  if (paused) {
    mediaSession = null;
    return {
      kind,
      details,
      state,
      startTimestamp: null,
      endTimestamp: null,
      ...baseAssets(),
    };
  }

  const t = Math.max(0, currentTime);
  const dur = duration > 0 && Number.isFinite(duration) ? Math.floor(duration) : 0;
  const identity = `${kind}\0${details}\0${state ?? ""}\0${dur}`;
  const computedStart = nowUnix() - Math.floor(t);
  const computedEnd = dur > 0 ? computedStart + dur : null;

  // Tab swaps can briefly report 0:00 while the same track is still playing.
  if (
    mediaSession &&
    mediaSession.identity === identity &&
    t < 1.5 &&
    nowUnix() - mediaSession.startTimestamp > 3
  ) {
    return {
      kind,
      details,
      state,
      startTimestamp: mediaSession.startTimestamp,
      endTimestamp: mediaSession.endTimestamp,
      ...baseAssets(),
    };
  }

  if (
    !mediaSession ||
    mediaSession.identity !== identity ||
    Math.abs(mediaSession.startTimestamp - computedStart) > 2
  ) {
    mediaSession = {
      identity,
      startTimestamp: computedStart,
      endTimestamp: computedEnd,
    };
  }

  return {
    kind,
    details,
    state,
    startTimestamp: mediaSession.startTimestamp,
    endTimestamp: mediaSession.endTimestamp,
    ...baseAssets(),
  };
}

function browsePayload(details: string): DiscordActivityPayload {
  mediaSession = null;
  if (browseSessionStartedAt == null) {
    browseSessionStartedAt = nowUnix();
  }
  return {
    kind: "playing",
    details,
    state: null,
    // Stable start so Discord elapsed time does not reset on every page swap.
    startTimestamp: browseSessionStartedAt,
    endTimestamp: null,
    ...baseAssets(),
  };
}

function buildSnapshot(): DiscordActivityPayload | null {
  const st = useRuforgeStore.getState();
  const {
    settings,
    playingFile,
    activityOwner,
    activityHandoff,
    activeTab,
    navMode,
    downloadJobs,
  } = st;

  if (!settings.discordPresenceEnabled) return null;

  const showTitles = settings.discordPresenceShowTitles !== false;
  const showBrowsing = settings.discordPresenceShowBrowsing !== false;

  const renderState = resolveRenderState(activityOwner, playingFile);
  const file =
    renderState === "mini-owned" ? activityHandoff?.file ?? null : playingFile;

  const bridge = getMainPlaybackBridge();
  const paused =
    renderState === "mini-owned"
      ? (activityHandoff?.paused ?? true)
      : (bridge?.paused ?? true);
  const currentTime =
    renderState === "mini-owned"
      ? (activityHandoff?.startTime ?? 0)
      : (bridge?.currentTime ?? 0);
  const duration =
    renderState === "mini-owned"
      ? (activityHandoff?.file?.duration ?? 0)
      : bridge && bridge.duration > 0
        ? bridge.duration
        : (file?.duration ?? 0);

  const isMusic =
    renderState === "main-music" ||
    (renderState === "mini-owned" && file != null && isAudioOnlyPath(file.path));
  const isVideo =
    renderState === "main-video" ||
    (renderState === "mini-owned" && file != null && !isAudioOnlyPath(file.path));

  if (file && (isMusic || isVideo)) {
    if (isMusic) {
      const details = showTitles ? mediaTitle(file) : "Listening to music";
      const artist = musicArtist(file);
      let state: string | null = null;
      if (paused) state = "Paused";
      else if (showTitles && artist) state = artist;
      return mediaPayload("listening", details, state, paused, currentTime, duration);
    }
    const details = showTitles ? mediaTitle(file) : "Watching a video";
    const state = paused ? "Paused" : null;
    return mediaPayload("watching", details, state, paused, currentTime, duration);
  }

  const activeDownload = downloadJobs.find((j) => j.status === "downloading");
  if (activeDownload) {
    const jobName =
      activeDownload.metadata?.title?.trim() ||
      activeDownload.title?.trim() ||
      null;
    const details =
      showTitles && jobName
        ? `Downloading ${jobName}`
        : "Downloading something";
    return browsePayload(details);
  }

  if (!showBrowsing) return null;

  if (st.settingsOpen) {
    return browsePayload("Mingling in the settings");
  }
  if (st.downloaderOpen) {
    return browsePayload("Looking for something to download");
  }
  if (activeTab === "explorer") {
    return browsePayload("Searching YouTube");
  }
  if (navMode === "music") {
    return browsePayload("Finding something to listen to");
  }
  if (activeTab === "media") {
    return browsePayload("Exploring the video library");
  }
  if (activeTab === "player") {
    return browsePayload("In the player");
  }

  return null;
}

export function setupDiscordPresenceTransport(): () => void {
  if (!isMainPresenceWindow()) {
    return () => undefined;
  }

  let lastEnabled: boolean | null = null;
  let inFlight = false;
  let queued = false;

  const push = async () => {
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      do {
        queued = false;
        const enabled = useRuforgeStore.getState().settings.discordPresenceEnabled === true;
        if (lastEnabled !== enabled) {
          await invoke("discord_rpc_set_enabled", { enabled });
          lastEnabled = enabled;
          if (!enabled) resetPresenceSessions();
        }
        if (!enabled) continue;

        const snapshot = buildSnapshot();
        if (!snapshot) {
          resetPresenceSessions();
          await invoke("discord_rpc_clear_activity");
        } else {
          await invoke("discord_rpc_set_activity", { payload: snapshot });
        }
      } while (queued);
    } catch (err) {
      console.error("[discord-presence]", err);
    } finally {
      inFlight = false;
      if (queued) {
        queued = false;
        void push();
      }
    }
  };

  const refresh = () => {
    void push();
  };

  refresh();
  const unsubBridge = subscribeMainPlaybackBridge(refresh);
  const unsubStore = useRuforgeStore.subscribe(refresh);
  const heartbeat = window.setInterval(refresh, HEARTBEAT_MS);

  void invoke<DiscordRpcStatus>("discord_rpc_status")
    .then((status) => {
      if (useRuforgeStore.getState().settings.discordPresenceEnabled === true) {
        console.info("[discord-presence] status", status);
      }
    })
    .catch((err) => console.error("[discord-presence] status", err));

  return () => {
    window.clearInterval(heartbeat);
    unsubBridge();
    unsubStore();
    resetPresenceSessions();
  };
}

type DiscordRpcStatus = {
  enabled: boolean;
  connection: "disabled" | "disconnected" | "connected";
  hasActivity: boolean;
};
