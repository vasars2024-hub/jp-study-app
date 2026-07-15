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

const KEY = 'jp-os-wall-fit';
const EVENT = 'jp-wall-fit-changed';

export function loadWallpaperFit(): WallpaperFit {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (WALLPAPER_FITS as string[]).includes(v)) return v as WallpaperFit;
  } catch {
    /* storage unavailable */
  }
  return 'cover';
}

export function applyWallpaperFit(fit: WallpaperFit): void {
  document.documentElement.style.setProperty('--wall-fit', OBJECT_FIT[fit]);
  try {
    localStorage.setItem(KEY, fit);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: fit }));
}

export const setWallpaperFit = applyWallpaperFit;

/** Apply the saved fit before first paint (called from main.tsx). */
export function bootWallpaperFit(): void {
  applyWallpaperFit(loadWallpaperFit());
}

export function onWallpaperFitChanged(cb: (fit: WallpaperFit) => void): () => void {
  const h = (e: Event): void => cb((e as CustomEvent<WallpaperFit>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
