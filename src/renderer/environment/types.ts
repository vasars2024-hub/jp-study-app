/** Living desktop environment — L0 foundations + L1 wallpaper rotation. */

export type PerformanceTier = 'off' | 'low' | 'medium' | 'high';

export type WallItemKind = 'preset' | 'image' | 'video';

export interface WallpaperItem {
  id: string;
  kind: WallItemKind;
  /** Preset id or file path (image/video). */
  ref: string;
  label?: string;
  tags?: string[];
  /** Dwell time in playlist mode (seconds). */
  durationSec?: number;
}

export type TransitionKind = 'cut' | 'fade' | 'crossfade';

export interface WallpaperPlaylist {
  id: string;
  name: string;
  items: WallpaperItem[];
  transition: TransitionKind;
  transitionMs: number;
}

export type CalendarCategory = 'study' | 'exam' | 'assignment' | 'reminder' | 'personal';

export type RotationWhen =
  | { type: 'timeOfDay'; fromHour: number; toHour: number }
  | { type: 'playlistCycle' }
  /** Prefer a wall when today has a calendar event of this category. */
  | { type: 'calendarCategory'; category: CalendarCategory };

export interface RotationRule {
  id: string;
  when: RotationWhen;
  /** Item id within the active playlist, or full WallpaperItem ref override. */
  itemId: string;
  priority: number;
}

/** Particle preset ids (see particleEngine). */
export type ParticlePresetId =
  | 'fireflies'
  | 'rain'
  | 'snow'
  | 'dust'
  | 'leaves'
  | 'stars'
  | 'magic';

// ---- Weather (Phase 3 · M3) ----
export type WeatherKind = 'clear' | 'rain' | 'snow' | 'fog' | 'clouds';
/** off = none; auto = derive from the active wallpaper; else a fixed kind. */
export type WeatherMode = 'off' | 'auto' | WeatherKind;
export interface WeatherSettings {
  mode: WeatherMode;
  /** 0–1 strength of the atmospheric overlay. */
  intensity: number;
}

// ---- Ambient audio (Phase 3 · M4) ----
export interface AmbientAudioSettings {
  enabled: boolean;
  /** 0–1 ambient soundscape volume. */
  volume: number;
}

export interface EnvironmentSettings {
  /** Master switch for the living desktop layer. Default false. */
  enabled: boolean;
  performanceTier: PerformanceTier;
  particlesEnabled: boolean;
  /** 0–1 count scale (how many particles). */
  particleDensity: number;
  /** 0–1 visual strength (alpha / glow). */
  particleIntensity: number;
  /** 0–1 particle radius scale (flake / mote / firefly size). */
  particleSize: number;
  /** Build snow piles along the bottom when snow preset is active. */
  snowAccumulation: boolean;
  /** Manual preset selection when matchParticleSuggestions is false. */
  particlePresets: ParticlePresetId[];
  /** Derive active presets from wallpaper / time-of-day tags. */
  matchParticleSuggestions: boolean;
  companionsEnabled: boolean;
  /** Experimental: companions on the real Windows desktop (not implemented in L0). */
  companionsOnOsDesktop: boolean;
  /** Which companion types are active. */
  companionTypes: Array<
    'study-buddy' | 'critter' | 'timekeeper' | 'miko-shimeji' | 'wired-navi'
  >;
  companionReactivity: 'quiet' | 'normal' | 'playful';
  /** 0–1 wander / sprite / bob speed. Default 0.4 (calmer than classic shimeji). */
  companionActiveness: number;
  companionCelebrate: boolean;
  companionPauseWhenStudying: boolean;
  /** Persisted companion instances (positions / mood). */
  companions: import('./companionCatalog').CompanionInstance[];
  /** Programmable buddy command chains (click / menu). */
  buddyRoutines: import('./buddyRoutines').BuddyRoutine[];

  // ---- L1 wallpaper rotation ----
  /** When living layer is on, drive wallpaper from playlists/rules. */
  rotationEnabled: boolean;
  playlists: WallpaperPlaylist[];
  activePlaylistId: string;
  rules: RotationRule[];
  /** Prefer study/exam walls when calendar has matching events today (L5). */
  calendarWallsEnabled: boolean;

  // ---- L5 lighting & achievements ----
  /** Soft time-of-day colour wash over the desktop. */
  dayCycleLighting: boolean;
  /** 0–1 strength of the lighting wash. */
  lightingIntensity: number;
  /** Emit companion celebrations for streaks / daily volume. */
  achievementCelebrations: boolean;

  // ---- Weather (Phase 3 · M3) ----
  weather: WeatherSettings;

  // ---- Ambient audio (Phase 3 · M4) ----
  ambientAudio: AmbientAudioSettings;

  // ---- Environment presets (Phase 3 · M2) ----
  /** Active cohesive preset id, if one was applied. */
  environmentPresetId?: string;
}

export const DAY_CYCLE_PLAYLIST_ID = 'day-cycle';

/**
 * The built-in day-cycle playlist's seed labels, and the i18n key for each.
 *
 * They are stored in the playlist (so a user can rename them), which is why they
 * reached every language in English. A label still equal to its seed is shown
 * through i18n; a renamed one is the user's content and is shown as typed.
 */
