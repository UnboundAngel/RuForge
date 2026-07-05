export type CompanionItem = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  durationSecs?: number;
  container?: string;
  hasThumb: boolean;
  mediaType?: "audio" | "video";
  playable: boolean;
  audioCodec?: string;
  videoCodec?: string;
  scrubSpriteCount?: number;
};

export type LibraryResponse = {
  items: CompanionItem[];
  catalogRefreshing?: boolean;
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
  sbSegments?: SponsorSegment[];
  scrubSpriteCount?: number;
};

export type ProgressPayload = {
  positionSecs: number;
  durationSecs: number;
  playbackState: "playing" | "paused" | "ended";
};

export type SessionState =
  | "loading"
  | "paired"
  | "disconnected"
  | "session-lost"
  | "expired"
  | "unpaired";

export type MediaMode = "audio" | "video";

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
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
