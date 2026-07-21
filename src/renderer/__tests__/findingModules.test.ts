// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildBountyBoard,
  buildKanjiChallenge,
  computeSessionGauge,
  computeStudyVerdict,
  hasKanji,
  pickInterceptedTerm,
  seededIndex,
} from '../findingModules';
import type { VocabItem } from '../games/contentSource';
import type { WkLevel } from '../knownWords';

function vocab(word: string, reading: string, meaning = 'meaning'): VocabItem {
  return { word, reading, meaning, level: 5 };
}

const POOL: VocabItem[] = [
  vocab('食べる', 'たべる', 'to eat'),
  vocab('水', 'みず', 'water'),
  vocab('学校', 'がっこう', 'school'),
  vocab('電車', 'でんしゃ', 'train'),
  vocab('図書館', 'としょかん', 'library'),
];

describe('hasKanji', () => {
  it('detects han ideographs', () => {
    expect(hasKanji('学校')).toBe(true);
    expect(hasKanji('食べる')).toBe(true);
  });

  it('treats the iteration mark as kanji', () => {
    expect(hasKanji('人々')).toBe(true);
  });

  it('rejects pure kana', () => {
    expect(hasKanji('ひらがな')).toBe(false);
    expect(hasKanji('カタカナ')).toBe(false);
  });
});

describe('seededIndex', () => {
  it('stays in range', () => {
    for (let seed = 0; seed < 200; seed++) {
      const i = seededIndex(seed, 5);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(5);
    }
  });

  it('is stable for the same seed', () => {
    expect(seededIndex(42, 9)).toBe(seededIndex(42, 9));
  });

  it('does not simply walk neighbours on consecutive seeds', () => {
    // A naive `seed % length` would produce a strictly ascending run.
    const run = [0, 1, 2, 3, 4, 5].map((s) => seededIndex(s, 100));
    const ascending = run.every((v, i) => i === 0 || v === run[i - 1] + 1);
    expect(ascending).toBe(false);
  });

  it('handles an empty pool', () => {
    expect(seededIndex(3, 0)).toBe(0);
  });
});

describe('buildKanjiChallenge', () => {
  it('builds a four-option question whose answer index is correct', () => {
    const c = buildKanjiChallenge(POOL, 1);
    expect(c).not.toBeNull();
    expect(c!.choices).toHaveLength(4);
    expect(c!.choices[c!.answerIndex]).toBe(c!.reading);
  });

  it('only ever asks about words containing kanji', () => {
    const mixed = [...POOL, vocab('ひらがな', 'ひらがな')];
    for (let seed = 0; seed < 40; seed++) {
      const c = buildKanjiChallenge(mixed, seed);
      if (c) expect(hasKanji(c.word)).toBe(true);
    }
  });

  it('never repeats the correct reading among the distractors', () => {
    for (let seed = 0; seed < 40; seed++) {
      const c = buildKanjiChallenge(POOL, seed);
      if (!c) continue;
      const occurrences = c.choices.filter((r) => r === c.reading).length;
      expect(occurrences).toBe(1);
    }
  });

  it('is stable across repeated calls with one seed', () => {
    expect(buildKanjiChallenge(POOL, 7)).toEqual(buildKanjiChallenge(POOL, 7));
  });

  it('returns null rather than a one-option quiz', () => {
    expect(buildKanjiChallenge([], 0)).toBeNull();
    expect(buildKanjiChallenge([vocab('ひらがな', 'ひらがな')], 0)).toBeNull();
    // A single kanji word has no pool to draw distractors from.
    expect(buildKanjiChallenge([vocab('水', 'みず')], 0)).toBeNull();
  });

  it('skips entries whose reading is just the word again', () => {
    const c = buildKanjiChallenge([vocab('水', '水'), vocab('学校', 'がっこう'), vocab('電車', 'でんしゃ')], 0);
    if (c) expect(c.word).not.toBe('水');
  });
});

