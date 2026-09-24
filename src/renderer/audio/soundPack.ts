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

/**
 * A pack's sounds map whose URLs are built on first read, not at registration.
 *
 * The two generated packs (Aero, WIRED ARCHIVE) synthesize every cue as a WAV
 * data URL. Built eagerly (both are registered at boot) that was ~22 MB of
 * base64 strings on the renderer heap for two themes most users never pick.
 * `layout` names a cue per sound; `build` makes its URL once, when the sound
 * engine first asks for it, and the result is kept for the next play.
 */
export function lazySounds<K extends string>(
  layout: Partial<Record<SoundCategory, Record<string, K>>>,
  build: (cue: K) => string,
): SoundPackManifest['sounds'] {
  const cache = new Map<K, string>();
  const urlFor = (cue: K): string => {
    let url = cache.get(cue);
    if (url === undefined) {
      url = build(cue);
      cache.set(cue, url);
    }
    return url;
  };
  const sounds: SoundPackManifest['sounds'] = {};
  for (const [category, names] of Object.entries(layout) as [SoundCategory, Record<string, K>][]) {
    const group: Record<string, string> = {};
    for (const [name, cue] of Object.entries(names)) {
      Object.defineProperty(group, name, { enumerable: true, get: () => urlFor(cue) });
    }
    sounds[category] = group;
  }
  return sounds;
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
