/**
 * Framework bridge (Phase 3 · M1) — connects the Phase-1 wallpaper FRAMEWORK
 * (wallpaperFramework.ts: rich WallpaperDefinition metadata) to the living
 * ENVIRONMENT runtime, so that metadata stops being dead code.
 *
 * Before this, `WallpaperDefinition.particles / weather / timeAware` had zero
 * runtime readers — the runtime resolved walls purely through wallCatalog tags.
 * This module:
 *   1. enriches the built-in preset definitions with sensible particle/weather
 *      metadata (registered additively into the framework registry), and
 *   2. exposes small pure queries the runtime layers call with the active wall
 *      ref (ParticleLayer today; WeatherLayer + ambientAudio in M3/M4).
 *
 * It does NOT duplicate the wallpaper engine — it reads the existing registry and
 * maps its metadata onto the runtime's own enums. No new state, no new rendering.
 */

import { WALL_PRESETS } from './wallCatalog';
import {
  getWallpaper,
  registerWallpaper,
  type ParticleLayer as FwParticleLayer,
  type TimeOfDay,
  type WallpaperCategory,
  type WallpaperDefinition,
  type WeatherLayer,
} from './wallpaperFramework';
import type { ParticlePresetId } from './types';

/** Framework particle type → runtime particle preset id (null = no runtime match). */
const PARTICLE_MAP: Record<FwParticleLayer['type'], ParticlePresetId | null> = {
  fireflies: 'fireflies',
  stars: 'stars',
  dust: 'dust',
  petals: 'leaves',
  snow: 'snow',
  bubbles: null,
};

interface Enrichment {
  category?: WallpaperCategory;
  particles?: FwParticleLayer[];
  weather?: WeatherLayer[];
}

/** Sensible metadata for the built-in presets so the bridge returns real data. */
const ENRICH: Record<string, Enrichment> = {
  night: { category: 'sky', particles: [{ type: 'fireflies', density: 0.6 }, { type: 'stars', density: 0.4 }] },
  aurora: { category: 'sky', particles: [{ type: 'stars', density: 0.5 }] },
  crimsonveil: { category: 'abstract', particles: [{ type: 'dust', density: 0.3 }] },
  ember: { category: 'abstract', particles: [{ type: 'dust', density: 0.3 }] },
  snow: { category: 'seasonal', particles: [{ type: 'snow', density: 0.7 }], weather: [{ type: 'snow', intensity: 0.5 }] },
  dawn: { category: 'sky' },
  midday: { category: 'sky' },
  dusk: { category: 'sky' },
  ink: { category: 'minimal' },
};

let enriched = false;

/** Idempotently merge the enrichment metadata into the framework registry. */
export function ensureFrameworkEnriched(): void {
  if (enriched) return;
  enriched = true;
  for (const p of WALL_PRESETS) {
    const base = getWallpaper(p.id);
    if (!base) continue;
    const extra = ENRICH[p.id];
    if (extra) registerWallpaper({ ...base, ...extra });
  }
}

ensureFrameworkEnriched();

/** The framework definition for a wall ref (preset id), if any. */
export function wallDefinition(ref: string | undefined): WallpaperDefinition | undefined {
  return ref ? getWallpaper(ref) : undefined;
}

/** Runtime particle presets the framework declares for a wall (deduped). */
export function particlesForWall(ref: string | undefined): ParticlePresetId[] {
  const def = wallDefinition(ref);
  if (!def?.particles?.length) return [];
  const out: ParticlePresetId[] = [];
  for (const p of def.particles) {
    const mapped = PARTICLE_MAP[p.type];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

/** Weather layers the framework declares for a wall (consumed by M3). */
export function weatherForWall(ref: string | undefined): WeatherLayer[] {
  return wallDefinition(ref)?.weather ?? [];
}

/** Per-time-of-day CSS override the framework declares for a wall, if any. */
export function timeAwareCss(ref: string | undefined, phase: TimeOfDay): string | undefined {
  return wallDefinition(ref)?.timeAware?.[phase];
}
