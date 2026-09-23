/**
 * Scoring for release-keyed subtitle candidates — OpenSubtitles, for TV, drama,
 * film and anything Jimaku does not carry.
 *
 * Jimaku answers for an AniList entry, so its only open question is the episode
 * and `subtitleDiscovery.scoreCandidates` handles it. A release-keyed provider
 * answers three different kinds of question, and how much an answer is worth
 * depends on which one was asked:
 *
 *   hash  — the provider matched the exact bytes of this file. Timing is
 *           guaranteed; nothing else needs checking beyond the episode.
 *   id    — the provider matched the IMDb/TMDB work (or the work the hash
 *           identified). The show is certain; which release it was timed
 *           against is not.
 *   query — the provider matched a title string. The title has to agree, and
 *           for a film the year too: "The Thing" is two films.
 *
 * The "never attach the wrong episode" rule is NOT restated here. Every candidate
 * is still put through the shared `matchSubtitleTracks` with the episode and
 * season signals discriminating, exactly as the Jimaku path is. What this module
 * adds is the tier and the release-similarity nudges on top of that gate.
 *
 * Pure, synchronous, no I/O.
 */

import { matchSubtitleTracks } from './subtitleMatching';
import {
  normalizeSubtitleIdentityId,
  type SubtitleFormat,
  type SubtitleProvidersDocument,
  type SubtitleTrack,
} from './subtitleProviders';
import { createEmptySubtitleQualityRatings } from './subtitleQuality';
import { normalizeMediaTitleKey } from './mediaIdentity';

export type ReleaseMatchBasis = 'hash' | 'id' | 'query';

/** The fields scoring reads. `ProviderSubtitleCandidate` satisfies it structurally. */
export interface ReleaseCandidate {
  providerId: string;
  providerItemId: string;
  language: string;
  format: string;
  releaseName: string;
  /** The work's title as the provider knows it (the show's, for an episode). */
  featureTitle?: string | null;
  season: number | null;
  episode: number | null;
  year?: number | null;
  releaseGroup: string | null;
  hearingImpaired: boolean;
  hashMatch: boolean;
  downloads: number | null;
  /** How the search that produced this candidate was keyed. Absent reads as `query`. */
  matchBasis?: ReleaseMatchBasis;
  /** The provider flags it as machine- or AI-translated. */
  machineTranslated?: boolean;
  /** Uploaded by a source the provider vouches for. */
  trusted?: boolean;
}

/** What the library knows about the file being matched. */
export interface ReleaseTarget {
  /** Every name the work goes by: series title, display title, native title. */
  titles: readonly (string | null | undefined)[];
  season?: number | null;
  episode?: number | null;
  year?: number | null;
  releaseGroup?: string | null;
  /** Vertical lines, as `MediaItem.resolution` stores it. */
  resolution?: number | null;
  /** The file name, read for its source tag (BluRay / WEB / HDTV). */
  fileName?: string | null;
  durationSec?: number | null;
}

export interface ScoredRelease<C extends ReleaseCandidate> {
  candidate: C;
  /** 0–100 on the shared matcher's scale; a hash match is always 100. */
  score: number;
  basis: ReleaseMatchBasis;
  /** Why it scored what it did, for logs and tests. */
  reasons: string[];
}

const BASE_SCORE: Record<ReleaseMatchBasis, number> = { hash: 100, id: 88, query: 72 };

/** The release descriptors worth comparing between a subtitle and a video. */
export interface ReleaseTokens {
  group: string | null;
  resolution: number | null;
  source: 'bluray' | 'web' | 'hdtv' | 'dvd' | null;
}

const SOURCE_PATTERNS: [RegExp, ReleaseTokens['source']][] = [
  [/(?:^|[^a-z0-9])(?:blu-?ray|bdrip|brrip|bdremux|bd)(?![a-z0-9])/i, 'bluray'],
  [/(?:^|[^a-z0-9])(?:web-?dl|web-?rip|web|amzn|nf|dsnp|hmax|atvp|cr)(?![a-z0-9])/i, 'web'],
  [/(?:^|[^a-z0-9])(?:hdtv|pdtv|tvrip)(?![a-z0-9])/i, 'hdtv'],
  [/(?:^|[^a-z0-9])(?:dvd|dvdrip|dvd9|dvd5)(?![a-z0-9])/i, 'dvd'],
];

