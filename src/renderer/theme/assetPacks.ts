/**
 * Frutiger Aero Platform — Asset-pack resolution (Phase 1 · M10)
 * -----------------------------------------------------------------------------
 * The extension point that makes the Anime Edition (and any future edition) a
 * pure ASSET SWAP: a theme declares `assetPack { icons?, wallpapers?, sounds? }`
 * (ids), and everything else — layout, components, spacing, motion, behaviour —
 * stays identical.
 *
 * Wired now: sound packs (theme → soundEngine active pack). Icons and wallpapers
 * are resolved here too, as documented hooks the relevant systems consume in
 * later phases (Icons.tsx pack support; the wallpaper framework pack).
 *
 * NO Anime Edition is implemented — only the plumbing.
 */

import { getTheme, loadThemeId, onThemeChanged } from './engine';
import { soundEngine } from '../audio/soundEngine';
import { SILENT_PACK } from '../audio/soundPack';
import { listWallpaperPacks } from '../environment/wallpaperFramework';

/** The currently-resolved icon/wallpaper pack ids (for systems that read them). */
let activeIconPack: string | null = null;
let activeWallpaperPack: string | null = null;

export function getActiveIconPack(): string | null {
  return activeIconPack;
}
export function getActiveWallpaperPack(): string | null {
  return activeWallpaperPack;
}

/** Resolve and apply the active theme's asset pack. */
export function applyAssetPack(themeId: string): void {
  const pack = getTheme(themeId)?.assetPack;

  // --- Sounds (wired) ---
  const soundPackId = pack?.sounds;
  if (soundPackId && soundEngine.listPacks().some((p) => p.id === soundPackId)) {
    soundEngine.setActivePack(soundPackId);
  } else {
    soundEngine.setActivePack(SILENT_PACK.id);
  }

  // --- Icons (hook) --- Icons.tsx gains pack support in a later phase; store
  // the selection so it can read it.
  activeIconPack = pack?.icons ?? null;

  // --- Wallpapers (hook) --- validate against the wallpaper framework packs so
  // a pack swap points the picker at the edition's wallpapers later.
  const wpId = pack?.wallpapers;
  activeWallpaperPack = wpId && listWallpaperPacks().some((p) => p.id === wpId) ? wpId : null;
}

let installed = false;

/** Apply now + re-apply on every theme change. Call once at boot. */
export function installAssetPackSync(): void {
  if (installed) return;
  installed = true;
  applyAssetPack(loadThemeId());
  onThemeChanged(applyAssetPack);
}
