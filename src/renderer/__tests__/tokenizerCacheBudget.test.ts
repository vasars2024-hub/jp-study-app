// @vitest-environment jsdom
/**
 * The tokenize cache is for lines, not books. It had an entry cap and no size
 * cap, so one 40,000-character Library sample per book stayed resident as
 * token objects (~120 MB after a Library pass). Long texts are no longer
 * cached, and the total is bounded by an estimated byte budget.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sglkc/kuromoji/src/loader/DictionaryLoader', () => ({
  default: class {
    load(cb: (err: unknown, dic: unknown) => void): void {
      cb(null, {});
    }
  },
}));
vi.mock('@sglkc/kuromoji/src/Tokenizer', () => ({
  default: class {
    tokenize(text: string) {
      return [...text].map((ch) => ({ surface_form: ch, basic_form: ch, pos: '名詞', pos_detail_1: '一般' }));
    }
  },
}));

const {
  getTokenizer,
  tokenizeSync,
  tokenizeCacheStats,
  TOKENIZE_CACHE_MAX_TEXT,
  TOKENIZE_CACHE_MAX_BYTES,
} = await import('../tokenizer');

describe('tokenize cache budget', () => {
  it('caches short lines, not long samples, and stays under its byte budget', async () => {
    await getTokenizer();
    const line = '猫が好きです';
    const first = tokenizeSync(line);
    expect(tokenizeSync(line)).toBe(first);
    expect(tokenizeCacheStats().entries).toBe(1);

    const sample = '吾'.repeat(TOKENIZE_CACHE_MAX_TEXT + 1);
    const a = tokenizeSync(sample);
    expect(a).toHaveLength(sample.length);
    expect(tokenizeSync(sample)).not.toBe(a);
    expect(tokenizeCacheStats().entries).toBe(1);

    // Fill well past the budget with distinct maximal lines.
    for (let i = 0; i < 400; i++) tokenizeSync(`${i}`.padStart(TOKENIZE_CACHE_MAX_TEXT, '猫'));
    const stats = tokenizeCacheStats();
    expect(stats.bytes).toBeLessThanOrEqual(TOKENIZE_CACHE_MAX_BYTES);
    expect(stats.entries).toBeLessThan(400);
    expect(stats.entries).toBeGreaterThan(10);
  });
});
