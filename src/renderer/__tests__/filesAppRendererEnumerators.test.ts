/**
 * Gate 1, the renderer half: the Notebook lives in localStorage, so main's
 * index cannot see it and `outputs/notes` read 0 against a populated store.
 */
import { describe, expect, it } from 'vitest';
import {
  annotationFilesItems,
  clipboardFilesItems,
  flashcardDeckFilesItems,
  knownWordFilesItems,
  lookupHistoryFilesItems,
  notebookFilesItems,
  savedWordFilesItems,
  translationHistoryFilesItems,
  withRendererItems,
} from '../components/filesapp/rendererEnumerators';
import { NOTEBOOK_TIMELINE_STORAGE_KEY, type NotebookTimelineEntry } from '../notebookTimeline';
import { type DeckFlashcard } from '../flashcardDeck';
import { ANNOTATIONS_STORAGE_PREFIX, type Annotation } from '../annotations';
import { countByCategory, type FilesIndexSnapshot } from '../../shared/filesApp/catalog';

function card(over: Partial<DeckFlashcard>): DeckFlashcard {
  return {
    id: 'c1',
    word: '猫',
    reading: 'ねこ',
    meaning: 'cat',
    source: 'epub',
    addedAt: 1000,
    ...over,
  } as DeckFlashcard;
}

function mark(over: Partial<Annotation>): Annotation {
  return {
    id: 'a1',
    bookId: 'book-1',
    startOffset: 0,
    endOffset: 4,
    text: '吾輩は猫である',
    color: 'yellow',
    createdAt: 2000,
    ...over,
  };
}

function entry(over: Partial<NotebookTimelineEntry>): NotebookTimelineEntry {
  return { id: 'nb-1', stream: 'lookups', title: 'A lookup', ts: 100, ...over };
}

function emptySnapshot(): FilesIndexSnapshot {
  return { items: [], counts: countByCategory([]), enumerators: [], builtAt: 0 };
}

describe('files app — renderer-owned enumerators', () => {
  it('turns notebook entries into rows under notes and highlights', () => {
    const items = notebookFilesItems([
      entry({ id: 'a', stream: 'lookups', title: 'Looked up 猫' }),
      entry({ id: 'b', stream: 'highlights', title: 'Highlighted a line' }),
      entry({ id: 'c', stream: 'saved-words', title: 'Saved 犬' }),
    ]);

    expect(items.map((i) => i.categoryId)).toEqual([
      'outputs/notes',
      'outputs/highlights',
      'outputs/highlights',
    ]);
    expect(items[0].location).toEqual({
      store: 'localStorage',
      key: NOTEBOOK_TIMELINE_STORAGE_KEY,
      pointer: 'a',
    });
    // A timeline entry has no byte size; borrowing its detail length would put
    // a number meaning something else into the size column.
    expect(items.every((i) => i.sizeBytes === null)).toBe(true);
    expect(items[0].createdAt).toBe(100);
  });

  it('merges into a main-built snapshot and recomputes the counts', () => {
    const merged = withRendererItems({
      ...emptySnapshot(),
      enumerators: [{ source: 'library', itemCount: 0, elapsedMs: 1 }],
    });

    // Nothing in localStorage under vitest: an honest zero, with the reader
    // still named so a failed read stays distinguishable from an empty one.
    expect(merged.enumerators.map((r) => r.source)).toEqual([
      'library',
      'notebook',
      'local-deck',
      'highlights',
      // Gate 7's absorption: the five Notebook streams that had no Files reader.
      'saved-words',
      'lookups',
      'translations',
      'known-words',
      'clipboard',
    ]);
    const notes = merged.counts.find((c) => c.categoryId === 'outputs/notes');
    expect(notes?.total).toBe(0);
  });

  it('never produces a second row for an id the main index already carries', () => {
    const existing = notebookFilesItems([entry({ id: 'dup' })]);
    const merged = withRendererItems({
      ...emptySnapshot(),
      items: existing,
      counts: countByCategory(existing),
    });

    expect(merged.items.filter((i) => i.id === 'notebook:dup')).toHaveLength(1);
  });

  it('a store that throws is reported by name rather than blanking the merge', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage disabled');
      },
    });
    try {
      const merged = withRendererItems(emptySnapshot());
      const report = merged.enumerators.find((r) => r.source === 'notebook');
      // `loadNotebookTimeline` swallows its own failure, so the honest outcome
      // here is zero items from a reader that ran — never a missing report.
      expect(report).toBeDefined();
      expect(report?.itemCount).toBe(0);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});

