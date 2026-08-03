import { expect, it, vi } from 'vitest';
import type { StudySpeechRateChallenge } from '../../shared/studySpeechRate';

function challenge(
  patch: Partial<StudySpeechRateChallenge> = {},
): StudySpeechRateChallenge {
  return {
    id: 'study-speech-rate-abc',
    opportunityId: 'study-opportunity-speech-rate-abc',
    mediaId: 'media-fast',
    title: 'Fast drama',
    episode: 3,
    readinessId: 'readiness-fast',
    subtitleRecordId: 'subtitle-fast',
    positionSec: 42,
    wordsPerSecond: 3.2,
    baselineWordsPerSecond: 2,
    preferredPlaybackRate: 1,
    effectiveWordsPerSecond: 3.2,
    recommendedPlaybackRate: 0.6,
    excess: 0.6,
    comparedTitles: 4,
    cues: 240,
    ...patch,
  };
}

it('describes the measured delivery rate and preserves the exact media handoff', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { speechRateOpportunity } = await import('../mediaStudyOrchestrator');

  expect(speechRateOpportunity(challenge(), 300)).toMatchObject({
    id: 'study-opportunity-speech-rate-abc',
    type: 'speech-rate-challenge',
    title: 'Fast dialogue in Fast drama',
    explanation: expect.stringContaining('1×'),
    priority: 66,
    estimatedMinutes: 5,
    context: {
      mediaId: 'media-fast',
      episode: 3,
      subtitleRecordId: 'subtitle-fast',
      returnTarget: {
        section: 'video',
        mediaId: 'media-fast',
        subtitleRecordId: 'subtitle-fast',
        positionSec: 42,
      },
    },
    readinessId: 'readiness-fast',
    actions: ['preview-speech-rate', 'open-context'],
    evidence: [
      {
        code: 'speech-rate-effective',
        value: 3.2,
      },
      {
        code: 'speech-rate-baseline',
        value: 2,
      },
      {
        code: 'speech-rate-suggestion',
        value: 0.6,
      },
    ],
  });
});
