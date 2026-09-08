/**
 * Which entry an episode number actually belongs to, when a folder holds more
 * than one season.
 *
 * D266, measured on the user's own library: `The Big O` is one folder of 26
 * files. The metadata sweep matches the folder to AniList entry 567, which is
 * season 1 and says `episodes: 13`, and stamps all 26 files with that id. So
 * episodes 14–26 are asked about under an entry that structurally cannot
 * contain them, Jimaku correctly answers "nothing", and that is recorded as an
 * *evidential* `no-match` which then suppresses the provider for
 * `retryAfterDays`. The app spends the rest of its life asking the wrong series
 * a question it already knows the answer to.
 *
 * This module does the arithmetic and nothing else — no network, no storage —
 * so the rule can be tested against real season boundaries without a provider.
 *
 * It refuses rather than guesses, on purpose. Every cheaper option here is a
 * way to attach another show's cues: the repo has already had `Shinreigari`
 * come back as 33 files of Madoka Magica from a fuzzy title search, and a
 * subtitle that is confidently wrong is worse than none, because the user finds
 * out minutes into the episode and has no reason to distrust the next one.
 */

/**
 * A related AniList entry, kept structurally rather than as a display string.
 *
 * `relatedTitles` — the field that existed before this — is `string[]`, which
 * is enough to render a row and useless for asking a provider anything: there
 * is no id to query with and no episode count to do the arithmetic against.
 */
export interface RelatedWork {
  anilistId: number;
  /** AniList's own `MediaRelation`: `SEQUEL`, `PREQUEL`, `SIDE_STORY`, … */
  relationType: string;
  title: string;
  /** `TV`, `TV_SHORT`, `MOVIE`, `OVA`, `SPECIAL`, `ONA`, … */
  format?: string;
  /** How many episodes that entry has, when AniList publishes it. */
  episodeCount?: number;
}

/**
 * Formats that can hold "episodes 14–26 of a folder".
 *
 * A movie or a special is a legitimate `SEQUEL` edge and is never the answer to
 * "which entry is episode 14": hopping into one would ask a 1-episode entry for
 * episode 1 and get a confident, wrong file.
 */
const EPISODIC_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);

export interface SeasonHop {
  /** The entry the episode really belongs to. */
  anilistId: number;
  /** The episode number as THAT entry counts it. */
  episode: number;
  title: string;
}

export type SeasonResolution =
  /** The episode is inside the matched entry, or there is nothing to check. */
  | { kind: 'in-range' }
  /** Ask this entry, about this episode, instead. */
  | { kind: 'resolved'; hop: SeasonHop }
  /**
   * The episode is past the matched entry and no single sequel accounts for it.
   * The caller must not fall back to the original id: that is the question
   * already known to be unanswerable, and asking it again is what turns a
   * structural mismatch into a permanent "no subtitles filed anywhere".
   */
  | { kind: 'unresolved'; reason: 'no-sequel' | 'ambiguous' | 'beyond-sequel'; coveredThrough: number };

export interface SeasonResolutionInput {
  /** The episode number the local file carries, absolute within its folder. */
  episode?: number | null;
  /** `episodes` on the matched entry. */
  episodeCount?: number | null;
  anilistId?: number | null;
  relatedWorks?: readonly RelatedWork[] | null;
}

/**
 * Maps an absolute episode number onto the entry that actually holds it.
 *
 * Exactly one hop deep, and that is a decision rather than a shortcut: the
 * relations stored on an item are the *matched entry's* relations, so the
 * sequel's own sequel is not known here. A three-season folder therefore
 * resolves seasons 1 and 2 and reports `beyond-sequel` for season 3 — which is
 * the honest answer, and strictly better than the current behaviour of asking
 * season 1 about episode 40.
 */
export function resolveSeasonForEpisode(input: SeasonResolutionInput): SeasonResolution {
  const episode = input.episode;
  const episodeCount = input.episodeCount;
  // No number on the file, or no published run length, means there is no
  // boundary to be outside of. Silence is the right answer, not a guess.
  if (typeof episode !== 'number' || !Number.isFinite(episode)) return { kind: 'in-range' };
  if (typeof episodeCount !== 'number' || !Number.isFinite(episodeCount) || episodeCount <= 0) {
    return { kind: 'in-range' };
  }
  if (episode <= episodeCount) return { kind: 'in-range' };

  const sequels = (input.relatedWorks ?? []).filter((work) =>
    work.relationType === 'SEQUEL'
    && Number.isInteger(work.anilistId)
    && work.anilistId > 0
    && work.anilistId !== input.anilistId
    && (work.format === undefined || EPISODIC_FORMATS.has(work.format)));

  if (sequels.length === 0) return { kind: 'unresolved', reason: 'no-sequel', coveredThrough: episodeCount };
  // Two direct sequels is a split-cour or a reboot, and picking one is a coin
  // flip that lands on another show's cue file half the time.
  if (sequels.length > 1) return { kind: 'unresolved', reason: 'ambiguous', coveredThrough: episodeCount };

  const sequel = sequels[0];
  const relative = episode - episodeCount;
  // A known run length that the episode overshoots means a second hop is needed
  // and the data for it is not here. An UNKNOWN run length is not the same
  // claim — the sequel is still the best-evidenced entry, and asking it is what
  // an airing series looks like before AniList publishes a count.
  if (typeof sequel.episodeCount === 'number' && sequel.episodeCount > 0 && relative > sequel.episodeCount) {
    return {
      kind: 'unresolved',
      reason: 'beyond-sequel',
      coveredThrough: episodeCount + sequel.episodeCount,
    };
  }
  return {
    kind: 'resolved',
    hop: { anilistId: sequel.anilistId, episode: relative, title: sequel.title },
  };
}
