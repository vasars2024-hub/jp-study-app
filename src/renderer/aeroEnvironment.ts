/**
 * Secret OS (Aero) environment — wallpaper and living-layer state scoped to Aero mode.
 * Study OS environment is backed up on entry and restored on exit.
 */
import { loadEnvironment, saveEnvironment } from './environment/environmentStore';
import { presetPatch } from './environment/environmentPresets';
import type { EnvironmentSettings, WallpaperPlaylist } from './environment/types';

const AERO_ENV_KEY = 'jp-aero-environment-v1';
const STUDY_ENV_BACKUP_KEY = 'jp-study-environment-backup-v1';

export const SECRET_AERO_PLAYLIST_ID = 'secret-aero-default-wallpaper';
export const SECRET_WALLPAPER_URL = new URL('./assets/secret-os-default-wallpaper.png', import.meta.url).href;

export function buildSecretAeroWallpaperPlaylist(): WallpaperPlaylist {
  return {
    id: SECRET_AERO_PLAYLIST_ID,
    name: 'Secret OS Default',
    transition: 'crossfade',
    transitionMs: 900,
    items: [
      {
        id: 'secret-aero-first-discovery',
        kind: 'image',
        ref: SECRET_WALLPAPER_URL,
        label: 'Secret OS Wallpaper',
        tags: ['secret', 'aero', 'day'],
        durationSec: 0,
      },
    ],
  };
}

export const SECRET_AERO_WALLPAPER_PLAYLIST = buildSecretAeroWallpaperPlaylist();

/** Keep bundled wallpaper URL fresh after Vite rebuilds / Electron packaging. */
export function refreshSecretWallpaperRefs(env: EnvironmentSettings): EnvironmentSettings {
  const fresh = buildSecretAeroWallpaperPlaylist();
  const playlists = [...env.playlists];
  const idx = playlists.findIndex((p) => p.id === SECRET_AERO_PLAYLIST_ID);
  if (idx >= 0) playlists[idx] = fresh;
  else playlists.push(fresh);
  return { ...env, playlists };
}

export function secretAeroEnvironmentPatch(): Partial<EnvironmentSettings> {
  return {
    enabled: true,
    ...(presetPatch('floating-islands') ?? {}),
    companionsEnabled: true,
    companionTypes: ['miko-shimeji'],
    companionReactivity: 'playful',
    companions: [],
    rotationEnabled: true,
    activePlaylistId: SECRET_AERO_PLAYLIST_ID,
    playlists: [buildSecretAeroWallpaperPlaylist()],
    calendarWallsEnabled: false,
  };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function hasSavedAeroEnvironment(): boolean {
  return readJson<EnvironmentSettings>(AERO_ENV_KEY) !== null;
}

export function loadSavedAeroEnvironment(): EnvironmentSettings | null {
  return readJson<EnvironmentSettings>(AERO_ENV_KEY);
}

export function saveAeroEnvironmentSnapshot(env: EnvironmentSettings): void {
  writeJson(AERO_ENV_KEY, env);
}

export function backupStudyEnvironment(env: EnvironmentSettings): void {
  writeJson(STUDY_ENV_BACKUP_KEY, env);
}

export function loadStudyEnvironmentBackup(): EnvironmentSettings | null {
  return readJson<EnvironmentSettings>(STUDY_ENV_BACKUP_KEY);
}

/** Enter Aero: back up Study OS env, apply Aero env (seed wallpaper on first discovery). */
export function applyAeroEnvironment(firstDiscovery: boolean): EnvironmentSettings {
  const studyEnv = loadEnvironment();
  backupStudyEnvironment(studyEnv);

  let aeroEnv = loadSavedAeroEnvironment();
  if (!aeroEnv || firstDiscovery) {
    const merged = refreshSecretWallpaperRefs({
      ...studyEnv,
      ...secretAeroEnvironmentPatch(),
    } as EnvironmentSettings);
    aeroEnv = saveEnvironment(merged);
    saveAeroEnvironmentSnapshot(aeroEnv);
    return aeroEnv;
  }

  const next = saveEnvironment(refreshSecretWallpaperRefs(aeroEnv));
  saveAeroEnvironmentSnapshot(next);
  return next;
}

/** Exit Aero: persist Aero env and restore the backed-up Study OS environment. */
export function restoreStudyEnvironmentAfterAero(): EnvironmentSettings {
  saveAeroEnvironmentSnapshot(loadEnvironment());
  const study = loadStudyEnvironmentBackup();
  if (study) return saveEnvironment(study);
  return loadEnvironment();
}

/** Cold launch while Aero theme is active — ensure Aero wallpaper/env is present. */
export function bootAeroEnvironmentIfNeeded(isAeroTheme: boolean): void {
  if (!isAeroTheme) return;
  const aero = loadSavedAeroEnvironment();
  if (aero) {
    saveEnvironment(refreshSecretWallpaperRefs(aero));
    return;
  }
  applyAeroEnvironment(true);
}
