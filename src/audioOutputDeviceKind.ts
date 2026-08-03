/** Form-factor guess from Chromium/Windows output labels (no richer device API). */
export type AudioOutputDeviceKind =
  | "default"
  | "headphones"
  | "display"
  | "bluetooth"
  | "virtual"
  | "speakers";

export function classifyAudioOutputDeviceKind(label: string): AudioOutputDeviceKind {
  const t = label.trim();
  if (!t) return "speakers";
  if (/^system\s+default$/i.test(t)) return "default";

  const lower = t.toLowerCase();

  if (
    /\b(headphones?|headset|earbuds?|airpods|beats|treblab|sony\s*wh|bose\s*qc)\b/.test(
      lower,
    )
  ) {
    return "headphones";
  }

  if (/\b(bluetooth|\bbt\b)/.test(lower)) {
    return "bluetooth";
  }

  if (
    /\b(vb-?audio|virtual\s*cable|cable\s*in|cable\s*input|voicemeeter|steam\s*streaming)\b/.test(
      lower,
    )
  ) {
    return "virtual";
  }

  // Monitor / HDMI endpoints usually omit the "Speakers (" prefix.
  if (
    /\b(hdmi|display\s*port|\bdp\b|nvidia\s*high\s*definition|intel\(r\)\s*display|amd\s*hdmi)\b/.test(
      lower,
    ) ||
    (!/^speakers\b/.test(lower) && /\bhigh\s*definition\s*audio\b/.test(lower))
  ) {
    return "display";
  }

  if (/^speakers\b/.test(lower) || /\bspeaker\b/.test(lower)) {
    return "speakers";
  }

  return "speakers";
}
