import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { primaryArtist } from "@/components/music/musicArtist";
import { musicTrackIdentityKey } from "@/components/music/musicShelfDedup";
import {
  bridgeOwnerMatchesRenderState,
} from "@/lib/activityIslandResolve";
import type { ActivityOwner } from "@/lib/activityTypes";
import { noteIslandSkipDir } from "@/lib/islandSkipDirection";
import {
  getMainPlaybackBridge,
  getMainPlaybackBridgeOwner,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import { getPlaybackMediaElement } from "@/lib/playbackMediaElement";
import { isAudioOnlyPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";

type TaskbarTransportAction = "prev" | "play_pause" | "next" | "like";

const LIKE_ANIM_FRAMES = 9;
const LIKE_ANIM_MS = 40;

let likeAnimToken = 0;

function isWindowsTauri(): boolean {
  if (typeof window === "undefined") return false;
  if (!("__TAURI_INTERNALS__" in window)) return false;
  return /Windows/i.test(navigator.userAgent);
}

function resolveRenderState(
  activityOwner: ActivityOwner | null,
  playingFile: MediaFile | null,
): "idle" | "mini-owned" | "main-music" | "main-video" {
  if (activityOwner === "video-mini" || activityOwner === "music-mini") {
    return "mini-owned";
  }
  if (!playingFile) return "idle";
  if (isAudioOnlyPath(playingFile.path)) return "main-music";
  return "main-video";
}

type SyncPayload = {
  likeAnimFrame?: number;
  likeAnimFrames?: number;
};

function pushTaskbarTransportSync(payload: SyncPayload = {}): void {
  if (!isWindowsTauri()) return;

  const st = useRuforgeStore.getState();
  const renderState = resolveRenderState(st.activityOwner, st.playingFile);
  const bridge = getMainPlaybackBridge();
  const owner = getMainPlaybackBridgeOwner();
  const active =
    bridge !== null && bridgeOwnerMatchesRenderState(owner, renderState);
  const file = st.playingFile;
  const likeAvailable = renderState === "main-music" && active && file !== null;
  const liked =
    likeAvailable &&
    file !== null &&
    st.musicLikedKeys.includes(musicTrackIdentityKey(file, primaryArtist));

  const syncArgs: Record<string, unknown> = {
    active,
    paused: bridge?.paused ?? true,
    hasPrev: active && (bridge?.hasPrevInQueue ?? false),
    hasNext: active && (bridge?.hasNextInQueue ?? false),
    likeAvailable,
    liked,
  };
  if (payload.likeAnimFrame != null) {
    syncArgs.likeAnimFrame = payload.likeAnimFrame;
  }
  if (payload.likeAnimFrames != null) {
    syncArgs.likeAnimFrames = payload.likeAnimFrames;
  }

  void invoke("sync_taskbar_transport", syncArgs).catch(() => null);
}

async function runLikeThumbbarAnim(): Promise<void> {
  const token = ++likeAnimToken;
  for (let frame = 0; frame < LIKE_ANIM_FRAMES; frame++) {
    if (token !== likeAnimToken) return;
    pushTaskbarTransportSync({
      likeAnimFrame: frame,
      likeAnimFrames: LIKE_ANIM_FRAMES,
    });
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, LIKE_ANIM_MS);
    });
  }
  if (token === likeAnimToken) {
    pushTaskbarTransportSync();
  }
}

function executeTaskbarTransport(action: "prev" | "play_pause" | "next"): void {
  const bridge = getMainPlaybackBridge();
  if (bridge) {
    if (action === "prev") bridge.skipPrev?.();
    else if (action === "next") bridge.skipNext?.();
    else bridge.togglePlay?.();
    return;
  }

  const el = getPlaybackMediaElement();
  if (!el || action !== "play_pause") return;
  if (el.paused) {
    void el.play();
  } else {
    el.pause();
  }
}

function handleTaskbarLike(): void {
  const st = useRuforgeStore.getState();
  const file = st.playingFile;
  if (!file || !isAudioOnlyPath(file.path)) return;

  const key = musicTrackIdentityKey(file, primaryArtist);
  const wasLiked = st.musicLikedKeys.includes(key);
  st.toggleMusicLike(file);

  if (!wasLiked) {
    void runLikeThumbbarAnim();
  } else {
    likeAnimToken += 1;
    pushTaskbarTransportSync();
  }
}

export function setupTaskbarTransportBridge(): () => void {
  if (!isWindowsTauri()) {
    return () => undefined;
  }

  pushTaskbarTransportSync();

  const unsubBridge = subscribeMainPlaybackBridge(() => pushTaskbarTransportSync());
  const unsubStore = useRuforgeStore.subscribe(() => pushTaskbarTransportSync());

  const unlistenReadyPromise = listen("ruforge:taskbar-ready", () => {
    pushTaskbarTransportSync();
  });

  const unlistenPromise = listen<{ action: TaskbarTransportAction }>(
    "ruforge:taskbar-transport",
    (event) => {
      switch (event.payload.action) {
        case "like":
          handleTaskbarLike();
          return;
        case "prev":
        case "play_pause":
        case "next":
          if (event.payload.action === "prev") noteIslandSkipDir(-1);
          else if (event.payload.action === "next") noteIslandSkipDir(1);
          executeTaskbarTransport(event.payload.action);
          return;
        default:
          break;
      }
    },
  );

  return () => {
    likeAnimToken += 1;
    unsubBridge();
    unsubStore();
    void unlistenReadyPromise.then((unlisten) => unlisten());
    void unlistenPromise.then((unlisten) => unlisten());
  };
}
