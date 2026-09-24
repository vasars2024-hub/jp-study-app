/**
 * External player profiles — the renderer's synchronous mirror.
 *
 * The list is owned by the main process (`main/externalPlayer.ts`), because the
 * launcher must only start programs the user configured. Menus need an answer
 * synchronously, so a copy lives in localStorage and is refreshed from main
 * (on load and on every `externalPlayer:changed`). Profiles saved by builds
 * that kept them only here are pushed to main once, so nobody has to add their
 * players again.
 */

import {
  createEmptyExternalPlayerPreferences,
  normalizeExternalPlayerPreferences,
  type ExternalPlayerPreferences,
} from '../shared/externalPlayer';

export const EXTERNAL_PLAYER_STORAGE_KEY = 'jp-external-player-preferences-v1';
export const EXTERNAL_PLAYER_CHANGED_EVENT = 'external-player-preferences-changed';

let fallback: ExternalPlayerPreferences | null = null;

export function loadExternalPlayerPreferences(): ExternalPlayerPreferences {
  // The first read anywhere (a menu opening, not only Settings) syncs with main,
  // so a list saved by an older build reaches the launcher before a click.
  if (!hydration && typeof window !== 'undefined' && window.api?.externalPlayersGet) {
    void hydrateExternalPlayerPreferences();
  }
  try {
    const raw = localStorage.getItem(EXTERNAL_PLAYER_STORAGE_KEY);
    if (raw) return (fallback = normalizeExternalPlayerPreferences(JSON.parse(raw)));
  } catch {
    /* memory fallback */
  }
  return fallback ?? createEmptyExternalPlayerPreferences();
}

function mirror(input: unknown): ExternalPlayerPreferences {
  const value = normalizeExternalPlayerPreferences(input);
  fallback = value;
  try {
    localStorage.setItem(EXTERNAL_PLAYER_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* memory fallback */
  }
  try {
    window.dispatchEvent(new CustomEvent(EXTERNAL_PLAYER_CHANGED_EVENT));
  } catch {
    /* no window (tests) */
  }
  return value;
}

/** Local mirror only. Use {@link commitExternalPlayerPreferences} to change what main will launch. */
export function saveExternalPlayerPreferences(input: unknown): ExternalPlayerPreferences {
  return mirror(input);
}

export interface ExternalPlayerCommitResult {
  preferences: ExternalPlayerPreferences;
  /** Profile ids main refused, with why (`not-absolute`, `missing`, `not-executable`). */
  rejected: { id: string; problem: string }[];
}

/** Saves through main (which validates every program path) and mirrors what it kept. */
export async function commitExternalPlayerPreferences(input: ExternalPlayerPreferences): Promise<ExternalPlayerCommitResult> {
  const api = typeof window !== 'undefined' ? window.api : undefined;
  if (!api?.externalPlayersSave) return { preferences: mirror(input), rejected: [] };
  const result = await api.externalPlayersSave(normalizeExternalPlayerPreferences(input));
  return { preferences: mirror(result.preferences), rejected: result.rejected };
}

let hydration: Promise<ExternalPlayerPreferences> | null = null;

/**
 * Refreshes the mirror from main. When main has no profiles but this mirror
 * does (a list configured before main owned it), the mirror is pushed once.
 */
export function hydrateExternalPlayerPreferences(): Promise<ExternalPlayerPreferences> {
  if (hydration) return hydration;
  hydration = (async () => {
    const api = typeof window !== 'undefined' ? window.api : undefined;
    if (!api?.externalPlayersGet) return loadExternalPlayerPreferences();
    const main = normalizeExternalPlayerPreferences(await api.externalPlayersGet());
    const local = loadExternalPlayerPreferences();
    if (main.profiles.length === 0 && local.profiles.length > 0) {
      return (await commitExternalPlayerPreferences(local)).preferences;
    }
    return mirror(main);
  })().catch(() => loadExternalPlayerPreferences());
  return hydration;
}

/** Keeps the mirror current and tells the caller; returns an unsubscribe. */
export function onExternalPlayerPreferencesChanged(cb: (preferences: ExternalPlayerPreferences) => void): () => void {
  const local = (): void => cb(loadExternalPlayerPreferences());
  window.addEventListener(EXTERNAL_PLAYER_CHANGED_EVENT, local);
  const offMain = window.api?.onExternalPlayersChanged?.((preferences) => mirror(preferences));
  return () => {
    window.removeEventListener(EXTERNAL_PLAYER_CHANGED_EVENT, local);
    offMain?.();
  };
}

/** For tests: forget the once-per-session hydration. */
export function __resetExternalPlayerHydrationForTests(): void {
  hydration = null;
  fallback = null;
}
