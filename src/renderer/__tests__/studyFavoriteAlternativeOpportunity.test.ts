import { expect, it, vi } from 'vitest';
import type { StudyFavoriteAlternative } from '../../shared/studyFavoriteAlternative';

it('localizes the comparison and opens the easier favorite at its exact saved context', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { favoriteAlternativeOpportunity } = await import('../mediaStudyOrchestrator');
  const alternative: StudyFavoriteAlternative = {
    id: 'study-favorite-alternative-test',
    opportunityId: 'study-opportunity-easier-favorite-alternative-test',
    harder: {
      mediaId: 'harder',
      title: 'Hard favorite',
      positionSec: 10,
      subtitleRecordId: 'subtitle-hard',
      readinessId: 'readiness-hard',
      generatedAt: 100,
      knownCoverage: 0.4,
      category: 'save-for-later',
      studyQueue: true,
    },
    easier: {
      mediaId: 'easier',
      title: 'Easy favorite',
      episode: 3,
      positionSec: 42,
      subtitleRecordId: 'subtitle-easy',
      readinessId: 'readiness-easy',
      generatedAt: 200,
      knownCoverage: 0.88,
      category: 'ready-now',
      studyQueue: false,
    },
    coverageDelta: 0.48,
  };

  expect(favoriteAlternativeOpportunity(alternative, 300)).toMatchObject({
    id: alternative.opportunityId,
    type: 'easier-favorite-alternative',
    title: 'Try Easy favorite before Hard favorite',
    explanation: expect.stringContaining('current cached readiness'),
    priority: 72,
    context: {
      mediaId: 'easier',
      episode: 3,
      subtitleRecordId: 'subtitle-easy',
      returnTarget: {
        section: 'video',
        mediaId: 'easier',
        subtitleRecordId: 'subtitle-easy',
        positionSec: 42,
      },
    },
    readinessId: 'readiness-easy',
    evidence: [
      {
        code: 'harder-favorite-coverage',
        label: 'Hard favorite · 40% known coverage',
        value: 0.4,
      },
      {
        code: 'easier-favorite-coverage',
        label: 'Easy favorite · 88% known coverage',
        value: 0.88,
      },
      {
        code: 'favorite-coverage-delta',
        label: '48 percentage points easier',
        value: 0.48,
      },
    ],
    actions: ['open-context'],
    status: 'active',
    createdAt: 300,
    updatedAt: 300,
  });
});
