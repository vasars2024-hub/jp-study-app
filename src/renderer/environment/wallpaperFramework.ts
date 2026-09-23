/**
 * Frutiger Aero Platform — Wallpaper Framework (Phase 1 · M6)
 * -----------------------------------------------------------------------------
 * INFRASTRUCTURE ONLY — no new environments, no rendering. This is a metadata +
 * registry layer that formalises what a wallpaper *is* so future phases (living
 * wallpapers, weather, particles) have a stable contract to build against.
 *
 * It does NOT replace the existing systems: the built-in `WALL_PRESETS`
 * (wallCatalog.ts) are bridged into the registry as a 'core' pack, and actual
 * painting still flows through the current WallpaperStage / environment layer.
 * The applied-wallpaper model (shared/desktop: preset|image|video|slideshow) is
 * untouched.
 */

import { WALL_PRESETS, type WallPreset } from './wallCatalog';
import {
  NOSTALGIC_WALLPAPER_PACK,
  NOSTALGIC_WALLPAPER_PACK_ID,
} from './nostalgicWallpaperPack';

export type WallpaperKind =
  | 'static' /* a single CSS/image background */
  | 'animated' /* CSS-animated gradient */
  | 'live'; /* future: canvas/webgl scene driven by a renderer */

export type WallpaperCategory =
  | 'nature'
  | 'ocean'
  | 'sky'
  | 'city'
  | 'space'
  | 'abstract'
  | 'seasonal'
  | 'minimal';

export type TimeOfDay = 'morning' | 'day' | 'afternoon' | 'evening' | 'night';

/* ---- Interface stubs consumed by the future Environment Engine ---------- */

/** A weather overlay a wallpaper can request. Declarative only in Phase 1. */
export interface WeatherLayer {
  type: 'rain' | 'snow' | 'fog' | 'clear';
  /** 0–1 suggested strength. */
  intensity?: number;
}

/** A particle overlay a wallpaper can request. Declarative only in Phase 1. */
export interface ParticleLayer {
  type: 'fireflies' | 'bubbles' | 'stars' | 'dust' | 'petals' | 'snow';
  /** 0–1 suggested density. */
  density?: number;
}

/** How to cross-fade between two wallpapers. */
export interface WallpaperTransition {
  type: 'fade' | 'slide' | 'none';
  durationMs: number;
}

export const WALLPAPER_TRANSITION_DEFAULT: WallpaperTransition = { type: 'fade', durationMs: 600 };

/**
 * The formal wallpaper definition. `css` carries static/animated backgrounds;
 * `live` wallpapers name a `renderer` a future engine resolves. `timeAware`,
 * `weather`, and `particles` are declarative metadata the living layer will
 * read later — none are rendered in Phase 1.
 */
export interface WallpaperDefinition {
  id: string;
  label: string;
  kind: WallpaperKind;
  category?: WallpaperCategory;
  tags?: string[];
  /** CSS background for static/animated kinds. */
  css?: string;
  /** For kind 'live': the id of a scene renderer (resolved in a later phase). */
  renderer?: string;
  /** Optional per-time-of-day background overrides (the vision's time cycle). */
  timeAware?: Partial<Record<TimeOfDay, string>>;
  /** Requested weather overlays (declarative). */
  weather?: WeatherLayer[];
  /** Requested particle overlays (declarative). */
  particles?: ParticleLayer[];
  /** Owning pack (defaults to 'core'). */
  packId?: string;
  /** Optional thumbnail (data/asset URL); falls back to `css` in pickers. */
  thumbnail?: string;
  /** Preferred transition when switching TO this wallpaper. */
  transition?: WallpaperTransition;
}

/** A named bundle of wallpapers (Anime Edition et al. ship as packs). */
export interface WallpaperPack {
  id: string;
  label: string;
  description?: string;
  wallpaperIds: string[];
}

/* ---- Registry ----------------------------------------------------------- */

const wallpapers = new Map<string, WallpaperDefinition>();
const packs = new Map<string, WallpaperPack>();

export function registerWallpaper(def: WallpaperDefinition): void {
  const withPack: WallpaperDefinition = { packId: 'core', ...def };
  wallpapers.set(def.id, withPack);
  const pack = packs.get(withPack.packId!);
  if (pack && !pack.wallpaperIds.includes(def.id)) pack.wallpaperIds.push(def.id);
}

export function registerWallpaperPack(pack: Omit<WallpaperPack, 'wallpaperIds'> & { wallpapers: WallpaperDefinition[] }): void {
  const entry: WallpaperPack = { id: pack.id, label: pack.label, description: pack.description, wallpaperIds: [] };
  packs.set(pack.id, entry);
  for (const w of pack.wallpapers) registerWallpaper({ ...w, packId: pack.id });
}

export function getWallpaper(id: string): WallpaperDefinition | undefined {
  return wallpapers.get(id);
}

export function listWallpapers(filter?: {
  kind?: WallpaperKind;
  category?: WallpaperCategory;
  packId?: string;
  tag?: string;
}): WallpaperDefinition[] {
  let all = [...wallpapers.values()];
  if (filter?.kind) all = all.filter((w) => w.kind === filter.kind);
  if (filter?.category) all = all.filter((w) => w.category === filter.category);
  if (filter?.packId) all = all.filter((w) => w.packId === filter.packId);
  if (filter?.tag) all = all.filter((w) => w.tags?.includes(filter.tag!));
  return all;
}

export function listWallpaperPacks(): WallpaperPack[] {
  return [...packs.values()];
}

/* ---- Bridge: adopt the existing built-in presets as the 'core' pack ------ */

/** Map a legacy WallPreset (wallCatalog.ts) into a framework definition. */
export function fromWallPreset(p: WallPreset): WallpaperDefinition {
  return {
    id: p.id,
    label: p.label,
    kind: p.animated ? 'animated' : 'static',
    tags: p.tags,
    css: p.css,
    packId: p.packId ?? 'core',
  };
}

// Seed the registry once (module load) so the framework knows the built-ins.
packs.set('core', { id: 'core', label: 'Gum', description: 'Built-in wallpapers.', wallpaperIds: [] });
packs.set(NOSTALGIC_WALLPAPER_PACK_ID, { ...NOSTALGIC_WALLPAPER_PACK, wallpaperIds: [] });
for (const p of WALL_PRESETS) registerWallpaper(fromWallPreset(p));
