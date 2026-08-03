/**
 * MASTER_PLAN §10 — the Media Hub's category taxonomy.
 *
 * A leaf module on purpose: both `mediaHub` (dashboard, search, organization) and
 * `mediaFileIdentity` (release parsing, identity grouping) need to agree on what the
 * categories are, and each of those two needs the other. Keeping the taxonomy here
 * breaks that cycle instead of relying on ESM's tolerance for one.
 *
 * `mediaHub` re-exports everything below, so existing importers are unaffected.
 *
 * It imports **nothing**, deliberately. It used to take `MediaItem` from `types.ts`
 * while `types.ts` reached back for `MediaCategory`, which made `types.ts` — the module
 * every other one depends on — part of a three-module cycle. `mediaCategory` only ever
 * reads four fields, so it asks for those four structurally instead.
 */

export type MediaCategory =
  | 'anime' | 'drama' | 'movie' | 'tv' | 'music'
  | 'podcast' | 'audiobook' | 'learning' | 'personal' | 'inbox';

export const MEDIA_CATEGORIES: readonly MediaCategory[] = [
  'anime', 'drama', 'movie', 'tv', 'music', 'podcast', 'audiobook', 'learning', 'personal', 'inbox',
];

/** The four fields `mediaCategory` reads. `MediaItem` satisfies this structurally. */
export interface MediaCategoryInput {
  category?: MediaCategory;
  kind?: string;
  title?: string;
  fileName?: string;
}

/**
 * Baseline classifier: an explicit category, then the media kind, then a keyword
 * guess, then `inbox`. It reads only the item, never a parsed release name — see
 * `inferMediaCategory` in `mediaFileIdentity` for the stronger version that does.
 */
export function mediaCategory(item: MediaCategoryInput): MediaCategory {
  if (item.category && MEDIA_CATEGORIES.includes(item.category)) return item.category;
  if (item.kind === 'audiobook') return /podcast|ラジオ/i.test(item.fileName ?? '') ? 'podcast' : 'audiobook';
  if (item.kind === 'audio') return 'music';
  if (/\banime\b|\bseason\b|\bepisode\b|\bep\.?\s*\d/i.test(`${item.title ?? ''} ${item.fileName ?? ''}`)) return 'anime';
  return 'inbox';
}
