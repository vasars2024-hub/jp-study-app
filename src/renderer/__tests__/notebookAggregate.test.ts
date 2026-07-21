import { beforeEach, describe, expect, it, vi } from 'vitest';

// This repo has no DOM test environment (adding one is a root config change,
// which CLAUDE.md forbids). The aggregator's localStorage-backed sources are
// mocked to empty so each test drives exactly one stream; the library- and
// plan-derived streams are passed in as plain data, which is the whole point
// of `aggregateNotebook` taking `NotebookSources` rather than fetching itself.
vi.hoisted(() => {
  const g = globalThis as unknown as { window?: unknown };
  if (!g.window) {
    g.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true };
  }
});

vi.mock('../annotations', () => ({ collectAllAnnotationsMap: vi.fn(() => ({})) }));
vi.mock('../clipboardHistory', () => ({ loadClipboardHistory: () => [] }));
vi.mock('../flashcardDeck', () => ({ loadDeck: vi.fn(() => []) }));
vi.mock('../lookupHistory', () => ({ loadLookupHistory: () => [] }));
vi.mock('../notebookTimeline', () => ({ loadNotebookTimeline: () => [] }));
vi.mock('../savedWords', () => ({ loadSaved: () => [] }));
vi.mock('../translationHistory', () => ({ loadTranslationHistory: () => [] }));
vi.mock('../knownWords', () => ({ listKnownEntries: () => [] }));

import { collectAllAnnotationsMap } from '../annotations';
import { loadDeck } from '../flashcardDeck';
import { aggregateNotebook } from '../notebook/aggregate';
import type { LibraryItem } from '../../shared/types';
import type { JitenPlanEntry } from '../../shared/jiten';

const BOOK_UUID = '3f8a1c92-7b41-4d0e-9a2f-15c6de40b881';

// Mock return values persist across tests in a file. Without this reset a test
// asserting on `entries[0]` can be reading an entry left behind by an earlier
// test that merely happened to sort lower — passing for the wrong reason.
beforeEach(() => {
  vi.mocked(collectAllAnnotationsMap).mockReturnValue({});
  vi.mocked(loadDeck).mockReturnValue([]);
});

function libraryItem(over: Partial<LibraryItem> = {}): LibraryItem {
  return { id: BOOK_UUID, title: '吾輩は猫である', kind: 'book', createdAt: 1, ...over } as LibraryItem;
}

function planEntry(over: Partial<JitenPlanEntry> = {}): JitenPlanEntry {
  return {
    id: 'plan-1',
    titleJp: '君の名は。',
    genres: [],
    tags: [],
    sourceLinks: [],
    acquisitionStatus: 'planned',
    createdAt: 1000,
    updatedAt: 2000,
    ...over,
  } as JitenPlanEntry;
}

describe('notebook aggregate — human-readable source grouping', () => {
  it('groups highlights under the library title, not the raw book UUID', () => {
    vi.mocked(collectAllAnnotationsMap).mockReturnValue({
      [BOOK_UUID]: [
        { id: 'a1', bookId: BOOK_UUID, startOffset: 0, endOffset: 3, text: '吾輩', color: 'yellow', createdAt: 5 },
      ],
    });

    const { entries, folders } = aggregateNotebook({ library: [libraryItem()] });

    expect(entries[0].folder).toBe('Highlights/吾輩は猫である');
    expect(folders.map((f) => f.id)).not.toContain(`Highlights/${BOOK_UUID}`);
    // The id is still carried for deep-linking even though it is not displayed.
    expect(entries[0].meta?.bookId).toBe(BOOK_UUID);
  });

  it('falls back to a short id when the book is no longer in the library', () => {
    vi.mocked(collectAllAnnotationsMap).mockReturnValue({
      [BOOK_UUID]: [
        { id: 'a1', bookId: BOOK_UUID, startOffset: 0, endOffset: 3, text: '吾輩', color: 'yellow', createdAt: 5 },
      ],
    });

    const { entries } = aggregateNotebook({ library: [] });

    // Degraded, but bounded — never the full 36-char UUID.
    expect(entries[0].folder).toBe('Highlights/Unknown book (3f8a1c92)');
    expect(entries[0].folder).not.toContain(BOOK_UUID);
  });
});

