// Singleton Web Audio bridge: the shared player registers its <audio> element
// here, and any number of visualizer canvases (wallpaper layer, widgets) read
// live frequency/waveform data from the shared analyser. Also does simple
// beat (transient) detection on the bass band.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;

// createMediaElementSource() may only be called ONCE per element — calling it
// again throws — so remember which elements are already wired up.
const wired = new WeakSet<HTMLMediaElement>();

let playing = false;
const playListeners = new Set<(playing: boolean) => void>();
const beatListeners = new Set<(strength: number) => void>();

function notify(next: boolean): void {
  if (playing === next) return;
  playing = next;
  for (const l of playListeners) l(playing);
  if (playing) startBeatLoop();
}

/** Route an audio element through the shared analyser (safe to call repeatedly). */
export function attachAudio(el: HTMLMediaElement): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      // Analyser must feed the speakers, or routed audio goes silent.
      analyser.connect(ctx.destination);
    }
    if (!wired.has(el)) {
      ctx.createMediaElementSource(el).connect(analyser!);
      wired.add(el);
    }
    // A fresh AudioContext starts suspended (autoplay policy). Once routed
    // through it, a suspended context means SILENCE — resume right away and
    // again on every play, or the song appears to play with no sound.
    void ctx.resume();
    el.addEventListener('play', () => {
      void ctx?.resume();
      notify(true);
    });
    el.addEventListener('pause', () => notify(false));
    el.addEventListener('ended', () => notify(false));
  } catch (err) {
    // Visualizer is decorative — never let it break playback.
    console.error('audioBus attach failed', err);
  }
}

export function isPlaying(): boolean {
  return playing;
}

/** Change frequency resolution (256–4096; more = finer bars, slower reaction). */
export function setFftSize(n: number): void {
  if (analyser && [256, 512, 1024, 2048, 4096].includes(n)) analyser.fftSize = n;
}

/** Fill `out` with current frequency bins (0-255). Returns false when idle. */
export function getFrequencyData(out: Uint8Array): boolean {
  if (!analyser) return false;
  analyser.getByteFrequencyData(out);
  return true;
}

/** Fill `out` with the current time-domain waveform (128 = silence line). */
export function getWaveform(out: Uint8Array): boolean {
  if (!analyser) return false;
  analyser.getByteTimeDomainData(out);
  return true;
}

export function binCount(): number {
  return analyser?.frequencyBinCount ?? 512;
}

const bassScratch = new Uint8Array(4096);

/** Average level (0..1) of the bass band (bottom ~8% of the spectrum). */
export function getBassLevel(): number {
  if (!analyser) return 0;
  const n = analyser.frequencyBinCount;
  analyser.getByteFrequencyData(bassScratch.subarray(0, n));
  const bassBins = Math.max(4, Math.floor(n * 0.08));
  let sum = 0;
  for (let i = 0; i < bassBins; i++) sum += bassScratch[i];
  return sum / bassBins / 255;
}

// ----- beat (transient) detection -------------------------------------------

let beatRaf = 0;
let rollingAvg = 0;
let lastBeatAt = 0;

function beatFrame(): void {
  if (!playing) {
    beatRaf = 0;
    rollingAvg = 0;
    return;
  }
  const level = getBassLevel();
  // Exponential rolling average of bass energy; a sudden jump above it = beat.
  rollingAvg = rollingAvg * 0.94 + level * 0.06;
  const now = performance.now();
  if (level > Math.max(0.12, rollingAvg * 1.4) && now - lastBeatAt > 150) {
    lastBeatAt = now;
    const strength = Math.min(1, rollingAvg > 0 ? (level - rollingAvg) / rollingAvg : 1);
    for (const l of beatListeners) l(strength);
  }
  beatRaf = requestAnimationFrame(beatFrame);
}

function startBeatLoop(): void {
  if (!beatRaf && beatListeners.size > 0) beatRaf = requestAnimationFrame(beatFrame);
}

/** Subscribe to detected beats (strength 0..1). Returns an unsubscribe fn. */
export function onBeat(cb: (strength: number) => void): () => void {
  beatListeners.add(cb);
  if (playing) startBeatLoop();
  return () => {
    beatListeners.delete(cb);
  };
}

/** Subscribe to play/pause changes. Returns an unsubscribe fn. */
export function onPlayingChanged(cb: (playing: boolean) => void): () => void {
  playListeners.add(cb);
  return () => playListeners.delete(cb);
}
