/**
 * Volume normalization for the VideoCore player's `<video>` (round-2 audit B).
 *
 * The Media Center's toggle drove a Web Audio graph built on the old player's
 * `videoRef`, which nothing has attached since that player was deleted — so it
 * never touched any audio. The graph now hangs off the element the study
 * overlay actually plays through.
 *
 * `createMediaElementSource` may be called ONCE per element, ever: a second
 * call throws, and the element's audio is routed through the graph from then
 * on. So the graph is built on first enable and kept (a WeakMap, so it goes
 * with the element); turning normalization off crossfades to a bypass path
 * rather than tearing the graph down. An element whose audio Web Audio may not
 * read (cross-origin without CORS) would be SILENCED by the graph, so it is
 * refused instead — VideoCore's element carries `crossOrigin="anonymous"`.
 */

export type VolumeNormalizationState = 'on' | 'off' | 'unavailable' | 'blocked';

interface Graph {
  context: AudioContext;
  normalized: GainNode;
  bypass: GainNode;
}

const graphs = new WeakMap<HTMLMediaElement, Graph>();

/** Makeup gain after compression, so normalized speech is not quieter than before. */
const MAKEUP_GAIN = 1.25;

/** True when Web Audio can read this element's samples (else the graph outputs silence). */
export function mediaAudioReadable(media: HTMLMediaElement, origin = globalThis.location?.origin): boolean {
  if (media.crossOrigin != null) return true;
  const src = media.currentSrc || media.src;
  if (!src) return true;
  if (src.startsWith('blob:') || src.startsWith('data:')) return true;
  try {
    return new URL(src).origin === origin;
  } catch {
    return false;
  }
}

function buildGraph(media: HTMLMediaElement, createContext: () => AudioContext): Graph {
  const context = createContext();
  const source = context.createMediaElementSource(media);
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 24;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.28;
  const normalized = context.createGain();
  normalized.gain.value = 0;
  const bypass = context.createGain();
  bypass.gain.value = 1;
  source.connect(compressor);
  compressor.connect(normalized);
  normalized.connect(context.destination);
  source.connect(bypass);
  bypass.connect(context.destination);
  return { context, normalized, bypass };
}

export async function setVolumeNormalization(
  media: HTMLMediaElement,
  enabled: boolean,
  createContext: () => AudioContext = () => new AudioContext(),
): Promise<VolumeNormalizationState> {
  let graph = graphs.get(media);
  if (!graph) {
    // Off with no graph is already the untouched element: build nothing.
    if (!enabled) return 'off';
    if (!mediaAudioReadable(media)) return 'blocked';
    try {
      graph = buildGraph(media, createContext);
    } catch {
      return 'unavailable';
    }
    graphs.set(media, graph);
  }
  const at = graph.context.currentTime;
  graph.normalized.gain.setTargetAtTime(enabled ? MAKEUP_GAIN : 0, at, 0.015);
  graph.bypass.gain.setTargetAtTime(enabled ? 0 : 1, at, 0.015);
  if (graph.context.state === 'suspended') await graph.context.resume().catch(() => undefined);
  return enabled ? 'on' : 'off';
}
