// @vitest-environment jsdom
// jsdom because the adapter reaches `window.api` for the engine config, the
// preset lists and — for a chapter-range run — `miningAnalyzeEpub`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiEnrichmentResult, EpubMiningAnalysis, MiningCandidate } from '../../shared/mining';
import {
  bookRangeTerms,
  cardStudioCardRows,
  createCardStudioAgentHandlers,
  resolveCardStudioBookScope,
  resolveGenerationSource,
} from '../cardStudioAgentHandlers';

/** Keys pass through, so an assertion names the key rather than a translation. */
const t = (key: string): string => key;

const candidate = (patch: Partial<MiningCandidate> & { expression: string }): MiningCandidate => ({
  count: 1,
  sampleSentence: '',
  frequencies: {} as MiningCandidate['frequencies'],
  ...patch,
});

const analysis = (patch: Partial<EpubMiningAnalysis> = {}): EpubMiningAnalysis => ({
  itemId: 'item-1',
  title: '夜のカフェ',
  totalCharacters: 1200,
  analyzer: 'kuromoji',
  candidates: [candidate({ expression: '珈琲', count: 3, sampleSentence: '珈琲を飲んだ。' })],
  generatedAt: 1,
  sections: [
    { index: 1, title: 'まえがき', href: 'a.xhtml' },
    { index: 2, title: '第一章', href: 'b.xhtml' },
    { index: 3, title: '第二章', href: 'c.xhtml' },
  ],
  ...patch,
}) as EpubMiningAnalysis;

const enrichment = (expression: string): AiEnrichmentResult =>
  ({
    expression,
    reading: 'コーヒー',
    meaning: 'coffee',
    sentence: '珈琲を飲んだ。',
    cards: [{ front: expression, back: 'coffee' }],
  }) as unknown as AiEnrichmentResult;

let analyzeEpub: ReturnType<typeof vi.fn>;
let generateDeck: ReturnType<typeof vi.fn>;

/**
 * Everything the renderer persists lives in `localStorage` — the deck store
 * (`flashcardDeck.ts`), saved words, mining config. Snapshotting the whole of it
 * measures "wrote nothing" against every path at once, including ones this test
 * did not think to name, which naming individual API methods would not.
 */
const storageSnapshot = (): string => {
  const keys = Object.keys(localStorage).sort();
  return JSON.stringify(keys.map((key) => [key, localStorage.getItem(key)]));
};

beforeEach(() => {
  analyzeEpub = vi.fn(async () => analysis());
  generateDeck = vi.fn(async () => [enrichment('珈琲')]);
  (window as unknown as { api: Record<string, unknown> }).api = {
    aiGetConfig: async () => ({
      engine: 'cloud',
      apiKeySet: true,
      selectedPresetId: 'preset-a',
      selectedFormatId: 'format-a',
      cardCount: 2,
      frontLang: 'ja',
      backLang: 'en',
      reverse: false,
      backGlossLangs: [],
    }),
    aiListPresets: async () => [],
    aiListFormats: async () => [],
    aiGenerateDeck: generateDeck,
    miningAnalyzeEpub: analyzeEpub,
    miningListEpubSections: async () => ({ itemId: 'item-1', title: '夜のカフェ', sections: [] }),
  };
  localStorage.clear();
});

const run = async (arguments_: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const handler = createCardStudioAgentHandlers(t)['flashcard.generate-cards'];
  // An adapter that stopped installing the operation would otherwise surface as a
  // TypeError inside each test rather than as the one fact that changed.
  if (!handler) throw new Error('the adapter no longer installs flashcard.generate-cards');
  return (await handler(arguments_)) as Record<string, unknown>;
};

describe('resolveGenerationSource', () => {
  it('reads the three spellings a planner uses for a book run', () => {
    expect(resolveGenerationSource('book')).toBe('book');
    expect(resolveGenerationSource('epub')).toBe('book');
    expect(resolveGenerationSource('chapter')).toBe('book');
  });

  it('falls back to preset rather than to book, so an unknown source cannot mine', () => {
    expect(resolveGenerationSource('dictionary')).toBe('dictionary');
    expect(resolveGenerationSource(undefined)).toBe('preset');
    expect(resolveGenerationSource('nonsense')).toBe('preset');
    expect(resolveGenerationSource(7)).toBe('preset');
  });
});

