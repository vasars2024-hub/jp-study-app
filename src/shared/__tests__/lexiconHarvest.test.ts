import { describe, expect, it } from 'vitest';
import {
  MAX_HARVEST_SURFACES,
  harvestLexiconVocabulary,
  type LexiconVocabularyItem,
} from '../lexiconHarvest';
import {
  buildOfflineInterlinear,
  type LexiconInterlinearMatch,
  type LexiconInterlinearPart,
  type LexiconInterlinearResult,
  type LexiconLookupResult,
} from '../lexiconInterlinear';

function token(
  text: string,
  start: number,
  match?: Partial<LexiconInterlinearMatch>,
): LexiconInterlinearPart {
  return {
    kind: 'token',
    text,
    start,
    end: start + text.length,
    ...(match
      ? {
        match: {
          query: text,
          headwordId: 1,
          dictId: 'jmdict-en',
          dictTitle: 'JMdict (English)',
          text,
          reading: '',
          via: 'exact',
          score: 10,
          glosses: [],
          hasTargetGloss: false,
          ...match,
        },
      }
      : {}),
  };
}

function passage(parts: LexiconInterlinearPart[]): LexiconInterlinearResult {
  return {
    text: parts.map((part) => part.text).join(''),
    detectedLangs: ['ja'],
    glossLangs: ['en'],
    parts,
    tokenCount: parts.filter((part) => part.kind === 'token').length,
    matchedCount: parts.filter((part) => part.kind === 'token' && part.match).length,
    truncated: false,
  };
}

function byText(harvest: { items: LexiconVocabularyItem[] }, text: string) {
  return harvest.items.find((item) => item.text === text);
}

describe('harvestLexiconVocabulary', () => {
  it('collapses inflected surfaces onto the grounded headword and counts occurrences', () => {
    const harvest = harvestLexiconVocabulary(passage([
      token('食べた', 0, { text: '食べる', reading: 'たべる', via: 'deinflected', glosses: [{ lang: 'en', text: 'to eat' }], hasTargetGloss: true }),
      { kind: 'separator', text: '。', start: 3, end: 4 },
      token('食べる', 4, { text: '食べる', reading: 'たべる', glosses: [{ lang: 'en', text: 'to eat' }], hasTargetGloss: true }),
    ]));

    expect(harvest.items).toHaveLength(1);
    const item = harvest.items[0];
    expect(item.text).toBe('食べる');
    expect(item.reading).toBe('たべる');
    expect(item.count).toBe(2);
    expect(item.surfaces).toEqual(['食べた', '食べる']);
    expect(item.glosses).toEqual([{ lang: 'en', text: 'to eat' }]);
    expect(harvest.occurrences).toBe(2);
    expect(harvest.uniqueCount).toBe(1);
    expect(harvest.groundedCount).toBe(1);
    expect(harvest.capped).toBe(false);
  });

  it('keeps a token the dictionaries could not answer, marked rather than dropped', () => {
    const harvest = harvestLexiconVocabulary(passage([
      token('猫', 0, { reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }], hasTargetGloss: true }),
      token('ヴォルグ', 1),
    ]));

    expect(harvest.items.map((item) => [item.text, item.grounded])).toEqual([
      ['猫', true],
      ['ヴォルグ', false],
    ]);
    expect(byText(harvest, 'ヴォルグ')?.glosses).toEqual([]);
    expect(byText(harvest, 'ヴォルグ')?.reading).toBe('');
    expect(harvest.groundedCount).toBe(1);
  });

  it('treats one headword found in two dictionaries as one vocabulary row', () => {
    const harvest = harvestLexiconVocabulary(passage([
      token('猫', 0, { dictId: 'jmdict-en', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] }),
      token('猫', 1, { dictId: 'jmdict-ru', headwordId: 2, reading: 'ねこ', glosses: [{ lang: 'ru', text: 'кошка' }] }),
    ]));

    expect(harvest.items).toHaveLength(1);
    expect(harvest.items[0].count).toBe(2);
    // The row keeps the first occurrence's attribution rather than inventing a merged source.
    expect(harvest.items[0].dictId).toBe('jmdict-en');
  });

  it('orders by frequency and breaks ties by first appearance', () => {
    const harvest = harvestLexiconVocabulary(passage([
      token('one', 0), token('two', 3), token('two', 6), token('three', 9), token('one', 14),
    ]));

    expect(harvest.items.map((item) => `${item.text}:${item.count}`))
      .toEqual(['one:2', 'two:2', 'three:1']);
  });

  it('skips tokens that carry no letter at all', () => {
    const harvest = harvestLexiconVocabulary(passage([
      token('2026', 0), token('猫', 4, { reading: 'ねこ' }), token('％', 5),
    ]));

    expect(harvest.items.map((item) => item.text)).toEqual(['猫']);
    expect(harvest.occurrences).toBe(1);
  });

  it('folds case only for grouping and shows the passage spelling', () => {
    const harvest = harvestLexiconVocabulary(passage([token('The', 0), token('the', 4)]));

    expect(harvest.items).toHaveLength(1);
    expect(harvest.items[0].text).toBe('The');
    expect(harvest.items[0].surfaces).toEqual(['The', 'the']);
  });

  it('caps the row list by frequency and reports it separately from input truncation', () => {
    const parts: LexiconInterlinearPart[] = [];
    for (let index = 0; index < 5; index += 1) parts.push(token(`word${index}`, index * 6));
    // The last word is the only repeated one, so a cap of 1 must keep exactly it.
    parts.push(token('word4', 60));

    const harvest = harvestLexiconVocabulary(passage(parts), 1);
    expect(harvest.items.map((item) => item.text)).toEqual(['word4']);
    expect(harvest.uniqueCount).toBe(5);
    expect(harvest.capped).toBe(true);
    expect(harvest.occurrences).toBe(6);
  });

  it('bounds the surface list without losing the occurrence count', () => {
    const parts: LexiconInterlinearPart[] = [];
    for (let index = 0; index < MAX_HARVEST_SURFACES + 3; index += 1) {
      parts.push(token(`走${index}`, index * 3, { text: '走る', reading: 'はしる' }));
    }

    const harvest = harvestLexiconVocabulary(passage(parts));
    expect(harvest.items[0].surfaces).toHaveLength(MAX_HARVEST_SURFACES);
    expect(harvest.items[0].count).toBe(MAX_HARVEST_SURFACES + 3);
  });

  it('harvests a real interlinear build rather than only a hand-built shape', () => {
    const entries: Record<string, LexiconLookupResult> = {
      猫: {
        query: '猫',
        detectedLangs: ['ja'],
        entries: [{
          headwordId: 7,
          dictId: 'jmdict-en',
          dictTitle: 'JMdict (English)',
          text: '猫',
          reading: 'ねこ',
          via: 'exact',
          score: 10,
          senses: [{ glosses: [{ lang: 'en', text: 'cat' }] }],
        }],
      },
    };
    const result = buildOfflineInterlinear(
      '猫と猫',
      (query) => entries[query] ?? { query, detectedLangs: ['ja'], entries: [] },
      { glossLangs: ['en'], sourceLangs: ['ja'] },
    );

    const harvest = harvestLexiconVocabulary(result);
    const cat = byText(harvest, '猫');
    expect(cat?.count).toBe(2);
    expect(cat?.grounded).toBe(true);
    expect(cat?.glosses).toEqual([{ lang: 'en', text: 'cat' }]);
    expect(cat?.headwordId).toBe(7);
  });
});
