import { describe, expect, it } from 'vitest';
import {
  createEmptyStudyOrchestratorDocument,
  syncStudyOpportunities,
  type StudyOrchestratorDocument,
  type StudyOpportunity,
  type StudyReadinessSnapshot,
} from '../mediaStudyOrchestrator';
import { measureStudySpeechStats } from '../mediaStudyAnalysis';
import {
  STUDY_SPEECH_MIN_CUES,
  studySpeechRateChallenges,
  studySpeechRateEntries,
} from '../studySpeechRate';
import type { MediaItem } from '../types';

const now = 2_000_000_000_000;

function item(id: string, series: string, episode: number): MediaItem {
  return {
    id,
    title: `${series} - ${String(episode).padStart(2, '0')}`,
    fileName: `${id}.mkv`,
    seriesKey: series,
    episode,
    positionSec: 12,
    subtitles: [{ id: `sub-${id}`, lang: 'ja', source: 'local', addedAt: 100 }],
  } as unknown as MediaItem;
}

function readiness(
  media: MediaItem,
  totalWords: number,
  spokenSec: number,
  cues = 200,
): StudyReadinessSnapshot {
  return {
    id: `readiness-${media.id}`,
    mediaId: media.id,
    analyzerVersion: 2,
    generatedAt: now - 1_000,
    sourceFingerprint: `sub-${media.id}:100:${cues}:0:1200`,
    knowledgeFingerprint: 'knowledge',
    levelListsFingerprint: 'levels',
    frequencyListsFingerprint: 'frequency',
    subtitleRecordId: `sub-${media.id}`,
    subtitleReady: true,
    contentLevel: 'N4',
    confidence: 0.9,
    knownCoverage: 0.5,
    uniqueKnownCoverage: 0.4,
    totalWordOccurrences: totalWords,
    knownWordOccurrences: 300,
    unknownUniqueWords: 40,
    recurringUnknownWords: 8,
    category: 'short-preview',
    truncated: false,
    speech: { spokenSec, cues, characters: totalWords * 2 },
  };
}

/** Three calm titles at 5 chars/sec, plus whatever the caller adds. */
function baselineWorld(extra: Array<[MediaItem, StudyReadinessSnapshot]> = []): {
  items: MediaItem[];
  document: StudyOrchestratorDocument;
} {
  const calm = [
    item('a', 'Alpha', 1),
    item('b', 'Bravo', 1),
    item('c', 'Charlie', 1),
  ];
  const document = createEmptyStudyOrchestratorDocument();
  for (const media of calm) {
    const snapshot = readiness(media, 1_000, 200);
    document.readiness[snapshot.id] = snapshot;
  }
  for (const [, snapshot] of extra) document.readiness[snapshot.id] = snapshot;
  return { items: [...calm, ...extra.map(([media]) => media)], document };
}

describe('measureStudySpeechStats', () => {
  it('sums cue durations rather than the first-to-last span', () => {
    // Two 2-second lines eight seconds apart: 4s of speech, not 12s of span.
    expect(measureStudySpeechStats([
      { start: 0, end: 2, text: 'あいうえお' },
      { start: 10, end: 12, text: 'かきくけこ' },
    ])).toEqual({ spokenSec: 4, cues: 2, characters: 10 });
  });

  it('counts kana, kanji and 々 but not latin or punctuation', () => {
    // 人 々 日 本 語 — the comma, latin letters and spaces carry no morae.
    expect(measureStudySpeechStats([
      { start: 0, end: 1, text: '人々、ABC! 日本語' },
    ])).toEqual({ spokenSec: 1, cues: 1, characters: 5 });
  });

  it('discards cues that cannot be real speech', () => {
    expect(measureStudySpeechStats([
      { start: 0, end: 0, text: 'ゼロ' },
      { start: 5, end: 4, text: 'ぎゃく' },
      { start: 0, end: 900, text: 'スタック' },
      { start: 0, end: 1, text: '(sign only)' },
      { start: 0, end: 2, text: 'ほんとう' },
    ])).toEqual({ spokenSec: 2, cues: 1, characters: 4 });
  });

  it('returns nothing when no cue survives', () => {
    expect(measureStudySpeechStats([])).toBeUndefined();
    expect(measureStudySpeechStats([{ start: 0, end: 1, text: 'ABC' }])).toBeUndefined();
  });
});

