// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { evaluateRound, meaningAlternatives, sentenceMeaningMatches, type GameRound } from '../games/engine';

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

describe('a sentence translation is one meaning, not a list of senses', () => {
  const sentenceRound = (meaning: string) =>
    ({ kind: 'type', answer: meaning, acceptable: [meaning], inputLang: 'en', answerMode: 'sentence' }) as unknown as GameRound;

  it('rejects half a sentence and accepts the whole', () => {
    const full = "It's raining, so I'm staying home.";
    expect(sentenceMeaningMatches("so I'm staying home.", full)).toBe(false);
    expect(sentenceMeaningMatches("It's raining", full)).toBe(false);
    expect(sentenceMeaningMatches(full, full)).toBe(true);
    expect(sentenceMeaningMatches('it is raining so i am staying home', full)).toBe(true);
    expect(evaluateRound(sentenceRound(full), "so I'm staying home.").correct).toBe(false);
    expect(evaluateRound(sentenceRound(full), "It's raining, so I'm staying home").correct).toBe(true);
  });

  it('ignores articles and punctuation, not missing words', () => {
    expect(sentenceMeaningMatches('I bought book yesterday', 'I bought a book yesterday.')).toBe(true);
    expect(sentenceMeaningMatches('I bought the book yesterday', 'I bought a book yesterday.')).toBe(true);
    expect(sentenceMeaningMatches('I bought yesterday', 'I bought a book yesterday.')).toBe(false);
    expect(sentenceMeaningMatches('', 'I bought a book yesterday.')).toBe(false);
  });

  it('does not accept a padded answer that only contains the sentence', () => {
    const full = 'I am a student.';
    expect(sentenceMeaningMatches('I am a student and a teacher and a doctor', full)).toBe(false);
  });

  it('keeps word glosses split into their senses ("dog, hound")', () => {
    expect(meaningAlternatives('dog, hound')).toEqual(['dog, hound', 'dog', 'hound']);
    const round = {
      kind: 'type',
      answer: 'dog, hound',
      acceptable: meaningAlternatives('dog, hound'),
      inputLang: 'en',
    } as unknown as GameRound;
    expect(evaluateRound(round, 'hound').correct).toBe(true);
    expect(evaluateRound(round, 'dog').correct).toBe(true);
    expect(evaluateRound(round, 'cat').correct).toBe(false);
  });
});
