import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_PAIRS,
  MIN_MATCH_PAIRS,
  buildMatchRound,
  matchScore,
  tilesMatch,
} from '../flashcardMatch';

/** Deterministic order, so a round's contents are what is under test. */
const stable = () => 0.5;

const deck = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `c${i}`,
  word: `語${i}`,
  meaning: `meaning ${i}`,
}));

describe('building a match round', () => {
  it('emits two tiles per pair, one of each side', () => {
    const round = buildMatchRound(deck(4), { size: 4, random: stable });
    expect(round.refusal).toBeNull();
    expect(round.pairs).toBe(4);
    expect(round.tiles).toHaveLength(8);
    expect(round.tiles.filter((tile) => tile.side === 'prompt')).toHaveLength(4);
    expect(round.tiles.filter((tile) => tile.side === 'answer')).toHaveLength(4);
  });

  it('refuses a card that has no meaning, rather than inventing one', () => {
    const round = buildMatchRound([
      { id: 'a', word: '猫', meaning: 'cat' },
      { id: 'b', word: '犬', meaning: 'dog' },
      { id: 'c', word: '鳥' },
      { id: 'd', word: '', meaning: 'nothing' },
    ], { size: 6, random: stable });

    expect(round.pairs).toBe(2);
    expect(round.skipped).toBe(2);
  });

  it('never puts two cards with the same meaning in one round', () => {
    // The ambiguity rule: with both present, either tile is right and only one
    // is accepted, and the user blames themselves for a defect in the round.
    const round = buildMatchRound([
      { id: 'a', word: '食べる', meaning: 'to eat' },
      { id: 'b', word: '喰う', meaning: 'To Eat' },
      { id: 'c', word: '飲む', meaning: 'to drink' },
    ], { size: 6, random: stable });

    expect(round.pairs).toBe(2);
    expect(round.skipped).toBe(1);
    expect(round.tiles.filter((tile) => tile.side === 'answer').map((tile) => tile.text))
      .not.toContain('To Eat');
  });

  it('applies the same rule to the Japanese side', () => {
    const round = buildMatchRound([
      { id: 'a', word: '食べる', meaning: 'to eat' },
      { id: 'b', word: '食べる', meaning: 'to consume' },
    ], { size: 6, random: stable });

    expect(round.pairs).toBe(0);
    expect(round.refusal).toBe('too-few-cards');
  });

  it('does not count the rest of the deck as skipped', () => {
    // Cards beyond the round size are the rest of the deck, not an exclusion,
    // and reporting them as left out would read as a fault.
    const round = buildMatchRound(deck(20), { size: 6, random: stable });
    expect(round.pairs).toBe(6);
    expect(round.skipped).toBe(0);
  });

  it.each([
    [
      { id: 'a', word: 'がくせい', meaning: 'student' },
      { id: 'b', word: 'か\u3099くせい', meaning: 'pupil' },
    ],
    [
      { id: 'a', word: '喫茶店', meaning: 'café' },
      { id: 'b', word: 'カフェ', meaning: 'cafe\u0301' },
    ],
  ])('excludes visually identical Unicode variants on either side', (first, duplicate) => {
    const round = buildMatchRound([
      first, duplicate, { id: 'c', word: '犬', meaning: 'dog' },
    ], { random: () => 0.99 });

    expect(round.refusal).toBeNull();
    expect(round.pairs).toBe(2);
    expect(round.skipped).toBe(1);
    expect(round.tiles.some((tile) => tile.pairId === 'b')).toBe(false);
    expect(round.tiles.find((tile) => tile.id === 'a:prompt')?.text).toBe(first.word);
    expect(round.tiles.find((tile) => tile.id === 'a:answer')?.text).toBe(first.meaning);
  });

  it('says WHY an unusable deck produced no round', () => {
    // The two refusals need different things from the user, so they are
    // distinguished rather than collapsed into one empty state.
    expect(buildMatchRound([{ id: 'a', word: '猫', meaning: 'cat' }], { random: stable }).refusal)
      .toBe('too-few-cards');
    expect(buildMatchRound([{ id: 'a', word: '猫' }, { id: 'b', word: '犬' }], { random: stable }).refusal)
      .toBe('no-usable-pairs');
    expect(buildMatchRound([], { random: stable }).refusal).toBe('no-usable-pairs');
  });

  it('will not be asked for a round smaller than a matching exercise', () => {
    expect(buildMatchRound(deck(8), { size: 1, random: stable }).pairs).toBe(MIN_MATCH_PAIRS);
    expect(buildMatchRound(deck(20), { random: stable }).pairs).toBe(DEFAULT_MATCH_PAIRS);
  });

  it('falls back to the sentence when a card has no word', () => {
    const round = buildMatchRound([
      { id: 'a', sentence: 'ご飯を食べる。', meaning: 'eats a meal' },
      { id: 'b', word: '犬', meaning: 'dog' },
    ], { random: stable });
    expect(round.tiles.map((tile) => tile.text)).toContain('ご飯を食べる。');
  });
});

describe('deciding whether two tiles are a pair', () => {
  const prompt = { id: 'a:prompt', pairId: 'a', side: 'prompt' as const, text: '猫' };
  const answer = { id: 'a:answer', pairId: 'a', side: 'answer' as const, text: 'cat' };
  const other = { id: 'b:answer', pairId: 'b', side: 'answer' as const, text: 'dog' };

  it('pairs the two halves, in either order', () => {
    expect(tilesMatch(prompt, answer)).toBe(true);
    expect(tilesMatch(answer, prompt)).toBe(true);
  });

  it('refuses a tile matched against itself or against the wrong pair', () => {
    expect(tilesMatch(prompt, prompt)).toBe(false);
    expect(tilesMatch(prompt, other)).toBe(false);
  });

  it('refuses two tiles of the same side — the check that does the work', () => {
    // Both halves always share a pairId, so the side comparison is what makes
    // this correct rather than a formality.
    const second = { id: 'a:prompt-2', pairId: 'a', side: 'prompt' as const, text: '猫' };
    expect(tilesMatch(prompt, second)).toBe(false);
  });
});

describe('scoring a round', () => {
  it('is done only when every pair is matched', () => {
    expect(matchScore(6, 5, 2, 9_400).done).toBe(false);
    expect(matchScore(6, 6, 2, 9_400)).toEqual({
      pairs: 6, matched: 6, misses: 2, elapsedMs: 9_400, done: true,
    });
    // An empty round is never "done", which would otherwise read as a win.
    expect(matchScore(0, 0, 0, 0).done).toBe(false);
  });

  it('never reports negative time', () => {
    expect(matchScore(2, 0, 0, -5).elapsedMs).toBe(0);
  });
});
