import { describe, expect, it } from 'vitest';
import {
  MAX_PINNABLE_SENSES,
  buildOfflineInterlinear,
  parallelGlossTargets,
  segmentLexiconText,
  type LexiconInterlinearToken,
  type LexiconLookupResult,
} from '../lexiconInterlinear';

function lookupMap(entries: Record<string, LexiconLookupResult>) {
  return (query: string): LexiconLookupResult => entries[query] ?? { query, detectedLangs: ['ja'], entries: [] };
}

function hit(
  query: string,
  over: Partial<LexiconLookupResult['entries'][number]> = {},
): LexiconLookupResult {
  return {
    query,
    detectedLangs: ['ja'],
    entries: [
      {
        headwordId: 1,
        dictId: 'jmdict-en',
        dictTitle: 'JMdict (English)',
        text: '食べる',
        reading: 'たべる',
        via: 'deinflected',
        score: 5,
        senses: [{ glosses: [{ lang: 'en', text: 'to eat' }, { lang: 'ru', text: 'есть' }] }],
        ...over,
      },
    ],
  };
}

/** The realistic parallel-target install: one dictionary per gloss language. */
function twoDictionaries(): LexiconLookupResult {
  return {
    query: '猫',
    detectedLangs: ['ja'],
    entries: [
      {
        headwordId: 1,
        dictId: 'jmdict-en',
        dictTitle: 'JMdict (English)',
        text: '猫',
        reading: 'ねこ',
        via: 'exact',
        score: 10,
        senses: [{ glosses: [{ lang: 'en', text: 'cat' }] }],
      },
      {
        headwordId: 2,
        dictId: 'jmdict-ru',
        dictTitle: 'JMdict (Russian)',
        text: '猫',
        reading: 'ねこ',
        via: 'exact',
        score: 4,
        senses: [{ glosses: [{ lang: 'ru', text: 'кошка' }] }],
      },
    ],
  };
}

