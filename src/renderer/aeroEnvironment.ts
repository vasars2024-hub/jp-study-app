/**
 * Secret OS (Aero) environment — wallpaper and living-layer state scoped to Aero mode.
 * Study OS environment is backed up on entry and restored on exit.
 */
import {
  loadEnvironment,
  markEnvironmentSwapped,
  onEnvironmentChanged,
  saveEnvironment,
  stripRetiredWalls,
} from './environment/environmentStore';
import { presetPatch } from './environment/environmentPresets';
import type { EnvironmentSettings, RotationRule, WallpaperPlaylist } from './environment/types';
import { writeLocalStorage, writeLocalStorageJson } from './localStorageWrite';
import { migrateLegacyCompanionStorage } from './environment/companionLegacyIds';
import { AERO_THEME_ID } from './theme/frutiger-aero';
import { DEFAULT_THEME_ID, loadThemeId, onThemeChanged } from './theme/engine';

const AERO_ENV_KEY = 'jp-aero-environment-v1';
const STUDY_ENV_BACKUP_KEY = 'jp-study-environment-backup-v1';
const AERO_RESTORE_THEME_KEY = 'jp-aero-restore-theme-v1';

export const SECRET_AERO_PLAYLIST_ID = 'secret-aero-default-wallpaper';
const SECRET_AERO_DEFAULT_RULE_ID = 'secret-aero-default';
const SECRET_AERO_DEFAULT_ITEM_ID = 'secret-harmony-aurora';
/**
 * Item ids of the playlist an earlier build seeded (two plain walls). A saved
 * playlist that is still exactly that seed was never edited, so it is upgraded
 * to the Aero scenery; anything else is the owner's and is left alone.
 */
const LEGACY_SEED_ITEM_IDS = ['secret-midday', 'secret-snow'];

/** Pins Secret OS to its first wall; `fromHour === toHour` matches all day. */
function buildSecretAeroDefaultRule(): RotationRule {
  return {
    id: SECRET_AERO_DEFAULT_RULE_ID,
    when: { type: 'timeOfDay', fromHour: 0, toHour: 0 },
    itemId: SECRET_AERO_DEFAULT_ITEM_ID,
    priority: 100,
  };
}

/**
 * Secret OS starts on its own CSS scenery (wallCatalog.ts): Harmony Aurora is
 * pinned, Bubble Lagoon and Green Hills sit beside it, and Midday stays as the
 * plain light fallback. (The five illustrated scenes an older build seeded were
 * removed and stay retired; these are new presets under new ids.)
 */
export function buildSecretAeroWallpaperPlaylist(): WallpaperPlaylist {
  return {
    id: SECRET_AERO_PLAYLIST_ID,
    name: 'Secret OS Default',
    transition: 'crossfade',
    transitionMs: 900,
    items: [
      { id: SECRET_AERO_DEFAULT_ITEM_ID, kind: 'preset', ref: 'harmony-aurora', label: 'Harmony Aurora', tags: ['secret', 'day'], durationSec: 0 },
      { id: 'secret-bubble-lagoon', kind: 'preset', ref: 'bubble-lagoon', label: 'Bubble Lagoon', tags: ['secret', 'day'], durationSec: 0 },
      { id: 'secret-green-hills', kind: 'preset', ref: 'green-hills', label: 'Green Hills', tags: ['secret', 'day'], durationSec: 0 },
      { id: 'secret-midday', kind: 'preset', ref: 'midday', label: 'Midday', tags: ['secret', 'day'], durationSec: 0 },
    ],
  };
}

function isUneditedLegacySeed(playlist: WallpaperPlaylist): boolean {
  const ids = playlist.items.map((item) => item.id);
  return ids.length === LEGACY_SEED_ITEM_IDS.length && ids.every((id, i) => id === LEGACY_SEED_ITEM_IDS[i]);
}

/**
 * Make sure Secret OS has a usable playlist without undoing the owner's edits.
 *
 * This used to REPLACE the playlist on every Aero entry and cold boot, so a wall
 * removed in Settings came straight back. It now seeds the playlist only when it
 * is missing or empty, and keeps the pin rule only while its wall still exists.
 */
