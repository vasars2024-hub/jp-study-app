// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The seam's whole job is ordering and isolation, so both halves are stubbed:
// what matters is that each runs, in the right order, and that one failing does
// not cost the other its result.
const narrateNewCards = vi.fn();
const annotateNewCards = vi.fn();
const order: string[] = [];

vi.mock('../flashcardAutoAudio', () => ({
  narrateNewCards: (...args: unknown[]) => {
    order.push('audio');
    return narrateNewCards(...(args as []));
  },
}));
vi.mock('../flashcardAutoReading', () => ({
  annotateNewCards: (...args: unknown[]) => {
    order.push('reading');
    return annotateNewCards(...(args as []));
  },
}));

const { enrichNewCards } = await import('../flashcardAutoEnrich');

const CARDS = [{ id: 'a', word: '猫', reading: '', source: 'epub' }] as never;

beforeEach(() => {
  order.length = 0;
  narrateNewCards.mockReset().mockResolvedValue({ spoken: 1, failed: 0, deferred: 0 });
  annotateNewCards.mockReset().mockResolvedValue({ added: 1, failed: 0, deferred: 0 });
});

describe('the one enrichment seam every mining flow calls', () => {
  it('reads before it speaks, so a card is not completed in two visible steps', async () => {
    const report = await enrichNewCards(CARDS);

    expect(order).toEqual(['reading', 'audio']);
    expect(report.reading).toMatchObject({ added: 1 });
    expect(report.audio).toMatchObject({ spoken: 1 });
  });

  it('still narrates when the tokenizer half throws', async () => {
    annotateNewCards.mockRejectedValue(new Error('no dictionary'));

    const report = await enrichNewCards(CARDS);

    expect(report.reading).toBeNull();
    expect(report.audio).toMatchObject({ spoken: 1 });
  });

  it('still annotates when the voice half throws', async () => {
    // A missing Japanese voice must not cost a batch its furigana.
    narrateNewCards.mockRejectedValue(new Error('no voice'));

    const report = await enrichNewCards(CARDS);

    expect(report.audio).toBeNull();
    expect(report.reading).toMatchObject({ added: 1 });
  });

  it('reports both halves as off rather than inventing a result', async () => {
    annotateNewCards.mockResolvedValue(null);
    narrateNewCards.mockResolvedValue(null);

    expect(await enrichNewCards(CARDS)).toEqual({ audio: null, reading: null });
  });
});
