import type { ExplorerYouTubeProfilePayload } from "@/explorerProfileScript";
import { normalizeYoutubeChannelHandle } from "@/lib/youtubeChannelHandle";
import { sanitizeYoutubeAvatarUrl } from "@/lib/youtubeAvatarUrl";
import type {
  YouTubeExplorerProfile,
  YoutubeSessionStatus,
} from "@/store/types";

export type { YoutubeSessionStatus };

const LS_CACHE = "ruforge-youtube-profile-cache";

type CachedYoutubeProfile = {
  displayName: string;
  avatarUrl: string | null;
  channelHandle?: string | null;
  updatedAt: number;
};

export function isGenericYoutubeProfileName(name: string): boolean {
  return GENERIC_CHANNEL_NAMES.has(name.trim().toLowerCase());
}

function slugHandleFromDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || isGenericYoutubeProfileName(trimmed)) return null;
  if (trimmed.startsWith("@")) return normalizeYoutubeChannelHandle(trimmed);
  return normalizeYoutubeChannelHandle(
    `@${trimmed.replace(/\s+/g, "").toLowerCase()}`,
  );
}

/** Handle that was guessed from display name slug, not scraped from YouTube. */
export function isSyntheticYoutubeHandle(
  profile: YouTubeExplorerProfile | null,
): boolean {
  if (!profile) return false;
  const handle = normalizeYoutubeChannelHandle(profile.channelHandle);
  if (!handle) return false;
  const slug = slugHandleFromDisplayName(profile.displayName);
  return !!slug && handle === slug;
}

/** Avatar cached but real @handle still missing or was slug-guessed. */
export function profileNeedsIdentityProbe(
  profile: YouTubeExplorerProfile | null,
  status: YoutubeSessionStatus,
): boolean {
  if (status === "signed-out" || !profile) return false;
  const handle = normalizeYoutubeChannelHandle(profile.channelHandle);
  if (handle && !isSyntheticYoutubeHandle(profile)) return false;
  return true;
}

export function formatYoutubeHandleLabel(
  profile: YouTubeExplorerProfile | null,
): string | null {
  if (!profile) return null;
  const handle = normalizeYoutubeChannelHandle(profile.channelHandle);
  if (handle && !isSyntheticYoutubeHandle(profile)) return handle;
  return null;
}

/** Hover pill text: prefer @handle, else display name (never hide when signed in). */
export function youtubeProfileHoverLabel(
  profile: YouTubeExplorerProfile | null,
): string {
  if (!profile) return "YouTube";
  const handle = formatYoutubeHandleLabel(profile);
  if (handle) return handle;
  const name = profile.displayName.trim();
  if (name) return name;
  return "YouTube";
}

function cacheToProfile(cache: CachedYoutubeProfile): YouTubeExplorerProfile {
  return {
    displayName: cache.displayName,
    avatarUrl: cache.avatarUrl,
    channelHandle: cache.channelHandle ?? null,
  };
}

export type YoutubeProfileSessionState = {
  status: YoutubeSessionStatus;
  profile: YouTubeExplorerProfile | null;
};

let signOutStreak = 0;

