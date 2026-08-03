import type { StudyReadinessSnapshot } from './mediaStudyOrchestrator';
import { isJapaneseSubtitleLang, type SubtitleRecord } from './subtitleRecord';
import {
  normalizeSubtitleIdentityId,
  subtitleTrackQualityScore,
  type SubtitleProvidersDocument,
  type SubtitleTrack,
} from './subtitleProviders';
import { scoreSubtitleQuality, type SubtitleQualityGrade } from './subtitleQuality';
import type { MediaItem } from './types';

export const STUDY_SUBTITLE_UPGRADE_MIN_DELTA = 10;
export const STUDY_SUBTITLE_UPGRADE_MIN_RATED_DIMENSIONS = 2;

export interface StudySubtitleUpgrade {
  mediaId: string;
  currentRecord: SubtitleRecord;
  candidateRecord: SubtitleRecord;
  currentTrack: SubtitleTrack;
  candidateTrack: SubtitleTrack;
  currentScore: number;
  candidateScore: number;
  candidateGrade: SubtitleQualityGrade;
  scoreDelta: number;
  evidence: string[];
}

function trackForRecord(
  tracks: readonly SubtitleTrack[],
  record: SubtitleRecord,
): SubtitleTrack | undefined {
  if (!record.providerId || !record.providerItemId) return undefined;
  return tracks.find((track) =>
    track.providerId === record.providerId
    && track.providerItemId === record.providerItemId);
}

function ratedEnough(track: SubtitleTrack): boolean {
  return scoreSubtitleQuality(track.quality).ratedDimensions.length
    >= STUDY_SUBTITLE_UPGRADE_MIN_RATED_DIMENSIONS;
}

/**
 * Returns one explicit Study-track upgrade only when both releases have enough
 * stored quality evidence and the better release is already present on disk.
 *
 * The current Study track comes from the readiness snapshot, not a guessed
 * playback preference. A candidate must be newer than that local record, map to
 * the same authoritative series shelf, and improve the composite score by at
 * least ten points. Unrated, catalogue-only, or loosely matched releases never
 * produce a recommendation.
 */
export function studySubtitleUpgrade(
  item: MediaItem,
  readiness: StudyReadinessSnapshot | undefined,
  catalogue: SubtitleProvidersDocument,
): StudySubtitleUpgrade | null {
  if (!readiness?.subtitleReady || !readiness.subtitleRecordId) return null;
  const records = (item.subtitles ?? []).filter((record) => isJapaneseSubtitleLang(record.lang));
  const currentRecord = records.find((record) => record.id === readiness.subtitleRecordId);
  if (!currentRecord) return null;

  const identityId = normalizeSubtitleIdentityId(item.seriesKey ?? item.id);
  const tracks = catalogue.tracks.filter((track) =>
    track.identityId === identityId && isJapaneseSubtitleLang(track.language));
  const currentTrack = trackForRecord(tracks, currentRecord);
  if (!currentTrack || !ratedEnough(currentTrack)) return null;
  const currentScore = subtitleTrackQualityScore(currentTrack);
  if (currentScore == null) return null;

  const candidates = records.flatMap((record) => {
    if (record.id === currentRecord.id || record.addedAt <= currentRecord.addedAt) return [];
    const track = trackForRecord(tracks, record);
    if (!track || !ratedEnough(track)) return [];
    const score = subtitleTrackQualityScore(track);
    if (score == null || score - currentScore < STUDY_SUBTITLE_UPGRADE_MIN_DELTA) return [];
    return [{ record, track, score }];
  }).sort((left, right) =>
    right.score - left.score
    || right.record.addedAt - left.record.addedAt
    || left.record.id.localeCompare(right.record.id));

  const best = candidates[0];
  if (!best) return null;
  const candidateQuality = scoreSubtitleQuality(best.track.quality);
  const scoreDelta = Math.round((best.score - currentScore) * 10) / 10;
  return {
    mediaId: item.id,
    currentRecord,
    candidateRecord: best.record,
    currentTrack,
    candidateTrack: best.track,
    currentScore,
    candidateScore: best.score,
    candidateGrade: candidateQuality.grade,
    scoreDelta,
    evidence: [
      `${currentScore} → ${best.score} quality`,
      `${candidateQuality.ratedDimensions.length} rated dimensions`,
      best.track.releaseGroup ?? best.track.translator ?? best.record.label ?? best.track.title,
    ].filter(Boolean),
  };
}
