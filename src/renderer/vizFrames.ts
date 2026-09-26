/**
 * Visualizer frames for windows that do not own the audio.
 *
 * Exactly one window — the player "leader" (`playerBus.ts`) — runs the `<audio>`
 * element, so exactly one window has a Web Audio analyser. The detached mini player
 * and a Visualizer in any other window are followers: they mirrored the transport but
 * drew a flat canvas and said "Nothing playing" while music played, because
 * `audioBus` could only read an analyser that did not exist in their renderer.
 *
 * DECISION: relay the analyser, not the audio. Playing a second copy of the track in
 * the detached window would need a second decoder kept in sync with the first, doubled
 * output, and a new leadership rule; a relay needs none of that. The leader samples its
 * analyser at most {@link VIZ_FRAME_FPS} times a second into a small byte array
 * ({@link VIZ_FRAME_BINS} spectrum bins + {@link VIZ_FRAME_WAVE} waveform samples, about
 * half a kilobyte) and main fans it out to the other windows. And only while someone is
 * watching: a follower with a mounted canvas asks for frames every second
 * ({@link VIZ_WANT_INTERVAL_MS}) and the leader stops sending
 * {@link VIZ_WANT_TTL_MS} after the last request, so a desktop with no detached
 * visualizer costs nothing.
 *
 * This module holds the pure packing/unpacking and the follower-side store; it has no
 * IPC of its own. `playerBus` injects the transport, and `audioBus` reads the store when
 * its own analyser is silent.
 */

/** Frames per second the leader may send. */
export const VIZ_FRAME_FPS = 30;
export const VIZ_FRAME_INTERVAL_MS = Math.round(1000 / VIZ_FRAME_FPS);
/** Spectrum bins in a relayed frame (max-pooled from the analyser's bins). */
export const VIZ_FRAME_BINS = 256;
/** Waveform samples in a relayed frame. */
export const VIZ_FRAME_WAVE = 256;
/** A follower re-requests frames this often while a canvas is mounted. */
export const VIZ_WANT_INTERVAL_MS = 1000;
/** The leader keeps sending this long after the last request. */
export const VIZ_WANT_TTL_MS = 3000;
/** A follower treats the stream as stopped when no frame arrived for this long. */
export const VIZ_FRAME_STALE_MS = 400;

import type { VizFrame } from '../shared/vizFrame';

export type { VizFrame };

/**
 * Max-pool `src[0..srcLen)` into `bins` buckets. Max, not mean: a bar that averaged a
 * loud bin with its quiet neighbours would visibly flatten the spectrum a follower
 * draws next to the leader's.
 */
export function poolBins(src: Uint8Array, srcLen: number, bins: number): Uint8Array {
  const out = new Uint8Array(bins);
  const n = Math.max(0, Math.min(srcLen, src.length));
  if (n === 0) return out;
  for (let b = 0; b < bins; b++) {
    const start = Math.floor((b * n) / bins);
    const end = Math.max(start + 1, Math.floor(((b + 1) * n) / bins));
    let peak = 0;
    for (let i = start; i < end && i < n; i++) if (src[i] > peak) peak = src[i];
    out[b] = peak;
  }
  return out;
}

/** Evenly resample a waveform to `len` samples (nearest sample — it is a trace, not audio). */
export function resampleWave(src: Uint8Array, srcLen: number, len: number): Uint8Array {
  const out = new Uint8Array(len).fill(128);
  const n = Math.max(0, Math.min(srcLen, src.length));
  if (n === 0) return out;
  for (let i = 0; i < len; i++) out[i] = src[Math.min(n - 1, Math.floor((i * n) / len))];
  return out;
}

/** Pack an analyser read into a relay frame. */
export function packFrame(
  freq: Uint8Array,
  freqLen: number,
  wave: Uint8Array,
  waveLen: number,
): VizFrame {
  return {
    freq: poolBins(freq, freqLen, VIZ_FRAME_BINS),
    wave: resampleWave(wave, waveLen, VIZ_FRAME_WAVE),
  };
}

/** Whether an IPC payload is a usable frame (structured clone may hand back a plain array). */
export function isVizFrame(v: unknown): v is VizFrame {
  if (!v || typeof v !== 'object') return false;
  const f = (v as VizFrame).freq;
  const w = (v as VizFrame).wave;
  const ok = (a: unknown) => a instanceof Uint8Array || Array.isArray(a);
  return ok(f) && ok(w) && (f as ArrayLike<number>).length > 0 && (w as ArrayLike<number>).length > 0;
}

// ----- follower side ----------------------------------------------------------

let remote: VizFrame | null = null;
let remoteAt = 0;
let remoteLive = false;
let staleTimer: ReturnType<typeof setTimeout> | null = null;
const remoteListeners = new Set<(live: boolean) => void>();

function setRemoteLive(next: boolean): void {
  if (remoteLive === next) return;
  remoteLive = next;
  for (const l of remoteListeners) l(next);
}

/** Store a frame that arrived from the leader. */
export function receiveRemoteFrame(frame: unknown, now: number = Date.now()): void {
  if (!isVizFrame(frame)) return;
  remote = {
    freq: frame.freq instanceof Uint8Array ? frame.freq : Uint8Array.from(frame.freq),
    wave: frame.wave instanceof Uint8Array ? frame.wave : Uint8Array.from(frame.wave),
  };
  remoteAt = now;
  setRemoteLive(true);
  if (staleTimer) clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    staleTimer = null;
    setRemoteLive(false);
  }, VIZ_FRAME_STALE_MS);
}

