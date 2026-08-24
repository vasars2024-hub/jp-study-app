import { describe, expect, it } from 'vitest';

import {
  LEXICON_WILD_CACHE_TTL_MS,
  LEXICON_WILD_SOURCE_CLASSES,
  MAX_WILD_CITATIONS_PER_CLASS,
  buildLexiconWildResult,
  lexiconWildBand,
  lexiconWildCacheKey,
  lexiconWildKey,
  putLexiconWildCache,
  rankLexiconWild,
  readLexiconWildCache,
  type LexiconWildCitation,
  type LexiconWildSourceStatus,
} from '../lexiconWild';

function citation(over: Partial<LexiconWildCitation> = {}): LexiconWildCitation {
  return {
    sourceClass: 'subtitles',
    sourceId: 'm1',
    title: 'Show',
    text: '猫が好きです。',
    terms: ['猫'],
    ...over,
  };
}

describe('lexiconWildBand', () => {
  it('reads a rank as a position in the installed list, and refuses to guess without one', () => {
    expect(lexiconWildBand(1)).toBe('core');
    expect(lexiconWildBand(1_500)).toBe('core');
    expect(lexiconWildBand(1_501)).toBe('common');
    expect(lexiconWildBand(5_001)).toBe('wider');
    expect(lexiconWildBand(15_001)).toBe('rare');
    expect(lexiconWildBand(undefined)).toBe('unranked');
    expect(lexiconWildBand(0)).toBe('unranked');
    expect(lexiconWildBand(Number.NaN)).toBe('unranked');
  });
});

