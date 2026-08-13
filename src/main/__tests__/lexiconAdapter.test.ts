// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  enrichLexiconResultMetadata,
  lookupResultToDictResult,
} from '../dictionary/lexiconAdapter';
import type { LookupResult } from '../dictionary/dictService';

function result(overrides: Partial<LookupResult> = {}): LookupResult {
  return {
    query: '食べた',
    detectedLangs: ['ja'],
    entries: [
      {
        headwordId: 1,
        dictId: 'jmdict-en',
        dictTitle: 'JMdict (English)',
        lang: 'ja',
        text: '食べる',
        reading: 'たべる',
        readingNorm: 'たべる',
        via: 'deinflected',
        reasons: ['past'],
        score: 5,
        senses: [
          {
            pos: ['v1'],
            tags: ['common'],
            glosses: [{ lang: 'en', text: 'to eat', html: '<b>to eat</b>' }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('lookupResultToDictResult', () => {
  it('preserves sourced glosses, attribution, html, score and de-inflection', () => {
    const mapped = lookupResultToDictResult(result());
    expect(mapped.query).toBe('食べた');
    expect(mapped.entries[0]).toMatchObject({
      word: '食べる',
      reading: 'たべる',
      isCommon: true,
      source: 'JMdict (English)',
      sourceLangs: ['en'],
      glossaryHtml: '<b>to eat</b>',
      senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: ['common'] }],
    });
    expect(mapped.deinflection).toEqual({
      source: '食べた',
      term: '食べる',
      reasons: ['past'],
    });
  });

  it('flattens multilingual glosses without duplicating definitions', () => {
    const mapped = lookupResultToDictResult(result({
      query: 'есть',
      detectedLangs: ['ru'],
      entries: [
        {
          ...result().entries[0],
          via: 'gloss',
          reasons: [],
          score: 0,
          senses: [
            {
              pos: [],
              tags: [],
              glosses: [
                { lang: 'en', text: 'to eat' },
                { lang: 'en', text: 'to eat' },
                { lang: 'ru', text: 'есть' },
              ],
            },
          ],
        },
      ],
    }));
    expect(mapped.entries[0]?.isCommon).toBe(false);
    expect(mapped.entries[0]?.sourceLangs).toEqual(['en', 'ru']);
    expect(mapped.entries[0]?.senses[0]?.definitions).toEqual(['to eat', 'есть']);
    expect(mapped.deinflection).toBeUndefined();
  });

  it('returns a stable empty result for a lookup miss', () => {
    expect(lookupResultToDictResult(result({ query: 'missing', entries: [] }))).toEqual({
      query: 'missing',
      entries: [],
    });
  });

  it('marks a wholly approximate result as approximate', () => {
    const mapped = lookupResultToDictResult(result({
      query: 'たべりゅ',
      entries: [{ ...result().entries[0], via: 'fuzzy', reasons: [], fuzzyDistance: 1 }],
    }));
    expect(mapped.approximate).toBe(true);
    expect(mapped.deinflection).toBeUndefined();
  });

  it('does not call a result approximate while any entry really matched', () => {
    // The flag describes the rows being rendered, not the request that produced
    // them. One exact entry means the user's word was found.
    const mapped = lookupResultToDictResult(result({
      entries: [
        result().entries[0],
        { ...result().entries[0], headwordId: 2, via: 'fuzzy', reasons: [], fuzzyDistance: 1 },
      ],
    }));
    expect(mapped.approximate).toBeUndefined();
  });

  it('leaves an empty result unmarked', () => {
    expect(lookupResultToDictResult(result({ entries: [] })).approximate).toBeUndefined();
  });

  it('restores legacy pitch and frequency metadata after SQLite conversion', () => {
    const mapped = enrichLexiconResultMetadata(lookupResultToDictResult(result()), {
      pitchHtml: (word) => word === '食べる' ? '<span>たべる</span>' : '',
      frequency: (word) => word === '食べる' ? 420 : undefined,
    });
    expect(mapped.entries[0]).toMatchObject({
      pitchHtml: '<span>たべる</span>',
      frequency: 420,
    });
  });
});