const DAY_CYCLE_SEED_LABELS: Record<string, { label: string; key: string }> = {
  'dc-dawn': { label: 'Dawn', key: 'settings.wallpaper.dayCycle.dawn' },
  'dc-midday': { label: 'Midday', key: 'settings.wallpaper.dayCycle.midday' },
  'dc-dusk': { label: 'Dusk', key: 'settings.wallpaper.dayCycle.dusk' },
  'dc-night': { label: 'Night', key: 'settings.wallpaper.dayCycle.night' },
  'dc-aurora': { label: 'Late night', key: 'settings.wallpaper.dayCycle.lateNight' },
  'dc-ember': { label: 'Focus ember', key: 'settings.wallpaper.dayCycle.focusEmber' },
  'dc-crimson': { label: 'Exam veil', key: 'settings.wallpaper.dayCycle.examVeil' },
};
const DAY_CYCLE_SEED_NAME = 'Day cycle';

/** The i18n key for a built-in item's label, or `null` when it is the user's own. */
export function seedWallpaperLabelKey(item: { id: string; label?: string }): string | null {
  const seed = DAY_CYCLE_SEED_LABELS[item.id];
  return seed && (item.label === undefined || item.label === seed.label) ? seed.key : null;
}

/** The i18n key for the built-in playlist's name, or `null` once renamed. */
export function seedPlaylistNameKey(playlist: { id: string; name: string }): string | null {
  return playlist.id === DAY_CYCLE_PLAYLIST_ID && playlist.name === DAY_CYCLE_SEED_NAME
    ? 'settings.wallpaper.dayCycle.name'
    : null;
}

export function buildDefaultDayCyclePlaylist(): WallpaperPlaylist {
  return {
    id: DAY_CYCLE_PLAYLIST_ID,
    name: DAY_CYCLE_SEED_NAME,
    transition: 'crossfade',
    transitionMs: 1200,
    items: [
      { id: 'dc-dawn', kind: 'preset', ref: 'dawn', label: 'Dawn', tags: ['morning'], durationSec: 0 },
      { id: 'dc-midday', kind: 'preset', ref: 'midday', label: 'Midday', tags: ['day'], durationSec: 0 },
      { id: 'dc-dusk', kind: 'preset', ref: 'dusk', label: 'Dusk', tags: ['evening'], durationSec: 0 },
      { id: 'dc-night', kind: 'preset', ref: 'night', label: 'Night', tags: ['night'], durationSec: 0 },
      { id: 'dc-aurora', kind: 'preset', ref: 'aurora', label: 'Late night', tags: ['night'], durationSec: 0 },
      { id: 'dc-ember', kind: 'preset', ref: 'ember', label: 'Focus ember', tags: ['study', 'exam'], durationSec: 0 },
      { id: 'dc-crimson', kind: 'preset', ref: 'crimsonveil', label: 'Exam veil', tags: ['exam'], durationSec: 0 },
    ],
  };
}

export function buildDefaultRules(): RotationRule[] {
  return [
    // Calendar rules (higher priority) — only apply when calendarWallsEnabled
    { id: 'r-cal-exam', when: { type: 'calendarCategory', category: 'exam' }, itemId: 'dc-crimson', priority: 40 },
    { id: 'r-cal-study', when: { type: 'calendarCategory', category: 'study' }, itemId: 'dc-ember', priority: 30 },
    { id: 'r-cal-assign', when: { type: 'calendarCategory', category: 'assignment' }, itemId: 'dc-ember', priority: 25 },
    // Time of day
    { id: 'r-morning', when: { type: 'timeOfDay', fromHour: 5, toHour: 11 }, itemId: 'dc-dawn', priority: 10 },
    { id: 'r-day', when: { type: 'timeOfDay', fromHour: 11, toHour: 17 }, itemId: 'dc-midday', priority: 10 },
    { id: 'r-evening', when: { type: 'timeOfDay', fromHour: 17, toHour: 21 }, itemId: 'dc-dusk', priority: 10 },
    { id: 'r-night', when: { type: 'timeOfDay', fromHour: 21, toHour: 24 }, itemId: 'dc-night', priority: 10 },
    { id: 'r-latenight', when: { type: 'timeOfDay', fromHour: 0, toHour: 5 }, itemId: 'dc-aurora', priority: 10 },
  ];
}

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  enabled: false,
  performanceTier: 'medium',
  particlesEnabled: false,
  particleDensity: 0.65,
  particleIntensity: 0.8,
  particleSize: 0.55,
  snowAccumulation: true,
  particlePresets: ['fireflies'],
  matchParticleSuggestions: true,
  companionsEnabled: false,
  companionsOnOsDesktop: false,
  companionTypes: ['study-buddy', 'critter', 'timekeeper', 'miko-shimeji', 'wired-navi'],
  companionReactivity: 'normal',
  companionActiveness: 0.4,
  companionCelebrate: true,
  companionPauseWhenStudying: false,
  companions: [],
  buddyRoutines: [],
  rotationEnabled: false,
  playlists: [buildDefaultDayCyclePlaylist()],
  activePlaylistId: DAY_CYCLE_PLAYLIST_ID,
  rules: buildDefaultRules(),
  calendarWallsEnabled: false,
  dayCycleLighting: false,
  lightingIntensity: 0.45,
  achievementCelebrations: true,
  weather: { mode: 'off', intensity: 0.5 },
  ambientAudio: { enabled: false, volume: 0.5 },
};

/** Resolved surface the stage paints. */
export interface ResolvedWall {
  item: WallpaperItem;
  playlist: WallpaperPlaylist;
  reason: string;
}