/**
 * `[Group] Show - 07 [1080p].mkv`, `Show.S01E07.720p.BluRay.x264-GROUP.srt`.
 *
 * Only the leading bracket and the trailing dash are read as a group: those are
 * the two conventions, and a looser read turns `x264` or `DTS-HD` into a group.
 */
export function releaseTokens(name: string | null | undefined): ReleaseTokens {
  const raw = (name ?? '').trim();
  if (!raw) return { group: null, resolution: null, source: null };
  const stem = raw.replace(/\.(srt|ass|ssa|vtt|sub|mkv|mp4|avi|m4v|webm)$/i, '');
  const bracket = /^\s*\[([^\]]{1,40})\]/.exec(stem)?.[1]?.trim();
  const dashed = /-([A-Za-z0-9]{2,20})$/.exec(stem)?.[1];
  const group = bracket || (dashed && !/^(?:hd|dl|rip|ma|x264|x265|h264|h265|\d+)$/i.test(dashed) ? dashed : null);
  const resolution = Number(/(?:^|[^0-9])(2160|1080|720|576|480)[pi](?![a-z0-9])/i.exec(stem)?.[1]);
  let source: ReleaseTokens['source'] = null;
  for (const [pattern, value] of SOURCE_PATTERNS) {
    if (pattern.test(stem)) {
      source = value;
      break;
    }
  }
  return {
    group: group ? group.toLowerCase().replace(/[^a-z0-9]+/g, '') : null,
    resolution: Number.isFinite(resolution) && resolution > 0 ? resolution : null,
    source,
  };
}

function basisOf(candidate: ReleaseCandidate): ReleaseMatchBasis {
  if (candidate.hashMatch) return 'hash';
  return candidate.matchBasis === 'id' ? 'id' : 'query';
}

function titleKeys(values: readonly (string | null | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    const key = normalizeMediaTitleKey(value ?? '');
    if (key) keys.add(key);
  }
  return [...keys];
}

/** `exact` when a name equals the work's title, `contains` when one holds the other. */
function titleAgreement(candidate: ReleaseCandidate, wanted: readonly string[]): 'exact' | 'contains' | 'none' {
  const offered = titleKeys([candidate.featureTitle, candidate.releaseName]);
  if (!offered.length || !wanted.length) return 'none';
  if (offered.some((key) => wanted.includes(key))) return 'exact';
  return offered.some((key) => wanted.some((target) => key.includes(target) || target.includes(key)))
    ? 'contains'
    : 'none';
}

/** Wraps candidates as §8 tracks so the shared matcher's episode/season gate can run. */
function gateDocument(
  candidates: readonly ReleaseCandidate[],
  identityId: string,
  durationSeconds: number | null,
  language: string,
): SubtitleProvidersDocument {
  const providerIds = [...new Set(candidates.map((candidate) => candidate.providerId))];
  return {
    version: 1,
    providers: providerIds.map((id, index) => ({
      id,
      name: id,
      enabled: true,
      priority: index,
      baseUrl: null,
      languages: [],
      searchMethod: 'file-hash',
      // Title is decided here, per basis, rather than by the matcher: an id or
      // hash match has already settled which work this is, and a Japanese
      // release name for a Western film would otherwise read as a mismatch.
      matchSignals: ['language', 'episode', 'season'],
      formats: [],
      styles: [],
      availability: 'available',
      reliabilityScore: null,
      notes: '',
    })),
    tracks: candidates.map((candidate): SubtitleTrack => ({
      id: normalizeSubtitleIdentityId(candidate.providerItemId),
      providerId: candidate.providerId,
      identityId,
      providerItemId: candidate.providerItemId,
      // Collapsed to the requested tag: candidates are pre-filtered to this base
      // language, and `pt-br` for a `pt` request is not a mismatch.
      language,
      format: (['srt', 'ass', 'ssa', 'vtt'].includes(candidate.format) ? candidate.format : 'srt') as SubtitleFormat,
      style: 'full',
      title: candidate.releaseName,
      season: candidate.season,
      episode: candidate.episode,
      year: null,
      releaseGroup: candidate.releaseGroup,
      translator: candidate.releaseGroup,
      durationSeconds,
      hearingImpaired: candidate.hearingImpaired,
      quality: createEmptySubtitleQualityRatings(),
      addedAt: null,
    })),
  };
}

