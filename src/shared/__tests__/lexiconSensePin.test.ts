import { describe, expect, it } from 'vitest';
import type { LexiconInterlinearMatch, LexiconInterlinearResult } from '../lexiconInterlinear';
import { applySensePin, applySensePins, canPinSense, sensePinKey } from '../lexiconSensePin';

function match(over: Partial<LexiconInterlinearMatch> = {}): LexiconInterlinearMatch {
  return {
    query: '見た',
    headwordId: 3,
    dictId: 'jmdict-en',
    dictTitle: 'JMdict (English)',
    text: '見る',
    reading: 'みる',
    via: 'deinflected',
    score: 8,
    glosses: [
      { lang: 'en', text: 'to see' },
      { lang: 'en', text: 'to look after' },
    ],
    senses: [
      { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
      { index: 1, glosses: [{ lang: 'en', text: 'to look after' }] },
    ],
    hasTargetGloss: true,
    ...over,
  };
}

function passage(parts: LexiconInterlinearResult['parts']): LexiconInterlinearResult {
  return {
    text: '見た。見た。',
    detectedLangs: ['ja'],
    glossLangs: ['en'],
    parts,
    tokenCount: parts.filter((part) => part.kind === 'token').length,
    matchedCount: parts.filter((part) => part.kind === 'token' && part.match).length,
    truncated: false,
  };
}

describe('Lexicon Workbench sense pinning', () => {
  it('offers a pin only where the entry gives a real choice', () => {
    expect(canPinSense(match())).toBe(true);
    expect(canPinSense(match({ senses: [{ index: 0, glosses: [{ lang: 'en', text: 'to see' }] }] }))).toBe(false);
    expect(canPinSense(match({ senses: undefined }))).toBe(false);
  });

  it('keys a pin to the headword in its own dictionary, not to the surface form', () => {
    expect(sensePinKey(match())).toBe(sensePinKey(match({ query: '見て', via: 'deinflected' })));
    expect(sensePinKey(match())).not.toBe(sensePinKey(match({ dictId: 'jmdict-ru' })));
    expect(sensePinKey(match())).not.toBe(sensePinKey(match({ reading: 'みえる' })));
  });

  it('narrows the gloss line to the pinned sense without touching the sense list', () => {
    const pinned = applySensePin(match(), 1);
    expect(pinned.glosses).toEqual([{ lang: 'en', text: 'to look after' }]);
    expect(pinned.pinnedSense).toBe(1);
    expect(pinned.senses).toHaveLength(2);
    expect(pinned.hasTargetGloss).toBe(true);
  });

  it('leaves a match alone when the pin names no sense it has', () => {
    const base = match();
    expect(applySensePin(base, 9)).toBe(base);
    expect(applySensePin(match({ senses: undefined }), 0)).toEqual(match({ senses: undefined }));
  });

  it('narrows only the chosen entry’s own parallel line and keeps sibling dictionaries', () => {
    const pinned = applySensePin(match({
      glosses: [
        { lang: 'en', text: 'to see' },
        { lang: 'en', text: 'to look after' },
        { lang: 'ru', text: 'смотреть' },
      ],
      senses: [
        { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
        { index: 1, glosses: [{ lang: 'en', text: 'to look after' }] },
      ],
      parallel: [
        {
          lang: 'en',
          dictId: 'jmdict-en',
          dictTitle: 'JMdict (English)',
          glosses: [{ lang: 'en', text: 'to see' }, { lang: 'en', text: 'to look after' }],
        },
        {
          lang: 'ru',
          dictId: 'jmdict-ru',
          dictTitle: 'JMdict (Russian)',
          glosses: [{ lang: 'ru', text: 'смотреть' }],
        },
      ],
    }), 0);

    expect(pinned.parallel).toEqual([
      {
        lang: 'en',
        dictId: 'jmdict-en',
        dictTitle: 'JMdict (English)',
        glosses: [{ lang: 'en', text: 'to see' }],
      },
      {
        lang: 'ru',
        dictId: 'jmdict-ru',
        dictTitle: 'JMdict (Russian)',
        glosses: [{ lang: 'ru', text: 'смотреть' }],
      },
    ]);
    expect(pinned.glosses).toEqual([
      { lang: 'en', text: 'to see' },
      { lang: 'ru', text: 'смотреть' },
    ]);
  });

  it('applies one pin to every occurrence of the headword in the passage', () => {
    const result = passage([
      { kind: 'token', text: '見た', start: 0, end: 2, match: match() },
      { kind: 'separator', text: '。', start: 2, end: 3 },
      { kind: 'token', text: '見た', start: 3, end: 5, match: match({ query: '見た' }) },
      { kind: 'separator', text: '。', start: 5, end: 6 },
    ]);

    const pinned = applySensePins(result, { [sensePinKey(match())]: 1 });
    const glosses = pinned.parts
      .filter((part) => part.kind === 'token')
      .map((part) => (part.kind === 'token' ? part.match?.glosses : undefined));
    expect(glosses).toEqual([
      [{ lang: 'en', text: 'to look after' }],
      [{ lang: 'en', text: 'to look after' }],
    ]);
    // The source result is never mutated: the pin is a view over it.
    expect((result.parts[0] as { match?: LexiconInterlinearMatch }).match?.glosses).toHaveLength(2);
  });

  it('returns the same result object when no pin changes anything', () => {
    const result = passage([{ kind: 'token', text: '見た', start: 0, end: 2, match: match() }]);
    expect(applySensePins(result, {})).toBe(result);
    expect(applySensePins(result, { 'other-word': 0 })).toBe(result);
    expect(applySensePins(result, { [sensePinKey(match())]: 9 })).toBe(result);
  });
});
