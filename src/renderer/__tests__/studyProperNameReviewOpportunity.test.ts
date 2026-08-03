import { expect, it, vi } from 'vitest';
import type { StudyProperNameReview } from '../../shared/studyProperNameReview';

function review(patch: Partial<StudyProperNameReview> = {}): StudyProperNameReview {
  return {
    id: 'study-proper-names-abc',
    opportunityId: 'study-opportunity-proper-names-abc',
    mediaId: 'media-1',
    title: 'Prepared drama',
    episode: 1,
    workspaceId: 'workspace-1',
    readinessId: 'readiness-1',
    subtitleRecordId: 'subtitle-1',
    names: [
      {
        candidateId: 'c1',
        word: '十郎',
        reading: 'じゅうろう',
        occurrences: 9,
        sentence: '十郎が来た。',
        cueStartSec: 41,
        selected: false,
      },
      {
        candidateId: 'c2',
        word: '花子',
        reading: 'はなこ',
        occurrences: 6,
        sentence: '花子は笑った。',
        cueStartSec: 96,
        selected: false,
      },
    ],
    totalNames: 4,
    totalOccurrences: 24,
    selectedNames: 0,
    excludeProperNouns: true,
    ...patch,
  };
}

it('localizes the review and points at the strongest name cue', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { properNameReviewOpportunity } = await import('../mediaStudyOrchestrator');

  expect(properNameReviewOpportunity(review(), 300)).toMatchObject({
    id: 'study-opportunity-proper-names-abc',
    type: 'proper-name-review',
    title: '4 recurring names in Prepared drama',
    explanation: expect.stringContaining('they are not vocabulary'),
    priority: 68,
    estimatedMinutes: 2,
    context: {
      mediaId: 'media-1',
      episode: 1,
      subtitleRecordId: 'subtitle-1',
      cueStartSec: 41,
      sentence: '十郎が来た。',
      returnTarget: {
        section: 'video',
        mediaId: 'media-1',
        subtitleRecordId: 'subtitle-1',
        positionSec: 41,
      },
    },
    readinessId: 'readiness-1',
    evidence: [
      { code: 'proper-name-cluster', label: '4 recurring proper names', value: 4 },
      { code: 'proper-name-occurrences', label: '24 appearances in prepared cues', value: 24 },
      { code: 'proper-name-out-of-cards', label: 'None of them are selected as cards', value: 0 },
    ],
    actions: ['preview-proper-names', 'open-context'],
    status: 'active',
    createdAt: 300,
    updatedAt: 300,
  });
});

it('reports deck pollution when the workspace filter admits names', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { properNameReviewOpportunity } = await import('../mediaStudyOrchestrator');
  const opportunity = properNameReviewOpportunity(
    review({ excludeProperNouns: false, selectedNames: 3 }),
    300,
  );

  expect(opportunity.evidence[2]).toEqual({
    code: 'proper-name-in-cards',
    label: '3 of them are currently selected as cards',
    value: 3,
  });
});