describe('rankLexiconWild', () => {
  it('puts the pinned sense first, a stated other sense next, and an unknown sense last', () => {
    const ranked = rankLexiconWild(
      [
        citation({ sourceId: 'c', text: 'unknown sense line', senseIndex: undefined }),
        citation({ sourceId: 'b', text: 'other sense line', senseIndex: 3 }),
        citation({ sourceId: 'a', text: 'pinned sense line', senseIndex: 1 }),
      ],
      { pinnedSense: 1 },
    );
    expect(ranked.map((item) => item.senseMatch)).toEqual(['pinned', 'other', 'unknown']);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it('never calls anything a pinned match when no sense is pinned', () => {
    const ranked = rankLexiconWild([citation({ senseIndex: 1 })], {});
    expect(ranked[0].senseMatch).toBe('unknown');
  });

  it('orders by distance from the learner band and breaks a tie toward the easier line', () => {
    const ranks: Record<string, number> = { easy: 900, mid: 3_000, hard: 20_000 };
    const ranked = rankLexiconWild(
      [
        citation({ sourceId: 'hard', text: 'hard' }),
        citation({ sourceId: 'easy', text: 'easy' }),
        citation({ sourceId: 'mid', text: 'mid' }),
      ],
      { learnerBand: 'common', resolveRank: (item) => ranks[item.sourceId] },
    );
    // `common` itself first; then core and wider are both one band away, and the
    // easier of the two wins.
    expect(ranked.map((item) => item.sourceId)).toEqual(['mid', 'easy', 'hard']);
    expect(ranked.map((item) => item.band)).toEqual(['common', 'core', 'rare']);
  });

  it('ranks a citation no frequency list can speak for below every ranked one', () => {
    const ranked = rankLexiconWild(
      [citation({ sourceId: 'none', text: 'none' }), citation({ sourceId: 'rare', text: 'rare' })],
      { learnerBand: 'core', resolveRank: (item) => (item.sourceId === 'rare' ? 20_000 : undefined) },
    );
    expect(ranked.map((item) => item.band)).toEqual(['rare', 'unranked']);
    expect(ranked[1].hardestRank).toBeUndefined();
  });

  it('keeps unranked last even for an advanced learner, where it is nominally "closest"', () => {
    // `rare` sits beside `unranked` in the band array, so a naive distance would
    // hand an advanced learner the citation nothing can speak for, ahead of a
    // core-vocabulary one. Coverage is not rarity.
    const ranked = rankLexiconWild(
      [citation({ sourceId: 'none', text: 'none' }), citation({ sourceId: 'core', text: 'core' })],
      { learnerBand: 'rare', resolveRank: (item) => (item.sourceId === 'core' ? 200 : undefined) },
    );
    expect(ranked.map((item) => item.band)).toEqual(['core', 'unranked']);
  });

  it('prefers the citation covering more terms, then the shorter one', () => {
    const ranked = rankLexiconWild([
      citation({ sourceId: 'short', text: '猫。', terms: ['猫'] }),
      citation({ sourceId: 'long', text: '猫と犬がとても仲良く暮らしています。', terms: ['猫'] }),
      citation({ sourceId: 'both', text: '猫と犬がいるとても長い一文です。', terms: ['猫', '犬'] }),
    ]);
    expect(ranked.map((item) => item.sourceId)).toEqual(['both', 'short', 'long']);
  });

  it('is stable regardless of the order the corpora answered in', () => {
    const items = [
      citation({ sourceId: 'a', text: '同じ長さの文' }),
      citation({ sourceId: 'b', text: '同じ長さの文' }),
      citation({ sourceId: 'c', text: '同じ長さの文' }),
    ];
    const forward = rankLexiconWild(items).map((item) => item.sourceId);
    const reversed = rankLexiconWild([...items].reverse()).map((item) => item.sourceId);
    expect(forward).toEqual(reversed);
  });

  it('drops a duplicate the same line reached through two classes', () => {
    const ranked = rankLexiconWild([
      citation({ sourceClass: 'subtitles', sourceId: 'm1', text: '猫が好きです。' }),
      citation({ sourceClass: 'subtitles', sourceId: 'm1', text: ' 猫が好きです。 ' }),
    ]);
    expect(ranked).toHaveLength(1);
  });

  it('keeps one copy of a line four different tracks carry, and keeps the best-ranked one', () => {
    // The live defect: an opening, two endings and the episode that shares them
    // returned the same cue four times, from four real media ids.
    const shared = 'もっとも あの父親の元では…';
    const ranked = rankLexiconWild(
      [
        citation({ sourceId: 'op', text: shared }),
        citation({ sourceId: 'ed1', text: `もっとも あの父親の元では…` }),
        citation({ sourceId: 'ed2', text: `もっとも  あの父親の元では…\n` }),
        citation({ sourceId: 'ep01', text: shared, terms: ['猫', '犬'] }),
      ],
    );
    expect(ranked).toHaveLength(1);
    // Two terms covered, so `ep01` outranks the three one-term copies.
    expect(ranked[0].sourceId).toBe('ep01');
  });

  it('keeps a subtitle locator so a citation can be played, not only read', () => {
    const ranked = rankLexiconWild([citation({ start: 12.5, end: 14 })]);
    expect(ranked[0].start).toBe(12.5);
    expect(ranked[0].end).toBe(14);
    expect(lexiconWildKey(citation({ start: 12.5 }))).not.toBe(lexiconWildKey(citation({ start: 13 })));
  });

  it('caps each class so one large library cannot crowd out the others', () => {
    const many: LexiconWildCitation[] = [];
    for (let i = 0; i < 20; i += 1) {
      many.push(citation({ sourceId: `m${i}`, text: `字幕${i}` }));
    }
    many.push(citation({ sourceClass: 'examples', sourceId: 'e1', text: '例文' }));
    const ranked = rankLexiconWild(many);
    expect(ranked.filter((item) => item.sourceClass === 'subtitles')).toHaveLength(
      MAX_WILD_CITATIONS_PER_CLASS,
    );
    expect(ranked.some((item) => item.sourceClass === 'examples')).toBe(true);
  });

  it('drops a citation with no text or no terms rather than showing an empty row', () => {
    expect(rankLexiconWild([citation({ text: '   ' }), citation({ terms: [] })])).toEqual([]);
  });
});

describe('buildLexiconWildResult', () => {
  const statuses: LexiconWildSourceStatus[] = [
    { sourceClass: 'subtitles', state: 'ready', scanned: 4, matched: 0 },
    { sourceClass: 'examples', state: 'ready', scanned: 1, matched: 0 },
    { sourceClass: 'library', state: 'unavailable', reason: 'no-corpus', scanned: 0, matched: 0 },
  ];

  it('reports every class, and separates "nothing installed" from "nothing found"', () => {
    const result = buildLexiconWildResult([citation()], statuses);
    expect(result.sources).toHaveLength(LEXICON_WILD_SOURCE_CLASSES.length);
    const byClass = Object.fromEntries(result.sources.map((item) => [item.sourceClass, item]));
    expect(byClass.subtitles.state).toBe('ready');
    expect(byClass.subtitles.matched).toBe(1);
    // Read and found nothing — an honest empty, not an absence.
    expect(byClass.examples.state).toBe('empty');
    expect(byClass.examples.scanned).toBe(1);
    // Named absence, with the reason the user can act on.
    expect(byClass.library.state).toBe('unavailable');
    expect(byClass.library.reason).toBe('no-corpus');
  });

  it('calls a class nobody reported unavailable with no reader, never empty', () => {
    const result = buildLexiconWildResult([], statuses);
    const news = result.sources.find((item) => item.sourceClass === 'news');
    expect(news).toEqual({ sourceClass: 'news', state: 'unavailable', reason: 'no-reader', scanned: 0, matched: 0 });
  });

  it('counts what a class contributed before the cap, so a cap does not look like a quiet corpus', () => {
    const many = Array.from({ length: 20 }, (_, i) => citation({ sourceId: `m${i}`, text: `字幕${i}` }));
    const result = buildLexiconWildResult(many, statuses);
    const subtitles = result.sources.find((item) => item.sourceClass === 'subtitles');
    expect(subtitles?.matched).toBe(20);
    expect(result.gathered).toBe(20);
    expect(result.citations.length).toBe(MAX_WILD_CITATIONS_PER_CLASS);
  });
});

describe('offline reuse', () => {
  it('keys on the question — the terms and classes — not on the sense or band', () => {
    expect(lexiconWildCacheKey(['猫', '犬'], ['subtitles', 'examples']))
      .toBe(lexiconWildCacheKey(['犬', '猫', '猫'], ['examples', 'subtitles']));
    expect(lexiconWildCacheKey(['猫'], ['subtitles']))
      .not.toBe(lexiconWildCacheKey(['猫'], ['subtitles', 'examples']));
  });

  it('returns a fresh entry and refuses an expired one', () => {
    const result = buildLexiconWildResult([citation()], []);
    const entries = putLexiconWildCache([], { key: 'k', at: 1_000, result });
    expect(readLexiconWildCache(entries, 'k', 1_000 + LEXICON_WILD_CACHE_TTL_MS - 1)?.result).toBe(result);
    expect(readLexiconWildCache(entries, 'k', 1_000 + LEXICON_WILD_CACHE_TTL_MS)).toBeUndefined();
    expect(readLexiconWildCache(entries, 'missing', 1_000)).toBeUndefined();
  });

  it('keeps the newest write for a key and stays bounded', () => {
    const result = buildLexiconWildResult([citation()], []);
    let entries = putLexiconWildCache([], { key: 'k', at: 1, result });
    entries = putLexiconWildCache(entries, { key: 'k', at: 2, result });
    expect(entries).toHaveLength(1);
    expect(entries[0].at).toBe(2);
    for (let i = 0; i < 40; i += 1) {
      entries = putLexiconWildCache(entries, { key: `k${i}`, at: 2, result });
    }
    expect(entries.length).toBeLessThanOrEqual(16);
    expect(entries[0].key).toBe('k39');
  });
});
