/**
 * Secret OS (Aero) environment — wallpaper and living-layer state scoped to Aero mode.
 * Study OS environment is backed up on entry and restored on exit.
 */
import { loadEnvironment, onEnvironmentChanged, saveEnvironment } from './environment/environmentStore';
import { presetPatch } from './environment/environmentPresets';
import type { EnvironmentSettings, WallpaperPlaylist } from './environment/types';
import { writeLocalStorage, writeLocalStorageJson } from './localStorageWrite';
import { AERO_THEME_ID } from './theme/frutiger-aero';
import { DEFAULT_THEME_ID, loadThemeId, onThemeChanged } from './theme/engine';

const AERO_ENV_KEY = 'jp-aero-environment-v1';
const STUDY_ENV_BACKUP_KEY = 'jp-study-environment-backup-v1';
const AERO_RESTORE_THEME_KEY = 'jp-aero-restore-theme-v1';

export const SECRET_AERO_PLAYLIST_ID = 'secret-aero-default-wallpaper';
export const SECRET_WALLPAPER_URL = new URL('./assets/secret-aero-network-wallpaper.jpg', import.meta.url).href;

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
        label: 'Secret Aero Network',
        tags: ['secret', 'aero', 'network', 'night'],
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

export function hasSavedAeroEnvironment(): boolean {
  return readJson<EnvironmentSettings>(AERO_ENV_KEY) !== null;
}

export function loadSavedAeroEnvironment(): EnvironmentSettings | null {
  return readJson<EnvironmentSettings>(AERO_ENV_KEY);
}

export function saveAeroEnvironmentSnapshot(env: EnvironmentSettings): void {
  writeLocalStorageJson(AERO_ENV_KEY, env);
}

export function backupStudyEnvironment(env: EnvironmentSettings): void {
  writeLocalStorageJson(STUDY_ENV_BACKUP_KEY, env);
}

export function loadStudyEnvironmentBackup(): EnvironmentSettings | null {
  return readJson<EnvironmentSettings>(STUDY_ENV_BACKUP_KEY);
}

/** Remember the Study OS theme to restore when leaving Aero (survives restarts). */
export function rememberAeroRestoreTheme(themeId: string): void {
  const id = themeId.trim();
  if (!id || id === AERO_THEME_ID) return;
  writeLocalStorage(AERO_RESTORE_THEME_KEY, id);
}

/** Theme to apply when exiting Aero; falls back to Study OS default. */
export function loadAeroRestoreTheme(fallback: string = DEFAULT_THEME_ID): string {
  try {
    const stored = localStorage.getItem(AERO_RESTORE_THEME_KEY);
    if (stored && stored !== AERO_THEME_ID) return stored;
  } catch {
    /* ignore */
  }
  return fallback !== AERO_THEME_ID ? fallback : DEFAULT_THEME_ID;
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

let aeroEnvBridgeInstalled = false;
let lastThemeForAeroEnv = DEFAULT_THEME_ID;

/**
 * Restore Study living-environment whenever the active theme leaves Aero —
 * Settings / Quick Settings / Wired / secret exit all go through theme change.
 */
export function installAeroEnvironmentBridge(): void {
  if (aeroEnvBridgeInstalled) return;
  aeroEnvBridgeInstalled = true;
  lastThemeForAeroEnv = loadThemeId();
  onThemeChanged((id) => {
    const prev = lastThemeForAeroEnv;
    lastThemeForAeroEnv = id;
    if (prev === AERO_THEME_ID && id !== AERO_THEME_ID) {
      restoreStudyEnvironmentAfterAero();
    }
  });
  // Keep the Aero snapshot in sync while Secret OS is active so Companions Off
  // (and other living-layer edits) survive the next Aero entry.
  onEnvironmentChanged((env) => {
    if (loadThemeId() === AERO_THEME_ID) {
      saveAeroEnvironmentSnapshot(env);
    }
  });
}
