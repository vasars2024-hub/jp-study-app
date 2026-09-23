/**
 * OpenSubtitles, asked in order of how certain each answer is — and asked once
 * per series rather than once per episode.
 *
 * The tiers, per file:
 *   1. hash  — the OSDb hash of this exact file. A hit is timed to these bytes.
 *   2. id    — the IMDb/TMDB id the metadata sweep stored (the show's id plus
 *              season for an episode, the film's id for a film).
 *   3. query — the title, with season for an episode and year for a film.
 * A tier is only asked while some wanted language is still unanswered, so a file
 * with a hash hit in both languages costs one request.
 *
 * Tiers 2 and 3 are asked WITHOUT the episode number and cached for the run, so a
 * 12-episode season is one listing (a few pages) instead of twelve searches, and
 * each episode then picks its own line out of it. A listing the paging cap cut
 * short falls back to one per-episode request for the episodes it missed.
 *
 * Scoring lives in `shared/subtitleDiscoveryScoring.ts`; this file only decides
 * what to ask and carries the answers there.
 */

import type { MediaItem } from '../shared/types';
import { providerSearchTitle } from '../shared/mediaFileIdentity';
import {
  scoreReleaseCandidates,
  type ReleaseMatchBasis,
  type ReleaseTarget,
  type ScoredRelease,
} from '../shared/subtitleDiscoveryScoring';
import {
  openSubtitlesSearchDetailed,
  openSubtitlesSearchParams,
  type OpenSubtitlesMatch,
  type OpenSubtitlesQuery,
  type ProviderSubtitleCandidate,
} from './subtitleProviderClients';

/** Pages of a series listing read before falling back to per-episode requests. */
export const MAX_BATCH_PAGES = 3;

export interface ExternalIds {
  /** For a series, the SHOW's IMDb id (TVmaze externals / TMDB). */
  imdb: string | null;
  tmdb: string | null;
  /** TMDB's movie and TV ids collide, so the namespace travels with the id. */
  tmdbType: 'movie' | 'tv' | null;
  tvmaze: string | null;
}

function idValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * The provider ids the metadata sweep stores on an item, read defensively.
 *
 * `tmdbId` / `imdbId` / `tvmazeId` are being added to `MediaItem` by the metadata
 * work; until they land (and for every item swept before they did) they are
 * simply absent, and the id tier is skipped. Read structurally so this file does
 * not depend on the exact shape that lands — a nested `externalIds` is accepted
 * too.
 */
export function readExternalIds(item: MediaItem): ExternalIds {
  const raw = item as MediaItem & Record<string, unknown>;
  const nested = (raw.externalIds && typeof raw.externalIds === 'object'
    ? raw.externalIds
    : {}) as Record<string, unknown>;
  const tmdbType = raw.tmdbType === 'movie' || raw.tmdbType === 'tv' ? raw.tmdbType : null;
  return {
    imdb: idValue(raw.imdbId, raw.imdb_id, nested.imdb, nested.imdbId),
    tmdb: idValue(raw.tmdbId, raw.tmdb_id, nested.tmdb, nested.tmdbId),
    tmdbType,
    tvmaze: idValue(raw.tvmazeId, raw.tvmaze_id, nested.tvmaze, nested.tvmazeId),
  };
}

export interface OpenSubtitlesPlanStep {
  basis: ReleaseMatchBasis;
  /** Languages are filled in per run. */
  query: OpenSubtitlesQuery;
  /** A series-level listing, shared by every episode in the run. */
  batch: boolean;
  /** The per-episode request to make when the listing was cut off. */
  fallback?: OpenSubtitlesQuery;
}

