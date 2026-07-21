import { describe, expect, it } from 'vitest';
import {
  isPitchLookup,
  moraPitch,
  pitchPatternName,
  splitMorae,
} from '../pitchAccent';

describe('splitMorae', () => {
  it('splits plain kana one per mora', () => {
    expect(splitMorae('はし')).toEqual(['は', 'し']);
    expect(splitMorae('にほんご')).toEqual(['に', 'ほ', 'ん', 'ご']);
  });

  it('binds small kana to the preceding mora', () => {
    // きょ is one mora, not two — this is what makes 東京 four morae.
    expect(splitMorae('きょう')).toEqual(['きょ', 'う']);
    expect(splitMorae('とうきょう')).toEqual(['と', 'う', 'きょ', 'う']);
    expect(splitMorae('しゃしん')).toEqual(['しゃ', 'し', 'ん']);
  });

  it('treats っ as its own mora', () => {
    expect(splitMorae('がっこう')).toEqual(['が', 'っ', 'こ', 'う']);
  });

  it('handles katakana and empty input', () => {
    expect(splitMorae('ラーメン')).toEqual(['ラ', 'ー', 'メ', 'ン']);
    expect(splitMorae('キャベツ')).toEqual(['キャ', 'ベ', 'ツ']);
    expect(splitMorae('')).toEqual([]);
  });
});

describe('moraPitch', () => {
  it('heiban rises after the first mora and stays high', () => {
    // にほんご = L H H H
    expect(moraPitch('にほんご', 0)).toEqual([false, true, true, true]);
  });

  it('atamadaka is high only on the first mora', () => {
    // はし (chopsticks) = H L
    expect(moraPitch('はし', 1)).toEqual([true, false]);
  });

  it('nakadaka rises then drops after the accent mora', () => {
    // たまご = L H L
    expect(moraPitch('たまご', 2)).toEqual([false, true, false]);
  });

  it('odaka is high to the end, dropping only on a following particle', () => {
    // はし (bridge) = L H, with the drop audible on the particle.
    expect(moraPitch('はし', 2)).toEqual([false, true]);
  });

  it('counts morae, not characters', () => {
    // とうきょう is 4 morae; a character-based split would give 5 values.
    expect(moraPitch('とうきょう', 0)).toHaveLength(4);
  });

  it('returns nothing for an empty reading', () => {
    expect(moraPitch('', 0)).toEqual([]);
  });
});

describe('pitchPatternName', () => {
  it('names the four patterns', () => {
    expect(pitchPatternName(0, 4)).toBe('heiban');
    expect(pitchPatternName(1, 2)).toBe('atamadaka');
    expect(pitchPatternName(2, 3)).toBe('nakadaka');
    expect(pitchPatternName(2, 2)).toBe('odaka');
  });

  it('calls a one-mora accented word odaka, not atamadaka', () => {
    // With a single mora the drop can only land on the particle, which is odaka.
    expect(pitchPatternName(1, 1)).toBe('odaka');
  });

  it('rejects impossible input rather than guessing', () => {
    expect(pitchPatternName(5, 3)).toBe('unknown');
    expect(pitchPatternName(-1, 3)).toBe('unknown');
    expect(pitchPatternName(1.5, 3)).toBe('unknown');
    expect(pitchPatternName(0, 0)).toBe('unknown');
  });
});

describe('isPitchLookup', () => {
  it('accepts a well-formed reply', () => {
    expect(isPitchLookup({ available: true, entries: [] })).toBe(true);
    expect(
      isPitchLookup({ available: true, entries: [{ reading: 'はし', positions: [1, 2] }] }),
    ).toBe(true);
  });

  it('rejects undefined and malformed shapes', () => {
    expect(isPitchLookup(undefined)).toBe(false);
    expect(isPitchLookup({})).toBe(false);
    expect(isPitchLookup({ available: 'yes', entries: [] })).toBe(false);
    expect(isPitchLookup({ available: true, entries: [{ reading: 'は' }] })).toBe(false);
    expect(isPitchLookup({ available: true, entries: [{ reading: 'は', positions: ['1'] }] })).toBe(
      false,
    );
  });
});