describe('notebook aggregate — previously unemitted streams', () => {
  it('emits one ocr entry per scanned volume, not per page', () => {
    const { entries, counts } = aggregateNotebook({
      library: [
        libraryItem({
          kind: 'manga',
          title: 'よつばと！',
          ocrMeta: { ocrPages: 42, translatedPages: 12, targetLang: 'en', updatedAt: 900 },
        }),
      ],
    });

    expect(counts.ocr).toBe(1);
    expect(entries[0].detail).toBe('42 pages scanned · 12 translated → en');
    expect(entries[0].meta?.ocrPages).toBe(42);
  });

  it('does not emit an ocr entry for a volume with no scanned pages', () => {
    const { counts } = aggregateNotebook({
      library: [libraryItem({ ocrMeta: { ocrPages: 0, translatedPages: 0, updatedAt: 900 } })],
    });

    expect(counts.ocr).toBe(0);
  });

  it('emits extension-sourced cards as the extension stream, not flashcards', () => {
    vi.mocked(loadDeck).mockReturnValue([
      { id: 'c1', word: '猫', reading: 'ねこ', meaning: 'cat', source: 'extension', addedAt: 10 },
    ] as ReturnType<typeof loadDeck>);

    const { counts, entries } = aggregateNotebook({});

    expect(counts.extension).toBe(1);
    expect(counts.flashcards).toBe(0);
    expect(entries[0].origin).toBe('extension');
  });

  it('treats a legacy folder-only extension card as extension', () => {
    // `source` postdates the extension bridge, so cards captured before it
    // carry only the folder. Found live: the chip read 1 against a sidebar
    // folder of 4, and the difference was labelled "Flashcards".
    vi.mocked(loadDeck).mockReturnValue([
      { id: 'c1', word: '今日はいい天気です', reading: '', meaning: '', source: 'dictionary', folder: 'Extension', addedAt: 10 },
    ] as ReturnType<typeof loadDeck>);

    const { counts } = aggregateNotebook({});

    expect(counts.extension).toBe(1);
    expect(counts.flashcards).toBe(0);
  });

  it('never labels a card extension-origin while streaming it elsewhere', () => {
    // The invariant behind the bug above: one predicate, one answer. A card
    // marked `origin: 'extension'` must be in a stream that says so.
    vi.mocked(loadDeck).mockReturnValue([
      { id: 'c1', word: 'a', reading: '', meaning: '', source: 'dictionary', folder: 'Extension', addedAt: 1 },
      { id: 'c2', word: 'b', reading: '', meaning: '', source: 'extension', addedAt: 2 },
      { id: 'c3', word: 'c', reading: '', meaning: '', source: 'dictionary', addedAt: 3 },
      { id: 'c4', word: 'd', reading: '', meaning: '', source: 'epub', bookId: 'bk', addedAt: 4 },
    ] as ReturnType<typeof loadDeck>);

    const { entries } = aggregateNotebook({});
    const deckRows = entries.filter((e) => e.id.startsWith('deck-'));

    for (const row of deckRows) {
      if (row.origin !== 'extension') continue;
      // `audio` and `anki` legitimately carry an extension origin; the point is
      // that plain `flashcards` never may — that is the disagreement.
      expect(row.stream).not.toBe('flashcards');
    }
  });

  it('still routes an exported extension card to anki (export wins over origin)', () => {
    vi.mocked(loadDeck).mockReturnValue([
      { id: 'c1', word: '猫', reading: '', meaning: '', source: 'extension', ankiExported: true, addedAt: 10 },
    ] as ReturnType<typeof loadDeck>);

    const { counts } = aggregateNotebook({});

    expect(counts.anki).toBe(1);
    expect(counts.extension).toBe(0);
  });

  it('emits inbox articles as extension captures', () => {
    vi.mocked(loadDeck).mockReturnValue([]);
    const { counts, entries } = aggregateNotebook({
      library: [
        libraryItem({
          title: 'NHK記事',
          inboxMeta: {
            sourceUrl: 'https://www3.nhk.or.jp/news/x',
            contentHash: 'h',
            lang: 'ja',
            charCount: 900,
            estMinutes: 4,
            knownRatio: 0.8,
            levelEstimate: 3,
            receivedAt: 700,
          },
        }),
      ],
    });

    expect(counts.extension).toBe(1);
    expect(entries[0].folder).toBe('Inbox');
    expect(entries[0].origin).toBe('extension');
  });

  it('emits the jiten plan store as the plan stream', () => {
    const { counts, entries } = aggregateNotebook({
      plan: [planEntry({ author: '新海誠', difficultyLabel: 'Moderate' })],
    });

    expect(counts.plan).toBe(1);
    expect(entries[0].title).toBe('君の名は。');
    expect(entries[0].detail).toBe('新海誠 · Moderate · planned');
    expect(entries[0].folder).toBe('Plan to read');
  });

  it('carries the plan lineage fields through to meta', () => {
    const { entries } = aggregateNotebook({
      plan: [planEntry({ importedLibraryItemId: BOOK_UUID, minedAt: 4242 })],
    });

    expect(entries[0].meta?.importedLibraryItemId).toBe(BOOK_UUID);
    expect(entries[0].meta?.minedAt).toBe(4242);
  });

  it('uses createdAt when a plan entry has never been updated', () => {
    const { entries } = aggregateNotebook({ plan: [planEntry({ updatedAt: 0, createdAt: 1234 })] });

    expect(entries[0].ts).toBe(1234);
  });
});

describe('notebook aggregate — degradation', () => {
  it('produces no library- or plan-derived entries when those sources are absent', () => {
    vi.mocked(collectAllAnnotationsMap).mockReturnValue({});
    vi.mocked(loadDeck).mockReturnValue([]);

    const { counts, entries } = aggregateNotebook();

    expect(entries).toEqual([]);
    expect(counts.ocr).toBe(0);
    expect(counts.plan).toBe(0);
  });
});
