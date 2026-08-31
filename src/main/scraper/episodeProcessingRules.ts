/**
 * The `episodeProcessing` settings group, applied to built rows.
 *
 * ## Why this exists next to `shared/episodeProcessing.ts`
 *
 * The audit (F5) found four settings in this group that nothing read:
 * `detectMissingNumbers`, `mergeDuplicateSources`, `keepHighestQuality` and
 * `renameEpisodes`. The user could change all four and nothing anywhere
 * behaved differently.
 *
 * The group's other six — `naturalSort`, `audioPreference`, `languagePriority`,
 * `resolutionPriority`, `ignoreFiller`, `ignoreRecaps` — were live the whole
 * time, read directly by `engine.ts`, `seanimeSources.ts`, `torrents.ts`,
 * `scraperResults.ts` and `subtitleManagement.ts`. (The audit's own correction
 * concluded all ten were dead; that was wrong, and the register has been
 * amended.)
 *
 * `shared/episodeProcessing.ts` implements all ten, but against
 * `ExtractedEpisode` — a DOM-extraction shape with `filler`, `recap`,
 * `language`, a numeric `resolution` and a `sources` array. The engine deals in
 * `EpisodeRow`, which has none of those in that form. Round-tripping rows
 * through the extraction shape to reuse it would drop real fields on the way
 * out, so the four behaviours are implemented here against the shape the engine
 * actually has. That module stays what it is: the extraction-layer parser,
 * still unwired, still recorded as such in `architecture-baseline.json`.
 *
 * The shape of this file follows `applyExtractionSettings` in
 * `extractionRules.ts` deliberately — same contract, same call sites, and the
 * same rule that with every toggle off the rows come out untouched.
 */
import type { EpisodeRow } from '../../shared/scraperResults';
import type { ScraperEpisodeProcessingSettings } from '../../shared/scraperSettings';

/** Episode kinds `ignoreRecaps` covers. */
const RECAP_KINDS = new Set(['recap']);

/**
 * Kinds `ignoreFiller` covers.
 *
 * A catalogue row carries no filler flag, so this is the closest honest
 * reading: the non-canonical extras a "skip filler" setting is asking to be rid
 * of. It deliberately does NOT include `special`/`ova`/`ona`/`movie`, which are
 * canon for many series — dropping those on a filler toggle would delete
 * content the user wanted.
 */
const FILLER_KINDS = new Set(['opening', 'ending', 'trailer']);

/** Numeric resolution from a row's `"1080p"`-style label; 0 when unlabelled. */
function resolutionValue(row: EpisodeRow): number {
  return Number.parseInt(row.resolution, 10) || 0;
}

/**
 * Rank by the user's resolution preference, then by raw height.
 *
 * `resolutionPriority` is an ordered list, so position in it wins over the
 * number itself — a user who lists 720 first wants 720, not "the biggest".
 */
function betterQuality(
  a: EpisodeRow,
  b: EpisodeRow,
  resolutionPriority: number[],
): EpisodeRow {
  const rank = (row: EpisodeRow) => {
    const index = resolutionPriority.indexOf(resolutionValue(row));
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const byPreference = rank(a) - rank(b);
  if (byPreference !== 0) return byPreference < 0 ? a : b;
  return resolutionValue(a) >= resolutionValue(b) ? a : b;
}

/** The identity two rows must share to be the same episode from two sources. */
function mergeKey(row: EpisodeRow): string {
  return `${row.season}:${row.kind}:${row.number}`;
}

export interface EpisodeProcessingOutcome {
  rows: EpisodeRow[];
  /**
   * Gaps in the numbered run of `kind: 'episode'` rows, ascending.
   *
   * Empty both when nothing is missing and when `detectMissingNumbers` is off —
   * callers that need to tell those apart should read the setting.
   */
  missingEpisodeNumbers: number[];
}

export interface EpisodeProcessingOptions {
  /**
   * Skip the filler/recap filter because the caller already did it better.
   *
   * The catalogue path knows which episodes a provider *flagged* as filler,
   * which is real evidence; the kind-based filter here is the fallback for
   * rows that have no such flag. Running both would be double filtering, and
   * the weaker rule would be the one that decided.
   */
  skipKindFilter?: boolean;
}

export function applyEpisodeProcessing(
  rows: EpisodeRow[],
  processing: ScraperEpisodeProcessingSettings,
  options: EpisodeProcessingOptions = {},
): EpisodeProcessingOutcome {
  let next = rows;

  if (!options.skipKindFilter && (processing.ignoreFiller || processing.ignoreRecaps)) {
    next = next.filter(
      (row) =>
        !(processing.ignoreFiller && FILLER_KINDS.has(row.kind))
        && !(processing.ignoreRecaps && RECAP_KINDS.has(row.kind)),
    );
  }

  if (processing.mergeDuplicateSources) {
    const merged = new Map<string, EpisodeRow>();
    for (const row of next) {
      const key = mergeKey(row);
      const previous = merged.get(key);
      if (!previous) {
        merged.set(key, row);
        continue;
      }
      // Without `keepHighestQuality` the first row seen wins, which keeps the
      // merge order-stable and makes the quality setting the only thing that
      // can change which mirror survives.
      const winner = processing.keepHighestQuality
        ? betterQuality(previous, row, processing.resolutionPriority)
        : previous;
      // Subtitles are unioned by language: a mirror the merge discards may
      // still have been the only one carrying a track, and losing that would
      // make the merge destructive rather than consolidating.
      const languages = new Set(winner.subtitles.map((s) => s.language));
      const extra = (winner === previous ? row : previous).subtitles.filter(
        (s) => !languages.has(s.language),
      );
      merged.set(key, extra.length ? { ...winner, subtitles: [...winner.subtitles, ...extra] } : winner);
    }
    next = [...merged.values()];
  }

  if (processing.renameEpisodes) {
    next = next.map((row) => {
      // A row with no usable number has no SxxExx form; renaming it to `SxxEnull`
      // would be worse than leaving the provider's own title alone.
      if (!Number.isFinite(row.number)) return row;
      const season = String(row.season).padStart(2, '0');
      const episode = String(row.number).padStart(2, '0');
      return { ...row, titleEn: `S${season}E${episode}` };
    });
  }

  return {
    rows: next,
    missingEpisodeNumbers: processing.detectMissingNumbers ? missingEpisodeNumbers(next) : [],
  };
}

/**
 * Gaps in the numbered run of `kind: 'episode'` rows, ascending.
 *
 * Exported separately so a caller holding already-processed rows can report on
 * them without running the transforms a second time.
 */
export function missingEpisodeNumbers(rows: readonly EpisodeRow[]): number[] {
  const numbered = rows
    .filter((row) => row.kind === 'episode' && Number.isInteger(row.number))
    .map((row) => row.number);
  if (!numbered.length) return [];
  const available = new Set(numbered);
  const missing: number[] = [];
  for (let n = Math.min(...numbered); n <= Math.max(...numbered); n += 1) {
    if (!available.has(n)) missing.push(n);
  }
  return missing;
}

/** How a gap report reads on a job summary. Empty when there is nothing to say. */
export function missingEpisodesNote(missing: number[]): string {
  if (!missing.length) return '';
  const shown = missing.slice(0, 8).join(', ');
  const rest = missing.length > 8 ? `, +${missing.length - 8} more` : '';
  return `Missing episode ${missing.length === 1 ? 'number' : 'numbers'}: ${shown}${rest}.`;
}
