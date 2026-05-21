/** Web Audio tap for audio-only LED visualizer (WebView-safe, MES reuse). */

export type AnalyserGraph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: AudioNode;
  freqData: Uint8Array;
  tappedStream: boolean;
};

const graphs = new WeakMap<HTMLMediaElement, AnalyserGraph>();
const mesAlreadyAttached = new WeakSet<HTMLMediaElement>();
const mediaElementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
const mediaStreamSources = new WeakMap<HTMLMediaElement, MediaStreamAudioSourceNode>();

type CaptureCapable = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function createAudioContext(): AudioContext {
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("AudioContext unavailable");
  return new Ctor();
}

function captureElementStream(el: HTMLMediaElement): MediaStream | null {
  const cap = el as CaptureCapable;
  try {
    return cap.captureStream?.() ?? cap.mozCaptureStream?.() ?? null;
  } catch {
    return null;
  }
}

function buildAnalyser(ctx: AudioContext): AnalyserNode {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  analyser.minDecibels = -85;
  analyser.maxDecibels = -8;
  return analyser;
}

function wireGraph(
  el: HTMLMediaElement,
  ctx: AudioContext,
  source: AudioNode,
  analyser: AnalyserNode,
  tappedStream: boolean,
): AnalyserGraph {
  source.connect(analyser);
  analyser.connect(ctx.destination);
  const graph: AnalyserGraph = {
    ctx,
    analyser,
    source,
    freqData: new Uint8Array(analyser.frequencyBinCount),
    tappedStream,
  };
  graphs.set(el, graph);
  void ctx.resume();
  return graph;
}

function reconnectExistingGraph(g: AnalyserGraph): AnalyserGraph {
  try {
    g.source.disconnect();
    g.analyser.disconnect();
  } catch {
    /* already disconnected */
  }
  g.source.connect(g.analyser);
  g.analyser.connect(g.ctx.destination);
  void g.ctx.resume();
  return g;
}

function tryMediaElementGraph(el: HTMLMediaElement): AnalyserGraph | null {
  const existing = graphs.get(el);
  if (existing && existing.ctx.state !== "closed") {
    return reconnectExistingGraph(existing);
  }

  if (mesAlreadyAttached.has(el)) {
    return null;
  }

  const ctx = createAudioContext();
  const analyser = buildAnalyser(ctx);

  try {
    const source = ctx.createMediaElementSource(el);
    mesAlreadyAttached.add(el);
    mediaElementSources.set(el, source);
    return wireGraph(el, ctx, source, analyser, false);
  } catch {
    void ctx.close();
    return null;
  }
}

function tryCaptureStreamGraph(el: HTMLMediaElement): AnalyserGraph | null {
  const stream = captureElementStream(el);
  if (!stream || stream.getAudioTracks().length === 0) return null;

  const ctx = createAudioContext();
  const analyser = buildAnalyser(ctx);
  const source = ctx.createMediaStreamSource(stream);
  mediaStreamSources.set(el, source);
  return wireGraph(el, ctx, source, analyser, true);
}

/** Audio: media-element tap first. Keeps context open on soft release for MES reuse. */
export function acquireAnalyserGraph(el: HTMLMediaElement): AnalyserGraph | null {
  const existing = graphs.get(el);
  if (existing && existing.ctx.state !== "closed") {
    return reconnectExistingGraph(existing);
  }

  try {
    if (el instanceof HTMLAudioElement) {
      const mes = tryMediaElementGraph(el);
      if (mes) return mes;
      return tryCaptureStreamGraph(el);
    }

    const fromStream = tryCaptureStreamGraph(el);
    if (fromStream) return fromStream;
    return tryMediaElementGraph(el);
  } catch (err) {
    console.warn("[RuForge] acquireAnalyserGraph failed", err);
    return null;
  }
}

export function acquireAnalyserGraphMediaElement(el: HTMLMediaElement): AnalyserGraph | null {
  releaseAnalyserGraph(el, true);
  return tryMediaElementGraph(el);
}

export function acquireAnalyserGraphCaptureStream(el: HTMLMediaElement): AnalyserGraph | null {
  releaseAnalyserGraph(el, true);
  return tryCaptureStreamGraph(el);
}

/**
 * Soft release (default): disconnect nodes, keep context + MES for remount.
 * Hard release: close context (new file / teardown).
 */
export function releaseAnalyserGraph(el: HTMLMediaElement, closeContext = false): void {
  const g = graphs.get(el);
  if (!g) return;

  try {
    g.source.disconnect();
    g.analyser.disconnect();
  } catch {
    /* already disconnected */
  }

  if (closeContext) {
    graphs.delete(el);
    mediaStreamSources.delete(el);
    mediaElementSources.delete(el);
    mesAlreadyAttached.delete(el);
    try {
      void g.ctx.close();
    } catch {
      /* already closed */
    }
  }
}

/** Bass-weighted loudness 0..1 from frequency bins (no silence gate). */
export function readSmoothedLoudness(graph: AnalyserGraph, gain = 1): number {
  graph.analyser.getByteFrequencyData(graph.freqData);
  const bins = graph.freqData;
  const n = bins.length;
  const cutoff = Math.floor(n * 0.7);
  if (cutoff < 1) return 0;

  let sumSq = 0;
  for (let i = 0; i < cutoff; i++) {
    const v = bins[i] / 255;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / cutoff);
  return Math.min(1, Math.pow(rms, 0.5) * 2.4 * gain);
}

/** Per-bar levels from frequency bins, normalized 0..1 (no silence gate). */
export function readLedBandLevels(
  graph: AnalyserGraph,
  out: number[],
  gain = 1,
): void {
  graph.analyser.getByteFrequencyData(graph.freqData);
  const bins = graph.freqData;
  const step = Math.max(1, Math.floor(bins.length / out.length));

  for (let i = 0; i < out.length; i++) {
    const start = i * step;
    const end = Math.min(bins.length, start + step);
    let peak = 0;
    let sum = 0;
    const n = Math.max(1, end - start);
    for (let j = start; j < end; j++) {
      const v = bins[j] / 255;
      sum += v;
      if (v > peak) peak = v;
    }
    const avg = sum / n;
    const raw = Math.max(peak, avg * 1.2);
    out[i] = Math.min(1, Math.pow(raw, 0.42) * 3.1 * gain);
  }
}
