import { describe, expect, it } from 'vitest';
import {
  alignFurigana,
  hasKanji,
  segmentsToBrackets,
  segmentsToKana,
  segmentsToRuby,
  toHiragana,
} from '../furigana';

describe('toHiragana', () => {
  it('converts katakana and leaves other characters alone', () => {
    expect(toHiragana('タベル')).toBe('たべる');
    expect(toHiragana('ラーメン')).toBe('らーめん'); // long-vowel mark survives
    expect(toHiragana('たべる')).toBe('たべる');
    expect(toHiragana('ABC123')).toBe('ABC123');
  });
});

describe('hasKanji', () => {
  it('detects kanji and the 々 repeater', () => {
    expect(hasKanji('食べる')).toBe(true);
    expect(hasKanji('人々')).toBe(true);
    expect(hasKanji('たべる')).toBe(false);
    expect(hasKanji('ラーメン')).toBe(false);
    expect(hasKanji('abc')).toBe(false);
  });
});

describe('alignFurigana — okurigana splitting', () => {
  it('annotates only the kanji, not the trailing okurigana', () => {
    // The whole point: たべる must not sit over 食べる.
    expect(alignFurigana('食べる', 'タベル')).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べる' },
    ]);
  });

  it('handles kana between two kanji runs', () => {
    expect(alignFurigana('話し合う', 'ハナシアウ')).toEqual([
      { text: '話', reading: 'はな' },
      { text: 'し' },
      { text: '合', reading: 'あ' },
      { text: 'う' },
    ]);
  });

  it('handles a leading kana run', () => {
    expect(alignFurigana('お茶', 'オチャ')).toEqual([
      { text: 'お' },
      { text: '茶', reading: 'ちゃ' },
    ]);
  });

  it('annotates an all-kanji word as one segment', () => {
    expect(alignFurigana('日本語', 'ニホンゴ')).toEqual([{ text: '日本語', reading: 'にほんご' }]);
  });

  it('accepts a reading already given in hiragana', () => {
    expect(alignFurigana('食べる', 'たべる')).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べる' },
    ]);
  });
});

describe('alignFurigana — when it must not guess', () => {
  it('returns the plain surface when there is no kanji', () => {
    expect(alignFurigana('たべる', 'タベル')).toEqual([{ text: 'たべる' }]);
    expect(alignFurigana('ラーメン', 'ラーメン')).toEqual([{ text: 'ラーメン' }]);
  });

  it('returns the plain surface with no reading supplied', () => {
    expect(alignFurigana('食べる')).toEqual([{ text: '食べる' }]);
    expect(alignFurigana('食べる', '')).toEqual([{ text: '食べる' }]);
  });

  it('falls back to whole-token ruby for jukujikun with no kana anchor', () => {
    // 今日 → きょう cannot be split per-character; one ruby over the pair is the
    // honest answer.
    expect(alignFurigana('今日', 'キョウ')).toEqual([{ text: '今日', reading: 'きょう' }]);
  });

  it('falls back to whole-token ruby when the kana anchor does not match', () => {
    // Reading disagrees with the surface's okurigana — refuse to split.
    expect(alignFurigana('食べる', 'タベマス')).toEqual([{ text: '食べる', reading: 'たべます' }]);
  });

  it('falls back rather than leaving a kanji run with an empty reading', () => {
    // The anchor 'べる' occurs at position 0 of the reading, which would give 食
    // nothing at all. Searching from pos+1 prevents that.
    expect(alignFurigana('食べる', 'べる')).toEqual([{ text: '食べる', reading: 'べる' }]);
  });

  it('falls back when the reading has unconsumed characters left over', () => {
    // 食 is bounded by the 'べる' anchor, so it takes 'た' — but that leaves a
    // trailing 'よ' the surface has nowhere to put.
    expect(alignFurigana('食べる', 'たべるよ')).toEqual([{ text: '食べる', reading: 'たべるよ' }]);
  });

  it('lets a trailing kanji run absorb the whole remainder', () => {
    // Documented consequence of the trailing rule, not an oversight: the same
    // rule that makes 日本語 → にほんご work cannot tell a legitimately long
    // trailing reading from an over-long one, because there is no anchor after
    // it to bound against. Splitting here would be a guess either way.
    expect(alignFurigana('お茶', 'オチャヅケ')).toEqual([
      { text: 'お' },
      { text: '茶', reading: 'ちゃづけ' },
    ]);
  });

  it('handles empty input', () => {
    expect(alignFurigana('', 'アイウ')).toEqual([{ text: '' }]);
  });
});

describe('output formats', () => {
  const segs = alignFurigana('食べる', 'タベル');

  it('renders ruby with rp fallbacks', () => {
    expect(segmentsToRuby(segs)).toBe('<ruby>食<rp>(</rp><rt>た</rt><rp>)</rp></ruby>べる');
  });

  it('escapes HTML in the surface', () => {
    expect(segmentsToRuby([{ text: '<b>&' }])).toBe('&lt;b&gt;&amp;');
  });

  it('renders Anki bracket furigana without a stray leading space', () => {
    expect(segmentsToBrackets(segs)).toBe('食[た]べる');
    expect(segmentsToBrackets(alignFurigana('お茶', 'オチャ'))).toBe('お 茶[ちゃ]');
  });

  it('renders a kana-only reading of the whole surface', () => {
    expect(segmentsToKana(segs)).toBe('たべる');
    expect(segmentsToKana(alignFurigana('話し合う', 'ハナシアウ'))).toBe('はなしあう');
  });

  it('leaves un-annotated text untouched in every format', () => {
    const plain = alignFurigana('ラーメン');
    expect(segmentsToRuby(plain)).toBe('ラーメン');
    expect(segmentsToBrackets(plain)).toBe('ラーメン');
    expect(segmentsToKana(plain)).toBe('らーめん');
  });
});