describe('bookRangeTerms', () => {
  it('takes the most frequent candidates, not the first ones the tokenizer emitted', () => {
    const terms = bookRangeTerms(
      [
        candidate({ expression: 'まれ', count: 1 }),
        candidate({ expression: 'よくある', count: 9 }),
        candidate({ expression: 'ふつう', count: 4 }),
      ],
      2,
    );
    expect(terms.map((term) => term.term)).toEqual(['よくある', 'ふつう']);
  });

  it('breaks ties by code unit, so the same book yields the same terms on every machine', () => {
    const forward = bookRangeTerms(
      [candidate({ expression: 'b', count: 2 }), candidate({ expression: 'a', count: 2 })],
      2,
    );
    const reversed = bookRangeTerms(
      [candidate({ expression: 'a', count: 2 }), candidate({ expression: 'b', count: 2 })],
      2,
    );
    expect(forward.map((term) => term.term)).toEqual(['a', 'b']);
    expect(reversed.map((term) => term.term)).toEqual(['a', 'b']);
  });

  it('carries the mined line as the term sentence — the reason to mine a range at all', () => {
    const [term] = bookRangeTerms(
      [candidate({ expression: '珈琲', count: 2, reading: 'コーヒー', sampleSentence: ' 珈琲を飲んだ。 ' })],
      5,
    );
    expect(term).toEqual({ term: '珈琲', reading: 'コーヒー', sentence: '珈琲を飲んだ。' });
  });

  it('omits reading and sentence rather than emitting empty strings for them', () => {
    const [term] = bookRangeTerms([candidate({ expression: '猫', count: 1 })], 5);
    expect(term).toEqual({ term: '猫' });
  });

  it('does not throw on a non-positive limit', () => {
    expect(bookRangeTerms([candidate({ expression: '猫', count: 1 })], 0)).toEqual([]);
  });
});

describe('resolveCardStudioBookScope', () => {
  it('refuses without a book instead of mining an arbitrary one', async () => {
    await expect(resolveCardStudioBookScope(t, {})).rejects.toThrow('blanc.agent.error.aiNoBook');
    expect(analyzeEpub).not.toHaveBeenCalled();
  });

  it('accepts the chapter bounds as numeric strings, which a local model emits', async () => {
    await resolveCardStudioBookScope(t, { itemId: 'item-1', chapterFrom: '2', chapterTo: '3' });
    expect(analyzeEpub).toHaveBeenCalledWith('item-1', undefined, { from: 2, to: 3 });
  });

  it('passes no mining config, so main uses the settings the manual panel shows', async () => {
    await resolveCardStudioBookScope(t, { itemId: 'item-1' });
    expect(analyzeEpub).toHaveBeenCalledWith('item-1', undefined, { from: null, to: null });
  });

  it('names the deck from the range main APPLIED, not the one that was asked for', async () => {
    // Asked for 2–99; main clamped to 2–3 and said so. The identity must follow
    // main, or a re-run of the same clamped range would land in a second deck.
    analyzeEpub.mockResolvedValueOnce(analysis({ range: { from: 2, to: 3 } }));
    const scope = await resolveCardStudioBookScope(t, {
      itemId: 'item-1',
      chapterFrom: 2,
      chapterTo: 99,
    });
    expect(scope.range).toEqual({ from: 2, to: 3 });
    expect(scope.identity.deckTitle).toBe('夜のカフェ — Ch. 2–3');
    expect(scope.identity.bookId).toBe('ai-item-1-ch2-3');
  });

  it('treats an absent range as the whole book', async () => {
    const scope = await resolveCardStudioBookScope(t, { itemId: 'item-1' });
    expect(scope.range).toBeNull();
    expect(scope.identity.deckTitle).toBe('夜のカフェ');
    expect(scope.identity.bookId).toBe('ai-item-1-full');
    expect(scope.sectionCount).toBe(3);
  });

  it('separates its deck from a traditional mining run of the same range', async () => {
    analyzeEpub.mockResolvedValueOnce(analysis({ range: { from: 2, to: 3 } }));
    const scope = await resolveCardStudioBookScope(t, { itemId: 'item-1', chapterFrom: 2, chapterTo: 3 });
    expect(scope.identity.bookId.startsWith('ai-')).toBe(true);
  });

  it('refuses a range whose text survived extraction but yielded no vocabulary', async () => {
    analyzeEpub.mockResolvedValueOnce(analysis({ candidates: [] }));
    await expect(
      resolveCardStudioBookScope(t, { itemId: 'item-1', chapterFrom: 1, chapterTo: 1 }),
    ).rejects.toThrow('blanc.agent.error.aiNoBookTerms');
  });
});

