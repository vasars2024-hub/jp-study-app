/**
 * Which harvested subtitle file belongs on which library item.
 *
 * The subs-only route acquires a *range* — 39 files in one click is the number
 * this pipeline was actually built for — and until now the only way to land them
 * was one `<select>` pair at a time, 39 times. This plans the whole set at once.
 *
 * It refuses far more readily than it guesses. Writing episode 7's cues onto
 * episode 8 is worse than attaching nothing: it is silent, it survives into the
 * deck as mistimed provenance, and the user has no reason to look. So every rule
 * below is a *narrowing* one, and anything that stays ambiguous is reported as
 * skipped with its reason rather than resolved by a tie-break.
 */
import { episodeFromFileName, looksLikeSameTitle } from './subtitleNyaa';
import { parseMediaFileName } from './mediaFileIdentity';

/** One fetched file, as the harvest panel holds it. */
export interface AttachSourceFile {
  /** Unique within one harvest. */
  key: string;
  /** The episode the provider filed it under; `null` when nothing numbered it. */
  episode: number | null;
  /** Display label, also the label written onto the record. */
  label: string;
}

/** One library item a file could land on. */
export interface AttachTargetItem {
  id: string;
  title: string;
  fileName?: string | null;
  /** Labels already on the item, so a second run does not double-write. */
  existingLabels?: readonly (string | null | undefined)[];
}

export type AttachSkipReason =
  /** The provider numbered nothing, so no episode can be claimed. */
  | 'no-episode'
  /** Nothing in the library is that episode of this series. */
  | 'no-match'
  /** More than one library item claims that episode; picking one would be a guess. */
  | 'ambiguous'
  /** That exact label is already a track on the matched item. */
  | 'already-attached';

export interface AttachPairing {
  key: string;
  episode: number;
  mediaId: string;
  mediaTitle: string;
}

export interface AttachSkip {
  key: string;
  episode: number | null;
  reason: AttachSkipReason;
}

export interface SubtitleAttachPlan {
  pairs: AttachPairing[];
  skipped: AttachSkip[];
}

/**
 * The episode a library item represents, read from its file name first.
 *
 * The file name is preferred because a library title can be user-edited into
 * anything, while the name on disk still carries the release's own numbering.
 *
 * **A `null` from the strict parser is an answer, not a gap**, and the loose
 * `episodeFromFileName` is only reached when there is no file name at all.
 * Measured on the user's real library: `The Big O - Creditless Ending 1/2` parse
 * to `null` — the extras they are — while the loose reader returns **1 and 2**,
 * colliding with real episodes 1 and 2. Falling through on null cost exactly
 * those two episodes of a 26-file harvest (24 paired, 2 ambiguous). A creditless
 * ending is not episode 1, and the parser that read the whole release name
 * already said so.
 */
function episodeOfTarget(item: AttachTargetItem): number | null {
  const name = (item.fileName ?? '').trim();
  if (!name) return episodeFromFileName(item.title ?? '');
  const parsed = parseMediaFileName(name).episode;
  if (parsed !== null) return parsed;
  return hashNumbered(name);
}

/**
 * The one numbering form the strict parser has no rule for: `… Hana #12 [id].mp4`.
 *
 * Added rather than reinstating a loose whole-name fallback, because `#` is the
 * narrowest possible signal — no release convention spends it on a resolution, a
 * CRC, a volume or a creditless extra, so it cannot recreate the collision
 * above. Four of the user's 33 library items are `#`-numbered episodes of a
 * podcast series, and without this they are unreachable from a range attach.
 */
function hashNumbered(name: string): number | null {
  const value = Number(/#\s*(\d{1,3})(?!\d)/.exec(name)?.[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Does this library item belong to the series that was harvested?
 *
 * Without this the matcher is an episode-number lookup, and every library that
 * holds two shows would cross-wire them — "The Big O - 01" and a JoJo episode 01
 * are both episode 1. `looksLikeSameTitle` is the app's own release-name
 * comparator, already hardened against the sequel-number collision this would
 * otherwise repeat.
 *
 * An empty series title means the caller cannot say, and rather than matching
 * everything the plan then matches nothing — a harvest with no title attached is
 * a caller bug, not a licence to write onto arbitrary videos.
 *
 * The *parsed* title is offered alongside the raw name because a raw release
 * name loses this comparison on its own tags: measured, `looksLikeSameTitle('The
 * Big O - 05 [BDRip].mkv', 'The Big O')` is **false**, while the same call on the
 * parser's `'The Big O'` is true. All three forms are tried and any one is
 * enough — the episode number is what narrows the match, this only decides which
 * show is on the table.
 */
function belongsToSeries(item: AttachTargetItem, seriesTitle: string): boolean {
  const series = (seriesTitle ?? '').trim();
  if (!series) return false;
  const fileName = (item.fileName ?? '').trim();
  const forms = [fileName, fileName ? parseMediaFileName(fileName).title : '', (item.title ?? '').trim()];
  return forms.some((form) => form.length > 0 && looksLikeSameTitle(form, series));
}

/**
 * Pair every harvested file with the library item it belongs on.
 *
 * Each item takes at most one file per plan: two files claiming the same target
 * make the *second* one ambiguous rather than overwriting the first, which is
 * the same refusal a two-way tie gets and for the same reason.
 */
export function planSubtitleAttach(
  files: readonly AttachSourceFile[],
  targets: readonly AttachTargetItem[],
  seriesTitle: string,
): SubtitleAttachPlan {
  const candidates = targets.filter((item) => belongsToSeries(item, seriesTitle));
  const byEpisode = new Map<number, AttachTargetItem[]>();
  for (const item of candidates) {
    const episode = episodeOfTarget(item);
    if (episode === null) continue;
    const bucket = byEpisode.get(episode);
    if (bucket) bucket.push(item);
    else byEpisode.set(episode, [item]);
  }

  const pairs: AttachPairing[] = [];
  const skipped: AttachSkip[] = [];
  const claimed = new Set<string>();

  for (const file of files) {
    if (file.episode === null) {
      skipped.push({ key: file.key, episode: null, reason: 'no-episode' });
      continue;
    }
    const bucket = byEpisode.get(file.episode) ?? [];
    const free = bucket.filter((item) => !claimed.has(item.id));
    if (!bucket.length) {
      skipped.push({ key: file.key, episode: file.episode, reason: 'no-match' });
      continue;
    }
    if (bucket.length > 1 || free.length !== 1) {
      skipped.push({ key: file.key, episode: file.episode, reason: 'ambiguous' });
      continue;
    }
    const target = free[0];
    const already = (target.existingLabels ?? []).some(
      (label) => (label ?? '').trim() === file.label.trim(),
    );
    if (already) {
      skipped.push({ key: file.key, episode: file.episode, reason: 'already-attached' });
      continue;
    }
    claimed.add(target.id);
    pairs.push({ key: file.key, episode: file.episode, mediaId: target.id, mediaTitle: target.title });
  }

  return { pairs, skipped };
}

/** Counts per skip reason, in the order the summary line reports them. */
export function countAttachSkips(skipped: readonly AttachSkip[]): Record<AttachSkipReason, number> {
  const counts: Record<AttachSkipReason, number> = {
    'no-episode': 0,
    'no-match': 0,
    ambiguous: 0,
    'already-attached': 0,
  };
  for (const skip of skipped) counts[skip.reason] += 1;
  return counts;
}
