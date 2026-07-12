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
  companionTypes: Array<'study-buddy' | 'critter' | 'timekeeper' | 'noctis'>;
  companionReactivity: 'quiet' | 'normal' | 'playful';
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
}

export const DAY_CYCLE_PLAYLIST_ID = 'day-cycle';

export function buildDefaultDayCyclePlaylist(): WallpaperPlaylist {
  return {
    id: DAY_CYCLE_PLAYLIST_ID,
    name: 'Day cycle',
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
  companionTypes: ['study-buddy', 'critter', 'timekeeper', 'noctis'],
  companionReactivity: 'normal',
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
};

/** Resolved surface the stage paints. */
export interface ResolvedWall {
  item: WallpaperItem;
  playlist: WallpaperPlaylist;
  reason: string;
}
