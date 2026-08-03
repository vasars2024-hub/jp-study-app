import { expect, it, vi } from 'vitest';
import type { StudyAnkiLeechReview } from '../../shared/studyAnkiLeech';

function review(patch: Partial<StudyAnkiLeechReview> = {}): StudyAnkiLeechReview {
  return {
    id: 'study-anki-leech-abc',
    opportunityId: 'study-opportunity-anki-leech-abc',
    mediaId: 'media-1',
    title: 'Prepared drama',
    episode: 2,
    workspaceId: 'workspace-1',
    readinessId: 'readiness-1',
    subtitleRecordId: 'subtitle-1',
    contexts: [{
      candidateId: 'c1',
      expression: '魔法',
      word: '魔法',
      reading: 'まほう',
      sentence: '魔法をもう一度聞く。',
      cueStartSec: 42,
      occurrences: 8,
      intervalDays: 3,
      leech: true,
      suspended: true,
    }],
    totalMatches: 1,
    leechCount: 1,
    suspendedCount: 1,
    ...patch,
  };
}

it('builds a localized read-only opportunity for the exact prepared cue', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { ankiLeechOpportunity } = await import('../mediaStudyOrchestrator');

  expect(ankiLeechOpportunity(review(), 300)).toMatchObject({
    id: 'study-opportunity-anki-leech-abc',
    type: 'anki-leech-context',
    title: 'Anki trouble spot in Prepared drama',
    explanation: expect.stringContaining('without changing the cards'),
    priority: 65,
    estimatedMinutes: 2,
    context: {
      mediaId: 'media-1',
      episode: 2,
      subtitleRecordId: 'subtitle-1',
      cueStartSec: 42,
      sentence: '魔法をもう一度聞く。',
      returnTarget: {
        section: 'video',
        mediaId: 'media-1',
        subtitleRecordId: 'subtitle-1',
        positionSec: 42,
      },
    },
    readinessId: 'readiness-1',
    evidence: [
      { code: 'anki-leech-context-count', label: 'Prepared context matches: 1', value: 1 },
      {
        code: 'anki-leech-tag-count',
        label: 'Terms carried by leech-tagged notes: 1',
        value: 1,
      },
      {
        code: 'anki-suspended-count',
        label: 'Terms carried by suspended cards: 1',
        value: 1,
      },
      {
        code: 'anki-leech-exact-subtitles',
        label: 'Matched to the exact prepared Japanese subtitle record',
        value: 'subtitle-1',
      },
    ],
    actions: ['preview-anki-leech', 'open-context'],
    status: 'active',
    createdAt: 300,
    updatedAt: 300,
  });
});

it('omits state evidence that is not present', async () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { ankiLeechOpportunity } = await import('../mediaStudyOrchestrator');
  const opportunity = ankiLeechOpportunity(review({
    contexts: [{ ...review().contexts[0], suspended: false }],
    suspendedCount: 0,
  }), 300);
  expect(opportunity.evidence.map((entry) => entry.code)).toEqual([
    'anki-leech-context-count',
    'anki-leech-tag-count',
    'anki-leech-exact-subtitles',
  ]);
});