describe('files app — the local flashcard deck', () => {
  it('lands cards under mined and folders under decks', () => {
    const items = flashcardDeckFilesItems(
      JSON.stringify({
        folders: ['Reading', 'Anime'],
        cards: [
          card({ id: 'c1', folder: 'Reading' }),
          card({ id: 'c2', word: '犬', reading: 'いぬ', folder: 'Anime' }),
          card({ id: 'c3', word: '本', reading: '本' }),
        ],
      }),
    );

    expect(items.filter((i) => i.categoryId === 'outputs/mined')).toHaveLength(3);
    expect(items.filter((i) => i.categoryId === 'outputs/decks').map((i) => i.name)).toEqual([
      'Reading',
      'Anime',
    ]);
    // A reading identical to the word is not repeated in parentheses.
    expect(items.find((i) => i.id === 'deck-card:c3')?.name).toBe('本');
    expect(items.find((i) => i.id === 'deck-card:c1')?.name).toBe('猫（ねこ）');
  });

  it('maps the deck vocabulary onto the catalogue one, and never guesses', () => {
    const items = flashcardDeckFilesItems(
      JSON.stringify({
        folders: [],
        cards: [
          card({ id: 'human', textProvenance: 'human-subs' }),
          card({ id: 'auto', textProvenance: 'auto-captions' }),
          // The one name that differs between the two vocabularies.
          card({ id: 'whisper', textProvenance: 'transcript' }),
          card({ id: 'book', textProvenance: 'book-text' }),
          // No value: additive field, so every card written before it exists.
          card({ id: 'legacy' }),
        ],
      }),
    );
    const provenanceOf = (id: string) =>
      items.find((i) => i.id === `deck-card:${id}`)?.provenance;

    expect(provenanceOf('human')).toBe('human-subs');
    expect(provenanceOf('auto')).toBe('auto-captions');
    expect(provenanceOf('whisper')).toBe('whisper-transcript');
    expect(provenanceOf('book')).toBe('book-text');
    // Negative control: an absent value must NOT inherit the neighbouring
    // card's mark, and must not become `book-text` because most cards are.
    expect(provenanceOf('legacy')).toBe('unknown');
  });

  it('treats a never-reviewed card as never used rather than as 1970', () => {
    const items = flashcardDeckFilesItems(
      JSON.stringify({
        folders: [],
        cards: [
          card({ id: 'fresh', srs: { lastReviewedAt: 0 } as DeckFlashcard['srs'] }),
          card({ id: 'seen', srs: { lastReviewedAt: 9000 } as DeckFlashcard['srs'] }),
        ],
      }),
    );
    expect(items.find((i) => i.id === 'deck-card:fresh')?.lastUsedAt).toBeNull();
    expect(items.find((i) => i.id === 'deck-card:seen')?.lastUsedAt).toBe(9000);
  });

  it('reads an empty or absent store as zero rows, not as a crash', () => {
    expect(flashcardDeckFilesItems(null)).toEqual([]);
    expect(flashcardDeckFilesItems('not json at all')).toEqual([]);
    expect(flashcardDeckFilesItems(JSON.stringify({ folders: [], cards: [] }))).toEqual([]);
  });
});

