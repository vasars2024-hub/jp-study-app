// Singleton Web Audio bridge: the shared player registers its <audio> element
// here, and any number of visualizer canvases (wallpaper layer, widgets) read
// live frequency/waveform data from the shared analyser. Also does simple
// beat (transient) detection on the bass band.
//
// A window that does not own the audio (the player's "leader" is another window)
// has no analyser; it reads the leader's relayed frames from `vizFrames` instead,
// so a detached Visualizer or mini player draws the music rather than a flat line.

import {
  ensureRelay,
  isRemoteLive,
  onRemoteLiveChanged,
  readRemoteFrequency,
  readRemoteWaveform,
} from './vizFrames';

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;

// createMediaElementSource() may only be called ONCE per element — calling it
// again throws — so remember which elements are already wired up.
const wired = new WeakSet<HTMLMediaElement>();

let playing = false;
const playListeners = new Set<(playing: boolean) => void>();
const beatListeners = new Set<(strength: number) => void>();

/** What listeners last heard: local audio OR a live relayed stream. */
let announced = false;

function emitIfChanged(): void {
  const next = playing || isRemoteLive();
  if (announced === next) return;
  announced = next;
  for (const l of playListeners) l(next);
  if (next) startBeatLoop();
}

function notify(next: boolean): void {
  if (playing === next) return;
  playing = next;
  // A follower may be waiting for frames from this window the moment it starts.
  if (playing) ensureRelay();
  emitIfChanged();
}

onRemoteLiveChanged(() => emitIfChanged());

/** Elements whose play/pause listeners are already installed. */
const listened = new WeakSet<HTMLMediaElement>();

/**
 * Build the shared graph on first use. Returns false when Web Audio is missing
 * or refuses (no output device, a sandboxed host) — playback then simply goes
 * straight to the speakers without a visualizer.
 */
function ensureGraph(): boolean {
  if (ctx && analyser) return true;
  const AC =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return false;
  try {
    const next = new AC();
    const node = next.createAnalyser();
    node.fftSize = 1024;
    node.smoothingTimeConstant = 0.8;
    // Analyser must feed the speakers, or routed audio goes silent.
    node.connect(next.destination);
    ctx = next;
    analyser = node;
    return true;
  } catch {
    return false;
  }
}

function wire(el: HTMLMediaElement): void {
  if (wired.has(el) || !ensureGraph() || !ctx || !analyser) return;
  ctx.createMediaElementSource(el).connect(analyser);
  wired.add(el);
}

/**
 * Route an audio element through the shared analyser (safe to call repeatedly).
 *
 * The AudioContext is created on the element's first PLAY, not here. `playerBus`
 * attaches its element at module load, so creating the context eagerly opened an
 * audio device on every launch — and on a machine with no output device Chromium
 * logged "AudioContext encountered an error from the audio device" at boot, every
 * time, for a visualizer nobody had asked for yet.
 */
export function attachAudio(el: HTMLMediaElement): void {
  if (listened.has(el)) return;
  listened.add(el);
  const route = (): void => {
    try {
      wire(el);
      // A fresh AudioContext starts suspended (autoplay policy). Once routed
      // through it, a suspended context means SILENCE — resume on every play,
      // or the song appears to play with no sound.
      void ctx?.resume();
    } catch (err) {
      // Visualizer is decorative — never let it break playback.
      console.warn('audioBus attach failed', err);
    }
  };
  el.addEventListener('play', () => {
    route();
    notify(true);
  });
  el.addEventListener('pause', () => notify(false));
  el.addEventListener('ended', () => notify(false));
  if (!el.paused) route();
}

/** True while music is audible anywhere: this window's audio, or the leader's relayed frames. */
export function isPlaying(): boolean {
  return playing || isRemoteLive();
}

/** True only while THIS window's own element is playing (the relay's sender needs it). */
export function isLocallyPlaying(): boolean {
  return playing;
}

/** Read this window's own analyser, for the relay. Null when there is none. */
export function readLocalAnalyser(
  freq: Uint8Array,
  wave: Uint8Array,
): { freqLen: number; waveLen: number } | null {
  if (!analyser) return null;
  const freqLen = Math.min(analyser.frequencyBinCount, freq.length);
  const waveLen = Math.min(analyser.fftSize, wave.length);
  analyser.getByteFrequencyData(freq.subarray(0, freqLen));
  analyser.getByteTimeDomainData(wave.subarray(0, waveLen));
  return { freqLen, waveLen };
}

/** Change frequency resolution (256–4096; more = finer bars, slower reaction). */
export function setFftSize(n: number): void {
  if (analyser && [256, 512, 1024, 2048, 4096].includes(n)) analyser.fftSize = n;
}

/**
 * Fill `out` with current frequency bins (0-255). Returns false when idle.
 * This window's own analyser wins while its audio plays; otherwise the leader's
 * relayed frame, stretched over `binCount()` bins.
 */
export function getFrequencyData(out: Uint8Array): boolean {
  if (analyser && playing) {
    analyser.getByteFrequencyData(out);
    return true;
  }
  if (readRemoteFrequency(out, Math.min(out.length, binCount()))) return true;
  if (!analyser) return false;
  analyser.getByteFrequencyData(out);
  return true;
}

/** Fill `out` with the current time-domain waveform (128 = silence line). */
export function getWaveform(out: Uint8Array): boolean {
  if (analyser && playing) {
    analyser.getByteTimeDomainData(out);
    return true;
  }
  if (readRemoteWaveform(out, Math.min(out.length, binCount() * 2))) return true;
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
  const n = Math.min(binCount(), bassScratch.length);
  if (!getFrequencyData(bassScratch.subarray(0, n))) return 0;
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
  if (!isPlaying()) {
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
  if (isPlaying()) startBeatLoop();
  return () => {
    beatListeners.delete(cb);
  };
}

/** Subscribe to play/pause changes. Returns an unsubscribe fn. */
export function onPlayingChanged(cb: (playing: boolean) => void): () => void {
  playListeners.add(cb);
  return () => playListeners.delete(cb);
}
