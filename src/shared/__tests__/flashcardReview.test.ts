import { describe, expect, it } from 'vitest';
import { audioReviewPoolStatus, orderReviewPlan, planFlashcardReview, planListenQueue } from '../flashcardReview';

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

describe('ordering a sitting ("mix it up")', () => {
  const decks = [
    { id: 'a1', reviewGroup: 'ep1', sourceOrder: 3, audioPath: 'a1.mp3' },
    { id: 'a2', reviewGroup: 'ep1', sourceOrder: 1, audioPath: 'a2.mp3' },
    { id: 'a3', reviewGroup: 'ep1', sourceOrder: 2, audioPath: 'a3.mp3' },
    { id: 'b1', reviewGroup: 'ep2', sourceOrder: 2, audioPath: 'b1.mp3' },
    { id: 'b2', reviewGroup: 'ep2', sourceOrder: 1 },
    { id: 'c1', reviewGroup: 'book', sourceOrder: 1 },
  ];
  let seed = 7;
  const seeded = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  it('interleaves decks when spreading, whatever the shuffle', () => {
    for (let run = 0; run < 20; run += 1) {
      const order = orderReviewPlan(decks, 'spread', seeded);
      expect(order).toHaveLength(decks.length);
      // Three ep1 cards among six: never two ep1 cards in a row while another deck has cards.
      for (let i = 1; i < order.length - 1; i += 1) {
        if (order[i].reviewGroup === order[i - 1].reviewGroup) {
          const rest = order.slice(i);
          expect(rest.every((card) => card.reviewGroup === order[i].reviewGroup)).toBe(true);
        }
      }
    }
  });

  it('keeps each deck together when shuffling within decks', () => {
    const order = orderReviewPlan(decks, 'by-deck', seeded);
    const groups = order.map((card) => card.reviewGroup);
    const runs = groups.filter((group, i) => i === 0 || group !== groups[i - 1]);
    expect(runs.sort()).toEqual(['book', 'ep1', 'ep2']);
  });

  it('plays each deck in its own order in source order', () => {
    const order = orderReviewPlan(decks, 'source', seeded).map((card) => card.id);
    expect(order).toEqual(['a2', 'a3', 'a1', 'b2', 'b1', 'c1']);
  });

  it('passes the order through the planner', () => {
    const plan = planFlashcardReview(decks, { mode: 'text', order: 'source', random: zero });
    expect(plan.map((card) => card.id)).toEqual(['a2', 'a3', 'a1', 'b2', 'b1', 'c1']);
  });

  it('builds the listen playlist from the cards that have a clip', () => {
    const queue = planListenQueue(decks, 'source');
    expect(queue.map((card) => card.id)).toEqual(['a2', 'a3', 'a1', 'b1']);
  });
});