describe('files app — per-book highlights', () => {
  it('makes one row per mark, keyed by the book its store belongs to', () => {
    const items = annotationFilesItems({
      'book-1': [mark({ id: 'm1' }), mark({ id: 'm2', text: '  ' })],
      'book-2': [mark({ id: 'm3', bookId: 'book-2', text: '面白い' })],
    });

    expect(items).toHaveLength(3);
    expect(items.every((i) => i.categoryId === 'outputs/highlights')).toBe(true);
    expect(items[0].location).toEqual({
      store: 'localStorage',
      key: `${ANNOTATIONS_STORAGE_PREFIX}book-1`,
      pointer: 'm1',
    });
    // A blank mark falls back to its id rather than rendering as an empty row.
    expect(items[1].name).toBe('m2');
    expect(items[2].location).toEqual({
      store: 'localStorage',
      key: `${ANNOTATIONS_STORAGE_PREFIX}book-2`,
      pointer: 'm3',
    });
  });

  it('drops a row with no identity instead of emitting an unaddressable one', () => {
    const items = annotationFilesItems({
      'book-1': [mark({ id: 'good' }), { text: 'no id' } as Annotation],
    });
    expect(items.map((i) => i.id)).toEqual(['annotation:book-1:good']);
  });
});

describe('files app — the joined snapshot, gate 1', () => {
  it('reports every renderer enumerator by name, including the ones reading zero', () => {
    const merged = withRendererItems(emptySnapshot());
    expect(merged.enumerators.map((r) => r.source).sort()).toEqual([
      'clipboard',
      'highlights',
      'known-words',
      'local-deck',
      'lookups',
      'notebook',
      'saved-words',
      'translations',
    ]);
    // A category at 0 has to be distinguishable from a reader that never ran,
    // which is the whole shape of the gate-1 finding this layer exists for.
    expect(merged.enumerators.every((r) => r.error === undefined)).toBe(true);
  });

  it('keeps counts equal to the joined rows so a group cannot disagree with its leaves', () => {
    const merged = withRendererItems(emptySnapshot());
    const mined = merged.counts.find((c) => c.categoryId === 'outputs/mined');
    expect(mined?.total).toBe(
      merged.items.filter((i) => i.categoryId === 'outputs/mined').length,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Gate 7 — the five Notebook streams Files could not see.
 * ------------------------------------------------------------------ */

describe('files app — the absorbed study-record streams (gate 7)', () => {
  it('saved words keep their reading, their timestamp and their real key', () => {
    const items = savedWordFilesItems(
      [
        { word: '猫', reading: 'ねこ', meaning: 'cat', addedAt: 1700 },
        { word: 'カレー', reading: 'カレー', meaning: 'curry', addedAt: 1800 },
        { word: '   ', reading: '', meaning: '', addedAt: 1900 },
      ],
      'jp-saved-words-ja',
    );
    // The blank word is dropped, not rendered as an empty row.
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('猫（ねこ）');
    // Reading identical to the word must not be repeated in brackets.
    expect(items[1].name).toBe('カレー');
    expect(items[0].createdAt).toBe(1700);
    expect(items[0].categoryId).toBe('outputs/notes');
    expect(items[0].location).toEqual({
      store: 'localStorage',
      key: 'jp-saved-words-ja',
      pointer: '猫',
    });
  });

  it('a lookup carries first-seen and last-seen as different columns', () => {
    const [item] = lookupHistoryFilesItems([
      {
        query: 'ねこ',
        lemma: '猫',
        meaning: 'cat',
        lang: 'ja',
        at: 5000,
        firstAt: 1000,
        count: 9,
        lookupTimes: [1000, 5000],
      },
    ]);
    expect(item.name).toBe('猫');
    expect(item.createdAt).toBe(1000);
    expect(item.lastUsedAt).toBe(5000);
    expect(item.location.store).toBe('localStorage');
  });

  it('a translation is named by its source text, never by its id', () => {
    const [item] = translationHistoryFilesItems([
      {
        id: 'tr-1',
        sourceLang: 'ja',
        targetLang: 'en',
        sourceText: '吾輩は猫である',
        resultText: 'I am a cat',
        ts: 4000,
        origin: 'app',
      },
    ]);
    expect(item.name).toBe('吾輩は猫である');
    expect(item.createdAt).toBe(4000);
  });

  it('known words get a NULL date rather than the notebook synthetic one', () => {
    const items = knownWordFilesItems(
      [
        { word: '猫', level: 3 },
        { word: '犬', level: 1 },
      ],
      'jp-word-knowledge-ja',
    );
    expect(items).toHaveLength(2);
    // `aggregate.ts` gives these `Date.now() - level * 1000` so the timeline can
    // sort them. That number means nothing, and a Date column showing it would
    // be showing an invented value.
    expect(items.every((i) => i.createdAt === null && i.modifiedAt === null)).toBe(true);
    expect(items[0].name).toBe('猫');
  });

  it('clipboard rows survive a truncation without losing their pointer', () => {
    const long = 'あ'.repeat(400);
    const [item] = clipboardFilesItems([
      { id: 'cb-1', type: 'text', text: long, createdAt: 900, pinned: true },
    ]);
    expect(item.name).toHaveLength(120);
    expect(item.location).toEqual({
      store: 'localStorage',
      key: 'jp-clipboard-history',
      pointer: 'cb-1',
    });
    // Gate 18 owns Favorites; `pinned` must NOT be smuggled into another flag.
    expect(item.flags).toEqual({ hasNotes: true });
  });

  it('every absorbed row is app-generated, and none claims mined provenance', () => {
    const all = [
      ...savedWordFilesItems([{ word: '猫', reading: '', meaning: '', addedAt: 1 }], 'k'),
      ...lookupHistoryFilesItems([
        { query: 'q', lemma: 'l', lang: 'ja', at: 2, firstAt: 1, count: 1, lookupTimes: [] },
      ]),
      ...translationHistoryFilesItems([
        { id: 't', sourceLang: 'ja', targetLang: 'en', sourceText: 's', resultText: 'r', ts: 3, origin: 'app' },
      ]),
      ...knownWordFilesItems([{ word: 'w', level: 2 }], 'k'),
      ...clipboardFilesItems([{ id: 'c', type: 'text', text: 't', createdAt: 4 }]),
    ];
    expect(all).toHaveLength(5);
    expect(all.every((i) => i.provenance === 'app-generated')).toBe(true);
    // Nothing here is mined text, so nothing may carry a trust mark.
    expect(all.some((i) => i.provenance === 'book-text')).toBe(false);
    // Ids are namespaced, so a word saved AND known cannot collide.
    expect(new Set(all.map((i) => i.id)).size).toBe(5);
  });

  it('control — a malformed row is dropped, it does not become a blank item', () => {
    // Each reader is handed exactly the shape that would slip past a naive
    // `entries.map(...)` and render a row with no name.
    expect(savedWordFilesItems([{ word: '', reading: '', meaning: '', addedAt: 1 }], 'k')).toEqual([]);
    expect(
      lookupHistoryFilesItems([
        { query: '', lemma: '', lang: 'ja', at: 1, firstAt: 1, count: 1, lookupTimes: [] },
      ]),
    ).toEqual([]);
    expect(translationHistoryFilesItems([{ id: 0 } as never])).toEqual([]);
    expect(knownWordFilesItems([{ word: '  ', level: 1 }], 'k')).toEqual([]);
    expect(clipboardFilesItems([null as never])).toEqual([]);
  });

  it('control — the same readers DO produce rows for well-formed input', () => {
    // Without this the assertions above would also pass on a reader that
    // returned [] unconditionally.
    expect(savedWordFilesItems([{ word: '猫', reading: '', meaning: '', addedAt: 1 }], 'k')).toHaveLength(1);
    expect(knownWordFilesItems([{ word: '猫', level: 1 }], 'k')).toHaveLength(1);
    expect(clipboardFilesItems([{ id: 'c', type: 'text', text: 't', createdAt: 1 }])).toHaveLength(1);
  });
});
