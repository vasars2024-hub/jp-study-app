import { describe, expect, it } from 'vitest';
import { audioReviewPoolStatus, planFlashcardReview } from '../flashcardReview';

const zero = () => 0;
const cards = [
  { id: 'a', audioPath: 'a.mp3', reviewGroup: 'episode-1' },
  { id: 'b', reviewGroup: 'episode-1' },
  { id: 'c', audioDataUrl: 'data:audio/wav;base64,AA==', reviewGroup: 'episode-2' },
  { id: 'd', reviewGroup: 'episode-2' },
];

describe('planFlashcardReview', () => {
  it('audio-only mode excludes cards without playable audio', () => {
    const plan = planFlashcardReview(cards, { mode: 'audio', random: zero });
    expect(plan.map((card) => card.id).sort()).toEqual(['a', 'c']);
    expect(plan.every((card) => card.promptKind === 'listening')).toBe(true);
  });

  it('mixed mode never assigns listening to a silent card', () => {
    const plan = planFlashcardReview(cards, { mode: 'mixed', random: zero });
    expect(plan).toHaveLength(cards.length);
    expect(plan.filter((card) => card.promptKind === 'listening').every(
      (card) => Boolean(card.audioPath || card.audioDataUrl),
    )).toBe(true);
    expect(new Set(plan.map((card) => card.promptKind)).size).toBeGreaterThan(1);
  });

  it('spreads cards from different source groups when possible', () => {
    const plan = planFlashcardReview(cards, { mode: 'text', random: zero });
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].reviewGroup).not.toBe(plan[i - 1].reviewGroup);
    }
  });
});

describe('what audio-only review says it will do', () => {
  it('names the silent remainder instead of shrinking the sitting silently', () => {
    // The defect this exists for: 40 selected, 5 with clips, and the only
    // visible change was the number on the Start button.
    expect(audioReviewPoolStatus(40, 5)).toEqual({ kind: 'partial', usable: 5, dropped: 35 });
    expect(audioReviewPoolStatus(12, 12)).toEqual({ kind: 'all', usable: 12 });
  });

  it('distinguishes "nothing selected" from "nothing playable"', () => {
    // A disabled Start with no reason was the same pixels for both, and only
    // one of them has an action the user can take.
    expect(audioReviewPoolStatus(0, 0)).toEqual({ kind: 'empty' });
    expect(audioReviewPoolStatus(9, 0)).toEqual({ kind: 'none', total: 9 });
  });

  it('cannot report more playable cards than were selected', () => {
    expect(audioReviewPoolStatus(3, 7)).toEqual({ kind: 'all', usable: 3 });
    expect(audioReviewPoolStatus(3, -1)).toEqual({ kind: 'none', total: 3 });
  });

  it('agrees with the planner it describes', () => {
    const plan = planFlashcardReview(cards, { mode: 'audio', random: zero });
    expect(audioReviewPoolStatus(cards.length, plan.length)).toEqual({
      kind: 'partial',
      usable: plan.length,
      dropped: cards.length - plan.length,
    });
  });
});
