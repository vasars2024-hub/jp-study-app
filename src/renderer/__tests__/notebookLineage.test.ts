import { describe, expect, it } from 'vitest';
import { buildLineageIndex, lineageForEntry, type LineageIndexInput } from '../notebook/lineage';
import type { NotebookTimelineEntry } from '../notebookTimeline';
import type { LibraryItem } from '../../shared/types';
import type { JitenPlanEntry } from '../../shared/jiten';
import type { DeckFlashcard } from '../flashcardDeck';

const BOOK = 'book-uuid-1';

function item(over: Partial<LibraryItem> = {}): LibraryItem {
  return { id: BOOK, title: '君の名は。', kind: 'book', createdAt: 1, ...over } as LibraryItem;
}

function plan(over: Partial<JitenPlanEntry> = {}): JitenPlanEntry {
  return {
    id: 'p1',
    titleJp: '君の名は。',
    genres: [],
    tags: [],
    sourceLinks: [],
    acquisitionStatus: 'planned',
    createdAt: 1,
    updatedAt: 2,
    ...over,
  } as JitenPlanEntry;
}

function card(over: Partial<DeckFlashcard> = {}): DeckFlashcard {
  return {
    id: 'c1', word: '猫', reading: '', meaning: '', source: 'epub', addedAt: 1, ...over,
  } as DeckFlashcard;
}

function entry(over: Partial<NotebookTimelineEntry> = {}): NotebookTimelineEntry {
  return { id: 'e1', stream: 'highlights', title: 'x', ts: 1, ...over } as NotebookTimelineEntry;
}

const FULL: LineageIndexInput = {
  library: [item({ ocrMeta: { ocrPages: 12, translatedPages: 0, updatedAt: 5 } })],
  plan: [plan({ importedLibraryItemId: BOOK })],
  deck: [
    card({ id: 'c1', bookId: BOOK }),
    card({ id: 'c2', bookId: BOOK, ankiExported: true }),
    card({ id: 'c3', bookId: 'other-book' }),
  ],
  annotations: {
    [BOOK]: [{ id: 'a1', bookId: BOOK, startOffset: 0, endOffset: 1, text: 'x', color: 'yellow', createdAt: 1 }],
  },
};

describe('artifact lineage', () => {
  it('builds the full chain from plan through to anki', () => {
    const index = buildLineageIndex(FULL);
    const chain = index.byBookId.get(BOOK)!;

    expect(chain.map((n) => n.stage)).toEqual([
      'plan', 'library', 'ocr', 'highlights', 'cards', 'anki',
    ]);
  });

  it('counts only cards belonging to this book', () => {
    const chain = buildLineageIndex(FULL).byBookId.get(BOOK)!;
    const cards = chain.find((n) => n.stage === 'cards');
    const anki = chain.find((n) => n.stage === 'anki');

    expect(cards?.count).toBe(2); // c3 belongs to another book
    expect(anki?.count).toBe(1);
  });

  it('omits stages that never happened rather than showing them as zero', () => {
    const chain = buildLineageIndex({ library: [item()] }).byBookId.get(BOOK)!;

    expect(chain.map((n) => n.stage)).toEqual(['library']);
    expect(chain.some((n) => n.count === 0)).toBe(false);
  });

  it('omits the ocr stage for a volume with zero scanned pages', () => {
    const chain = buildLineageIndex({
      library: [item({ ocrMeta: { ocrPages: 0, translatedPages: 0, updatedAt: 5 } })],
    }).byBookId.get(BOOK)!;

    expect(chain.some((n) => n.stage === 'ocr')).toBe(false);
  });

  it('omits the anki stage when nothing was exported', () => {
    const chain = buildLineageIndex({
      library: [item()],
      deck: [card({ bookId: BOOK })],
    }).byBookId.get(BOOK)!;

    expect(chain.map((n) => n.stage)).toEqual(['library', 'cards']);
  });

  it('does not open with a plan node when the book was imported by other means', () => {
    const chain = buildLineageIndex({
      library: [item()],
      plan: [plan({ importedLibraryItemId: undefined })],
    }).byBookId.get(BOOK)!;

    expect(chain[0].stage).toBe('library');
  });
});

describe('lineage lookup for an entry', () => {
  it('resolves a highlight entry through its meta.bookId', () => {
    const index = buildLineageIndex(FULL);
    const chain = lineageForEntry(entry({ meta: { bookId: BOOK } }), index);

    expect(chain.map((n) => n.stage)).toContain('cards');
  });

  it('resolves a plan entry through its stripped id', () => {
    const index = buildLineageIndex(FULL);
    const chain = lineageForEntry(entry({ id: 'plan-p1', stream: 'plan' }), index);

    expect(chain[0].stage).toBe('plan');
  });

  it('returns an empty chain for an entry with no book', () => {
    const index = buildLineageIndex(FULL);

    expect(lineageForEntry(entry({ stream: 'lookups' }), index)).toEqual([]);
  });

  it('returns an empty chain for an unknown book rather than a partial one', () => {
    const index = buildLineageIndex(FULL);

    expect(lineageForEntry(entry({ meta: { bookId: 'ghost' } }), index)).toEqual([]);
  });

  it('suppresses a single-node chain, which would only restate the row', () => {
    const index = buildLineageIndex({ library: [item()] });

    // The book resolves, but "Library: 君の名は。" alone is not lineage.
    expect(lineageForEntry(entry({ meta: { bookId: BOOK } }), index)).toEqual([]);
  });

  it('gives an un-imported plan entry no chain (one real stage only)', () => {
    const index = buildLineageIndex({ plan: [plan()] });

    expect(lineageForEntry(entry({ id: 'plan-p1', stream: 'plan' }), index)).toEqual([]);
  });
});
