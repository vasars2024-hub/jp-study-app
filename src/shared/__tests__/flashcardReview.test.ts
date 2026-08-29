import { describe, expect, it } from 'vitest';
import { planFlashcardReview } from '../flashcardReview';

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
