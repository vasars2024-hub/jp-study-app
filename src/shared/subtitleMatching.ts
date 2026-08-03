/**
 * MASTER_PLAN §8 — Subtitle matching (deterministic, offline).
 *
 * Scores known {@link SubtitleTrack} records against a target release using exactly
 * the signals §8 names: title, episode number, season, release year, release group,
 * duration and language. Which signals are evaluated is the *provider's* choice — a
 * provider's `matchSignals` are its matching rules — so a catalogue provider matching
 * only on identity + language is not penalized for carrying no release-group data.
 *
 * Signals fall into two classes:
 *   - **Discriminating** (`language`, `episode`, `season`, `title`): a decided
 *     mismatch rejects the candidate outright. Getting the wrong episode's subtitles
 *     is worse than getting none.
 *   - **Advisory** (`year`, `release-group`, `duration`): a mismatch only costs score,
 *     because re-releases, remasters and alternate cuts legitimately differ.
 * A signal neither side has data for is `unknown` and is left out of the score
 * entirely, rather than counted as a failure.
 *
 * Deliberately out of scope for this phase (do NOT add here):
 *   - fetching, downloading, opening, parsing or playing any subtitle file,
 *   - provider execution, networking, scraping, authentication,
 *   - persisting the chosen match (that is `subtitleManagement.ts` + the store).
 * Everything below is pure, synchronous, and deterministic. Nothing here does I/O.
 */

import { normalizeMediaTitleKey } from './mediaIdentity';
import {
  normalizeSubtitleLanguage,
  normalizeSubtitleProvidersDocument,
  subtitleProviderMatchSignals,
  subtitleTrackQualityScore,
  type SubtitleFormat,
  type SubtitleMatchSignal,
  type SubtitleProvidersDocument,
  type SubtitleStyle,
  type SubtitleTrack,
} from './subtitleProviders';
import { compareSubtitleQuality } from './subtitleQuality';

/** What we are looking for subtitles *of*. Every field beyond `language` is optional. */
export interface SubtitleMatchTarget {
  /** §7 `MediaIdentity.id`. When set, only that identity's tracks are considered. */
  identityId?: string;
  title?: string;
  alternativeTitles?: string[];
  season?: number | null;
  episode?: number | null;
  year?: number | null;
  releaseGroup?: string | null;
  durationSeconds?: number | null;
  /** Desired subtitle language tag. */
  language?: string;
  style?: SubtitleStyle;
}

export type SubtitleSignalState = 'match' | 'mismatch' | 'unknown';

export interface SubtitleSignalOutcome {
  signal: SubtitleMatchSignal;
  state: SubtitleSignalState;
  /** Weight this signal carried in the score (0 when unknown). */
  weight: number;
}

export type SubtitleMatchConfidence = 'exact' | 'strong' | 'weak' | 'rejected';

export interface SubtitleMatchCandidate {
  trackId: string;
  providerId: string;
  providerPriority: number;
  language: string;
  format: SubtitleFormat;
  style: SubtitleStyle;
  /** 0–100 over the *decided* signals, one decimal. */
  score: number;
  confidence: SubtitleMatchConfidence;
  qualityScore: number | null;
  signals: SubtitleSignalOutcome[];
  /** Discriminating signals that rejected this candidate. Empty when accepted. */
  rejectedBy: SubtitleMatchSignal[];
}

export type SubtitleMatchStatus = 'ready' | 'no-tracks' | 'no-matches';

export interface SubtitleMatchResult {
  status: SubtitleMatchStatus;
  /** Accepted candidates, best first. */
  candidates: SubtitleMatchCandidate[];
  /** Candidates a discriminating signal rejected, kept for explainability. */
  rejected: SubtitleMatchCandidate[];
}

export interface SubtitleMatchOptions {
  /** Runtime difference still counted as the same cut. Default 30s. */
  durationToleranceSeconds?: number;
  /** Override the provider's matching rules (diagnostics/tests). */
  signals?: SubtitleMatchSignal[];
}

/** Relative importance of each signal. Only decided signals reach the score. */
const SIGNAL_WEIGHTS: Record<SubtitleMatchSignal, number> = {
  title: 30,
  language: 25,
  episode: 20,
  season: 12,
  year: 6,
  duration: 4,
  'release-group': 3,
};

/** A decided mismatch on these rejects the candidate outright. */
const DISCRIMINATING: SubtitleMatchSignal[] = ['language', 'episode', 'season', 'title'];

const DEFAULT_DURATION_TOLERANCE_SECONDS = 30;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Every comparable title key the target exposes. */
function targetTitleKeys(target: SubtitleMatchTarget): string[] {
  const raw = [target.title, ...(Array.isArray(target.alternativeTitles) ? target.alternativeTitles : [])];
  const keys = new Set<string>();
  raw.forEach((entry) => {
    const key = normalizeMediaTitleKey(entry);
    if (key) keys.add(key);
  });
  return [...keys];
}

/** Loose group comparison: case-insensitive, punctuation-insensitive. */
function groupKey(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
}

