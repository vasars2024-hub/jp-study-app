/**
 * Frutiger Aero Platform — Performance tiers (Phase 1 · M9)
 * -----------------------------------------------------------------------------
 * A `data-perf` attribute on <html> lets beautiful-but-heavy effects (glass
 * backdrop blur, animation, ambience) degrade gracefully on lower-end hardware.
 * The CSS overrides live in perf.css; the sound engine + future environment
 * layer also read `data-perf`.
 *
 *   performance  — light blur, keep motion (mid-range)
 *   balanced     — default (no overrides)
 *   atmosphere   — Maximum Atmosphere: richest blur (high-end)
 *   battery      — Battery Saver: no blur, no motion, no ambience
 */

export type PerfTier = 'performance' | 'balanced' | 'atmosphere' | 'battery';

export const PERF_TIERS: PerfTier[] = ['performance', 'balanced', 'atmosphere', 'battery'];
export const DEFAULT_PERF_TIER: PerfTier = 'balanced';

const KEY = 'jp-os-perf-tier';
const EVENT = 'jp-perf-changed';

export function loadPerfTier(): PerfTier {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (PERF_TIERS as string[]).includes(v)) return v as PerfTier;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PERF_TIER;
}

export function applyPerfTier(tier: PerfTier): void {
  document.documentElement.setAttribute('data-perf', tier);
  try {
    localStorage.setItem(KEY, tier);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: tier }));
}

/** Preferred setter for new code / settings UI. */
export const setPerfTier = applyPerfTier;

/** Apply the saved tier before first paint (called from main.tsx). */
export function bootPerf(): void {
  applyPerfTier(loadPerfTier());
}

export function onPerfChanged(cb: (tier: PerfTier) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<PerfTier>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
