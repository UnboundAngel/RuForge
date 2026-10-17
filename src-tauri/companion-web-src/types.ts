export type CompanionItem = {
  id: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  durationSecs?: number;
  container?: string;
  hasThumb: boolean;
  /** Cover version; part of the immutable `/art` URL. */
  thumbV?: number;
  mediaType?: "audio" | "video";
  playable: boolean;
  audioCodec?: string;
  videoCodec?: string;
  addedAt?: number;
  year?: number | null;
  trackNo?: number | null;
};

export type LibraryResponse = {
  items: CompanionItem[];
  refreshing?: boolean;
};

export type StreamTokenResponse = {
  url: string;
};

export type SponsorSegment = {
  UUID?: string;
  segment: [number, number];
  category: string;
  actionType: string;
};

export type SidecarResponse = {
  sponsorSegments?: SponsorSegment[];
  scrubSpriteCount?: number;
};

export type ProgressPayload = {
  positionSecs: number;
  durationSecs: number;
  playbackState: "playing" | "paused" | "ended";
};

export type ProgressResponse = {
  positionSecs: number;
  durationSecs: number;
};

export type SessionState =
  | "loading"
  | "paired"
  | "disconnected"
  | "session-lost"
  | "expired"
  | "unpaired";

export type MediaMode = "audio" | "video";

export type Tab = "home" | "search" | "library";

export type HomeChip = "all" | "music" | "videos";

export type LibraryChip = "songs" | "albums" | "artists" | "videos";

export type LibrarySort = "recent" | "title" | "artist";

export type ArtistSort = "album" | "recent" | "title";

export function itemMediaType(item: CompanionItem): "audio" | "video" {
  if (item.mediaType === "audio" || item.mediaType === "video")
    return item.mediaType;
  const c = (item.container ?? "").toLowerCase();
  const audioExts: Record<string, true> = {
    mp3: true, m4a: true, flac: true, opus: true, ogg: true, wav: true,
  };
  if (audioExts[c]) return "audio";
  if (!item.videoCodec && item.audioCodec) return "audio";
  return "video";
}

export function fmtDuration(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s < 10 ? `0${s}` : String(s);
  if (h > 0) return `${h}:${m < 10 ? "0" : ""}${m}:${ss}`;
  return `${m}:${ss}`;
}
