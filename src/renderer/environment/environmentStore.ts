import {
  buildDefaultDayCyclePlaylist,
  buildDefaultRules,
  DAY_CYCLE_PLAYLIST_ID,
  DEFAULT_ENVIRONMENT,
  type EnvironmentSettings,
  type WallpaperPlaylist,
} from './types';
import { mergeBuddyRoutines } from './buddyRoutines';
import { writeLocalStorageJson } from '../localStorageWrite';

const KEY = 'jp-os-environment-v1';
const EVENT = 'jp-os-environment-changed';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function sanitizePlaylist(raw: unknown): WallpaperPlaylist | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<WallpaperPlaylist>;
  if (typeof p.id !== 'string' || typeof p.name !== 'string' || !Array.isArray(p.items)) return null;
  return {
    id: p.id,
    name: p.name,
    transition: p.transition === 'cut' || p.transition === 'fade' || p.transition === 'crossfade' ? p.transition : 'crossfade',
    transitionMs: typeof p.transitionMs === 'number' ? Math.max(0, Math.min(5000, p.transitionMs)) : 1200,
    items: p.items
      .filter((i) => i && typeof i === 'object' && typeof (i as WallpaperItemLoose).id === 'string')
      .map((i) => {
        const it = i as WallpaperItemLoose;
        return {
          id: it.id,
          kind: it.kind === 'image' || it.kind === 'video' ? it.kind : 'preset',
          ref: typeof it.ref === 'string' ? it.ref : 'crimsonveil',
          label: typeof it.label === 'string' ? it.label : undefined,
          tags: Array.isArray(it.tags) ? it.tags.filter((t): t is string => typeof t === 'string') : undefined,
          durationSec: typeof it.durationSec === 'number' ? it.durationSec : undefined,
        };
      }),
  };
}

interface WallpaperItemLoose {
  id: string;
  kind?: string;
  ref?: string;
  label?: string;
  tags?: unknown;
  durationSec?: number;
}