/** What to ask, in order. Pure. */
export function planOpenSubtitlesSearch(item: MediaItem, hash: string | null): OpenSubtitlesPlanStep[] {
  const steps: OpenSubtitlesPlanStep[] = [];
  const episodic = typeof item.episode === 'number';
  const season = typeof item.season === 'number' ? item.season : null;
  const empty: OpenSubtitlesQuery = { title: '', season: null, episode: null, languages: [] };

  if (hash) steps.push({ basis: 'hash', batch: false, query: { ...empty, movieHash: hash } });

  const ids = readExternalIds(item);
  // A TMDB id is only usable in its own namespace: a film's id sent as a show's
  // (or the reverse) names some other work entirely.
  const tmdb = ids.tmdb && (ids.tmdbType === null || ids.tmdbType === (episodic ? 'tv' : 'movie'))
    ? ids.tmdb
    : null;
  // One id, not both: sent together they are ANDed, and a metadata match that
  // got one of them wrong would then find nothing at all.
  if (ids.imdb || tmdb) {
    if (episodic) {
      const base: OpenSubtitlesQuery = {
        ...empty,
        season: season ?? 1,
        ...(ids.imdb ? { parentImdbId: ids.imdb } : { parentTmdbId: tmdb }),
      };
      steps.push({ basis: 'id', batch: true, query: base, fallback: { ...base, episode: item.episode ?? null } });
    } else {
      steps.push({
        basis: 'id',
        batch: false,
        query: { ...empty, ...(ids.imdb ? { imdbId: ids.imdb } : { tmdbId: tmdb }) },
      });
    }
  }

  const title = providerSearchTitle(item.seriesTitle ?? item.title ?? '');
  if (title) {
    if (episodic) {
      const base: OpenSubtitlesQuery = { ...empty, title, season };
      steps.push({ basis: 'query', batch: true, query: base, fallback: { ...base, episode: item.episode ?? null } });
    } else {
      steps.push({
        basis: 'query',
        batch: false,
        query: { ...empty, title, ...(typeof item.year === 'number' ? { year: item.year } : {}) },
      });
    }
  }
  return steps;
}

export interface BatchedReply {
  candidates: ProviderSubtitleCandidate[];
  down: boolean;
  /** The paging cap stopped the listing before its last page. */
  truncated: boolean;
}

/** One run's memory of the listings it has already fetched. */
export interface OpenSubtitlesBatch {
  search(query: OpenSubtitlesQuery, maxPages: number): Promise<BatchedReply>;
  /** Requests actually sent, for tests and logs. */
  requests(): number;
}

