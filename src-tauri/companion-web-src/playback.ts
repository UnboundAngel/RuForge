import { itemMediaType, type CompanionItem } from "./types";

const VIDEO_CODECS: Record<string, string> = {
  h264: "avc1.42E01E",
  hevc: "hvc1.1.6.L93.B0",
  vp8: "vp8",
  vp9: "vp09.00.10.08",
  av1: "av01.0.05M.08",
};

const AUDIO_CODECS: Record<string, string> = {
  aac: "mp4a.40.2",
  mp3: "mp4a.6B",
  opus: "opus",
  vorbis: "vorbis",
  flac: "flac",
};

function audioMime(container: string, codec: string): string | null {
  const c = AUDIO_CODECS[codec];
  switch (container) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "mp4":
    case "aac":
      return c ? `audio/mp4; codecs="${c}"` : "audio/mp4";
    case "flac":
      return "audio/flac";
    case "wav":
      return "audio/wav";
    case "ogg":
      return `audio/ogg; codecs="${c ?? "vorbis"}"`;
    case "opus":
      return `audio/ogg; codecs="opus"`;
    case "webm":
      return `audio/webm; codecs="${c ?? "opus"}"`;
    default:
      return null;
  }
}

function videoMime(container: string, vcodec: string, acodec: string): string | null {
  if (container !== "mp4" && container !== "webm") return null;
  const codecs = [VIDEO_CODECS[vcodec], acodec ? AUDIO_CODECS[acodec] : undefined].filter(Boolean);
  const base = container === "mp4" ? "video/mp4" : "video/webm";
  return codecs.length > 0 ? `${base}; codecs="${codecs.join(", ")}"` : base;
}

const verdicts = new Map<string, boolean>();
let probe: HTMLVideoElement | null = null;

/** Asks this browser, not the PC, whether it can decode the file. Safari and Chromium disagree on WebM. */
export function playsHere(item: CompanionItem): boolean {
  if (!item.playable) return false;
  const container = (item.container ?? "").toLowerCase();
  const vcodec = (item.videoCodec ?? "").toLowerCase();
  const acodec = (item.audioCodec ?? "").toLowerCase();
  const mime =
    itemMediaType(item) === "audio"
      ? audioMime(container, acodec)
      : videoMime(container, vcodec, acodec);
  if (!mime) return true;
  const cached = verdicts.get(mime);
  if (cached !== undefined) return cached;
  probe ??= document.createElement("video");
  const ok = probe.canPlayType(mime) !== "";
  verdicts.set(mime, ok);
  return ok;
}
