/**
 * The owner's private, git-ignored assets (`private-assets/` at the repo root).
 *
 * Third-party art — fan-made companion sprite packs, reference images — must
 * not be in the public tree, but the owner's own builds keep using it. Vite
 * resolves these globs at build time: when the folder exists the files are
 * bundled like any other asset, and in a public clone every glob is simply
 * empty. Nothing may assume a private file exists; each user of this module has
 * an original fallback.
 *
 * Layout (see .gitignore):
 *   private-assets/shimeji/<pack>/*.png          companion packs, listed like built-ins
 *   private-assets/shimeji/<pack>/sequences.json optional per-motion frame lists
 *   private-assets/shimeji/defaults.json         optional { "<companion type>": "<pack>" }
 *   private-assets/images/*                      reference images
 */

export type AssetGlob = Record<string, string>;
export type JsonGlob = Record<string, unknown>;

export const PRIVATE_SHIMEJI_FRAMES = import.meta.glob('/private-assets/shimeji/*/*.{png,gif,webp}', {
  eager: true,
  import: 'default',
}) as AssetGlob;

export const PRIVATE_SHIMEJI_SEQUENCES = import.meta.glob('/private-assets/shimeji/*/sequences.json', {
  eager: true,
  import: 'default',
}) as JsonGlob;

export const PRIVATE_SHIMEJI_DEFAULTS = import.meta.glob('/private-assets/shimeji/defaults.json', {
  eager: true,
  import: 'default',
}) as JsonGlob;

const PRIVATE_IMAGES = import.meta.glob('/private-assets/images/*.{png,jpg,jpeg,webp,gif}', {
  eager: true,
  import: 'default',
}) as AssetGlob;

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** URL of `private-assets/images/<name>`, or null when it is not there (a public clone). */
export function privateImageUrl(name: string, images: AssetGlob = PRIVATE_IMAGES): string | null {
  const want = name.toLowerCase();
  for (const [p, url] of Object.entries(images)) {
    if (basename(p).toLowerCase() === want) return url;
  }
  return null;
}
