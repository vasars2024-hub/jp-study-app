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
 * - Buffers are fetched+decoded on demand and cached.
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

const LS_ENABLED = 'jp-os-sound-enabled';
const LS_VOLUME = 'jp-os-sound-volume';
const LS_MUTED = 'jp-os-sound-muted';

export interface PlayOptions {
  /** Per-shot gain 0–1 (default 1). */
  volume?: number;
  /** Playback rate (default 1). */
  rate?: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private catGain = new Map<SoundCategory, GainNode>();
  private buffers = new Map<string, AudioBuffer | null>();
  private packs = new Map<string, SoundPackManifest>();
  private activePackId: string = SILENT_PACK.id;

  private enabled = true;
  private muted = false;
  private volume = 0.7;

  constructor() {
    this.packs.set(SILENT_PACK.id, SILENT_PACK);
    try {
      this.enabled = localStorage.getItem(LS_ENABLED) !== '0';
      this.muted = localStorage.getItem(LS_MUTED) === '1';
      const v = Number.parseFloat(localStorage.getItem(LS_VOLUME) ?? '');
      if (Number.isFinite(v)) this.volume = Math.min(1, Math.max(0, v));
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
      g.gain.value = 1;
      g.connect(master);
      this.catGain.set(c, g);
    }
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  /** Battery Saver (perf tier) suppresses ambient categories. */
  private perfAllows(category: SoundCategory): boolean {
    const perf = document.documentElement.getAttribute('data-perf') ?? 'balanced';
    if (perf === 'battery') return category !== 'environment' && category !== 'companion';
    return true;
  }

  private async load(url: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(url)) return this.buffers.get(url) ?? null;
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.buffers.set(url, null);
        return null;
      }
      const arr = await res.arrayBuffer();
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
    }
    const buf = await this.load(url);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts?.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts?.volume ?? 1;
    src.connect(g);
    g.connect(this.catGain.get(category) ?? this.master!);
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
}

/** Singleton engine. */
export const soundEngine = new SoundEngine();

/** Convenience: play a sound from anywhere. */
export function playSound(category: SoundCategory, name: string, opts?: PlayOptions): Promise<void> {
  return soundEngine.play(category, name, opts);
}