describe('Lexicon Workbench offline interlinear', () => {
  it('keeps every separator and exposes only sourced target-language glosses', () => {
    const result = buildOfflineInterlinear(
      '食べた。\n猫',
      lookupMap({
        食べた: hit('食べた'),
        猫: hit('猫', {
          headwordId: 2,
          text: '猫',
          reading: 'ねこ',
          via: 'exact',
          senses: [{ glosses: [{ lang: 'en', text: 'cat' }, { lang: 'ru', text: 'кошка' }] }],
        }),
      }),
      { sourceLangs: ['ja'], glossLangs: ['ru'] },
    );

    expect(result.text).toBe('食べた。\n猫');
    expect(result.parts.map((part) => part.text).join('')).toBe(result.text);
    expect(result.parts.filter((part) => part.kind === 'separator').map((part) => part.text)).toEqual(['。', '\n']);
    expect(result.parts.filter((part) => part.kind === 'token').map((part) => part.text)).toEqual(['食べた', '猫']);
    expect(result.parts[0]).toMatchObject({
      kind: 'token',
      match: {
        text: '食べる',
        reading: 'たべる',
        via: 'deinflected',
        dictTitle: 'JMdict (English)',
        glosses: [{ lang: 'ru', text: 'есть' }],
        hasTargetGloss: true,
      },
    });
  });

  it('merges adjacent morphology fragments only when the database proves the surface', () => {
    const queries: string[] = [];
    const result = buildOfflineInterlinear('食べた猫', (query) => {
      queries.push(query);
      if (query === '食べた') return hit(query);
      if (query === '猫') {
        return hit(query, {
          headwordId: 2,
          text: '猫',
          reading: 'ねこ',
          via: 'exact',
          senses: [{ glosses: [{ lang: 'en', text: 'cat' }] }],
        });
      }
      return { query, detectedLangs: ['ja'], entries: [] };
    });

    const tokens = result.parts.filter((part): part is LexiconInterlinearToken => part.kind === 'token');
    expect(tokens.map((part) => part.text)).toEqual(['食べた', '猫']);
    expect(tokens.every((part) => part.match)).toBe(true);
    expect(queries).toContain('食べた');
    expect(result.matchedCount).toBe(2);
  });

  it('does not treat prefix search rows as grounded token glosses', () => {
    const result = buildOfflineInterlinear('食', () => ({
      query: '食',
      detectedLangs: ['ja'],
      entries: [{
        headwordId: 9,
        dictId: 'jmdict-en',
        dictTitle: 'JMdict (English)',
        text: '食べる',
        reading: 'たべる',
        via: 'prefix',
        score: 5,
        senses: [{ glosses: [{ lang: 'en', text: 'to eat' }] }],
      }],
    }));

    expect(result.parts).toEqual([{ kind: 'token', text: '食', start: 0, end: 1 }]);
    expect(result.matchedCount).toBe(0);
  });

  it('chooses a later source entry when the requested target is absent from the first source', () => {
    const result = buildOfflineInterlinear('猫', () => ({
      query: '猫',
      detectedLangs: ['ja'],
      entries: [
        {
          headwordId: 1,
          dictId: 'jmdict-en',
          dictTitle: 'JMdict (English)',
          text: '猫',
          reading: 'ねこ',
          via: 'exact',
          score: 10,
          senses: [{ glosses: [{ lang: 'en', text: 'cat' }] }],
        },
        {
          headwordId: 2,
          dictId: 'jmdict-ru',
          dictTitle: 'JMdict (Russian)',
          text: '猫',
          reading: 'ねこ',
          via: 'exact',
          score: 1,
          senses: [{ glosses: [{ lang: 'ru', text: 'кошка' }] }],
        },
      ],
    }), { glossLangs: ['ru'] });

    expect(result.parts[0]).toMatchObject({
      kind: 'token',
      match: { dictTitle: 'JMdict (Russian)', glosses: [{ lang: 'ru', text: 'кошка' }] },
    });
  });

  it('bounds long input without changing the represented offsets', () => {
    const result = buildOfflineInterlinear('猫猫猫', () => ({ query: '猫', entries: [] }), { maxChars: 2 });
    expect(result).toMatchObject({ text: '猫猫', truncated: true, tokenCount: 2 });
    expect(result.parts.at(-1)?.end).toBe(2);
  });

  it('keeps a single requested target on the shape it had before parallel targets', () => {
    const result = buildOfflineInterlinear('猫', () => twoDictionaries(), { glossLangs: ['en'] });

    const match = (result.parts[0] as LexiconInterlinearToken).match;
    expect(match?.glosses).toEqual([{ lang: 'en', text: 'cat' }]);
    expect(match).not.toHaveProperty('parallel');
  });

  it('reads a second target off a sibling entry for the same headword', () => {
    const result = buildOfflineInterlinear('猫', () => twoDictionaries(), { glossLangs: ['en', 'ru'] });

    const match = (result.parts[0] as LexiconInterlinearToken).match;
    expect(match?.parallel).toEqual([
      { lang: 'en', dictId: 'jmdict-en', dictTitle: 'JMdict (English)', glosses: [{ lang: 'en', text: 'cat' }] },
      { lang: 'ru', dictId: 'jmdict-ru', dictTitle: 'JMdict (Russian)', glosses: [{ lang: 'ru', text: 'кошка' }] },
    ]);
    // The flat list stays the union, so an unaware consumer still shows both.
    expect(match?.glosses).toEqual([{ lang: 'en', text: 'cat' }, { lang: 'ru', text: 'кошка' }]);
    expect(match?.dictTitle).toBe('JMdict (English)');
    expect(result.glossLangs).toEqual(['en', 'ru']);
  });

  it('never borrows a parallel gloss from a different headword that merely ranked nearby', () => {
    const result = buildOfflineInterlinear('猫', () => {
      const base = twoDictionaries();
      base.entries[1] = { ...base.entries[1], headwordId: 7, text: '犬', reading: 'いぬ' };
      return base;
    }, { glossLangs: ['en', 'ru'] });

    const match = (result.parts[0] as LexiconInterlinearToken).match;
    expect(match?.parallel).toEqual([
      { lang: 'en', dictId: 'jmdict-en', dictTitle: 'JMdict (English)', glosses: [{ lang: 'en', text: 'cat' }] },
    ]);
    expect(match?.glosses).toEqual([{ lang: 'en', text: 'cat' }]);
  });

  it('carries the pinnable senses of a polysemous entry, keeping their source index', () => {
    const result = buildOfflineInterlinear('見た', () => hit('見た', {
      text: '見る',
      reading: 'みる',
      senses: [
        { glosses: [{ lang: 'ru', text: 'смотреть' }] },
        { glosses: [{ lang: 'en', text: 'to look after' }] },
        { glosses: [{ lang: 'ru', text: 'считать' }, { lang: 'en', text: 'to judge' }] },
      ],
    }), { glossLangs: ['ru'] });

    const match = (result.parts[0] as LexiconInterlinearToken).match;
    // The English-only sense is dropped, but sense 2 keeps index 2 so a pin
    // still names the same sense when the target languages change.
    expect(match?.senses).toEqual([
      { index: 0, glosses: [{ lang: 'ru', text: 'смотреть' }] },
      { index: 2, glosses: [{ lang: 'ru', text: 'считать' }] },
    ]);
  });

  it('omits the sense list when the entry offers no choice in the requested targets', () => {
    const single = buildOfflineInterlinear('猫', () => twoDictionaries(), { glossLangs: ['en'] });
    expect((single.parts[0] as LexiconInterlinearToken).match).not.toHaveProperty('senses');

    const filtered = buildOfflineInterlinear('見た', () => hit('見た', {
      senses: [
        { glosses: [{ lang: 'ru', text: 'смотреть' }] },
        { glosses: [{ lang: 'en', text: 'to look after' }] },
      ],
    }), { glossLangs: ['ru'] });
    expect((filtered.parts[0] as LexiconInterlinearToken).match).not.toHaveProperty('senses');
  });

  it('collects senses split across sibling entries, which is how the legacy stores answer', () => {
    // The shape a live probe of 見る returned: JMdict's senses arrive as separate
    // entries of one sense each, never as one entry with a sense list.
    const sibling = (id: number, definition: string) => ({
      headwordId: -id,
      dictId: 'bundled-jmdict-en',
      dictTitle: 'JMdict (Japanese–English)',
      text: '見る',
      reading: 'みる',
      via: 'deinflected' as const,
      score: 1,
      senses: [{ glosses: [{ lang: 'en', text: definition }] }],
    });
    const result = buildOfflineInterlinear('見た', () => ({
      query: '見た',
      detectedLangs: ['ja'],
      entries: [
        sibling(1, 'to see'),
        sibling(2, 'to examine'),
        // Neither a different headword nor a different dictionary may be folded
        // in: their sense numbering is not this dictionary's.
        { ...sibling(3, 'to look after'), text: '観る' },
        { ...sibling(4, 'смотреть'), dictId: 'bundled-jmdict-ru' },
      ],
    }), { glossLangs: ['en'] });

    const match = (result.parts[0] as LexiconInterlinearToken).match;
    expect(match?.senses).toEqual([
      { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
      { index: 1, glosses: [{ lang: 'en', text: 'to examine' }] },
    ]);
    // The unpinned line keeps showing only the entry the lookup chose.
    expect(match?.glosses).toEqual([{ lang: 'en', text: 'to see' }]);
  });

  it('bounds how many senses one token can carry into a passage-scale result', () => {
    const senses = Array.from({ length: MAX_PINNABLE_SENSES + 4 }, (_unused, index) => ({
      glosses: [{ lang: 'en', text: `sense ${index}` }],
    }));
    const result = buildOfflineInterlinear('見た', () => hit('見た', { senses }), { glossLangs: ['en'] });

    const match = (result.parts[0] as LexiconInterlinearToken).match;
    expect(match?.senses).toHaveLength(MAX_PINNABLE_SENSES);
    expect(match?.senses?.at(-1)?.index).toBe(MAX_PINNABLE_SENSES - 1);
  });

  it('derives parallel targets from the installed dictionaries, primary first', () => {
    const dicts = [
      { hasTerms: true, glossLangs: ['en'] },
      { hasTerms: true, glossLangs: ['en'] },
      { hasTerms: true, glossLangs: ['de'], glossLangOverride: 'ru' },
      { hasTerms: true, enabled: false, glossLangs: ['fr'] },
      { hasTerms: false, glossLangs: ['es'] },
      { hasTerms: true, glossLangs: ['ZH '] },
    ];

    expect(parallelGlossTargets('ru', dicts)).toEqual(['ru', 'en', 'zh']);
    expect(parallelGlossTargets('en', dicts, 2)).toEqual(['en', 'ru']);
    expect(parallelGlossTargets('en', [])).toEqual(['en']);
  });

  it('keeps a stable fallback segmentation contract for punctuation and spaces', () => {
    const parts = segmentLexiconText('cat, 猫。');
    expect(parts.map((part) => [part.text, part.wordLike])).toEqual([
      ['cat', true],
      [',', false],
      [' ', false],
      ['猫', true],
      ['。', false],
    ]);
  });
});
