/**
 * Harvesting Japanese subtitles for a catalogue entry, without the video.
 *
 * The app already has two ways to get subtitles, and neither answers this:
 *
 *   `main/subtitleDiscovery.ts` searches for subs belonging to a **local media
 *     file** — it is keyed on `mediaIds` and its whole job is matching a
 *     release you already have on disk.
 *   `MalDownloadDialog` fetches **torrents**, which is the whole episode.
 *
 * What a learner mining vocabulary actually wants is the text alone: the subs
 * for episodes 20–24 of a show they have not downloaded, or a whole season's
 * dialogue as one corpus to run frequency over. That is what this module plans.
 * It is pure — no network, no `window`, no Electron — so the ranking and the
 * combining rules are testable without a provider.
 *
 * Two things it deliberately does NOT do:
 *
 *   **It does not parse episode numbers out of file names.** `releaseCoversEpisode`
 *     in `./malDownload.ts` already does that, against the forms release groups
 *     really use, and a second parser would drift from it. (C1-3 wrote its own
 *     and had to delete it — see docs/audit/HANDOFF_C1_FINAL_ROWS.md §3.)
 *   **It does not decide what a cue is.** Parsing .srt/.ass into cues belongs to
 *     `renderer/subtitles.ts`; this module takes the cues it is given. The cue
 *     shape below is structural for exactly that reason — `shared/` must not
 *     import from `renderer/`, and `Cue` satisfies `HarvestCue` structurally.
 */

import { releaseCoversEpisode } from './malDownload';

/** Structurally identical to `renderer/subtitles.ts`'s `Cue`. See the note above. */
export interface HarvestCue {
  start: number;
  end: number;
  text: string;
}

/** One subtitle file a provider is offering. */
export interface HarvestFileCandidate {
  /**
   * Stable provider-scoped id, e.g. `jimaku:1234:Ep20.ja.srt`, and the only
   * handle the fetch call takes.
   *
   * Deliberately not a URL. Main holds the URL its own listing produced and
   * exchanges this id for it, so the renderer can never ask main to fetch an
   * address main did not itself offer.
   */
  id: string;
  name: string;
  /** Lower-case extension without the dot: `srt`, `ass`, `vtt`. */
  format: string;
}

export interface HarvestPick {
  episode: number;
  file: HarvestFileCandidate;
}

// --------------------------------------------------------------------- ipc ---
// Types only, so this module stays pure and both sides read one definition.

export interface SubtitleHarvestListInput {
  /** Jimaku keys on this; a title-only search is the fallback, not the plan. */
  anilistId: number | null;
  title: string;
  /**
   * A MyAnimeList id to resolve an AniList id *from*, when the catalogue entry
   * only has the former.
   *
   * Jikan is the richer episode catalogue and is what Discover prefers, so most
   * candidates arrive with a MAL id and no AniList id. Without this, every one
   * of them would fall back to a fuzzy title search — measured: MAL 52991
   * resolves to AniList 154587, which is the difference between asking Jimaku a
   * question with one answer and asking it to guess from a string.
   */
  malId?: number | null;
}

export interface SubtitleHarvestListResult {
  ok: boolean;
  /**
   * The provider has no API key. Distinct from `ok: false` with an empty list,
   * because "you need a key" is fixable and "this show has no subs" is not.
   */
  needsKey: boolean;
  files: HarvestFileCandidate[];
  message: string;
}

export interface SubtitleHarvestFetchResult {
  files: { id: string; text: string | null; error: string }[];
}

export interface HarvestPlan {
  picks: HarvestPick[];
  /** Wanted episodes no file covered. Reported, never silently dropped. */
  missing: number[];
}

/**
 * Format preference, for text mining specifically.
 *
 * `srt` first is not arbitrary: ASS carries positioning and styling override
 * blocks, and its files are the ones that also ship signs/karaoke layers. For
 * *playback* ASS is richer and would rank first; this module exists to build a
 * word-frequency corpus, where the plainest container is the best one.
 */
const FORMAT_RANK: Record<string, number> = { srt: 0, vtt: 1, ass: 2, ssa: 3 };

/**
 * Tracks that are not dialogue.
 *
 * A "Signs & Songs" file is typeset captions and lyrics. Mining one produces a
 * frequency list of station names and chorus lines, which looks like a working
 * feature and is worthless — the single most damaging thing that can end up in
 * this corpus, because nothing downstream can tell it apart from dialogue.
 */
const NON_DIALOGUE = /\b(signs?|songs?|s&s|karaoke|lyrics?)\b/i;

function score(file: HarvestFileCandidate): number {
  const format = FORMAT_RANK[file.format.toLowerCase()] ?? 9;
  // Weighted so a dialogue track in a worse container always beats a
  // signs track in a better one.
  return (NON_DIALOGUE.test(file.name) ? 100 : 0) + format;
}

