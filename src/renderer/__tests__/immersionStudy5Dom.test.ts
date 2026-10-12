// @vitest-environment jsdom
/**
 * Immersion 7.5: i+1 sentence painting over the reader's known-word spans, and
 * the page's lemmas for "new words met". jsdom has no CSS Highlight API, so the
 * fallback (a class on the one unknown word) is what is asserted; a fake
 * registry checks the Range path.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  IMM5_IPLUS1_HIGHLIGHT,
  IMM5_IPLUS1_WORD_CLASS,
  imm5ApplyIPlusOne,
  imm5BlockText,
  imm5ClearIPlusOne,
  imm5PageLemmas,
  imm5ReaderCoverage,
} from '../immersionStudy5Dom';

const w = (lemma: string, level: number) => `<span class="wk wk-${level}" data-lemma="${lemma}">${lemma}</span>`;

function reader(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (globalThis as { CSS?: unknown }).CSS;
  delete (globalThis as { Highlight?: unknown }).Highlight;
});

describe('i+1 in the immersion reader', () => {
  it('marks the single unknown word of an i+1 sentence, not of a sentence with two', () => {
    const root = reader(
      `<p>${w('私', 3)}は${w('猫', 0)}が${w('好き', 3)}。${w('犬', 0)}と${w('鳥', 0)}と${w('魚', 3)}。</p>`,
    );
    expect(imm5ApplyIPlusOne(root)).toBe(1);
    const marked = [...root.querySelectorAll(`.${IMM5_IPLUS1_WORD_CLASS}`)].map((el) => el.textContent);
    expect(marked).toEqual(['猫']);
    imm5ClearIPlusOne(root);
    expect(root.querySelectorAll(`.${IMM5_IPLUS1_WORD_CLASS}`)).toHaveLength(0);
  });

  it('reads past furigana: ruby text is not part of the sentence', () => {
    const root = reader(`<p><ruby>${w('漢字', 3)}<rt>かんじ</rt></ruby>の${w('勉強', 0)}は${w('楽しい', 3)}。</p>`);
    expect(imm5BlockText(root.querySelector('p') as Element).text).toBe('漢字の勉強は楽しい。');
    expect(imm5ApplyIPlusOne(root)).toBe(1);
  });

  it('measures innermost blocks only', () => {
    const root = reader(`<ul><li><p>${w('私', 3)}${w('猫', 0)}${w('好き', 3)}。</p></li></ul>`);
    expect(imm5ApplyIPlusOne(root)).toBe(1);
  });

  it('registers one Highlight of sentence ranges when the API exists', () => {
    const registry = new Map<string, unknown>();
    class FakeHighlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    (globalThis as { CSS?: unknown }).CSS = { highlights: registry };
    (globalThis as { Highlight?: unknown }).Highlight = FakeHighlight;
    const root = reader(`<p>${w('私', 3)}は${w('猫', 0)}が${w('好き', 3)}。</p>`);
    expect(imm5ApplyIPlusOne(root)).toBe(1);
    const highlight = registry.get(IMM5_IPLUS1_HIGHLIGHT) as FakeHighlight;
    expect(highlight.ranges).toHaveLength(1);
    expect(highlight.ranges[0].toString()).toBe('私は猫が好き。');
    imm5ClearIPlusOne(root);
    expect(registry.has(IMM5_IPLUS1_HIGHLIGHT)).toBe(false);
  });

  it('covers Aozora-style text: one div of <br> lines, no <p> at all', () => {
    const root = reader(
      `<div class="main_text">${w('私', 3)}は${w('猫', 0)}が${w('好き', 3)}<br />${w('犬', 0)}と${w('鳥', 0)}と${w('魚', 3)}<br /><div class="jisage_3">${w('空', 3)}が${w('青', 0)}い${w('日', 3)}</div></div>`,
    );
    const block = imm5BlockText(root.querySelector('.main_text') as Element);
    // The nested div is measured on its own; the <br> reads as a line break.
    expect(block.text).toBe('私は猫が好き\n犬と鳥と魚\n');
    expect(imm5ApplyIPlusOne(root)).toBe(2);
    expect([...root.querySelectorAll(`.${IMM5_IPLUS1_WORD_CLASS}`)].map((el) => el.textContent)).toEqual(['猫', '青']);
  });

  it('never takes a proper noun as the unknown word', () => {
    const root = reader(`<p>${w('私', 3)}は<span class="wk wk-0" data-lemma="東京" data-proper="">東京</span>が${w('好き', 3)}。</p>`);
    expect(imm5ApplyIPlusOne(root)).toBe(0);
  });

  it('measures page coverage from the spans, names and furigana excluded', () => {
    const root = reader(`<p>${w('猫', 3)}${w('猫', 3)}${w('犬', 0)}<span class="wk wk-0" data-lemma="東京" data-proper="">東京</span></p>`);
    expect(imm5ReaderCoverage(root)).toEqual({ tokens: 3, known: 2, knownPct: 67, unknownUnique: 1 });
  });

  it('lists the distinct lemmas on the page', () => {
    const root = reader(`<p>${w('猫', 0)}${w('猫', 0)}${w('犬', 3)}</p>`);
    expect(imm5PageLemmas(root).sort()).toEqual(['犬', '猫']);
  });
});
