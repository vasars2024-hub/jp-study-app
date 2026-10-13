// @vitest-environment jsdom
/**
 * The player's subtitle line colours a word by the same key the reader does
 * (`studyTokens`: the one knowledge-key rule plus spelling variants), so a word the
 * reader shows as known is not marked new on the subtitle, and the other way round.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { studyWordKnownClass, tokenKnownClass } from '../components/SubtitleCueLine';
import { setLevel } from '../knownWords';
import { setStudyLang } from '../studyEnvironment';
import { studyTokens } from '../studyTokens';
import type { JpToken } from '../tokenizer';

const token = (over: Partial<JpToken>): JpToken => ({
  surface: '',
  lemma: '',
  reading: '',
  content: true,
  proper: false,
  pos: '名詞',
  posDetail: '',
  ...over,
} as JpToken);

beforeEach(() => {
  localStorage.clear();
});

describe('subtitle known-word colours match the reader', () => {
  it('a katakana word known in hiragana is known on the line, as in the reader', () => {
    setStudyLang('ja');
    setLevel('ねこ', 3);
    const neko = token({ surface: 'ネコ', lemma: 'ネコ', reading: 'ネコ' });
    expect(tokenKnownClass(neko)).toBe('');
    // Before: the line looked up ネコ (and its surface) only, and marked it new.
    expect(tokenKnownClass(token({ surface: 'イヌ', lemma: 'イヌ', reading: 'イヌ' }))).toBe(' wk-new');
  });

  it('an inflected word is coloured by its dictionary form, not by a stray surface entry', () => {
    setStudyLang('ja');
    setLevel('食べ', 3);
    const tabeta = token({ surface: '食べ', lemma: '食べる', reading: 'タベ', pos: '動詞' });
    // The reader keys this token 食べる (unknown); the line used to read the surface 食べ too.
    expect(tokenKnownClass(tabeta)).toBe(' wk-new');
    setLevel('食べる', 1);
    expect(tokenKnownClass(tabeta)).toBe(' wk-learning');
  });

  it('names and function words carry no knowledge mark', () => {
    expect(tokenKnownClass(token({ surface: '田中', lemma: '田中', proper: true }))).toBe('');
    expect(tokenKnownClass(token({ surface: 'が', lemma: 'が', content: false }))).toBe('');
    expect(tokenKnownClass(token({ surface: '本', lemma: '本' }), false)).toBe('');
  });

  it('a Russian form is found under the dictionary form graded, exactly as the reader keys it', () => {
    setStudyLang('ru');
    setLevel('книга', 3);
    const readerKey = studyTokens('книги', 'ru').find((part) => part.content)?.lemma ?? '';
    expect(readerKey).toBe('книга');
    expect(studyWordKnownClass('книги', 'ru')).toBe('');
    expect(studyWordKnownClass('стол', 'ru')).toBe(' wk-new');
  });
});