export function refreshSecretWallpaperRefs(env: EnvironmentSettings): EnvironmentSettings {
  // A snapshot saved before the Aero scenes were removed still lists them.
  const clean = stripRetiredWalls(env.playlists ?? [], env.rules ?? []);
  const playlists = [...clean.playlists];
  const idx = playlists.findIndex((p) => p.id === SECRET_AERO_PLAYLIST_ID);
  const seeded = idx < 0 || playlists[idx].items.length === 0 || isUneditedLegacySeed(playlists[idx]);
  if (idx < 0) playlists.push(buildSecretAeroWallpaperPlaylist());
  else if (seeded) playlists[idx] = buildSecretAeroWallpaperPlaylist();
  const secret = playlists.find((p) => p.id === SECRET_AERO_PLAYLIST_ID);
  const otherRules = clean.rules.filter((rule) => rule.id !== SECRET_AERO_DEFAULT_RULE_ID);
  const existing = clean.rules.find((rule) => rule.id === SECRET_AERO_DEFAULT_RULE_ID);
  const pin = seeded ? buildSecretAeroDefaultRule() : existing;
  const pinStillValid = !!pin && !!secret?.items.some((item) => item.id === pin.itemId);
  // The same "unedited seed" rule for the particles: a snapshot still carrying
  // the old Floating Islands dust + magic gets the Aero bubbles instead.
  const legacyParticles =
    env.environmentPresetId === 'floating-islands' &&
    env.particlePresets?.length === 2 &&
    env.particlePresets[0] === 'dust' &&
    env.particlePresets[1] === 'magic';
  return {
    ...env,
    ...(legacyParticles ? { particlePresets: ['bubbles', 'magic'] as EnvironmentSettings['particlePresets'] } : {}),
    playlists,
    rules: pinStillValid && pin ? [pin, ...otherRules] : otherRules,
  };
}

export function secretAeroEnvironmentPatch(): Partial<EnvironmentSettings> {
  return {
    enabled: true,
    ...(presetPatch('floating-islands') ?? {}),
    // Glossy rising bubbles with a few magic motes, not dust — the Aero air.
    particlePresets: ['bubbles', 'magic'],
    companionsEnabled: true,
    companionTypes: ['aero-assistant'],
    companionReactivity: 'playful',
    companions: [],
    rotationEnabled: true,
    activePlaylistId: SECRET_AERO_PLAYLIST_ID,
    playlists: [buildSecretAeroWallpaperPlaylist()],
    rules: [buildSecretAeroDefaultRule()],
    calendarWallsEnabled: false,
  };
}

function readJson<T>(key: string): T | null {
  migrateLegacyCompanionStorage();
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

/**
 * Whether the live environment is currently Aero's. `'0'` once the Study environment has
 * been put back; `'1'` while Aero's is applied; absent on profiles from before the flag
 * (treated as applied, which is the old behaviour). It makes the restore idempotent:
 * Wired entry restores explicitly, and the theme bridge then sees Aero → Wired too — a
 * second restore would snapshot the STUDY environment as Aero's and lose Aero's.
 */
const AERO_ENV_ACTIVE_KEY = 'jp-aero-environment-active-v1';

function setAeroEnvironmentApplied(applied: boolean): void {
  writeLocalStorage(AERO_ENV_ACTIVE_KEY, applied ? '1' : '0');
}

export function isAeroEnvironmentApplied(): boolean {
  try {
    return localStorage.getItem(AERO_ENV_ACTIVE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Enter Aero: back up Study OS env, apply Aero env (seed wallpaper on first discovery). */
export function applyAeroEnvironment(firstDiscovery: boolean): EnvironmentSettings {
  const studyEnv = loadEnvironment();
  backupStudyEnvironment(studyEnv);
  markEnvironmentSwapped();
  setAeroEnvironmentApplied(true);

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

/**
 * Exit Aero: persist Aero env and restore the backed-up Study OS environment.
 * A no-op when the Study environment is already back (see `AERO_ENV_ACTIVE_KEY`).
 */
export function restoreStudyEnvironmentAfterAero(): EnvironmentSettings {
  if (!isAeroEnvironmentApplied()) return loadEnvironment();
  saveAeroEnvironmentSnapshot(loadEnvironment());
  setAeroEnvironmentApplied(false);
  const study = loadStudyEnvironmentBackup();
  if (!study) return loadEnvironment();
  // Before the write, so a companion layer re-rendering on this change already knows
  // its Aero list is stale and never writes it back over the Study one.
  markEnvironmentSwapped();
  return saveEnvironment(study);
}

/** Cold launch while Aero theme is active — ensure Aero wallpaper/env is present. */
export function bootAeroEnvironmentIfNeeded(isAeroTheme: boolean): void {
  if (!isAeroTheme) return;
  const aero = loadSavedAeroEnvironment();
  if (aero) {
    markEnvironmentSwapped();
    setAeroEnvironmentApplied(true);
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
    // Only while Aero's own environment is live: Aero reached without it (an old
    // profile, a Wired exit before that path applied it) must not save Study values
    // as Aero's.
    if (loadThemeId() === AERO_THEME_ID && isAeroEnvironmentApplied()) {
      saveAeroEnvironmentSnapshot(env);
    }
  });
}