describe('computeStudyVerdict', () => {
  const knowledge = (n: Partial<Record<WkLevel, number>>): Record<WkLevel, number> => ({
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    ...n,
  });

  it('always returns three votes and a consensus among them', () => {
    const v = computeStudyVerdict({
      streak: 4,
      todaySeconds: 600,
      knowledge: knowledge({ 1: 10, 3: 5 }),
      deckSize: 80,
    });
    expect(v.units).toHaveLength(3);
    expect(v.total).toBe(3);
    expect(v.units.map((u) => u.vote)).toContain(v.consensus);
  });

  it('agreement counts the units that actually voted for the consensus', () => {
    const v = computeStudyVerdict({
      streak: 0,
      todaySeconds: 0,
      knowledge: knowledge({ 1: 30 }),
      deckSize: 200,
    });
    const actual = v.units.filter((u) => u.vote === v.consensus).length;
    expect(v.agreement).toBe(actual);
    expect(v.agreement).toBeGreaterThanOrEqual(2);
  });

  it('recommends rest after a long session', () => {
    const v = computeStudyVerdict({
      streak: 10,
      todaySeconds: 60 * 60,
      knowledge: knowledge({ 3: 100 }),
      deckSize: 300,
    });
    expect(v.units.find((u) => u.id === 'casper')!.vote).toBe('rest');
  });

  it('recommends mining when the deck is nearly empty', () => {
    const v = computeStudyVerdict({
      streak: 0,
      todaySeconds: 0,
      knowledge: knowledge({}),
      deckSize: 3,
    });
    expect(v.units.find((u) => u.id === 'melchior')!.vote).toBe('mine');
  });

  it('recommends review when a large partially-learned pile has built up', () => {
    const v = computeStudyVerdict({
      streak: 1,
      todaySeconds: 120,
      knowledge: knowledge({ 1: 40, 2: 20 }),
      deckSize: 400,
    });
    expect(v.units.find((u) => u.id === 'balthasar')!.vote).toBe('review');
  });
});

describe('buildBountyBoard', () => {
  const levels: Record<string, WkLevel> = {
    食べる: 0,
    水: 3,
    学校: 1,
    電車: 2,
    図書館: 0,
  };
  const levelOf = (w: string): WkLevel => levels[w] ?? 0;

  it('excludes words the user already knows', () => {
    const board = buildBountyBoard(POOL, levelOf, 5);
    expect(board.map((b) => b.word)).not.toContain('水');
  });

  it('ranks least-known first', () => {
    const board = buildBountyBoard(POOL, levelOf, 5);
    const ranked = board.map((b) => levelOf(b.word));
    expect(ranked).toEqual([...ranked].sort((a, b) => a - b));
    expect(ranked[0]).toBe(0);
    expect(board.at(-1)!.word).toBe('電車'); // the only level-2 entry
  });

  it('breaks level ties by length, so the harder word leads', () => {
    const tied = [vocab('水', 'みず'), vocab('図書館', 'としょかん')];
    const board = buildBountyBoard(tied, () => 0, 5);
    expect(board[0].word).toBe('図書館');
  });

  it('pays more for less-known words', () => {
    const board = buildBountyBoard(POOL, levelOf, 5);
    const byWord = new Map(board.map((b) => [b.word, b.bounty]));
    expect(byWord.get('図書館')!).toBeGreaterThan(byWord.get('電車')!);
  });

  it('respects the count limit', () => {
    expect(buildBountyBoard(POOL, levelOf, 2)).toHaveLength(2);
  });

  it('returns empty when everything is known', () => {
    expect(buildBountyBoard(POOL, () => 3)).toEqual([]);
  });
});

describe('computeSessionGauge', () => {
  it('is cold before any meaningful study', () => {
    expect(computeSessionGauge(0, 0).band).toBe('cold');
  });

  it('reaches nominal at the daily target', () => {
    const g = computeSessionGauge(3, 30 * 60);
    expect(g.band).toBe('nominal');
    expect(g.pct).toBe(1);
  });

  it('clamps pct at 1 and reports overdrive past double the target', () => {
    const g = computeSessionGauge(3, 120 * 60);
    expect(g.pct).toBe(1);
    expect(g.band).toBe('overdrive');
  });

  it('reports minutes, not seconds', () => {
    expect(computeSessionGauge(1, 90).todayMinutes).toBe(1.5);
  });
});

describe('pickInterceptedTerm', () => {
  it('returns null for an empty pool', () => {
    expect(pickInterceptedTerm([], 0)).toBeNull();
  });

  it('is stable for one seed', () => {
    expect(pickInterceptedTerm(POOL, 12)).toEqual(pickInterceptedTerm(POOL, 12));
  });

  it('always returns a member of the pool', () => {
    const words = new Set(POOL.map((v) => v.word));
    for (let seed = 0; seed < 30; seed++) {
      expect(words.has(pickInterceptedTerm(POOL, seed)!.word)).toBe(true);
    }
  });
});
