/**
 * The one reader/writer of `jp-media-player-preferences-v1` for both of its
 * owners: the Media Center settings pane (`MediaContent`) and the VideoCore
 * study overlay (round-2 audit B).
 *
 * Each used to write its whole copy of the object on every change — the Media
 * Center even on mount — so each erased whatever the other had changed since
 * it loaded: the overlay's subtitle font, colour and position, the Media
 * Center's speed and toggles. Writes here are PATCHES: read the stored object,
 * lay the changed keys over it, write it back. And a write announces itself, so
 * the other owner can take the change: the `storage` event covers another
 * window, a same-window event covers this one (the browser never raises
 * `storage` in the window that wrote).
 */
import { PLAYER_PREFERENCES_STORAGE_KEY } from '../shared/videoCoreStudy';
import { writeLocalStorageJson } from './localStorageWrite';

export const PLAYER_PREFERENCES_CHANGED_EVENT = 'player-preferences-changed';

export function readStoredPlayerPreferences(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PLAYER_PREFERENCES_STORAGE_KEY) ?? 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Lay `patch` over the stored preferences. `source` names the writer, so its
 * own listener can ignore the echo.
 */
export function writePlayerPreferencesPatch(patch: Record<string, unknown>, source: string): boolean {
  if (Object.keys(patch).length === 0) return true;
  const next = { ...readStoredPlayerPreferences(), ...patch };
  const ok = writeLocalStorageJson(PLAYER_PREFERENCES_STORAGE_KEY, next);
  try {
    window.dispatchEvent(new CustomEvent(PLAYER_PREFERENCES_CHANGED_EVENT, { detail: { source } }));
  } catch {
    /* no window (tests) */
  }
  return ok;
}

/** Keys whose value differs between two preference objects (shallow, arrays by JSON). */
export function changedPreferenceKeys<T extends Record<string, unknown>>(before: T, after: T): (keyof T)[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => {
    const a = before[key];
    const b = after[key];
    if (a === b) return false;
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) !== JSON.stringify(b);
    return true;
  }) as (keyof T)[];
}

/**
 * Call `cb` with the stored object whenever another writer changes it — in
 * this window (not for `source`'s own writes) or another one.
 */
export function onPlayerPreferencesChanged(
  source: string,
  cb: (stored: Record<string, unknown>) => void,
): () => void {
  const onLocal = (event: Event): void => {
    if ((event as CustomEvent<{ source?: string }>).detail?.source === source) return;
    cb(readStoredPlayerPreferences());
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== PLAYER_PREFERENCES_STORAGE_KEY) return;
    cb(readStoredPlayerPreferences());
  };
  window.addEventListener(PLAYER_PREFERENCES_CHANGED_EVENT, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PLAYER_PREFERENCES_CHANGED_EVENT, onLocal);
    window.removeEventListener('storage', onStorage);
  };
}
