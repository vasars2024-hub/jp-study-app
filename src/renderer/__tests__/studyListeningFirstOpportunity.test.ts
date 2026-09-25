import { expect, it, vi } from 'vitest';
import type { StudyListeningFirstRecipe } from '../../shared/studyListeningFirstRecipe';

it('localizes the recipe and opens dictation at the exact prepared context', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { listeningFirstOpportunity } = await import('../mediaStudyOrchestrator');
  const recipe: StudyListeningFirstRecipe = {
    id: 'study-listening-first-media-1',
    opportunityId: 'study-opportunity-listening-first-media-1',
    mediaId: 'media-1',
    title: 'Easy drama',
    episode: 3,
    subtitleRecordId: 'subtitle-1',
    readinessId: 'readiness-1',
    workspaceId: 'workspace-1',
    positionSec: 42,
    knownCoverage: 0.9,
    audioEvidence: 'captured-audio-track',
    audioTrackCount: 1,
  };

  expect(listeningFirstOpportunity(recipe, 300)).toMatchObject({
    id: recipe.opportunityId,
    type: 'listening-first-recipe',
    title: 'Listen first with Easy drama',
    explanation: expect.stringContaining('loaded player confirmed usable audio'),
    priority: 73,
    context: {
      mediaId: 'media-1',
      episode: 3,
      subtitleRecordId: 'subtitle-1',
      listeningMode: 'dictation',
      returnTarget: {
        section: 'video',
        mediaId: 'media-1',
        subtitleRecordId: 'subtitle-1',
        positionSec: 42,
      },
    },
    readinessId: 'readiness-1',
    evidence: [
      {
        code: 'listening-known-coverage',
        label: '90% known coverage',
        value: 0.9,
      },
      {
        code: 'listening-audio-confirmed',
        label: 'Decoded audio track confirmed by the current player',
        value: 1,
      },
      {
        code: 'listening-exact-subtitles',
        label: 'Exact study-language subtitles ready for reveal',
        value: 'subtitle-1',
      },
    ],
    actions: ['start-listening-first', 'open-context'],
    status: 'active',
    createdAt: 300,
    updatedAt: 300,
  });
});
