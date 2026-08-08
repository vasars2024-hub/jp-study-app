import { describe, expect, it } from 'vitest';
import {
  CEDICT_LINE_RE,
  cedictHeadwords,
  parseCedictLine,
  parseClassifiers,
  pinyinSearchKey,
  pinyinToneMarks,
  pinyinToneless,
} from '../pinyin';

describe('pinyinToneMarks — where the mark actually goes', () => {
  it('marks a single vowel', () => {
    expect(pinyinToneMarks('ma1')).toBe('mā');
    expect(pinyinToneMarks('ma2')).toBe('má');
    expect(pinyinToneMarks('ma3')).toBe('mǎ');
    expect(pinyinToneMarks('ma4')).toBe('mà');
  });

  it('leaves the neutral tone unmarked, whether written 0 or 5', () => {
    expect(pinyinToneMarks('ma5')).toBe('ma');
    expect(pinyinToneMarks('ma0')).toBe('ma');
  });

  it('prefers a over every other vowel', () => {
    // xiao4 is xiào, never xìao — the rule is not "first vowel".
    expect(pinyinToneMarks('xiao4')).toBe('xiào');
    expect(pinyinToneMarks('guai1')).toBe('guāi');
  });

  it('prefers e when there is no a', () => {
    expect(pinyinToneMarks('xie4')).toBe('xiè');
    expect(pinyinToneMarks('lue4')).toBe('luè');
  });

  it('marks the o of ou', () => {
    expect(pinyinToneMarks('gou3')).toBe('gǒu');
    expect(pinyinToneMarks('zhou1')).toBe('zhōu');
  });

  it('falls back to the LAST vowel — the liu/gui cases', () => {
    // liu2 is liú, not líu; gui1 is guī, not gūi.
    expect(pinyinToneMarks('liu2')).toBe('liú');
    expect(pinyinToneMarks('gui1')).toBe('guī');
  });

  it('converts the u: digraph to ü', () => {
    expect(pinyinToneMarks('nu:3')).toBe('nǚ');
    expect(pinyinToneMarks('lu:4')).toBe('lǜ');
  });

  it('handles a multi-syllable reading', () => {
    expect(pinyinToneMarks('chuan2 tong3')).toBe('chuán tǒng');
    expect(pinyinToneMarks('zhong1 guo2 ren2')).toBe('zhōng guó rén');
  });

  it('passes through a syllable that carries no tone number', () => {
    expect(pinyinToneMarks('r')).toBe('r');
    expect(pinyinToneMarks('xxx')).toBe('xxx');
  });
});

describe('the search keys — what a learner actually types', () => {
  it('strips tones but keeps syllable boundaries', () => {
    expect(pinyinToneless('chuan2 tong3')).toBe('chuan tong');
    expect(pinyinToneless('CHUAN2 TONG3')).toBe('chuan tong');
  });

  it('keeps ü, which is a different letter and not decoration', () => {
    expect(pinyinToneless('nu:3')).toBe('nü');
  });

  it('produces the spaceless spelling too', () => {
    expect(pinyinSearchKey('chuan2 tong3')).toBe('chuantong');
    expect(pinyinSearchKey('zhong1 guo2')).toBe('zhongguo');
  });

  it('is stable on an already-toneless input', () => {
    expect(pinyinToneless('chuan tong')).toBe('chuan tong');
  });
});

describe('parseCedictLine', () => {
  it('parses a normal entry', () => {
    expect(parseCedictLine('傳統 传统 [chuan2 tong3] /tradition/traditional/')).toEqual({
      trad: '傳統',
      simp: '传统',
      pinyin: 'chuan2 tong3',
      defs: ['tradition', 'traditional'],
    });
  });

  it('skips comments and blank lines rather than throwing', () => {
    // The shipped file opens with a comment header, and a parser that dies on it
    // takes the whole 120k-line import with it.
    expect(parseCedictLine('# CC-CEDICT')).toBeNull();
    expect(parseCedictLine('')).toBeNull();
    expect(parseCedictLine('   ')).toBeNull();
  });

  it('skips a malformed line', () => {
    expect(parseCedictLine('傳統 传统 chuan2 tong3 /tradition/')).toBeNull();
    expect(parseCedictLine('傳統 传统 [chuan2 tong3]')).toBeNull();
  });

  it('skips an entry with no usable definition', () => {
    expect(parseCedictLine('X X [x1] /  /')).toBeNull();
  });

  it('keeps a definition containing a bracket or a pipe', () => {
    const entry = parseCedictLine('一 一 [yi1] /one/CL:個|个[ge4]/');
    expect(entry?.defs).toEqual(['one', 'CL:個|个[ge4]']);
  });

  it('exposes the regex it uses, so the importer cannot drift from it', () => {
    expect(CEDICT_LINE_RE.test('傳統 传统 [chuan2 tong3] /tradition/')).toBe(true);
  });
});

describe('cedictHeadwords', () => {
  it('indexes both scripts when they differ', () => {
    expect(cedictHeadwords({ trad: '傳統', simp: '传统', pinyin: '', defs: [] })).toEqual(['传统', '傳統']);
  });

  it('indexes one headword when the forms are identical', () => {
    expect(cedictHeadwords({ trad: '一', simp: '一', pinyin: '', defs: [] })).toEqual(['一']);
  });
});

describe('parseClassifiers', () => {
  it('reads a hint with distinct traditional and simplified forms', () => {
    expect(parseClassifiers(['CL:條|条[tiao2]'])).toEqual([{ trad: '條', simp: '条', pinyin: 'tiáo' }]);
  });

  it('reads a hint where both forms are the same', () => {
    expect(parseClassifiers(['CL:个[ge4]'])).toEqual([{ trad: '个', simp: '个', pinyin: 'gè' }]);
  });

  it('reads several hints from one definition', () => {
    expect(parseClassifiers(['CL:隻|只[zhi1],條|条[tiao2]'])).toEqual([
      { trad: '隻', simp: '只', pinyin: 'zhī' },
      { trad: '條', simp: '条', pinyin: 'tiáo' },
    ]);
  });

  it('ignores definitions that are not classifier hints', () => {
    expect(parseClassifiers(['tradition', 'traditional'])).toEqual([]);
  });

  it('deduplicates by simplified form', () => {
    expect(parseClassifiers(['CL:个[ge4]', 'CL:個|个[ge4]'])).toHaveLength(1);
  });
});
