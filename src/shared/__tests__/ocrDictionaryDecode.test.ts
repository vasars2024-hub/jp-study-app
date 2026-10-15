// @vitest-environment node
/**
 * Dictionary-guided OCR decoding and the per-character merge, with a word
 * list for a dictionary. The owner's thumbnail read 恐竜の魅力を語る as
 * 彼後の魅力を語え; the recogniser's runners-up plus the dictionary fix it.
 */
import { describe, expect, it } from 'vitest';
import {
  dictionaryDecode,
  memoWordOracle,
  mergeLineReads,
  wordCoverage,
  writesWithoutSpaces,
} from '../ocrDictionaryDecode';
import type { OcrChar } from '../ocrRouterTypes';

const WORDS = new Set(['恐竜', '魅力', '語る', '物語', '時間', 'кошка', 'дома']);
const oracle = (extra: Iterable<string> = []) => {
  const words = new Set([...WORDS, ...extra]);
  return memoWordOracle(async (text) => words.has(text));
};

function chars(text: string, unsure: Record<number, { p: number; alts: Array<[string, number]> }> = {}): OcrChar[] {
  return [...text].map((ch, i) => ({
    ch,
    p: unsure[i]?.p ?? 0.98,
    alts: (unsure[i]?.alts ?? []).map(([a, p]) => ({ ch: a, p })),
  }));
}

describe('word coverage', () => {
  it('counts the characters inside dictionary words of two or more', async () => {
    expect(await wordCoverage([...'恐竜の魅力を語る'], 'ja', oracle())).toMatchObject({ score: 6 });
    expect(await wordCoverage([...'彼後の魅力を語え'], 'ja', oracle())).toMatchObject({ score: 2 });
  });

  it('spaced scripts are judged word by word', async () => {
    const cov = await wordCoverage([...'кошка дома'], 'ru', oracle());
    expect(cov.score).toBe(9);
    expect(writesWithoutSpaces('ru')).toBe(false);
    expect(writesWithoutSpaces('zh-Hans')).toBe(true);
  });
});

describe('dictionary-guided decoding', () => {
  it('彼後 → 恐竜 and 語え → 語る: runners-up that turn non-words into words', async () => {
    const line = chars('彼後の魅力を語え', {
      0: { p: 0.41, alts: [['恐', 0.22], ['披', 0.1]] },
      1: { p: 0.38, alts: [['竜', 0.3]] },
      7: { p: 0.52, alts: [['る', 0.31], ['ろ', 0.05]] },
    });
    const { chars: out, changed } = await dictionaryDecode(line, { lang: 'ja', oracle: oracle() });
    expect(out.map((c) => c.ch).join('')).toBe('恐竜の魅力を語る');
    expect(changed).toBe(3);
    // What the engine read becomes the first alternative: one click takes it back.
    expect(out[0]).toMatchObject({ ch: '恐', was: '彼', alts: [{ ch: '彼', p: 0.41 }, { ch: '披', p: 0.1 }] });
  });

  it('never touches a character that is already inside a word', async () => {
    // を is unsure and 物 would make 物語, but 語 already makes a word with る.
    const line = chars('魅力を語る', { 2: { p: 0.6, alts: [['物', 0.3]] } });
    const { chars: out, changed } = await dictionaryDecode(line, { lang: 'ja', oracle: oracle() });
    expect(changed).toBe(0);
    expect(out.map((c) => c.ch).join('')).toBe('魅力を語る');
  });

  it('a sure character is trusted, and an improbable alternative is never taken', async () => {
    const sure = chars('語え', { 1: { p: 0.95, alts: [['る', 0.04]] } });
    expect((await dictionaryDecode(sure, { lang: 'ja', oracle: oracle() })).changed).toBe(0);
    const improbable = chars('語え', { 1: { p: 0.8, alts: [['る', 0.02]] } });
    expect((await dictionaryDecode(improbable, { lang: 'ja', oracle: oracle() })).changed).toBe(0);
  });

  it('with no dictionary answers, nothing changes', async () => {
    const line = chars('彼後', { 0: { p: 0.3, alts: [['恐', 0.3]] }, 1: { p: 0.3, alts: [['竜', 0.3]] } });
    const none = memoWordOracle(async () => false);
    expect((await dictionaryDecode(line, { lang: 'ja', oracle: none })).changed).toBe(0);
  });

  it('lookups are bounded by count and by the deadline', async () => {
    let calls = 0;
    const counted = memoWordOracle(async () => {
      calls += 1;
      return false;
    }, { maxLookups: 5 });
    const line = chars('彼後の魅力を語え', {
      0: { p: 0.4, alts: [['恐', 0.3], ['披', 0.2], ['波', 0.1]] },
      1: { p: 0.4, alts: [['竜', 0.3], ['俊', 0.2]] },
      7: { p: 0.4, alts: [['る', 0.3]] },
    });
    await dictionaryDecode(line, { lang: 'ja', oracle: counted });
    expect(calls).toBe(5);
    expect(counted.exhausted).toBe(true);
    let now = 0;
    const late = memoWordOracle(async () => true, { deadline: 10, now: () => now });
    expect(await late.isWord('恐竜')).toBe(true);
    now = 11;
    expect(await late.isWord('魅力')).toBe(false);
  });
});

describe('merging two engines per character', () => {
  it('takes manga-ocr\'s characters where they make words, keeps PaddleOCR\'s elsewhere', async () => {
    const paddle = { engine: 'web', text: '彼後の魅力を語え', confidence: 0.6, chars: chars('彼後の魅力を語え', { 0: { p: 0.4, alts: [] }, 1: { p: 0.4, alts: [] }, 7: { p: 0.5, alts: [] } }) };
    const manga = { engine: 'manga', text: '恐竜の魅力を語え', confidence: 0.75 };
    const merged = await mergeLineReads([paddle, manga], 'ja', oracle());
    expect(merged.text).toBe('恐竜の魅力を語え');
    expect(merged.chars[0]).toMatchObject({ ch: '恐', engine: 'manga', alts: [{ ch: '彼', p: 0.4 }] });
    expect(merged.chars[7]).toMatchObject({ ch: 'え', engine: 'web' });
    expect(merged.consulted).toEqual(['web', 'manga']);
    expect(merged.engine).toBe('web');
  });

  it('reads of different lengths compete whole, by coverage and confidence', async () => {
    const merged = await mergeLineReads([
      { engine: 'web', text: '彼後の', confidence: 0.6 },
      { engine: 'manga', text: '恐竜のは', confidence: 0.7 },
    ], 'ja', oracle());
    expect(merged.text).toBe('恐竜のは');
  });

  it('at a tie the primary engine stays', async () => {
    const merged = await mergeLineReads([
      { engine: 'web', text: '時間', confidence: 0.9 },
      { engine: 'manga', text: '時問', confidence: 0.9 },
    ], 'ja', oracle());
    expect(merged.text).toBe('時間');
    expect(merged.chars[1].alts).toEqual([{ ch: '問', p: 0.9 }]);
  });
});