describe('studySpeechRateEntries', () => {
  it('derives analyzed words per second of real speech', () => {
    const { items, document } = baselineWorld();
    const entries = studySpeechRateEntries(items, document);
    expect(entries).toHaveLength(3);
    expect(entries[0].wordsPerSecond).toBeCloseTo(5, 6);
  });

  it('ignores analyses without enough measured cues', () => {
    const thin = item('d', 'Delta', 1);
    const snapshot = readiness(thin, 500, 100, STUDY_SPEECH_MIN_CUES - 1);
    const document = createEmptyStudyOrchestratorDocument();
    document.readiness[snapshot.id] = snapshot;
    expect(studySpeechRateEntries([thin], document)).toEqual([]);
  });

  it('ignores analyses whose Japanese track is no longer attached', () => {
    const detached = item('e', 'Echo', 1);
    const snapshot = readiness(detached, 1_000, 200);
    detached.subtitles = [];
    const document = createEmptyStudyOrchestratorDocument();
    document.readiness[snapshot.id] = snapshot;
    expect(studySpeechRateEntries([detached], document)).toEqual([]);
  });

  it('survives a knowledge change, because speed does not depend on vocabulary', () => {
    const { items, document } = baselineWorld();
    for (const snapshot of Object.values(document.readiness)) {
      snapshot.knowledgeFingerprint = 'something-else-entirely';
    }
    expect(studySpeechRateEntries(items, document)).toHaveLength(3);
  });
});

describe('studySpeechRateChallenges', () => {
  it('flags a title delivered materially faster than the personal median', () => {
    const fast = item('fast', 'Foxtrot', 1);
    const { items, document } = baselineWorld([[fast, readiness(fast, 1_600, 200)]]);
    const [challenge] = studySpeechRateChallenges(items, document);

    expect(challenge).toMatchObject({
      mediaId: 'fast',
      title: 'Foxtrot - 01',
      subtitleRecordId: 'sub-fast',
      comparedTitles: 4,
      positionSec: 12,
    });
    expect(challenge?.wordsPerSecond).toBeCloseTo(8, 6);
    expect(challenge?.baselineWordsPerSecond).toBeCloseTo(5, 6);
    expect(challenge?.preferredPlaybackRate).toBe(1);
    expect(challenge?.effectiveWordsPerSecond).toBeCloseTo(8, 6);
    expect(challenge?.recommendedPlaybackRate).toBe(0.6);
    expect(challenge?.excess).toBeCloseTo(0.6, 6);
  });

  it('respects an already-slower stated player preference', () => {
    const fast = item('fast', 'Foxtrot', 1);
    const { items, document } = baselineWorld([[fast, readiness(fast, 1_600, 200)]]);

    // At 0.7x the effective 5.6 words/sec is only 12% over the 5.0 baseline.
    expect(studySpeechRateChallenges(items, document, 0.7)).toEqual([]);
  });

  it('stays silent until three canonical titles have been measured', () => {
    const fast = item('fast', 'Foxtrot', 1);
    const document = createEmptyStudyOrchestratorDocument();
    const two = [item('a', 'Alpha', 1), fast];
    for (const media of two) {
      const snapshot = readiness(media, media.id === 'fast' ? 1_600 : 1_000, 200);
      document.readiness[snapshot.id] = snapshot;
    }
    expect(studySpeechRateChallenges(two, document)).toEqual([]);
  });

  it('does not flag a title within the normal band', () => {
    const mild = item('mild', 'Golf', 1);
    // 10% above the median sits under the 15% threshold.
    const { items, document } = baselineWorld([[mild, readiness(mild, 1_100, 200)]]);
    expect(studySpeechRateChallenges(items, document)).toEqual([]);
  });

  it('summarises a series by its own median so it cannot outvote other titles', () => {
    const document = createEmptyStudyOrchestratorDocument();
    const many: MediaItem[] = [];
    // Twenty fast episodes of one series must not drag the baseline upward.
    for (let episode = 1; episode <= 20; episode += 1) {
      const media = item(`hotel-${episode}`, 'Hotel', episode);
      many.push(media);
      const snapshot = readiness(media, 1_600, 200);
      document.readiness[snapshot.id] = snapshot;
    }
    for (const name of ['India', 'Juliett', 'Kilo']) {
      const media = item(`calm-${name}`, name, 1);
      many.push(media);
      const snapshot = readiness(media, 1_000, 200);
      document.readiness[snapshot.id] = snapshot;
    }
    const challenges = studySpeechRateChallenges(many, document);
    // Baseline is the median of {8, 5, 5, 5} = 5, so the series is still flagged.
    expect(challenges[0]?.baselineWordsPerSecond).toBeCloseTo(5, 6);
    expect(challenges.every((entry) => entry.title.startsWith('Hotel'))).toBe(true);
  });

  it('retires an active renderer signal after the selected speed resolves it', () => {
    const opportunity: StudyOpportunity = {
      id: 'study-opportunity-speech-rate-fast',
      type: 'speech-rate-challenge',
      title: 'Fast dialogue',
      explanation: 'Measured comparison',
      priority: 66,
      estimatedMinutes: 5,
      context: { mediaId: 'fast' },
      evidence: [],
      actions: ['preview-speech-rate'],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const result = syncStudyOpportunities(
      { [opportunity.id]: opportunity },
      [],
      now + 1,
      { retireMissingActive: true },
    );
    expect(result.opportunities[opportunity.id]).toBeUndefined();
  });
});
