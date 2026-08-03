import {
  STUDY_ANALYZER_VERSION,
  type StudyOrchestratorDocument,
  type StudyReadinessSnapshot,
} from './mediaStudyOrchestrator';
import { studyCanonicalTitleIdentity } from './studyCrossTitleReinforcement';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { MediaItem } from './types';

/** A personal baseline is meaningless until several works have been measured. */
export const STUDY_SPEECH_MIN_TITLES = 3;
/** Below this the rate is an artifact of a handful of lines. */
export const STUDY_SPEECH_MIN_CUES = 40;
/** How far above the personal median is worth telling the user about. */
export const STUDY_SPEECH_MIN_EXCESS = 0.15;
export const STUDY_SPEECH_RESULT_LIMIT = 3;

export interface StudySpeechRateEntry {
  mediaId: string;
  title: string;
  episode?: number;
  titleIdentity: string;
  readinessId: string;
  subtitleRecordId: string;
  /** Analyzer word occurrences per second of actual cue time. */
  wordsPerSecond: number;
  cues: number;
  spokenSec: number;
}

export interface StudySpeechRateChallenge {
  id: string;
  opportunityId: string;
  mediaId: string;
  title: string;
  episode?: number;
  readinessId: string;
  subtitleRecordId: string;
  positionSec: number;
  wordsPerSecond: number;
  /** Median across one value per canonical title the user has measured. */
  baselineWordsPerSecond: number;
  /** The playback speed the user explicitly selected in the existing player. */
  preferredPlaybackRate: number;
  /** Delivery speed after applying that preference. */
  effectiveWordsPerSecond: number;
  /** Bounded 0.05x step that brings this title back to the personal median. */
  recommendedPlaybackRate: number;
  /** 0.22 means the preferred playback speed is still 22% over the baseline. */
  excess: number;
  comparedTitles: number;
  cues: number;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizePlaybackRate(value: number): number {
  return Number.isFinite(value) ? Math.max(0.25, Math.min(3, value)) : 1;
}

function recommendedPlaybackRate(
  baselineWordsPerSecond: number,
  wordsPerSecond: number,
): number {
  const exact = baselineWordsPerSecond / wordsPerSecond;
  // Round down so the recommendation never claims to match the baseline while
  // actually running a little faster. The player accepts custom 0.05x steps.
  return Math.max(0.25, Math.min(3, Math.floor(exact * 20) / 20));
}

/**
 * The newest analysis per media that still describes the attached Japanese
 * track and carries delivery-speed statistics.
 *
 * Knowledge, level-list and frequency fingerprints are deliberately **not**
 * required: how fast a title is spoken does not change when the user learns a
 * word, and demanding those would make the measurement vanish after every
 * vocabulary edit.
 */
function measuredReadiness(
  item: MediaItem,
  document: StudyOrchestratorDocument,
): StudyReadinessSnapshot | undefined {
  return Object.values(document.readiness)
    .filter((entry) => {
      if (entry.mediaId !== item.id) return false;
      if ((entry.sourceKind ?? 'media') !== 'media') return false;
      if (entry.analyzerVersion !== STUDY_ANALYZER_VERSION) return false;
      if (!entry.subtitleReady || !entry.subtitleRecordId) return false;
      const speech = entry.speech;
      if (
        !speech
        || speech.cues < STUDY_SPEECH_MIN_CUES
        || speech.spokenSec <= 0
        || entry.totalWordOccurrences <= 0
      ) return false;
      const subtitle = item.subtitles?.find((record) =>
        record.id === entry.subtitleRecordId && isJapaneseSubtitleLang(record.lang));
      return Boolean(subtitle
        && entry.sourceFingerprint.startsWith(`${subtitle.id}:${subtitle.addedAt}:`));
    })
    .sort((left, right) => right.generatedAt - left.generatedAt)[0];
}

/**
 * One measured delivery speed per analysed media item. Pure projection over
 * stored statistics — no subtitle is read and no rate is persisted.
 */
export function studySpeechRateEntries(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
): StudySpeechRateEntry[] {
  return items.flatMap((item) => {
    const readiness = measuredReadiness(item, document);
    const speech = readiness?.speech;
    if (!readiness?.subtitleRecordId || !speech) return [];
    const identity = studyCanonicalTitleIdentity(item);
    if (!identity) return [];
    return [{
      mediaId: item.id,
      title: item.title.trim() || item.fileName.trim(),
      ...(Number.isFinite(item.episode) ? { episode: item.episode } : {}),
      titleIdentity: identity,
      readinessId: readiness.id,
      subtitleRecordId: readiness.subtitleRecordId,
      wordsPerSecond: readiness.totalWordOccurrences / speech.spokenSec,
      cues: speech.cues,
      spokenSec: speech.spokenSec,
    }];
  });
}

/**
 * Flags analysed titles that are delivered materially faster than the user's
 * own measured norm.
 *
 * The baseline is the median of one value per canonical title — a series is
 * summarised by the median of its own episodes first, so a 26-episode show
 * cannot outvote everything else the user has prepared. At least three
 * canonical titles must have been measured before any comparison is offered;
 * with fewer, "faster than usual" would have no meaning.
 */
export function studySpeechRateChallenges(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  preferredPlaybackRate = 1,
): StudySpeechRateChallenge[] {
  const entries = studySpeechRateEntries(items, document);
  const byTitle = new Map<string, StudySpeechRateEntry[]>();
  for (const entry of entries) {
    const bucket = byTitle.get(entry.titleIdentity);
    if (bucket) bucket.push(entry);
    else byTitle.set(entry.titleIdentity, [entry]);
  }
  if (byTitle.size < STUDY_SPEECH_MIN_TITLES) return [];

  const baseline = median([...byTitle.values()].map(
    (bucket) => median(bucket.map((entry) => entry.wordsPerSecond)),
  ));
  if (!(baseline > 0)) return [];

  const preference = normalizePlaybackRate(preferredPlaybackRate);
  const positionOf = new Map(items.map((item) => [item.id, item.positionSec ?? 0]));
  return entries.flatMap((entry) => {
    const effectiveWordsPerSecond = entry.wordsPerSecond * preference;
    const excess = effectiveWordsPerSecond / baseline - 1;
    if (excess < STUDY_SPEECH_MIN_EXCESS) return [];
    const recommendedRate = recommendedPlaybackRate(baseline, entry.wordsPerSecond);
    if (recommendedRate >= preference) return [];
    const suffix = stableHash(`${entry.mediaId}:${entry.readinessId}`);
    return [{
      id: `study-speech-rate-${suffix}`,
      opportunityId: `study-opportunity-speech-rate-${suffix}`,
      mediaId: entry.mediaId,
      title: entry.title,
      ...(entry.episode != null ? { episode: entry.episode } : {}),
      readinessId: entry.readinessId,
      subtitleRecordId: entry.subtitleRecordId,
      positionSec: positionOf.get(entry.mediaId) ?? 0,
      wordsPerSecond: entry.wordsPerSecond,
      baselineWordsPerSecond: baseline,
      preferredPlaybackRate: preference,
      effectiveWordsPerSecond,
      recommendedPlaybackRate: recommendedRate,
      excess,
      comparedTitles: byTitle.size,
      cues: entry.cues,
    }];
  }).sort((left, right) =>
    right.excess - left.excess
    || left.title.localeCompare(right.title, 'ja'))
    .slice(0, STUDY_SPEECH_RESULT_LIMIT);
}