function normalize(partial: Partial<EnvironmentSettings>): EnvironmentSettings {
  const playlistsRaw = Array.isArray(partial.playlists)
    ? partial.playlists.map(sanitizePlaylist).filter(Boolean) as WallpaperPlaylist[]
    : [];
  let playlists = playlistsRaw.length ? playlistsRaw : [buildDefaultDayCyclePlaylist()];
  // Merge new default day-cycle items (e.g. exam/study walls) into older saves.
  playlists = playlists.map((p) => {
    if (p.id !== DAY_CYCLE_PLAYLIST_ID) return p;
    const def = buildDefaultDayCyclePlaylist();
    const have = new Set(p.items.map((i) => i.id));
    const missing = def.items.filter((i) => !have.has(i.id));
    if (!missing.length) return p;
    return { ...p, items: [...p.items, ...missing] };
  });
  const activePlaylistId =
    typeof partial.activePlaylistId === 'string' && playlists.some((p) => p.id === partial.activePlaylistId)
      ? partial.activePlaylistId
      : playlists[0]?.id ?? DAY_CYCLE_PLAYLIST_ID;

  let rules =
    Array.isArray(partial.rules) && partial.rules.length
      ? partial.rules
      : buildDefaultRules();
  // Ensure L5 calendar rules exist even for older saved rule lists.
  const hasCal = rules.some((r) => r.when && (r.when as { type?: string }).type === 'calendarCategory');
  if (!hasCal) {
    rules = [
      ...buildDefaultRules().filter((r) => r.when.type === 'calendarCategory'),
      ...rules,
    ];
  }

  const particlePresets = Array.isArray(partial.particlePresets)
    ? (partial.particlePresets.filter((p) => typeof p === 'string') as EnvironmentSettings['particlePresets'])
    : DEFAULT_ENVIRONMENT.particlePresets;

  const companionTypes = Array.isArray(partial.companionTypes)
    ? (partial.companionTypes.filter((t) =>
        t === 'study-buddy' ||
        t === 'critter' ||
        t === 'timekeeper' ||
        t === 'noctis' ||
        t === 'miko-shimeji' ||
        t === 'wired-navi',
      ) as EnvironmentSettings['companionTypes'])
    : DEFAULT_ENVIRONMENT.companionTypes;

  const companions = Array.isArray(partial.companions) ? partial.companions : DEFAULT_ENVIRONMENT.companions;
  const buddyRoutines = mergeBuddyRoutines(partial.buddyRoutines);

  const WEATHER_MODES = ['off', 'auto', 'clear', 'rain', 'snow', 'fog', 'clouds'];
  const weatherMode =
    partial.weather && WEATHER_MODES.includes(partial.weather.mode)
      ? partial.weather.mode
      : DEFAULT_ENVIRONMENT.weather.mode;

  return {
    ...DEFAULT_ENVIRONMENT,
    ...partial,
    particleDensity: clamp01(partial.particleDensity ?? DEFAULT_ENVIRONMENT.particleDensity),
    particleIntensity: clamp01(
      typeof partial.particleIntensity === 'number'
        ? partial.particleIntensity
        : DEFAULT_ENVIRONMENT.particleIntensity,
    ),
    particleSize: clamp01(
      typeof partial.particleSize === 'number'
        ? partial.particleSize
        : DEFAULT_ENVIRONMENT.particleSize,
    ),
    snowAccumulation: partial.snowAccumulation !== false,
    // An explicitly empty array means "every preset turned off" and must round-trip.
    // Only a missing/invalid field falls back to the defaults (handled above).
    particlePresets,
    matchParticleSuggestions: partial.matchParticleSuggestions !== false,
    companionTypes: companionTypes.length ? companionTypes : [...DEFAULT_ENVIRONMENT.companionTypes],
    companionReactivity:
      partial.companionReactivity === 'quiet' ||
      partial.companionReactivity === 'playful' ||
      partial.companionReactivity === 'normal'
        ? partial.companionReactivity
        : DEFAULT_ENVIRONMENT.companionReactivity,
    companionActiveness: clamp01(
      typeof partial.companionActiveness === 'number'
        ? partial.companionActiveness
        : DEFAULT_ENVIRONMENT.companionActiveness,
    ),
    companionCelebrate: partial.companionCelebrate !== false,
    companionPauseWhenStudying: partial.companionPauseWhenStudying === true,
    companions,
    buddyRoutines,
    playlists,
    activePlaylistId,
    rules,
    rotationEnabled: partial.rotationEnabled === true,
    calendarWallsEnabled: partial.calendarWallsEnabled === true,
    dayCycleLighting: partial.dayCycleLighting === true,
    lightingIntensity: clamp01(
      typeof partial.lightingIntensity === 'number'
        ? partial.lightingIntensity
        : DEFAULT_ENVIRONMENT.lightingIntensity,
    ),
    achievementCelebrations: partial.achievementCelebrations !== false,
    weather: {
      mode: weatherMode,
      intensity: clamp01(
        typeof partial.weather?.intensity === 'number'
          ? partial.weather.intensity
          : DEFAULT_ENVIRONMENT.weather.intensity,
      ),
    },
    ambientAudio: {
      enabled: partial.ambientAudio?.enabled === true,
      volume: clamp01(
        typeof partial.ambientAudio?.volume === 'number'
          ? partial.ambientAudio.volume
          : DEFAULT_ENVIRONMENT.ambientAudio.volume,
      ),
    },
    environmentPresetId:
      typeof partial.environmentPresetId === 'string' ? partial.environmentPresetId : undefined,
  };
}

export function loadEnvironment(): EnvironmentSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<EnvironmentSettings>);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_ENVIRONMENT, playlists: [buildDefaultDayCyclePlaylist()], rules: buildDefaultRules() };
}

export function saveEnvironment(partial: Partial<EnvironmentSettings>): EnvironmentSettings {
  const prev = loadEnvironment();
  const next = normalize({ ...prev, ...partial });
  writeLocalStorageJson(KEY, next);
  window.dispatchEvent(new CustomEvent<EnvironmentSettings>(EVENT, { detail: next }));
  return next;
}

export function bootEnvironment(): void {
  void loadEnvironment();
}

export function onEnvironmentChanged(cb: (s: EnvironmentSettings) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<EnvironmentSettings>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** True when living layer should paint wallpaper instead of the shell's static wall. */
export function isRotationActive(env: EnvironmentSettings = loadEnvironment()): boolean {
  return env.enabled && env.rotationEnabled;
}