/** The latest relayed frame while the stream is live, else null. */
export function remoteFrame(now: number = Date.now()): VizFrame | null {
  if (!remote || !remoteLive || now - remoteAt > VIZ_FRAME_STALE_MS) return null;
  return remote;
}

export function isRemoteLive(): boolean {
  return remoteLive;
}

/** Subscribe to the relayed stream starting/stopping. */
export function onRemoteLiveChanged(cb: (live: boolean) => void): () => void {
  remoteListeners.add(cb);
  return () => {
    remoteListeners.delete(cb);
  };
}

/**
 * Copy the relayed spectrum into `out[0..len)`, stretching the frame's bins across the
 * caller's bin count so the canvas's own frequency fractions (bass = bottom 8%, and so
 * on) keep meaning the same frequencies.
 */
export function readRemoteFrequency(out: Uint8Array, len: number, now: number = Date.now()): boolean {
  const f = remoteFrame(now);
  if (!f) return false;
  const n = Math.min(len, out.length);
  const m = f.freq.length;
  for (let i = 0; i < n; i++) out[i] = f.freq[Math.min(m - 1, Math.floor((i * m) / n))];
  return true;
}

/** Copy the relayed waveform into `out[0..len)`. */
export function readRemoteWaveform(out: Uint8Array, len: number, now: number = Date.now()): boolean {
  const f = remoteFrame(now);
  if (!f) return false;
  const n = Math.min(len, out.length);
  const m = f.wave.length;
  for (let i = 0; i < n; i++) out[i] = f.wave[Math.min(m - 1, Math.floor((i * m) / n))];
  return true;
}

// ----- demand (who is watching) ----------------------------------------------

let lastWantAt = -Infinity;

/** The leader heard a follower ask for frames. */
export function noteFramesWanted(now: number = Date.now()): void {
  lastWantAt = now;
  ensureRelay(now);
}

/** Whether any follower asked recently enough to be sent frames. */
export function framesWanted(now: number = Date.now()): boolean {
  return now - lastWantAt <= VIZ_WANT_TTL_MS;
}

// ----- transport (injected by playerBus) --------------------------------------

export interface VizTransport {
  sendFrame(frame: VizFrame): void;
  sendWant(): void;
  /** True while THIS window's own analyser has live audio (then it needs no relay). */
  localPlaying(): boolean;
  /** Read the local analyser. Returns false when there is none. */
  readLocal(freq: Uint8Array, wave: Uint8Array): { freqLen: number; waveLen: number } | null;
}

let transport: VizTransport | null = null;
let sendTimer: ReturnType<typeof setInterval> | null = null;
const wantHolders = new Set<symbol>();
let wantTimer: ReturnType<typeof setInterval> | null = null;

export function setVizTransport(t: VizTransport | null): void {
  transport = t;
}

const freqScratch = new Uint8Array(4096);
const waveScratch = new Uint8Array(4096);

function stopRelay(): void {
  if (sendTimer) clearInterval(sendTimer);
  sendTimer = null;
}

/**
 * One tick of the leader's sender. Exported for tests; the interval below calls it.
 * Sends only while this window's audio is live AND a follower asked recently; the
 * first tick that finds either false stops the timer, so an unwatched leader is not
 * woken 30 times a second for nothing.
 */
export function relayTick(now: number = Date.now()): boolean {
  if (!transport || !transport.localPlaying() || !framesWanted(now)) {
    stopRelay();
    return false;
  }
  const read = transport.readLocal(freqScratch, waveScratch);
  if (!read) return false;
  transport.sendFrame(packFrame(freqScratch, read.freqLen, waveScratch, read.waveLen));
  return true;
}

/** Whether the leader's sender timer is running (tests and diagnostics). */
export function isRelayRunning(): boolean {
  return sendTimer !== null;
}

/**
 * Start the leader's throttled sender if it should run: this window is playing and a
 * follower is watching. Called when a request arrives and when local playback starts.
 */
export function ensureRelay(now: number = Date.now()): void {
  if (sendTimer || !transport || !transport.localPlaying() || !framesWanted(now)) return;
  sendTimer = setInterval(() => relayTick(), VIZ_FRAME_INTERVAL_MS);
}

function sendWantNow(): void {
  if (!transport || transport.localPlaying()) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  transport.sendWant();
}

/**
 * A canvas that wants live data mounted. Returns a release fn. While at least one
 * holder exists this window asks the leader for frames every second — unless it is
 * itself the window playing, in which case it reads its own analyser and asks nobody.
 */
export function requestRemoteFrames(): () => void {
  const token = Symbol('viz-want');
  wantHolders.add(token);
  if (!wantTimer) {
    sendWantNow();
    wantTimer = setInterval(sendWantNow, VIZ_WANT_INTERVAL_MS);
  }
  return () => {
    wantHolders.delete(token);
    if (wantHolders.size === 0 && wantTimer) {
      clearInterval(wantTimer);
      wantTimer = null;
    }
  };
}

/** Test-only: reset module state. */
export function __resetVizFramesForTests(): void {
  remote = null;
  remoteAt = 0;
  remoteLive = false;
  if (staleTimer) clearTimeout(staleTimer);
  staleTimer = null;
  remoteListeners.clear();
  lastWantAt = -Infinity;
  transport = null;
  stopRelay();
  wantHolders.clear();
  if (wantTimer) clearInterval(wantTimer);
  wantTimer = null;
}
