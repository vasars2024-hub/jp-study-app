import { describe, expect, it } from 'vitest';
import { studySubtitleUpgrade } from '../studySubtitleUpgrade';
import type { StudyReadinessSnapshot } from '../mediaStudyOrchestrator';
import type { SubtitleProvidersDocument, SubtitleTrack } from '../subtitleProviders';
import type { MediaItem } from '../types';

const record = (id: string, providerItemId: string, addedAt: number) => ({
  id,
  lang: 'ja',
  source: 'provider' as const,
  format: 'srt' as const,
  path: `${id}.srt`,
  providerId: 'provider',
  providerItemId,
  addedAt,
});

const item: MediaItem = {
  id: 'media-1',
  title: 'Series - 01',
  path: 'series-01.mkv',
  fileName: 'series-01.mkv',
  addedAt: 1,
  seriesKey: 'Series',
  episode: 1,
  subtitles: [
    record('record-old', 'release-old', 100),
    record('record-new', 'release-new', 200),
  ],
};

const readiness = {
  id: 'ready-1',
  mediaId: item.id,
  analyzerVersion: 2,
  generatedAt: 150,
  sourceFingerprint: 'source',
  knowledgeFingerprint: 'knowledge',
  levelListsFingerprint: 'levels',
  subtitleRecordId: 'record-old',
  subtitleReady: true,
  contentLevel: 'N2',
  confidence: 1,
  knownCoverage: 0.8,
  uniqueKnownCoverage: 0.8,
  totalWordOccurrences: 10,
  knownWordOccurrences: 8,
  unknownUniqueWords: 2,
  recurringUnknownWords: 1,
  category: 'ready-now',
  truncated: false,
} satisfies StudyReadinessSnapshot;

const track = (
  id: string,
  providerItemId: string,
  accuracy: number,
  syncQuality: number,
): SubtitleTrack => ({
  id,
  providerId: 'provider',
  identityId: 'series',
  providerItemId,
  language: 'ja',
  format: 'srt',
  style: 'full',
  title: id,
  season: null,
  episode: 1,
  year: null,
  releaseGroup: id === 'new' ? 'Better Subs' : 'Old Subs',
  translator: null,
  durationSeconds: null,
  hearingImpaired: false,
  quality: {
    accuracy,
    syncQuality,
    translationQuality: null,
    completeness: null,
    userRating: null,
  },
  addedAt: null,
});

const catalogue = (...tracks: SubtitleTrack[]): SubtitleProvidersDocument => ({
  version: 1,
  providers: [{
    id: 'provider',
    name: 'Provider',
    enabled: true,
    priority: 1,
    baseUrl: null,
    languages: ['ja'],
    searchMethod: 'title',
    matchSignals: ['title', 'episode', 'language'],
    formats: ['srt'],
    styles: ['full'],
    availability: 'available',
    reliabilityScore: 90,
    notes: '',
  }],
  tracks,
});

describe('studySubtitleUpgrade', () => {
  it('recommends a newer local track with enough explicit quality improvement', () => {
    const result = studySubtitleUpgrade(
      item,
      readiness,
      catalogue(track('old', 'release-old', 60, 60), track('new', 'release-new', 90, 90)),
    );
    expect(result).toMatchObject({
      mediaId: 'media-1',
      currentScore: 60,
      candidateScore: 90,
      scoreDelta: 30,
      candidateGrade: 'excellent',
    });
    expect(result?.candidateRecord.id).toBe('record-new');
    expect(result?.evidence).toContain('Better Subs');
  });

  it('does not recommend catalogue-only, older, or weakly rated releases', () => {
    const weak = track('new', 'release-new', 95, 95);
    weak.quality.syncQuality = null;
    expect(studySubtitleUpgrade(item, readiness, catalogue(
      track('old', 'release-old', 60, 60),
      weak,
      track('catalogue-only', 'not-downloaded', 100, 100),
    ))).toBeNull();

    const olderItem = {
      ...item,
      subtitles: [
        record('record-old', 'release-old', 200),
        record('record-new', 'release-new', 100),
      ],
    };
    expect(studySubtitleUpgrade(
      olderItem,
      readiness,
      catalogue(track('old', 'release-old', 60, 60), track('new', 'release-new', 90, 90)),
    )).toBeNull();
  });

  it('requires a meaningful score delta and the exact readiness record', () => {
    expect(studySubtitleUpgrade(
      item,
      readiness,
      catalogue(track('old', 'release-old', 80, 80), track('new', 'release-new', 88, 88)),
    )).toBeNull();
    expect(studySubtitleUpgrade(
      item,
      { ...readiness, subtitleRecordId: 'missing' },
      catalogue(track('old', 'release-old', 60, 60), track('new', 'release-new', 90, 90)),
    )).toBeNull();
  });

  it('rejects releases from a different authoritative series shelf', () => {
    const different = track('new', 'release-new', 90, 90);
    different.identityId = 'other-series';
    expect(studySubtitleUpgrade(
      item,
      readiness,
      catalogue(track('old', 'release-old', 60, 60), different),
    )).toBeNull();
  });
});
