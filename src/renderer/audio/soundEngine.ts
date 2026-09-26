/**
 * Frutiger Aero Platform — Sound Engine (Phase 1 · M7)
 * -----------------------------------------------------------------------------
 * INFRASTRUCTURE ONLY. A small Web-Audio engine for UI/system/environment/
 * companion sounds. Lazy: no AudioContext is created until the first play()
 * (which should happen on a user gesture, satisfying autoplay policy). With the
 * default SILENT pack every call is a no-op, so this is safe to ship now.
 *
 * - Categories each get a GainNode under a master gain (volume/mute/duck).
 * - Respects a `soundsEnabled` pref + the performance tier (data-perf, M9):
 *   Battery Saver suppresses ambient categories (environment/companion).
 * - Buffers are read (fetched, or decoded from a data: URL) and decoded on demand, and cached.
 *
 * Builds on the same AudioContext pattern used by audioBus.ts (the music
 * visualiser); this engine keeps its own context for low-latency SFX.
 */

import {
  SILENT_PACK,
  SOUND_CATEGORIES,
  type SoundCategory,
  type SoundPackManifest,
} from './soundPack';
import { isAeroSafeModeApplied, onAeroSafeModeChanged } from '../aeroSafeMode';

const LS_ENABLED = 'jp-os-sound-enabled';
const LS_VOLUME = 'jp-os-sound-volume';
const LS_MUTED = 'jp-os-sound-muted';
const LS_CATEGORY_VOLUME = 'jp-os-sound-category-volume';

const DEFAULT_CATEGORY_VOLUME: Record<SoundCategory, number> = {
  system: 1,
  ui: 0.82,
  environment: 0.74,
  companion: 0.76,
  achievement: 0.86,
  notification: 0.84,
};

export interface PlayOptions {
  /** Per-shot gain 0–1 (default 1). */
  volume?: number;
  /** Playback rate (default 1). */
  rate?: number;
}

/** Handle for a looping bed (ambient soundscapes). */
export interface LoopHandle {
  stop(): void;
  setVolume(v: number): void;
  fadeTo(v: number, ms: number): void;
}

/**
 * The bytes of one sound. The generated packs (Aero proof chimes, Wired Archive) are
 * `data:audio/wav;base64,…` URLs, and those are decoded here rather than fetched: the
 * packaged CSP's `connect-src` does not list `data:`, so `fetch(dataUrl)` was refused
 * in every packaged build — "Fetch API cannot load data:audio/wav…" on each cue, and the
 * Aero look played no sound at all (round-4 console sweep). Dev never binds the policy.
 * Decoding locally keeps `connect-src` as tight as it is.
 */
