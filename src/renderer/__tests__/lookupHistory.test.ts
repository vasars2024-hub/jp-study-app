// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadLookupHistory,
  recordLookup,
  repeatedLookupEntries,
} from '../lookupHistory';

describe('lookup history evidence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('folds repeated surface forms into one canonical lemma with bounded times', () => {
    recordLookup({ query: '食べた', lemma: '食べる', reading: 'たべる', lang: 'ja' }, 100);
    recordLookup({ query: '食べます', lemma: '食べる', reading: 'たべる', lang: 'ja' }, 200);

    expect(loadLookupHistory()).toEqual([expect.objectContaining({
      query: '食べます',
      lemma: '食べる',
      count: 2,
      firstAt: 100,
      at: 200,
      lookupTimes: [100, 200],
    })]);
  });

  it('selects only repeated recent Japanese entries not excluded by knowledge/mining', () => {
    const now = 40 * 86_400_000;
    recordLookup({ query: '見る', lemma: '見る', lang: 'ja' }, now - 100);
    recordLookup({ query: '見た', lemma: '見る', lang: 'ja' }, now - 50);
    recordLookup({ query: '知る', lemma: '知る', lang: 'ja' }, now - 100);
    recordLookup({ query: '知った', lemma: '知る', lang: 'ja' }, now - 50);
    recordLookup({ query: 'hello', lemma: 'hello', lang: 'ja' }, now - 20);
    recordLookup({ query: 'hello', lemma: 'hello', lang: 'ja' }, now - 10);

    expect(repeatedLookupEntries(loadLookupHistory(), {
      now,
      exclude: (entry) => entry.lemma === '知る',
    }).map((entry) => entry.lemma)).toEqual(['見る']);
  });

  it('migrates the old query/timestamp-only rows without inventing repetition', () => {
    localStorage.setItem('jp-lookup-history', JSON.stringify([{ query: '読む', at: 123 }]));
    expect(loadLookupHistory()[0]).toMatchObject({
      query: '読む',
      lemma: '読む',
      count: 1,
      lookupTimes: [123],
    });
    expect(repeatedLookupEntries(loadLookupHistory(), { now: 123 })).toEqual([]);
  });
});
