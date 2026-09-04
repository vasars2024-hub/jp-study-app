/**
 * P2(a) — the matcher, against the plan's own §3 thresholds.
 *
 * Every accept case here ships beside a negative control that must NOT accept,
 * because the failure mode this module exists to prevent is silent confidence:
 * a matcher with no controls scores 1.0 on everything and looks perfect.
 */

import { describe, expect, it } from 'vitest';
import {
  BIND_ACCEPT,
  BIND_SUGGEST,
  kanaToRomaji,
  matchReadingWork,
  readingTitleSimilarity,
  scoreReadingMatch,
  type ReadingMatchCandidate,
} from '../readingListMatching';
import type { ReadingWorkRef } from '../readingLists';

function work(patch: Partial<ReadingWorkRef> & { titleRaw: string }): ReadingWorkRef {
  return { id: 'rw1', boundItemIds: [], bindConfidence: 0, ...patch };
}

function item(patch: Partial<ReadingMatchCandidate> & { title: string }): ReadingMatchCandidate {
  return { id: 'it1', ...patch };
}

describe('kanaToRomaji', () => {
  it('transliterates hiragana, katakana, digraphs, sokuon and the long mark', () => {
    expect(kanaToRomaji('よるのばけもの')).toBe('yorunobakemono');
    expect(kanaToRomaji('コンビニ')).toBe('konbini');
    expect(kanaToRomaji('きょう')).toBe('kyou');
    expect(kanaToRomaji('がっこう')).toBe('gakkou');
    expect(kanaToRomaji('いっしょ')).toBe('issho');
    expect(kanaToRomaji('まって')).toBe('matte');
    expect(kanaToRomaji('ラーメン')).toBe('raamen');
    expect(kanaToRomaji('ハリー・ポッター')).toBe('harii pottaa');
  });

  it('leaves a string with no kana exactly as it was', () => {
    // The caller uses identity to ask "was there anything to transliterate".
    expect(kanaToRomaji('Convenience Store Woman')).toBe('Convenience Store Woman');
    expect(kanaToRomaji('人間失格')).toBe('人間失格');
  });

  it('passes kanji through while transliterating the kana around them', () => {
    expect(kanaToRomaji('君の膵臓をたべたい')).toBe('君no膵臓wotabetai');
  });
});

describe('readingTitleSimilarity', () => {
  it('is 1 for an exact key match and 0.97 across a spacing difference', () => {
    expect(readingTitleSimilarity('Kino no Tabi', 'kino no tabi')).toBe(1);
    expect(readingTitleSimilarity('yorunobakemono', 'Yoru no Bakemono')).toBe(0.97);
  });

  it('scores a CJK title that has no spaces to tokenize', () => {
    // `titleSimilarity`'s token branch sees one token per side here and returns
    // 0; the bigram branch is the whole reason this wrapper exists.
    expect(readingTitleSimilarity('コンビニ人間', 'コンビニ人間 上巻')).toBeGreaterThan(0.5);
  });

  it('NEGATIVE CONTROL — the length floor kills a containment hit a short title would win', () => {
    // Both of these score ~0.64 on containment without the floor, which is a
    // suggestion for a book that merely starts with the same two characters.
    // An exact match is decided before the floor, so short titles still bind.
    expect(readingTitleSimilarity('IT', 'IT 2')).toBe(0);
    expect(readingTitleSimilarity('人間', '人間失格')).toBe(0);
    expect(readingTitleSimilarity('人間', '人間')).toBe(1);
  });

  it('NEGATIVE CONTROL — two unrelated real titles stay far below suggest', () => {
    expect(readingTitleSimilarity('Convenience Store Woman', 'Norwegian Wood')).toBeLessThan(0.3);
    expect(readingTitleSimilarity('君の膵臓をたべたい', 'ノルウェイの森')).toBeLessThan(0.3);
  });
});

