/**
 * Weather engine (Phase 3 · M3) — resolves the ACTIVE weather from environment
 * settings + the active wallpaper's framework metadata. Pure + testable; the
 * WeatherLayer renders the result. Rain/snow precipitation is still provided by
 * the particle engine — this layer adds the atmospheric fields (fog/cloud/wind
 * haze/overcast wash) and the shared weather STATE that ties them together.
 */
import type { EnvironmentSettings, WeatherKind } from './types';
import { weatherForWall } from './frameworkBridge';

export interface ResolvedWeather {
  kind: WeatherKind;
  /** 0–1 overlay strength (0 = nothing to render). */
  intensity: number;
}

const NONE: ResolvedWeather = { kind: 'clear', intensity: 0 };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * @param activeWallRef  the current wallpaper preset id (for `auto` mode).
 */
export function resolveWeather(env: EnvironmentSettings, activeWallRef?: string): ResolvedWeather {
  const w = env.weather ?? { mode: 'off', intensity: 0.5 };
  if (w.mode === 'off') return NONE;

  if (w.mode === 'auto') {
    const layers = weatherForWall(activeWallRef);
    const pick = layers.find((l) => l.type !== 'clear') ?? layers[0];
    if (!pick || pick.type === 'clear') return NONE;
    return { kind: pick.type as WeatherKind, intensity: clamp01((pick.intensity ?? 0.5) * (w.intensity ?? 0.5) * 2) };
  }

  if (w.mode === 'clear') return NONE;
  return { kind: w.mode, intensity: clamp01(w.intensity ?? 0.5) };
}
