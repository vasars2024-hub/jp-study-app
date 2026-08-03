import { expect, it, vi } from 'vitest';
import type { StudySeriesRecurrenceForecast } from '../../shared/studySeriesRecurrenceForecast';

function forecast(): StudySeriesRecurrenceForecast {
  return {
    id: 'study-series-recurrence-abc',
    opportunityId: 'study-opportunity-series-recurrence-abc',
    seriesIdentity: 'series:the-big-o',
    seriesTitle: 'The Big O',
    mediaId: 'episode-1',
    season: 1,
    episode: 1,
    workspaceId: 'workspace-1',
    readinessId: 'readiness-1',
    subtitleRecordId: 'subtitle-1',
    upcomingPreparedEpisodes: 2,
    totalRecurringLemmas: 1,
    totalFutureOccurrences: 8,
    lemmas: [{
      lemmaKey: '魔法\x1fまほう',
      candidateId: 'candidate-1',
      word: '魔法',
      reading: 'まほう',
      meaning: 'magic',
      jlptLevel: 'N3',
      frequencyRank: 500,
      currentOccurrences: 2,
      currentCueStartSec: 42,
      currentSentence: '魔法が必要だ。',
      futureEpisodeCount: 2,
      futureOccurrences: 8,
      contexts: [{
        mediaId: 'episode-2',
        title: 'The Big O - 02',
        season: 1,
        episode: 2,
        subtitleRecordId: 'subtitle-2',
        cueStartSec: 96,
        sentence: '魔法はない。',
        occurrences: 5,
      }],
    }],
  };
}

it('builds a localized ranked-preview opportunity from the exact anchor cue', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { seriesRecurrenceOpportunity } = await import('../mediaStudyOrchestrator');

  expect(seriesRecurrenceOpportunity(forecast(), 300)).toMatchObject({
    id: 'study-opportunity-series-recurrence-abc',
    type: 'series-recurrence-forecast',
    title: 'Words worth keeping from The Big O episode 1',
    priority: 64,
    estimatedMinutes: 3,
    context: {
      mediaId: 'episode-1',
      episode: 1,
      subtitleRecordId: 'subtitle-1',
      cueStartSec: 42,
      sentence: '魔法が必要だ。',
      returnTarget: {
        section: 'video',
        mediaId: 'episode-1',
        subtitleRecordId: 'subtitle-1',
        positionSec: 42,
      },
    },
    readinessId: 'readiness-1',
    evidence: [
      {
        code: 'series-recurrence-lemma-count',
        label: 'Selected lemmas that return: 1',
        value: 1,
      },
      {
        code: 'series-recurrence-upcoming-episodes',
        label: 'Later prepared episodes compared: 2',
        value: 2,
      },
      {
        code: 'series-recurrence-future-occurrences',
        label: 'Future prepared occurrences: 8',
        value: 8,
      },
      {
        code: 'series-recurrence-exact-subtitles',
        label: 'Current and future cues use exact prepared Japanese subtitle records',
        value: 'subtitle-1',
      },
    ],
    actions: ['preview-series-recurrence', 'open-context'],
    status: 'active',
    createdAt: 300,
    updatedAt: 300,
  });
});

it('caps the estimated preview time without storing a forecast score', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { seriesRecurrenceOpportunity } = await import('../mediaStudyOrchestrator');
  const many = forecast();
  const firstLemma = many.lemmas[0];
  if (!firstLemma) throw new Error('Missing forecast lemma fixture');
  many.lemmas = Array.from({ length: 8 }, (_, index) => ({
    ...firstLemma,
    lemmaKey: `lemma-${index}`,
    candidateId: `candidate-${index}`,
  }));
  const opportunity = seriesRecurrenceOpportunity(many, 300);

  expect(opportunity.estimatedMinutes).toBe(7);
  expect(opportunity).not.toHaveProperty('score');
  expect(opportunity.evidence.every((entry) => entry.code !== 'forecast-score')).toBe(true);
});
