// @vitest-environment node
/**
 * CTC decoding with the runners-up: the same text and confidence as the
 * greedy decoder, plus each emitted character's top-k alternatives at the
 * slice where it peaked. Synthetic probability matrices only.
 */
import { describe, expect, it } from 'vitest';
import { ctcGreedyDecode } from '../ctcDecode';
import { ctcDecodeTopK, trimChars } from '../ctcTopK';

const CHARSET = ['', '彼', '恐', '後', '竜', 'の', ' '];

/** A [T x C] matrix from per-step {class: prob} rows; the rest of each row goes to the blank. */
function matrix(rows: Array<Record<number, number>>): Float32Array {
  const C = CHARSET.length;
  const out = new Float32Array(rows.length * C);
  rows.forEach((row, t) => {
    let rest = 1;
    for (const [c, p] of Object.entries(row)) {
      out[t * C + Number(c)] = p;
      rest -= p;
    }
    out[t * C] = Math.max(0, rest);
  });
  return out;
}

describe('ctcDecodeTopK', () => {
  const rows: Array<Record<number, number>> = [
    { 1: 0.5, 2: 0.3 }, // 彼 (恐 second)
    { 1: 0.45, 2: 0.4 }, // still 彼: one character over two slices, peak at the first
    {}, // blank
    { 3: 0.55, 4: 0.35 }, // 後 (竜 second)
    {},
    { 5: 0.97 }, // の, sure
  ];
  const probs = matrix(rows);

  it('reads exactly what the greedy decoder reads, with the same confidence', () => {
    const greedy = ctcGreedyDecode(probs, rows.length, CHARSET.length, CHARSET);
    const topk = ctcDecodeTopK(probs, rows.length, CHARSET.length, CHARSET);
    expect(topk.text).toBe(greedy.text);
    expect(topk.text).toBe('彼後の');
    expect(topk.confidence).toBeCloseTo(greedy.confidence, 6);
  });

  it('keeps each character\'s runners-up from the slice where it peaked', () => {
    const { chars } = ctcDecodeTopK(probs, rows.length, CHARSET.length, CHARSET, 3);
    expect(chars.map((c) => c.ch)).toEqual(['彼', '後', 'の']);
    expect(chars[0].p).toBeCloseTo(0.5);
    expect(chars[0].alts[0]).toEqual({ ch: '恐', p: expect.closeTo(0.3, 5) });
    expect(chars[1].alts[0]).toEqual({ ch: '竜', p: expect.closeTo(0.35, 5) });
    // The blank and the character itself are never alternatives; noise below 1% is dropped.
    expect(chars[2].alts).toEqual([]);
  });

  it('a repeated character separated by a blank is two characters, each with its own candidates', () => {
    const r: Array<Record<number, number>> = [{ 5: 0.9 }, {}, { 5: 0.6, 1: 0.2 }];
    const { text, chars } = ctcDecodeTopK(matrix(r), r.length, CHARSET.length, CHARSET);
    expect(text).toBe('のの');
    expect(chars[1].alts).toEqual([{ ch: '彼', p: expect.closeTo(0.2, 5) }]);
  });

  it('an empty or malformed matrix reads nothing', () => {
    expect(ctcDecodeTopK(new Float32Array(0), 0, CHARSET.length, CHARSET)).toEqual({ text: '', confidence: 0, chars: [] });
    expect(ctcDecodeTopK(new Float32Array(3), 2, CHARSET.length, CHARSET).text).toBe('');
  });

  it('trimChars keeps the characters aligned with the trimmed text', () => {
    const r: Array<Record<number, number>> = [{ 6: 0.9 }, {}, { 5: 0.8 }, {}, { 6: 0.9 }];
    const decoded = ctcDecodeTopK(matrix(r), r.length, CHARSET.length, CHARSET);
    expect(decoded.text).toBe(' の ');
    expect(trimChars(decoded.text, decoded.chars)).toEqual({ text: 'の', chars: [decoded.chars[1]] });
    // Not aligned: the text is still trimmed, the characters are dropped.
    expect(trimChars(' の ', [])).toEqual({ text: 'の', chars: [] });
  });
});
