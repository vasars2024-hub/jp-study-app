import { describe, expect, it } from 'vitest';
import { pickLemmaReading } from '../readings';
import { hiraToKata, kanaEquals, kataToHira } from '../langs';

describe('lemma reading resolution', () => {
  it('会う resolves to あう, never the conjugated-surface アッ', () => {
    // Surface pass stored アッ (from 会った); dictionary has あう.
    expect(pickLemmaReading(['あう'], '', 'アッ')).toBe('あう');
  });

  it('訊く resolves to きく', () => {
    expect(pickLemmaReading(['きく'], 'キク', 'キイ')).toBe('きく');
  });

  it('kuromoji lemma reading disambiguates between multiple dictionary readings', () => {
    // 行く has いく and ゆく — kuromoji said イク for the bare lemma.
    expect(pickLemmaReading(['ゆく', 'いく'], 'イク', 'イッ')).toBe('いく');
  });

  it('falls back to the kuromoji lemma reading when no dictionary entry exists', () => {
    expect(pickLemmaReading([], 'オボロヅキ', 'オボロ')).toBe('おぼろづき');
  });

  it('falls back to the surface reading as the last resort, converted to hiragana', () => {
    expect(pickLemmaReading([], '', 'ニンゲン')).toBe('にんげん');
  });
});

describe('kana conversion', () => {
  it('kataToHira / hiraToKata round-trip', () => {
    expect(kataToHira('ニンゲン')).toBe('にんげん');
    expect(hiraToKata('にんげん')).toBe('ニンゲン');
    expect(hiraToKata(kataToHira('アウ'))).toBe('アウ');
  });

  it('kanaEquals ignores script and width', () => {
    expect(kanaEquals('アウ', 'あう')).toBe(true);
    expect(kanaEquals('ｷｸ', 'きく')).toBe(true);
    expect(kanaEquals('あう', 'あった')).toBe(false);
  });
});
