import { describe, expect, it } from 'vitest';
import {
  applyRussianStress,
  foldRussianYo,
  russianFormKey,
  russianLemmaCandidates,
  russianStem,
  stripRussianStress,
} from '../russianMorphology';
import { segmentStudyText, studyWordKey, studyWords } from '../studySegmentation';
import { pinyinRubyPairs, stressedRussian } from '../readingAid';

const A = '\u0301';

describe('segmentStudyText', () => {
  it('splits Chinese into words, not characters', () => {
    expect(studyWords('今天天气很好', 'zh')).toContain('今天');
    expect(studyWords('今天天气很好', 'zh')).toContain('天气');
    expect(studyWords('今天天氣很好', 'zh-Hant')).toContain('天氣');
  });

  it('splits Russian into words with offsets', () => {
    const parts = segmentStudyText('Я видела кошку.', 'ru');
    expect(parts.filter((part) => part.wordLike).map((part) => part.text)).toEqual(['Я', 'видела', 'кошку']);
    const kosku = parts.find((part) => part.text === 'кошку');
    expect(kosku && 'Я видела кошку.'.slice(kosku.start, kosku.end)).toBe('кошку');
  });
});

describe('Russian word forms', () => {
  it('strips stress but keeps ё; folds ё only on request', () => {
    expect(stripRussianStress(`кни${A}га`)).toBe('книга');
    expect(stripRussianStress('ёлка')).toBe('ёлка');
    expect(foldRussianYo('Ёлка')).toBe('Елка');
    expect(russianFormKey(`Ё${A}лка`)).toBe('елка');
  });

  it('proposes the dictionary form among its candidates', () => {
    expect(russianLemmaCandidates('книги')).toContain('книга');
    expect(russianLemmaCandidates('кошку')).toContain('кошка');
    expect(russianLemmaCandidates('видела')).toContain('видеть');
    expect(russianLemmaCandidates('парке')).toContain('парк');
    expect(russianLemmaCandidates('книги')[0]).toBe('книги');
  });

  it('groups the forms of one word under one stem', () => {
    expect(russianStem('книга')).toBe(russianStem('книгу'));
    expect(russianStem('книги')).toBe(russianStem('Книге'));
    expect(studyWordKey('книгами', 'ru')).toBe(studyWordKey('книга', 'ru'));
  });

  it('puts the accent onto the word as written, case kept', () => {
    expect(applyRussianStress('Книги', `кни${A}ги`)).toBe(`Кни${A}ги`);
    expect(applyRussianStress('елки', `ё${A}лки`)).toBe(`е${A}лки`);
    expect(applyRussianStress('кошки', `кни${A}ги`)).toBe('кошки');
    expect(stressedRussian('книги', undefined)).toBe('книги');
  });
});

describe('pinyinRubyPairs', () => {
  it('pairs each character with its syllable', () => {
    expect(pinyinRubyPairs('今天', ['jīn', 'tiān'])).toEqual([{ base: '今', rt: 'jīn' }, { base: '天', rt: 'tiān' }]);
    expect(pinyinRubyPairs('我A', ['wǒ', ''])).toEqual([{ base: '我', rt: 'wǒ' }, { base: 'A', rt: '' }]);
  });
});