export async function readSoundBytes(
  url: string,
  fetchImpl: (url: string) => Promise<Response> = (u) => fetch(u),
): Promise<ArrayBuffer | null> {
  const data = /^data:[^,]*?(;base64)?,/i.exec(url);
  if (data) {
    const payload = url.slice(data[0].length);
    if (!data[1]) return new TextEncoder().encode(decodeURIComponent(payload)).buffer as ArrayBuffer;
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  const res = await fetchImpl(url);
  return res.ok ? res.arrayBuffer() : null;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private catGain = new Map<SoundCategory, GainNode>();
  private buffers = new Map<string, AudioBuffer | null>();
  private packs = new Map<string, SoundPackManifest>();
  private activePackId: string = SILENT_PACK.id;
  private activeSources = new Set<AudioBufferSourceNode>();

  private enabled = true;
  private muted = false;
  private volume = 0.7;
  private categoryVolume = new Map<SoundCategory, number>(
    SOUND_CATEGORIES.map((category) => [category, DEFAULT_CATEGORY_VOLUME[category]]),
  );

  constructor() {
    this.packs.set(SILENT_PACK.id, SILENT_PACK);
    try {
      this.enabled = localStorage.getItem(LS_ENABLED) !== '0';
      this.muted = localStorage.getItem(LS_MUTED) === '1';
      const v = Number.parseFloat(localStorage.getItem(LS_VOLUME) ?? '');
      if (Number.isFinite(v)) this.volume = Math.min(1, Math.max(0, v));
      const rawCategories = JSON.parse(localStorage.getItem(LS_CATEGORY_VOLUME) ?? '{}') as Partial<Record<SoundCategory, number>>;
      for (const category of SOUND_CATEGORIES) {
        const cv = rawCategories[category];
        if (typeof cv === 'number' && Number.isFinite(cv)) {
          this.categoryVolume.set(category, Math.min(1, Math.max(0, cv)));
        }
      }
    } catch {
      /* storage unavailable */
    }
  }

  /* ---- Packs ---- */
  registerPack(manifest: SoundPackManifest): void {
    this.packs.set(manifest.id, manifest);
  }
  listPacks(): SoundPackManifest[] {
    return [...this.packs.values()];
  }
  setActivePack(id: string): void {
    if (this.packs.has(id)) this.activePackId = id;
  }
  getActivePackId(): string {
    return this.activePackId;
  }
  /** Stop one-shots and loops that are already playing. Useful when a theme
      exits to a silent/default sound pack: the pack switch prevents future
      sounds, while this silences sounds that started before the switch. */
  stopAll(): void {
    for (const src of [...this.activeSources]) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
      this.activeSources.delete(src);
    }
  }

  /* ---- Prefs ---- */
  isEnabled(): boolean {
    return this.enabled;
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(LS_ENABLED, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
  isMuted(): boolean {
    return this.muted;
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.value = m ? 0 : this.volume;
    try {
      localStorage.setItem(LS_MUTED, m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
  getVolume(): number {
    return this.volume;
  }
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx && !this.muted) this.master.gain.value = this.volume;
    try {
      localStorage.setItem(LS_VOLUME, String(this.volume));
    } catch {
      /* ignore */
    }
  }
  getCategoryVolume(category: SoundCategory): number {
    return this.categoryVolume.get(category) ?? DEFAULT_CATEGORY_VOLUME[category];
  }
  setCategoryVolume(category: SoundCategory, v: number): void {
    const next = Math.min(1, Math.max(0, v));
    this.categoryVolume.set(category, next);
    const g = this.catGain.get(category);
    if (g) g.gain.value = next;
    try {
      const data = Object.fromEntries(SOUND_CATEGORIES.map((c) => [c, this.getCategoryVolume(c)]));
      localStorage.setItem(LS_CATEGORY_VOLUME, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  /* ---- Internals ---- */
  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);
    for (const c of SOUND_CATEGORIES) {
      const g = ctx.createGain();
      g.gain.value = this.getCategoryVolume(c);
      g.connect(master);
      this.catGain.set(c, g);
    }
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  /** Battery Saver (perf tier) suppresses ambient categories. */
  private perfAllows(category: SoundCategory): boolean {
    if (isAeroSafeModeApplied()) return false;
    const perf = document.documentElement.getAttribute('data-perf') ?? 'balanced';
    if (perf === 'battery') return category !== 'environment' && category !== 'companion';
    return true;
  }

  private reducedSensoryGain(category: SoundCategory): number {
    if (typeof document === 'undefined') return 1;
    const root = document.documentElement;
    const reduced =
      root.classList.contains('reduce-motion') ||
      root.dataset.displayAnim === 'reduced' ||
      root.dataset.displayAnim === 'none';
    if (!reduced) return 1;
    if (category === 'environment' || category === 'companion') return 0.48;
    if (category === 'notification' || category === 'achievement') return 0.58;
    if (category === 'ui') return 0.64;
    return 0.82;
  }

  /**
   * Synthesised one-shot blip (Phase 4.5) — for motion feedback like the score
   * ticker, where a sample would be silent under the default SILENT pack and a
   * per-tick fetch/decode would be absurd for a 30ms sine.
   *
   * Reuses this engine's context and category gains, so volume, mute, the perf
   * tier and reduced-sensory scaling all apply exactly as they do to samples,
   * and there is still only one AudioContext for SFX. The oscillator disposes
   * itself on `ended` — per-shot nodes without cleanup are the documented leak.
   */
  playTone(
    category: SoundCategory,
    opts: { freq?: number; durationMs?: number; volume?: number; type?: OscillatorType } = {},
  ): void {
    if (!this.enabled || this.muted) return;
    if (!this.perfAllows(category)) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const destination = this.catGain.get(category) ?? this.master;
    if (!destination) return;
    // A suspended context needs a gesture; a tick is not worth awaiting a resume.
    if (ctx.state === 'suspended') return;

    const durationMs = Math.min(400, Math.max(8, opts.durationMs ?? 28));
    const now = ctx.currentTime;
    const end = now + durationMs / 1000;
    const peak =
      Math.min(1, Math.max(0, opts.volume ?? 0.18)) * this.reducedSensoryGain(category);
    if (peak <= 0) return;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.value = Math.min(12_000, Math.max(40, opts.freq ?? 1180));
    const g = ctx.createGain();
    // Short attack + exponential decay: a click-free tick.
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g);
    g.connect(destination);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    osc.start(now);
    osc.stop(end);
  }

  private async load(url: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(url)) return this.buffers.get(url) ?? null;
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    try {
      const arr = await readSoundBytes(url);
      if (!arr) {
        this.buffers.set(url, null);
        return null;
      }
      const buf = await ctx.decodeAudioData(arr);
      this.buffers.set(url, buf);
      return buf;
    } catch {
      this.buffers.set(url, null);
      return null;
    }
  }

  /** Play a one-shot sound. No-op if disabled/muted/missing (e.g. silent pack). */
  async play(category: SoundCategory, name: string, opts?: PlayOptions): Promise<void> {
    if (!this.enabled || this.muted) return;
    if (!this.perfAllows(category)) return;
    const url = this.packs.get(this.activePackId)?.sounds?.[category]?.[name];
    if (!url) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
      if (ctx.state !== 'running') return;
    }
    const buf = await this.load(url);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts?.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = (opts?.volume ?? 1) * this.reducedSensoryGain(category);
    src.connect(g);
    const destination = this.catGain.get(category) ?? this.master;
    if (!destination) return;
    g.connect(destination);
    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    src.start();
  }

  /** Temporarily lower an ambient category (e.g. duck environment for a chime). */
  duck(category: SoundCategory, to = 0.3, ms = 400): void {
    const g = this.catGain.get(category);
    if (!g || !this.ctx) return;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.linearRampToValueAtTime(to, now + ms / 2000);
    g.gain.linearRampToValueAtTime(1, now + ms / 1000);
  }

  /**
   * Start a looping bed on a category; returns a handle to fade/stop it. Returns
   * a silent no-op handle if disabled/muted/perf-gated or the sound is missing
   * (e.g. the default silent pack). Used by the environment ambient-audio layer.
   */
  async playLoop(category: SoundCategory, name: string, opts?: { volume?: number }): Promise<LoopHandle> {
    const silent: LoopHandle = {
      stop: () => undefined,
      setVolume: () => undefined,
      fadeTo: () => undefined,
    };
    if (!this.enabled || this.muted) return silent;
    if (!this.perfAllows(category)) return silent;
    const url = this.packs.get(this.activePackId)?.sounds?.[category]?.[name];
    if (!url) return silent;
    const ctx = this.ensureCtx();
    if (!ctx) return silent;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* needs a user gesture */
      }
    }
    // Still suspended means no gesture yet. Starting the loop anyway queues it
    // silently, and the user's next click anywhere resumes the context — audio
    // they never asked for appears out of nowhere. Bail instead.
    if (ctx.state !== 'running') return silent;
    const buf = await this.load(url);
    if (!buf) return silent;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = (opts?.volume ?? 1) * this.reducedSensoryGain(category);
    src.connect(g);
    const destination = this.catGain.get(category) ?? this.master;
    if (!destination) return silent;
    g.connect(destination);
    this.activeSources.add(src);
    src.start();
    let stopped = false;
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        soundEngine.activeSources.delete(src);
        src.disconnect();
        g.disconnect();
      },
      setVolume(v: number) {
        g.gain.value = Math.min(1, Math.max(0, v));
      },
      fadeTo(v: number, ms: number) {
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(Math.min(1, Math.max(0, v)), now + ms / 1000);
      },
    };
  }
}

/** Singleton engine. */
export const soundEngine = new SoundEngine();

onAeroSafeModeChanged((state) => {
  if (state.enabled && isAeroSafeModeApplied()) soundEngine.stopAll();
});

/** Convenience: play a sound from anywhere. */
export function playSound(category: SoundCategory, name: string, opts?: PlayOptions): Promise<void> {
  return soundEngine.play(category, name, opts);
}