/**
 * Choose at most one file per wanted episode.
 *
 * Ties break on the shorter name and then lexicographically, so the same
 * provider response always plans the same way — a harvest that picked a
 * different file on a retry would make a frequency list unreproducible.
 */
export function planSubtitleHarvest(
  files: readonly HarvestFileCandidate[],
  wantedEpisodes: readonly number[],
): HarvestPlan {
  const picks: HarvestPick[] = [];
  const missing: number[] = [];
  // Dedupe and order so the plan reads the way the episode list does.
  const wanted = [...new Set(wantedEpisodes)].filter(Number.isInteger).sort((a, b) => a - b);

  for (const episode of wanted) {
    const matches = files.filter((file) => releaseCoversEpisode(file.name, episode));
    if (!matches.length) {
      missing.push(episode);
      continue;
    }
    const best = [...matches].sort((a, b) =>
      score(a) - score(b)
      || a.name.length - b.name.length
      || a.name.localeCompare(b.name))[0];
    picks.push({ episode, file: best });
  }

  return { picks, missing };
}

export interface HarvestedEpisodeCues {
  episode: number;
  cues: readonly HarvestCue[];
}

export interface CombinedSeasonSegment {
  episode: number;
  /** Where this episode begins in the combined timeline, in seconds. */
  start: number;
  end: number;
  cues: number;
}

export interface CombinedSeason {
  cues: HarvestCue[];
  segments: CombinedSeasonSegment[];
}

/** Silence inserted between episodes so a boundary is visible in the timeline. */
export const SEASON_EPISODE_GAP_SECONDS = 60;

/**
 * Lay a season's episodes end to end on one timeline.
 *
 * **Why the offsetting is load-bearing.** Every episode's cues start again from
 * zero. Concatenating them raw produces a cue list whose timestamps run
 * 0…1400, 0…1400, 0…1400 — and `buildMediaStudyCorpus` reads cue order and
 * `firstSeenAt` from those numbers. Without offsets the combined corpus reports
 * that half its vocabulary first appears in the first thirty seconds, and
 * sentence order interleaves three episodes at once. That is not a display bug:
 * it is a wrong frequency table, which is the whole output.
 *
 * Episodes are laid down in ascending episode order regardless of the order
 * they were fetched in, because a parallel fetch settles in whatever order the
 * network chose.
 */
export function combineSeasonCues(
  episodes: readonly HarvestedEpisodeCues[],
  gapSeconds = SEASON_EPISODE_GAP_SECONDS,
): CombinedSeason {
  const ordered = [...episodes].sort((a, b) => a.episode - b.episode);
  const cues: HarvestCue[] = [];
  const segments: CombinedSeasonSegment[] = [];
  let offset = 0;

  for (const entry of ordered) {
    const sorted = [...entry.cues].sort((a, b) => a.start - b.start);
    const start = offset;
    let last = 0;
    for (const cue of sorted) {
      cues.push({ start: cue.start + offset, end: cue.end + offset, text: cue.text });
      last = Math.max(last, cue.end);
    }
    segments.push({ episode: entry.episode, start, end: start + last, cues: sorted.length });
    // An episode that parsed to nothing still advances by the gap, so it stays
    // visible as an empty segment rather than vanishing from the index.
    offset = start + last + gapSeconds;
  }

  return { cues, segments };
}

/** Which episode of the combined timeline a moment belongs to. */
export function episodeAt(segments: readonly CombinedSeasonSegment[], seconds: number): number | null {
  for (const segment of segments) {
    if (seconds >= segment.start && seconds <= segment.end) return segment.episode;
  }
  return null;
}

/** `3661.5` → `01:01:01,500`. SubRip separates milliseconds with a comma. */
function srtStamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const whole = Math.floor(clamped);
  const ms = Math.round((clamped - whole) * 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)},${pad(ms, 3)}`;
}

/**
 * The combined season as one SubRip file.
 *
 * Written out rather than kept only in memory because the corpus is the point
 * of the harvest: it is what gets re-read in a text editor, fed to a different
 * tool, or kept after the app forgets the run. SubRip specifically — it is the
 * format every other tool accepts, and the harvest already prefers `.srt`
 * sources for the same reason.
 */
export function toSrt(cues: readonly HarvestCue[]): string {
  return cues
    .map((cue, index) => `${index + 1}\n${srtStamp(cue.start)} --> ${srtStamp(cue.end)}\n${cue.text}\n`)
    .join('\n');
}

/**
 * The combined season as plain dialogue, one line per cue.
 *
 * The timestamps are what make an .srt re-readable and exactly what makes it
 * useless to paste into a dictionary or a frequency tool, so both exports
 * exist.
 */
export function toPlainText(cues: readonly HarvestCue[]): string {
  return cues.map((cue) => cue.text.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n');
}
