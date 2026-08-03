/**
 * Release-kind taxonomy for parsed media file names.
 *
 * A leaf module for the same reason `mediaCategories.ts` is one: `types.ts` needs
 * to name the kind on `MediaItem`, and `mediaFileIdentity.ts` — which produces it
 * — needs `MediaItem`. Declaring the union here breaks that cycle instead of
 * relying on ESM's tolerance for one, and keeps `types.ts` (the module everything
 * else depends on) out of a cycle it has been kept out of before.
 *
 * It imports **nothing**, deliberately. `mediaFileIdentity` re-exports both types,
 * so existing importers are unaffected.
 */

export type MediaReleaseKind = 'episode' | 'season-pack' | 'movie' | 'special' | 'ova' | 'unknown';

export type MediaReleaseSource = 'bluray' | 'web' | 'hdtv' | 'dvd' | null;