describe('flashcard.generate-cards, book source', () => {
  it('mines the range and reports which book and chapters it targeted', async () => {
    analyzeEpub.mockResolvedValueOnce(analysis({ range: { from: 2, to: 3 } }));
    const result = await run({ source: 'book', itemId: 'item-1', chapterFrom: 2, chapterTo: 3 });

    expect(result.source).toBe('book');
    expect(result.termSource).toBe('book-chapters');
    expect(result.itemId).toBe('item-1');
    expect(result.bookTitle).toBe('夜のカフェ');
    expect(result.chapterRange).toBe('Ch. 2–3');
    expect(result.chapterFrom).toBe(2);
    expect(result.chapterTo).toBe(3);
    expect(result.deckTitle).toBe('夜のカフェ — Ch. 2–3');
    expect(result.bookId).toBe('ai-item-1-ch2-3');
    expect(result.terms).toBe(1);
    expect(result.termsWithSentence).toBe(1);
  });

  it('sends the mined terms to main as a dictionary run, sentences included', async () => {
    await run({ source: 'book', itemId: 'item-1' });
    const request = generateDeck.mock.calls[0][0];
    // `book` is an adapter-level source; main only knows preset vs dictionary.
    expect(request.source).toBe('dictionary');
    expect(request.terms).toEqual([
      { term: '珈琲', sentence: '珈琲を飲んだ。' },
    ]);
    expect(request.wordCount).toBeUndefined();
  });

  it('writes nothing — the deck write stays the gated add-cards step', async () => {
    // A deck already in the store, so an accidental `replaceImportedDeck` would
    // both change the snapshot AND destroy something, exactly as it would live.
    localStorage.setItem('jp.decks.v1', JSON.stringify({ cards: [{ id: 'existing' }] }));
    const before = storageSnapshot();

    const result = await run({ source: 'book', itemId: 'item-1', chapterFrom: 1, chapterTo: 2 });

    expect(storageSnapshot()).toBe(before);
    expect(result.saved).toBe(false);
    expect(result.generated).toBe(true);
  });

  it('returns rows already shaped for flashcard.add-cards', async () => {
    const result = await run({ source: 'book', itemId: 'item-1' });
    expect(result.cards).toEqual(
      cardStudioCardRows([enrichment('珈琲')]),
    );
  });

  it('caps the terms it will pay to enrich', async () => {
    analyzeEpub.mockResolvedValueOnce(
      analysis({
        candidates: Array.from({ length: 200 }, (_unused, index) =>
          candidate({ expression: `語${index}`, count: 200 - index }),
        ),
      }),
    );
    await run({ source: 'book', itemId: 'item-1', termLimit: 500 });
    expect(generateDeck.mock.calls[0][0].terms).toHaveLength(25);
  });
});

describe('flashcard.generate-cards, the other two sources are unchanged', () => {
  it('leaves a preset run free of book fields and still reporting a word count', async () => {
    const result = await run({ source: 'preset', wordCount: 4 });
    expect(analyzeEpub).not.toHaveBeenCalled();
    expect(result.source).toBe('preset');
    expect(result.wordCount).toBe(4);
    expect(result.bookId).toBeUndefined();
    expect(result.chapterRange).toBeUndefined();
    expect(result.terms).toBeUndefined();
    expect(generateDeck.mock.calls[0][0].source).toBe('preset');
  });

  it('still refuses a dictionary run with nothing to build from', async () => {
    await expect(run({ source: 'dictionary' })).rejects.toThrow('blanc.agent.error.aiNoTerms');
    expect(generateDeck).not.toHaveBeenCalled();
  });

  it('still counts supplied terms for a dictionary run', async () => {
    const result = await run({
      source: 'dictionary',
      terms: [{ term: '猫', sentence: '猫がいる。' }, { term: '犬' }],
    });
    expect(result.source).toBe('dictionary');
    expect(result.termSource).toBe('arguments');
    expect(result.terms).toBe(2);
    expect(result.termsWithSentence).toBe(1);
    expect(result.bookId).toBeUndefined();
  });
});
