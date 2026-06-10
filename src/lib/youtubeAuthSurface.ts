import { readYoutubeProfileCache } from "@/lib/youtubeProfileSession";
import { sanitizeYoutubeAvatarUrl } from "@/lib/youtubeAvatarUrl";
import type { NavMode } from "@/store/types";
import type { ActiveTab } from "@/store/types";
import type { MusicView } from "@/store/types";
import { useRuforgeStore } from "@/store/ruforgeStore";

export function isYoutubeAuthSurfaceActive(
  navMode: NavMode,
  activeTab: ActiveTab,
  musicView: MusicView,
): boolean {
  if (navMode === "music") return musicView === "explore";
  return activeTab === "explorer";
}

function hasDisplayableAvatar(): boolean {
  const profile = useRuforgeStore.getState().youtubeExplorerProfile;
  return !!sanitizeYoutubeAvatarUrl(profile?.avatarUrl ?? null);
}

function profileFromCache() {
  const cache = readYoutubeProfileCache();
  if (!cache) return null;
  return {
    displayName: cache.displayName,
    avatarUrl: cache.avatarUrl,
    channelHandle: cache.channelHandle ?? null,
  };
}

/** User opened Explorer (or Music Explore): show spinner until PFP or they leave. */
export function onYoutubeAuthSurfaceEnter(): void {
  if (hasDisplayableAvatar()) return;

  const cached = profileFromCache();
  if (cached?.avatarUrl) {
    useRuforgeStore.getState().setYoutubeProfileSession({
      status: "signed-in",
      profile: cached,
    });
    return;
  }

  const { youtubeSessionStatus, youtubeExplorerProfile, setYoutubeProfileSession } =
    useRuforgeStore.getState();
  if (youtubeSessionStatus === "signed-in" && youtubeExplorerProfile?.avatarUrl) {
    return;
  }
  setYoutubeProfileSession({
    status: "pending",
    profile: youtubeExplorerProfile ?? cached,
  });
}

/** Left auth surface without a captured PFP: back to Log in only if nothing in cache. */
export function onYoutubeAuthSurfaceLeave(): void {
  if (hasDisplayableAvatar()) return;

  const cached = profileFromCache();
  if (cached?.avatarUrl) {
    useRuforgeStore.getState().setYoutubeProfileSession({
      status: "signed-in",
      profile: cached,
    });
    return;
  }

  useRuforgeStore.getState().setYoutubeProfileSession({
    status: "signed-out",
    profile: null,
  });
}