/**
 * Scores candidates for one language and returns the acceptable ones, best first.
 *
 * Hash matches lead regardless of score, then score, then popularity. A
 * candidate below `minConfidence` is dropped unless it is a hash match: the
 * provider matched this file's bytes, which is stronger than any name compare.
 */
export function scoreReleaseCandidates<C extends ReleaseCandidate>(
  candidates: readonly C[],
  target: ReleaseTarget,
  language: string,
  minConfidence: number,
): ScoredRelease<C>[] {
  const base = language.trim().toLowerCase().slice(0, 2);
  const forLanguage = candidates.filter((candidate) => candidate.language.trim().toLowerCase().startsWith(base));
  if (!forLanguage.length) return [];

  const identityId = 'target';
  const result = matchSubtitleTracks(
    gateDocument(forLanguage, identityId, target.durationSec ?? null, language),
    {
      identityId,
      season: target.season ?? null,
      episode: target.episode ?? null,
      durationSeconds: target.durationSec ?? null,
      language,
    },
  );
  const accepted = new Set(result.candidates.map((match) => match.trackId));

  const wantedTitles = titleKeys(target.titles);
  const targetTokens = releaseTokens(target.fileName);
  const targetGroup = target.releaseGroup
    ? target.releaseGroup.toLowerCase().replace(/[^a-z0-9]+/g, '')
    : targetTokens.group;
  const targetResolution = target.resolution ?? targetTokens.resolution;
  const episodic = typeof target.episode === 'number';

  const out: ScoredRelease<C>[] = [];
  for (const candidate of forLanguage) {
    if (!accepted.has(normalizeSubtitleIdentityId(candidate.providerItemId))) continue;
    const basis = basisOf(candidate);
    // A film or an unnumbered special must not take a numbered episode's lines;
    // on this path there is no user to catch it.
    if (!episodic && typeof candidate.episode === 'number') continue;
    // The converse, for anything but a hash: a season listing carries every
    // episode, and a row that does not say which one it is could be any of them.
    if (episodic && basis !== 'hash' && candidate.episode === null) continue;

    const reasons: string[] = [basis];
    if (basis === 'hash') {
      out.push({ candidate, score: 100, basis, reasons });
      continue;
    }

    let score = BASE_SCORE[basis];
    if (basis === 'query') {
      const agreement = titleAgreement(candidate, wantedTitles);
      if (agreement === 'none') continue;
      if (agreement === 'exact') {
        score += 6;
        reasons.push('title-exact');
      }
    }

    if (typeof target.year === 'number' && typeof candidate.year === 'number') {
      const gap = Math.abs(target.year - candidate.year);
      if (gap === 0) {
        score += 4;
        reasons.push('year');
      } else if (gap === 1) {
        score += 1;
      } else if (basis === 'query') {
        // A remake or a namesake. A title string is not enough to tell them apart.
        continue;
      } else {
        score -= 4;
        reasons.push('year-mismatch');
      }
    }

    const tokens = releaseTokens(candidate.releaseName);
    const group = candidate.releaseGroup
      ? candidate.releaseGroup.toLowerCase().replace(/[^a-z0-9]+/g, '')
      : tokens.group;
    if (targetGroup && group && targetGroup === group) {
      score += 5;
      reasons.push('group');
    }
    if (targetResolution && tokens.resolution && targetResolution === tokens.resolution) {
      score += 2;
      reasons.push('resolution');
    }
    if (targetTokens.source && tokens.source && targetTokens.source === tokens.source) {
      score += 3;
      reasons.push('source');
    }
    if (candidate.trusted) score += 2;
    if (candidate.downloads && candidate.downloads > 0) {
      score += Math.min(4, Math.floor(Math.log10(candidate.downloads + 1)));
    }
    if (candidate.hearingImpaired) score -= 2;
    if (candidate.machineTranslated) {
      score -= 25;
      reasons.push('machine-translated');
    }

    score = Math.min(99, Math.round(score * 10) / 10);
    if (score < minConfidence) continue;
    out.push({ candidate, score, basis, reasons });
  }

  return out.sort((a, b) => {
    if (a.candidate.hashMatch !== b.candidate.hashMatch) return a.candidate.hashMatch ? -1 : 1;
    return b.score - a.score || (b.candidate.downloads ?? 0) - (a.candidate.downloads ?? 0);
  });
}
