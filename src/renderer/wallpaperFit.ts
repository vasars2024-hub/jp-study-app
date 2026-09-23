/**
 * Wallpaper fit (Phase 2 · M10) — how the base desktop wallpaper is scaled.
 * Sets a `--wall-fit` CSS var (object-fit keyword) on <html>; shell.css applies
 * it to `.os-wall-image` / `.os-wall-video`, overriding the old hardcoded
 * `cover`. Persisted to localStorage `jp-os-wall-fit`.
 */

export type WallpaperFit = 'cover' | 'contain' | 'fill' | 'center';

export const WALLPAPER_FITS: WallpaperFit[] = ['cover', 'contain', 'fill', 'center'];

export const WALLPAPER_FIT_LABEL: Record<WallpaperFit, string> = {
  cover: 'Fill screen',
  contain: 'Fit',
  fill: 'Stretch',
  center: 'Center',
};

/** Map a fit to a CSS object-fit keyword (center = none + centred position). */
const OBJECT_FIT: Record<WallpaperFit, string> = {
  cover: 'cover',
  contain: 'contain',
  fill: 'fill',
  center: 'none',
};

/**
 * Background layers cannot use `object-fit`, so the living wallpaper stage
 * needs the equivalent `background-size` value. Keep the two mappings beside
 * each other so base-shell and scheduled/environment wallpapers cannot drift.
 */
const BACKGROUND_SIZE: Record<WallpaperFit, string> = {
  cover: 'cover',
  contain: 'contain',
  fill: '100% 100%',
  center: 'auto',
};

const KEY = 'jp-os-wall-fit';
const EVENT = 'jp-wall-fit-changed';
let wallpaperFitSyncCleanup: (() => void) | null = null;

function normalizeWallpaperFit(value: unknown): WallpaperFit {
  return typeof value === 'string' && (WALLPAPER_FITS as readonly string[]).includes(value)
    ? value as WallpaperFit
    : 'cover';
}

function applyWallpaperFitToRoot(fit: WallpaperFit): void {
  document.documentElement.style.setProperty('--wall-fit', OBJECT_FIT[fit]);
  document.documentElement.style.setProperty('--wall-background-fit', BACKGROUND_SIZE[fit]);
}

function notifyWallpaperFitChanged(fit: WallpaperFit): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: fit }));
}

export function loadWallpaperFit(): WallpaperFit {
  try {
    return normalizeWallpaperFit(localStorage.getItem(KEY));
  } catch {
    /* storage unavailable */
  }
  return 'cover';
}

export function applyWallpaperFit(fit: WallpaperFit): void {
  const next = normalizeWallpaperFit(fit);
  applyWallpaperFitToRoot(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  notifyWallpaperFitChanged(next);
}

export const setWallpaperFit = applyWallpaperFit;

/** Apply the saved fit before first paint (called from main.tsx). */
export function bootWallpaperFit(): void {
  applyWallpaperFitToRoot(loadWallpaperFit());
  startWallpaperFitSync();
}

/**
 * Storage events are delivered only to sibling renderers. Apply the already
 * persisted value without writing it back, then reuse the local event so an
 * open Quick Settings panel can converge as well.
 */
export function startWallpaperFitSync(): () => void {
  if (wallpaperFitSyncCleanup) return wallpaperFitSyncCleanup;

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== KEY) return;
    const next = normalizeWallpaperFit(event.newValue);
    applyWallpaperFitToRoot(next);
    notifyWallpaperFitChanged(next);
  };
  window.addEventListener('storage', onStorage);
  const cleanup = (): void => {
    if (wallpaperFitSyncCleanup !== cleanup) return;
    window.removeEventListener('storage', onStorage);
    wallpaperFitSyncCleanup = null;
  };
  wallpaperFitSyncCleanup = cleanup;
  return cleanup;
}

export function onWallpaperFitChanged(cb: (fit: WallpaperFit) => void): () => void {
  startWallpaperFitSync();
  const h = (e: Event): void => cb((e as CustomEvent<WallpaperFit>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