function evaluateSignal(
  signal: SubtitleMatchSignal,
  track: SubtitleTrack,
  target: SubtitleMatchTarget,
  titleKeys: string[],
  toleranceSeconds: number,
): SubtitleSignalState {
  switch (signal) {
    case 'language': {
      const wanted = normalizeSubtitleLanguage(target.language);
      if (!wanted) return 'unknown';
      return track.language === wanted ? 'match' : 'mismatch';
    }
    case 'title': {
      if (titleKeys.length === 0) return 'unknown';
      const trackKey = normalizeMediaTitleKey(track.title);
      if (!trackKey) return 'unknown';
      // A release title usually carries the work's title plus tags ("[Group] Show 03 [1080p]"),
      // so containment either way counts as a match.
      return titleKeys.some((key) => trackKey === key || trackKey.includes(key) || key.includes(trackKey))
        ? 'match'
        : 'mismatch';
    }
    case 'episode': {
      if (target.episode === undefined || target.episode === null || track.episode === null) return 'unknown';
      return track.episode === target.episode ? 'match' : 'mismatch';
    }
    case 'season': {
      if (target.season === undefined || target.season === null || track.season === null) return 'unknown';
      return track.season === target.season ? 'match' : 'mismatch';
    }
    case 'year': {
      if (target.year === undefined || target.year === null || track.year === null) return 'unknown';
      return track.year === target.year ? 'match' : 'mismatch';
    }
    case 'release-group': {
      const wanted = groupKey(target.releaseGroup);
      const actual = groupKey(track.releaseGroup);
      if (!wanted || !actual) return 'unknown';
      return wanted === actual ? 'match' : 'mismatch';
    }
    case 'duration': {
      const wanted = target.durationSeconds;
      if (wanted === undefined || wanted === null || track.durationSeconds === null) return 'unknown';
      return Math.abs(track.durationSeconds - wanted) <= toleranceSeconds ? 'match' : 'mismatch';
    }
    default:
      return 'unknown';
  }
}

/**
 * Scores every known track against a target. Tracks are pre-filtered by identity when
 * the target names one, so the signals refine *within* a shelf rather than searching
 * the whole library. Ranking is fully deterministic: score, then quality, then
 * provider priority, then track ID.
 */
export function matchSubtitleTracks(
  document: SubtitleProvidersDocument,
  target: SubtitleMatchTarget,
  options: SubtitleMatchOptions = {},
): SubtitleMatchResult {
  const normalized = normalizeSubtitleProvidersDocument(document).value;
  const identityId = target.identityId ? target.identityId.trim().toLowerCase() : null;
  const tolerance = typeof options.durationToleranceSeconds === 'number' && Number.isFinite(options.durationToleranceSeconds)
    ? Math.max(0, options.durationToleranceSeconds)
    : DEFAULT_DURATION_TOLERANCE_SECONDS;
  const providerById = new Map(normalized.providers.map((provider) => [provider.id, provider]));
  const pool = normalized.tracks.filter((track) => !identityId || track.identityId === identityId);
  if (pool.length === 0) {
    return { status: 'no-tracks', candidates: [], rejected: [] };
  }
  const titleKeys = targetTitleKeys(target);
  const wantedStyle = target.style;

  const evaluated = pool.map((track) => {
    const provider = providerById.get(track.providerId);
    const signals = options.signals ?? (provider ? subtitleProviderMatchSignals(provider) : []);
    const outcomes: SubtitleSignalOutcome[] = signals.map((signal) => {
      const state = evaluateSignal(signal, track, target, titleKeys, tolerance);
      return { signal, state, weight: state === 'unknown' ? 0 : SIGNAL_WEIGHTS[signal] };
    });
    const decided = outcomes.filter((outcome) => outcome.state !== 'unknown');
    const decidedWeight = decided.reduce((sum, outcome) => sum + outcome.weight, 0);
    const matchedWeight = decided
      .filter((outcome) => outcome.state === 'match')
      .reduce((sum, outcome) => sum + outcome.weight, 0);
    const rejectedBy = decided
      .filter((outcome) => outcome.state === 'mismatch' && DISCRIMINATING.includes(outcome.signal))
      .map((outcome) => outcome.signal);
    const rawScore = decidedWeight > 0 ? round1((matchedWeight / decidedWeight) * 100) : 0;
    // A style the caller did not ask for is never a rejection, only a nudge downward.
    const styleAdjusted = wantedStyle && track.style !== wantedStyle ? round1(rawScore * 0.9) : rawScore;
    const score = rejectedBy.length > 0 ? 0 : styleAdjusted;
    const allMatched = decided.length > 0 && rejectedBy.length === 0 && matchedWeight === decidedWeight;
    let confidence: SubtitleMatchConfidence = 'weak';
    if (rejectedBy.length > 0) confidence = 'rejected';
    else if (allMatched && decided.length === outcomes.length && score === 100) confidence = 'exact';
    else if (score >= 70) confidence = 'strong';
    const candidate: SubtitleMatchCandidate = {
      trackId: track.id,
      providerId: track.providerId,
      providerPriority: provider ? provider.priority : Number.MAX_SAFE_INTEGER,
      language: track.language,
      format: track.format,
      style: track.style,
      score,
      confidence,
      qualityScore: subtitleTrackQualityScore(track),
      signals: outcomes,
      rejectedBy,
    };
    return candidate;
  });

  const rank = (left: SubtitleMatchCandidate, right: SubtitleMatchCandidate): number =>
    right.score - left.score
    || compareSubtitleQuality(left.qualityScore, right.qualityScore)
    || left.providerPriority - right.providerPriority
    || left.trackId.localeCompare(right.trackId);

  const candidates = evaluated.filter((candidate) => candidate.confidence !== 'rejected').sort(rank);
  const rejected = evaluated.filter((candidate) => candidate.confidence === 'rejected').sort(rank);
  return {
    status: candidates.length === 0 ? 'no-matches' : 'ready',
    candidates,
    rejected,
  };
}

/** The single best match, or null when nothing survives the discriminating signals. */
export function bestSubtitleMatch(
  document: SubtitleProvidersDocument,
  target: SubtitleMatchTarget,
  options: SubtitleMatchOptions = {},
): SubtitleMatchCandidate | null {
  return matchSubtitleTracks(document, target, options).candidates[0] ?? null;
}
