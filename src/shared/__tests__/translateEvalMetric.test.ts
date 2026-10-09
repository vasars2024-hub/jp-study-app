// @vitest-environment node
/**
 * The translation eval harness (`tools/translate-eval.cjs`): its chrF metric,
 * its bundled test set, and scoring from a hypothesis file. Only the pure parts
 * run here — the harness's provider runners make real network calls and are
 * for manual runs, never the suite.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const require_ = createRequire(__filename);
const harness = require_(path.join(ROOT, 'tools', 'translate-eval.cjs')) as {
  DEFAULT_SET: string;
  chrfStats: (hyp: string, ref: string, order?: number) => number[][];
  chrfFromStats: (stats: number[][], beta?: number) => number;
  sentenceChrf: (hyp: string, refs: string | string[]) => number;
  corpusChrf: (hyps: string[], refs: Array<string | string[]>) => number;
  loadEvalSet: (file?: string) => { source: string; target: string; items: Array<{ id: string; category: string; source: string; references: string[] }> };
  scoreHypotheses: (items: unknown[], hyps: string[]) => {
    overall: number;
    empty: number;
    categories: Record<string, { items: number; chrf: number }>;
    items: Array<{ id: string; chrf: number }>;
  };
  readHypothesisFile: (file: string, items: Array<{ id: string }>) => string[];
};

describe('chrF', () => {
  it('is 100 for an exact match and 0 for an empty hypothesis', () => {
    expect(harness.sentenceChrf('I like cats.', 'I like cats.')).toBeCloseTo(100, 6);
    expect(harness.sentenceChrf('', 'I like cats.')).toBe(0);
  });

  it('ignores whitespace, like sacreBLEU', () => {
    expect(harness.sentenceChrf('a b c', 'abc')).toBeCloseTo(100, 6);
  });

  it('matches a hand-computed value', () => {
    // n=1: P=R=2/3; n=2: P=R=1/2; n=3: no match; n>=4: no n-grams on either side
    // (not counted). (2/3 + 1/2 + 0) / 3 = 0.38888…
    expect(harness.sentenceChrf('abc', 'abd')).toBeCloseTo(38.8889, 3);
  });

  it('weights recall above precision (beta = 2)', () => {
    const short = harness.sentenceChrf('I like', 'I like cats');
    const long = harness.sentenceChrf('I like cats very much indeed', 'I like cats');
    expect(short).toBeLessThan(long);
  });

  it('counts clipped n-gram matches', () => {
    const stats = harness.chrfStats('aaa', 'a', 1);
    expect(stats).toEqual([[3, 1, 1]]);
  });

  it('takes the best of several references', () => {
    const one = harness.sentenceChrf('I have two cats.', ['I keep two felines.']);
    const best = harness.sentenceChrf('I have two cats.', ['I keep two felines.', 'I have two cats.']);
    expect(best).toBeCloseTo(100, 6);
    expect(one).toBeLessThan(best);
  });

  it('scores a corpus from summed statistics, not by averaging sentence scores', () => {
    const hyps = ['abc', 'I like cats.'];
    const refs = ['abd', 'I like cats.'];
    const corpus = harness.corpusChrf(hyps, refs);
    const mean = (harness.sentenceChrf(hyps[0], refs[0]) + harness.sentenceChrf(hyps[1], refs[1])) / 2;
    expect(corpus).toBeGreaterThan(mean);
    expect(corpus).toBeLessThan(100);
  });
});

describe('the bundled test set', () => {
  const set = harness.loadEvalSet();

  it('is about forty invented Japanese sentences across the five hard categories', () => {
    expect(set.source).toBe('ja');
    expect(set.target).toBe('en');
    expect(set.items.length).toBeGreaterThanOrEqual(38);
    const byCategory = new Map<string, number>();
    for (const item of set.items) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
    expect([...byCategory.keys()].sort()).toEqual(['counter', 'idiom', 'keigo', 'omission', 'onomatopoeia']);
    for (const count of byCategory.values()) expect(count).toBeGreaterThanOrEqual(6);
  });

  it('has unique ids, Japanese sources and non-empty references', () => {
    expect(new Set(set.items.map((item) => item.id)).size).toBe(set.items.length);
    for (const item of set.items) {
      expect(item.source).toMatch(/[぀-ヿ一-鿿]/);
      expect(item.references.length).toBeGreaterThan(0);
      for (const ref of item.references) expect(ref.trim()).not.toBe('');
    }
  });

  it('scores its own first references at 100 and reports empties', () => {
    const perfect = harness.scoreHypotheses(set.items, set.items.map((item) => item.references[0]));
    expect(perfect.overall).toBeCloseTo(100, 1);
    expect(Object.keys(perfect.categories)).toHaveLength(5);
    const half = harness.scoreHypotheses(set.items, set.items.map((item, i) => (i % 2 ? item.references[0] : '')));
    expect(half.empty).toBe(Math.ceil(set.items.length / 2));
    expect(half.overall).toBeLessThan(perfect.overall);
  });

  it('reads hypotheses from an array, an id map, or a previous report', () => {
    const items = set.items.slice(0, 2);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlate-eval-'));
    try {
      const write = (name: string, value: unknown): string => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, JSON.stringify(value));
        return file;
      };
      expect(harness.readHypothesisFile(write('a.json', ['x', 'y']), items)).toEqual(['x', 'y']);
      expect(harness.readHypothesisFile(write('b.json', { [items[1].id]: 'y' }), items)).toEqual(['', 'y']);
      expect(harness.readHypothesisFile(write('c.json', { items: [{ id: items[0].id, hypothesis: 'x' }] }), items)).toEqual(['x', '']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
