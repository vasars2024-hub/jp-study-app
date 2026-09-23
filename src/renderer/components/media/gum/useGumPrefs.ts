/**
 * The viewer's arrangement, persisted in localStorage (the UI-state tier — see
 * `storage/storage.ts`) and kept in step across Media Center windows through the
 * `storage` event. Catalogued as "Media library layout" in `settingsCatalog.ts`,
 * so Memory & storage can back it up, restore it and clear it.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  GUM_HOME_LAYOUT_KEY,
  GUM_LIBRARY_PREFS_KEY,
  GUM_SAVED_VIEWS_KEY,
  defaultHomeLayout,
  normalizeHomeLayout,
  normalizeLibraryPrefs,
  normalizeSavedViews,
  type GumHomeLayout,
  type GumLibraryPrefs,
  type GumSavedView,
} from './gumLayout';

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    // A corrupt or blocked store costs the arrangement, never the library.
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preference only.
  }
}

/** One persisted, normalised value with cross-window sync. */
function usePersisted<T>(key: string, read: () => T): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === key || event.key === null) setValue(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // `read` is a closure over stable module functions; `key` identifies it.
  }, [key]);
  const set = useCallback((next: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
      writeJson(key, resolved);
      return resolved;
    });
  }, [key]);
  return [value, set];
}

export function useSavedViews(): [GumSavedView[], (next: GumSavedView[] | ((current: GumSavedView[]) => GumSavedView[])) => void] {
  return usePersisted(GUM_SAVED_VIEWS_KEY, () => normalizeSavedViews(readJson(GUM_SAVED_VIEWS_KEY)));
}

export function useHomeLayout(savedViewIds: readonly string[]): {
  layout: GumHomeLayout;
  setLayout: (next: GumHomeLayout | ((current: GumHomeLayout) => GumHomeLayout)) => void;
  reset: () => void;
} {
  const idsKey = savedViewIds.join('|');
  const [layout, setLayout] = usePersisted(GUM_HOME_LAYOUT_KEY, () => normalizeHomeLayout(readJson(GUM_HOME_LAYOUT_KEY), savedViewIds));
  // A saved view deleted elsewhere drops out of the layout.
  useEffect(() => {
    setLayout((current) => normalizeHomeLayout(current, savedViewIds));
  }, [idsKey]);
  const reset = useCallback(() => setLayout(defaultHomeLayout()), [setLayout]);
  return { layout, setLayout, reset };
}

export function useLibraryPrefs(): [GumLibraryPrefs, (next: GumLibraryPrefs | ((current: GumLibraryPrefs) => GumLibraryPrefs)) => void] {
  return usePersisted(GUM_LIBRARY_PREFS_KEY, () => normalizeLibraryPrefs(readJson(GUM_LIBRARY_PREFS_KEY)));
}
