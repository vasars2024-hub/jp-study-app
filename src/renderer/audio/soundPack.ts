/**
 * Frutiger Aero Platform — Sound pack manifest (Phase 1 · M7)
 * -----------------------------------------------------------------------------
 * A sound pack maps logical sound names to asset URLs. Packs are theme-scoped:
 * a theme's assetPack.sounds can select a pack (wired in M10). NO audio is
 * bundled in Phase 1 — the default is the SILENT pack, so every play() is a
 * safe no-op until a pack is added.
 *
 * Asset convention:  public/sounds/<packId>/<category>/<name>.<ext>
 */

export type SoundCategory =
  | 'system' /* startup, shutdown */
  | 'ui' /* click, confirm, error, hover */
  | 'environment' /* ambience beds (looping) */
  | 'companion' /* companion reactions */
  | 'achievement' /* milestones */
  | 'notification'; /* toasts / alerts */

export const SOUND_CATEGORIES: SoundCategory[] = [
  'system',
  'ui',
  'environment',
  'companion',
  'achievement',
  'notification',
];

export interface SoundPackManifest {
  id: string;
  label: string;
  /** Optional theme binding — auto-selected when that theme is active (M10). */
  themeId?: string;
  /** category → (logical name → asset URL). */
  sounds: Partial<Record<SoundCategory, Record<string, string>>>;
}

/** Build a conventional asset URL for a pack sound (origin-relative → app://). */
export function soundAssetUrl(packId: string, category: SoundCategory, file: string): string {
  return `${location.origin}/sounds/${packId}/${category}/${file}`;
}

/** The default pack ships NO audio — every play() is a safe no-op. */
export const SILENT_PACK: SoundPackManifest = {
  id: 'silent',
  label: 'Silent (no sounds)',
  sounds: {},
};