export function readYoutubeProfileCache(): CachedYoutubeProfile | null {
  try {
    const raw = localStorage.getItem(LS_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedYoutubeProfile;
    if (!parsed?.displayName || typeof parsed.displayName !== "string") return null;
    const displayName = parsed.displayName.trim();
    let channelHandle = normalizeYoutubeChannelHandle(parsed.channelHandle);
    if (
      channelHandle
      && isSyntheticYoutubeHandle({
        displayName,
        avatarUrl: null,
        channelHandle,
      })
    ) {
      channelHandle = null;
    }
    const avatarUrl =
      typeof parsed.avatarUrl === "string"
        ? sanitizeYoutubeAvatarUrl(parsed.avatarUrl)
        : null;
    if (!avatarUrl && isGenericYoutubeProfileName(displayName) && !channelHandle) {
      return null;
    }
    return {
      displayName,
      avatarUrl,
      channelHandle: channelHandle || null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeYoutubeProfileCache(profile: YouTubeExplorerProfile): void {
  try {
    const entry: CachedYoutubeProfile = {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      channelHandle: profile.channelHandle ?? null,
      updatedAt: Date.now(),
    };
    localStorage.setItem(LS_CACHE, JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

export function clearYoutubeProfileCache(): void {
  localStorage.removeItem(LS_CACHE);
}

export function hydrateYoutubeProfileSession(): YoutubeProfileSessionState {
  const cache = readYoutubeProfileCache();
  if (!cache) {
    return { status: "signed-out", profile: null };
  }
  const profile = cacheToProfile(cache);
  if (cache.avatarUrl) {
    return { status: "signed-in", profile };
  }
  if (cache.channelHandle || !isGenericYoutubeProfileName(cache.displayName)) {
    return { status: "signed-in", profile };
  }
  return { status: "pending", profile };
}

const GENERIC_CHANNEL_NAMES = new Set(
  ["your channel", "youtube", "account"].map((s) => s.toLowerCase()),
);

function mergeAvatarFromCache(
  displayName: string,
  liveAvatar: string | null,
): string | null {
  if (liveAvatar) return liveAvatar;
  const cache = readYoutubeProfileCache();
  if (!cache?.avatarUrl) return null;
  const generic = GENERIC_CHANNEL_NAMES.has(displayName.trim().toLowerCase());
  if (generic || cache.displayName.toLowerCase() === displayName.toLowerCase()) {
    return cache.avatarUrl;
  }
  return cache.avatarUrl;
}

function resolveDisplayName(
  probeName: string,
  cache: CachedYoutubeProfile | null,
): string {
  const trimmed = probeName.trim();
  if (!GENERIC_CHANNEL_NAMES.has(trimmed.toLowerCase())) return trimmed;
  if (cache?.displayName && !GENERIC_CHANNEL_NAMES.has(cache.displayName.toLowerCase())) {
    return cache.displayName;
  }
  return trimmed;
}

function mergeStoredHandle(
  displayName: string,
  raw: string | null | undefined,
): string | null {
  const handle = normalizeYoutubeChannelHandle(raw);
  if (!handle) return null;
  if (
    isSyntheticYoutubeHandle({
      displayName,
      avatarUrl: null,
      channelHandle: handle,
    })
  ) {
    return null;
  }
  return handle;
}

export function applyYoutubeProfileProbe(
  payload: ExplorerYouTubeProfilePayload,
  prev: YoutubeProfileSessionState,
): YoutubeProfileSessionState {
  if (
    !payload ||
    typeof payload.displayName !== "string" ||
    !payload.displayName.trim()
  ) {
    signOutStreak += 1;
    const cache = readYoutubeProfileCache();
    if (signOutStreak < 2 && cache?.avatarUrl) {
      return { status: "signed-in", profile: cacheToProfile(cache) };
    }
    if (signOutStreak < 2 && prev.status === "signed-in" && prev.profile) {
      return prev;
    }
    signOutStreak = 0;
    return { status: "signed-out", profile: null };
  }

  signOutStreak = 0;
  const cache = readYoutubeProfileCache();
  const rawName = payload.displayName.trim();
  const displayName = resolveDisplayName(rawName, cache);
  const incomingAvatar =
    typeof payload.avatarUrl === "string" && payload.avatarUrl.trim()
      ? sanitizeYoutubeAvatarUrl(payload.avatarUrl.trim())
      : payload.avatarUrl === null
        ? null
        : undefined;
  let avatarUrl: string | null;
  if (incomingAvatar) {
    avatarUrl = incomingAvatar;
  } else if (incomingAvatar === null) {
    avatarUrl =
      prev.profile?.avatarUrl
      && (isGenericYoutubeProfileName(rawName) || rawName === prev.profile.displayName)
        ? prev.profile.avatarUrl
        : mergeAvatarFromCache(rawName, null);
  } else {
    avatarUrl =
      prev.profile?.avatarUrl
      && (isGenericYoutubeProfileName(rawName) || rawName === prev.profile.displayName)
        ? prev.profile.avatarUrl
        : mergeAvatarFromCache(rawName, null);
  }
  const channelHandle =
    normalizeYoutubeChannelHandle(payload.channelHandle)
    ?? mergeStoredHandle(displayName, prev.profile?.channelHandle)
    ?? mergeStoredHandle(displayName, cache?.channelHandle)
    ?? null;
  let resolvedName = displayName;
  if (isGenericYoutubeProfileName(resolvedName) && channelHandle) {
    resolvedName = channelHandle.slice(1);
  }
  const profile: YouTubeExplorerProfile = {
    displayName: resolvedName,
    avatarUrl,
    channelHandle,
  };

  if (avatarUrl || channelHandle || !isGenericYoutubeProfileName(resolvedName)) {
    writeYoutubeProfileCache(profile);
  } else if (cache?.avatarUrl) {
    writeYoutubeProfileCache({
      displayName: resolvedName,
      avatarUrl: cache.avatarUrl,
      channelHandle: cache.channelHandle ?? channelHandle,
    });
  }

  return { status: "signed-in", profile };
}
