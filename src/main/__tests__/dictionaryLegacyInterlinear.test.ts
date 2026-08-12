// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { legacyBatchToLookupResult } from '../dictionary/legacyInterlinear';
import { buildOfflineInterlinear } from '../../shared/lexiconInterlinear';
import type { DictEntry, YomitanDictInfo } from '../../shared/types';

function info(id: string, title: string, glossLangs: string[]): YomitanDictInfo {
  return {
    id,
    title,
    revision: 'fixture',
    priority: 0,
    hasTerms: true,
    hasPitch: false,
    hasFreq: false,
    importedAt: 0,
    glossLangs,
  };
}

const DICTS: YomitanDictInfo[] = [
  info('bundled-jmdict-en', 'JMdict (Japanese–English)', ['en']),
  info('bundled-jmdict-ru', 'JMdict (Japanese–Russian)', ['ru']),
];

function entry(overrides: Partial<DictEntry> = {}): DictEntry {
  return {
    word: '猫',
    reading: 'ねこ',
    isCommon: true,
    jlpt: [],
    senses: [{ partsOfSpeech: ['n'], definitions: ['cat'], tags: [] }],
    source: 'JMdict (Japanese–English)',
    sourceLangs: ['en'],
    ...overrides,
  };
}

describe('legacyBatchToLookupResult', () => {
  it('resolves the dictionary id back from the title the entry was tagged with', () => {
    const result = legacyBatchToLookupResult('猫', { entries: [entry()] }, DICTS);

    expect(result.entries[0]).toMatchObject({
      dictId: 'bundled-jmdict-en',
      dictTitle: 'JMdict (Japanese–English)',
      text: '猫',
      reading: 'ねこ',
      via: 'exact',
      senses: [{ glosses: [{ lang: 'en', text: 'cat' }] }],
    });
  });

  it('keeps an unregistered title as the id rather than inventing or blanking one', () => {
    const result = legacyBatchToLookupResult(
      '猫',
      { entries: [entry({ source: 'A dictionary nobody registered' })] },
      DICTS,
    );

    expect(result.entries[0].dictId).toBe('A dictionary nobody registered');
    expect(result.entries[0].dictTitle).toBe('A dictionary nobody registered');
  });

  it('gives every entry a distinct negative headword id so a SQLite rowid can never collide', () => {
    const result = legacyBatchToLookupResult(
      '猫',
      { entries: [entry(), entry({ source: 'JMdict (Japanese–Russian)', sourceLangs: ['ru'] })] },
      DICTS,
    );
    const ids = result.entries.map((row) => row.headwordId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id < 0)).toBe(true);
  });

  it('carries the conjugation path onto every entry of a de-inflected batch', () => {
    const result = legacyBatchToLookupResult(
      '食べた',
      {
        entries: [entry({ word: '食べる', reading: 'たべる', senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [] }] })],
        deinflection: { source: '食べた', term: '食べる', reasons: ['past'] },
      },
      DICTS,
    );

    expect(result.entries[0]).toMatchObject({ via: 'deinflected', reasons: ['past'] });
  });

  it('falls back to en for a store that never declared a gloss language', () => {
    const result = legacyBatchToLookupResult('猫', { entries: [entry({ sourceLangs: undefined })] }, DICTS);

    expect(result.entries[0].senses[0].glosses[0].lang).toBe('en');
  });

  it('puts the structured glossary HTML on the first gloss of the first sense only', () => {
    const result = legacyBatchToLookupResult(
      '猫',
      {
        entries: [entry({
          glossaryHtml: '<div>cat</div>',
          senses: [
            { partsOfSpeech: ['n'], definitions: ['cat', 'feline'], tags: [] },
            { partsOfSpeech: ['n'], definitions: ['shamisen'], tags: [] },
          ],
        })],
      },
      DICTS,
    );
    const [first, second] = result.entries[0].senses;

    expect(first.glosses[0].html).toBe('<div>cat</div>');
    expect(first.glosses[1].html).toBeUndefined();
    expect(second.glosses[0].html).toBeUndefined();
  });

  it('grounds an interlinear token, including a parallel gloss read off a sibling dictionary', () => {
    const result = buildOfflineInterlinear(
      '猫',
      (query) => legacyBatchToLookupResult(
        query,
        {
          entries: [
            entry(),
            entry({
              source: 'JMdict (Japanese–Russian)',
              sourceLangs: ['ru'],
              senses: [{ partsOfSpeech: ['n'], definitions: ['кошка'], tags: [] }],
            }),
          ],
        },
        DICTS,
      ),
      { sourceLangs: ['ja'], glossLangs: ['en', 'ru'] },
    );

    expect(result.matchedCount).toBe(1);
    expect(result.parts[0]).toMatchObject({
      kind: 'token',
      match: {
        hasTargetGloss: true,
        parallel: [
          { lang: 'en', dictId: 'bundled-jmdict-en', glosses: [{ lang: 'en', text: 'cat' }] },
          { lang: 'ru', dictId: 'bundled-jmdict-ru', glosses: [{ lang: 'ru', text: 'кошка' }] },
        ],
      },
    });
  });
});
