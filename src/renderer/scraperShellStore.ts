// Persistence for the Scraper app's window shape (see shared/scraperShell.ts).
//
// Deliberately mirrors scraperSettingsStore.ts — same localStorage-plus-memory
// fallback, same CustomEvent bus — so the two stores behave identically when
// storage is full, disabled or corrupt. This module is the only writer of its
// key; anything else touching it directly would desync the change event.

import {
  DEFAULT_SCRAPER_SHELL_STATE,
  normalizeScraperShellState,
  pushRecentScraperPage,
  type ScraperPageId,
  type ScraperShellState,
} from '../shared/scraperShell';

export const SCRAPER_SHELL_STORAGE_KEY = 'jp-scraper-shell-v1';
const CHANGED_EVENT = 'jp-scraper-shell-changed';

let memoryFallback: ScraperShellState | null = null;

function dispatchChanged(state: ScraperShellState): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ScraperShellState>(CHANGED_EVENT, { detail: state }));
}

export function loadScraperShellState(): ScraperShellState {
  try {
    const raw = localStorage.getItem(SCRAPER_SHELL_STORAGE_KEY);
    if (raw) {
      const normalized = normalizeScraperShellState(JSON.parse(raw));
      memoryFallback = normalized.value;
      return normalized.value;
    }
  } catch {
    // Corrupt or unavailable storage falls through to the last known good
    // in-memory value, then to defaults.
  }
  if (memoryFallback) return normalizeScraperShellState(memoryFallback).value;
  memoryFallback = { ...DEFAULT_SCRAPER_SHELL_STATE };
  return memoryFallback;
}

export function saveScraperShellState(input: unknown): ScraperShellState {
  const state = normalizeScraperShellState(input).value;
  memoryFallback = state;
  try {
    localStorage.setItem(SCRAPER_SHELL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the validated value in memory when storage is unavailable or full.
  }
  dispatchChanged(state);
  return state;
}

export function patchScraperShellState(patch: Partial<ScraperShellState>): ScraperShellState {
  return saveScraperShellState({ ...loadScraperShellState(), ...patch });
}

/** Where "Advanced / developer tools" lived before it joined the shell document. */
export const LEGACY_SCRAPER_ADVANCED_KEY = 'jp-scraper-advanced-v1';

/**
 * One-time move of the old standalone advanced flag into `ScraperShellState.advanced`.
 * The legacy key is removed either way, so it cannot resurrect a choice the user
 * later reverses; a '1' carries over as `advanced: true`.
 */
export function migrateLegacyScraperAdvancedMode(): void {
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_SCRAPER_ADVANCED_KEY);
    if (legacy === null) return;
    localStorage.removeItem(LEGACY_SCRAPER_ADVANCED_KEY);
  } catch {
    return;
  }
  if (legacy === '1') patchScraperShellState({ advanced: true });
}

/** Navigate and record the visit in one write, so the MRU can't drift from the page. */
export function navigateScraperShell(page: ScraperPageId): ScraperShellState {
  const current = loadScraperShellState();
  return saveScraperShellState({
    ...current,
    page,
    recentPages: pushRecentScraperPage(current.recentPages, page),
  });
}

export function onScraperShellChanged(
  listener: (state: ScraperShellState) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handle = (event: Event) => {
    listener((event as CustomEvent<ScraperShellState>).detail);
  };
  const storage = (event: StorageEvent) => {
    if (event.key !== SCRAPER_SHELL_STORAGE_KEY && event.key !== null) return;
    // Deletion/clear must not resurrect this window's old memory fallback.
    memoryFallback = null;
    listener(loadScraperShellState());
  };
  window.addEventListener(CHANGED_EVENT, handle);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, handle);
    window.removeEventListener('storage', storage);
  };
}