export function createOpenSubtitlesBatch(
  search: (query: OpenSubtitlesQuery) => Promise<OpenSubtitlesMatch> = openSubtitlesSearchDetailed,
): OpenSubtitlesBatch {
  const cache = new Map<string, Promise<BatchedReply>>();
  let sent = 0;
  return {
    requests: () => sent,
    search(query, maxPages) {
      const key = `${openSubtitlesSearchParams({ ...query, page: null })}#${maxPages}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const run = (async (): Promise<BatchedReply> => {
        const all: ProviderSubtitleCandidate[] = [];
        for (let page = 1; ; page += 1) {
          sent += 1;
          const reply = await search({ ...query, page });
          if (reply.down) {
            // A later page failing still leaves the earlier pages usable; it is the
            // missing rest that makes the listing incomplete.
            return page === 1
              ? { candidates: [], down: true, truncated: false }
              : { candidates: all, down: false, truncated: true };
          }
          all.push(...reply.candidates);
          const total = reply.totalPages ?? 1;
          if (page >= total) return { candidates: all, down: false, truncated: false };
          if (page >= Math.max(1, maxPages)) return { candidates: all, down: false, truncated: true };
        }
      })();
      cache.set(key, run);
      // An outage is not an answer about the series: the next episode asks again.
      void run.then((reply) => {
        if (reply.down) cache.delete(key);
      }, () => cache.delete(key));
      return run;
    },
  };
}

/** What the library knows about a file, in the shape the scorer reads. */
export function releaseTargetFor(item: MediaItem): ReleaseTarget {
  return {
    titles: [item.seriesTitle, item.title, item.nativeTitle, providerSearchTitle(item.seriesTitle ?? item.title ?? '')],
    season: typeof item.season === 'number' ? item.season : null,
    episode: typeof item.episode === 'number' ? item.episode : null,
    year: typeof item.year === 'number' ? item.year : null,
    releaseGroup: item.releaseGroup ?? null,
    resolution: typeof item.resolution === 'number' ? item.resolution : null,
    fileName: item.fileName ?? null,
    durationSec: typeof item.durationSec === 'number' ? item.durationSec : null,
  };
}

export interface OpenSubtitlesItemResult {
  /** Acceptable candidates per wanted language, best first. Absent language: none. */
  byLanguage: Map<string, ScoredRelease<ProviderSubtitleCandidate>[]>;
  /** Some tier went unanswered while a language was still open. */
  down: boolean;
  /** Which tier answered each language, for the record's provenance. */
  basis: Map<string, ReleaseMatchBasis>;
}

/**
 * Asks each tier in turn until every wanted language has an acceptable candidate.
 *
 * `hash` is the file's OSDb hash, or null when the file is too small, missing, or
 * unreadable — the hash tier is then skipped rather than failed.
 */
export async function searchOpenSubtitlesForItem(
  item: MediaItem,
  languages: readonly string[],
  hash: string | null,
  batch: OpenSubtitlesBatch,
  minConfidence: number,
): Promise<OpenSubtitlesItemResult> {
  const byLanguage = new Map<string, ScoredRelease<ProviderSubtitleCandidate>[]>();
  const basis = new Map<string, ReleaseMatchBasis>();
  const target = releaseTargetFor(item);
  const wanted = [...new Set(languages.map((lang) => lang.trim().toLowerCase()).filter(Boolean))];
  let down = false;

  const scoreInto = (candidates: ProviderSubtitleCandidate[], stepBasis: ReleaseMatchBasis): void => {
    for (const lang of wanted) {
      if (byLanguage.has(lang)) continue;
      const scored = scoreReleaseCandidates(candidates, target, lang, minConfidence);
      if (!scored.length) continue;
      byLanguage.set(lang, scored);
      basis.set(lang, scored[0].basis === 'hash' ? 'hash' : stepBasis);
    }
  };

  for (const step of planOpenSubtitlesSearch(item, hash)) {
    if (wanted.every((lang) => byLanguage.has(lang))) break;
    // The full language set, not just the open ones: the listing is shared with
    // the rest of the series, whose episodes may be missing either language.
    const reply = await batch.search({ ...step.query, languages: wanted }, step.batch ? MAX_BATCH_PAGES : 1);
    if (reply.down) {
      down = true;
      continue;
    }
    scoreInto(annotate(reply.candidates, step.basis, null), step.basis);

    if (step.batch && step.fallback && reply.truncated && wanted.some((lang) => !byLanguage.has(lang))) {
      const exact = await batch.search({ ...step.fallback, languages: wanted }, 1);
      if (exact.down) down = true;
      else scoreInto(annotate(exact.candidates, step.basis, step.fallback.episode), step.basis);
    }
  }

  return { byLanguage, down: down && wanted.some((lang) => !byLanguage.has(lang)), basis };
}

/**
 * Marks each candidate with the tier that found it.
 *
 * From the hash tier, only a row the provider itself flags as a hash match counts
 * as one; the other rows it returns are held to the query rules, title and all.
 * From a per-episode request, a row that does not state its episode is the
 * episode that was asked for.
 */
function annotate(
  candidates: readonly ProviderSubtitleCandidate[],
  stepBasis: ReleaseMatchBasis,
  askedEpisode: number | null,
): ProviderSubtitleCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    matchBasis: stepBasis === 'hash' ? (candidate.hashMatch ? 'hash' : 'query') : stepBasis,
    episode: candidate.episode ?? askedEpisode,
  }));
}