describe('scoreReadingMatch', () => {
  it('accepts on an exact title with nothing else known', () => {
    const result = scoreReadingMatch(
      work({ titleRaw: 'コンビニ人間' }),
      item({ title: 'コンビニ人間' }),
    );
    expect(result.score).toBeGreaterThanOrEqual(BIND_ACCEPT);
    expect(result.signals.titleVia).toBe('exact');
    expect(result.signals.author).toBe(0);
  });

  it('accepts across kana and romaji, and says a transliteration did it', () => {
    const result = scoreReadingMatch(
      work({ titleRaw: 'よるのばけもの', titleJa: 'よるのばけもの' }),
      item({ title: 'Yoru no Bakemono' }),
    );
    expect(result.score).toBeGreaterThanOrEqual(BIND_ACCEPT);
    expect(result.signals.titleVia).toBe('romaji');
  });

  it('NEGATIVE CONTROL — a disagreeing author pulls an exact title below accept', () => {
    const same = { titleRaw: 'Norwegian Wood' };
    const agreeing = scoreReadingMatch(
      work({ ...same, authorRaw: 'Haruki Murakami' }),
      item({ title: 'Norwegian Wood', author: 'Murakami Haruki' }),
    );
    const disagreeing = scoreReadingMatch(
      work({ ...same, authorRaw: 'Haruki Murakami' }),
      item({ title: 'Norwegian Wood', author: 'Sayaka Murata' }),
    );
    expect(agreeing.signals.author).toBe(1);
    expect(disagreeing.signals.author).toBe(-1);
    expect(agreeing.score).toBeGreaterThanOrEqual(BIND_ACCEPT);
    expect(disagreeing.score).toBeLessThan(BIND_ACCEPT);
  });

  it('NEGATIVE CONTROL — volume 7 does not satisfy a request for volumes 1-3', () => {
    const inRange = scoreReadingMatch(
      work({ titleRaw: 'ハリー・ポッター', volume: { from: 1, to: 3 } }),
      item({ title: 'ハリー・ポッター', volume: 2 }),
    );
    const outOfRange = scoreReadingMatch(
      work({ titleRaw: 'ハリー・ポッター', volume: { from: 1, to: 3 } }),
      item({ title: 'ハリー・ポッター', volume: 7 }),
    );
    expect(inRange.signals.volume).toBe(1);
    expect(outOfRange.signals.volume).toBe(-1);
    expect(inRange.score).toBeGreaterThanOrEqual(BIND_ACCEPT);
    expect(outOfRange.score).toBeLessThan(BIND_ACCEPT);
  });

  it('reads an alternative title on the item, not only its display title', () => {
    const result = scoreReadingMatch(
      work({ titleRaw: 'コンビニ人間' }),
      item({ title: '[epub] konbini-ningen-2018', altTitles: ['コンビニ人間'] }),
    );
    expect(result.score).toBeGreaterThanOrEqual(BIND_ACCEPT);
  });

  it('scores nothing at all against an empty library title', () => {
    expect(scoreReadingMatch(work({ titleRaw: 'コンビニ人間' }), item({ title: '' })).score).toBe(0);
  });
});

describe('matchReadingWork', () => {
  const library: ReadingMatchCandidate[] = [
    { id: 'a', title: 'コンビニ人間' },
    { id: 'b', title: 'ノルウェイの森' },
    { id: 'c', title: '君の膵臓をたべたい' },
  ];

  it('accepts the one real match and names the rest as also-rans or nothing', () => {
    const outcome = matchReadingWork(work({ titleRaw: 'コンビニ人間' }), library);
    expect(outcome.disposition).toBe('accept');
    expect(outcome.best?.candidateId).toBe('a');
  });

  it('NEGATIVE CONTROL — a title the library does not hold binds to nothing', () => {
    const outcome = matchReadingWork(work({ titleRaw: '推し、燃ゆ' }), library);
    expect(outcome.disposition).toBe('none');
    expect(outcome.best?.score ?? 0).toBeLessThan(BIND_SUGGEST);
  });

  it('NEGATIVE CONTROL — two library files of the same book ask instead of binding', () => {
    // Both clear accept and land within 0.05 of each other, so there is no honest
    // reason to pick one. Compare with the volume case below, where an exact hit
    // beats a near one by more than the ambiguity band and correctly binds.
    const duplicates: ReadingMatchCandidate[] = [
      { id: 'd1', title: 'コンビニ人間' },
      { id: 'd2', title: 'コンビニ 人間' },
    ];
    const alone = matchReadingWork(work({ titleRaw: 'コンビニ人間' }), [duplicates[0]]);
    const together = matchReadingWork(work({ titleRaw: 'コンビニ人間' }), duplicates);
    expect(alone.disposition).toBe('accept');
    expect(together.disposition).toBe('suggest');
    expect(together.runnerUp?.candidateId).toBe('d2');
  });

  it('still binds volume 1 out of a shelf of volumes — an exact hit beats a near one', () => {
    const volumes: ReadingMatchCandidate[] = [
      { id: 'v1', title: '鋼の錬金術師 1' },
      { id: 'v2', title: '鋼の錬金術師 2' },
    ];
    const outcome = matchReadingWork(work({ titleRaw: '鋼の錬金術師 1' }), volumes);
    expect(outcome.disposition).toBe('accept');
    expect(outcome.best?.candidateId).toBe('v1');
  });

  it('offers a suggestion in the middle band rather than binding or hiding it', () => {
    const outcome = matchReadingWork(work({ titleRaw: 'Kino no Tabi' }), [
      { id: 'k', title: 'Kino no Tabi - Beautiful World' },
    ]);
    expect(outcome.disposition).toBe('suggest');
    expect(outcome.best?.score).toBeGreaterThanOrEqual(BIND_SUGGEST);
    expect(outcome.best?.score).toBeLessThan(BIND_ACCEPT);
  });

  it('is deterministic when two candidates score identically', () => {
    const twins: ReadingMatchCandidate[] = [
      { id: 'z', title: 'コンビニ人間' },
      { id: 'a', title: 'コンビニ人間' },
    ];
    expect(matchReadingWork(work({ titleRaw: 'コンビニ人間' }), twins).best?.candidateId).toBe('a');
    expect(
      matchReadingWork(work({ titleRaw: 'コンビニ人間' }), [...twins].reverse()).best?.candidateId,
    ).toBe('a');
  });
});
