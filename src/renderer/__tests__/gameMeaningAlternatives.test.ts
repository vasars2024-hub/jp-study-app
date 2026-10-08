// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { evaluateRound, meaningAlternatives, type GameRound } from '../games/engine';

describe('Reverse Recall accepts any sense of a gloss', () => {
  it('splits senses and drops parenthetical notes', () => {
    expect(meaningAlternatives('to eat; to live on (e.g. a salary)')).toEqual([
      'to eat; to live on (e.g. a salary)',
      'to eat',
      'to live on',
    ]);
    expect(meaningAlternatives('cat')).toEqual(['cat']);
  });

  it('a single sense is a right answer', () => {
    const round = {
      kind: 'type',
      answer: 'cat; feline',
      acceptable: meaningAlternatives('cat; feline'),
      inputLang: 'en',
    } as unknown as GameRound;
    expect(evaluateRound(round, 'feline').correct).toBe(true);
  });
});
