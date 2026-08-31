/**
 * The Files app — the enumerators that only the RENDERER can run.
 *
 * Every other store this app owns lives under `userData` and is walked in main
 * (`main/filesApp/enumerators.ts`). The Notebook does not: it is persisted in
 * renderer `localStorage` under `NOTEBOOK_TIMELINE_STORAGE_KEY`, which no
 * main-process reader can open. Chromium keeps localStorage in a Snappy-blocked
 * LevelDB, so this is not a "main could just read the file" situation — the
 * value is only decodable inside the renderer that owns it.
 *
 * That is why `outputs/notes` and `outputs/highlights` read a permanent 0 while
 * the store on disk held real entries: gate 1's FINDING shape, produced by a
 * process boundary rather than a wrong path. The fix is a second enumerator
 * layer merged into the snapshot on arrival, not a second index.
 *
 * The merge is additive and recomputes `counts` from the joined list, so a
 * group total can never disagree with the leaves under it — the same invariant
 * `countByCategory` gives the main-side build.
 */
import {
  categoryForKind,
  countByCategory,
  type FilesIndexSnapshot,
  type FilesItem,
  type FilesItemKind,
  type FilesProvenance,
} from '../../../shared/filesApp/catalog';
import {
  NOTEBOOK_TIMELINE_STORAGE_KEY,
  loadNotebookTimeline,
  type NotebookStream,
  type NotebookTimelineEntry,
} from '../../notebookTimeline';
import {
  FLASHCARD_DECK_STORAGE_KEY,
  parseFlashcardDeckStore,
  type DeckFlashcard,
  type FlashcardTextProvenance,
} from '../../flashcardDeck';
import {
  ANNOTATIONS_STORAGE_PREFIX,
  collectAllAnnotationsMap,
  type Annotation,
} from '../../annotations';

/**
 * Which Notebook streams are highlights rather than notes.
 *
 * The plan gives `outputs/notes` and `outputs/highlights` separate leaves, and
 * the Notebook's own vocabulary already draws that line — a highlight is text
 * the user marked in something they were reading; everything else in the
 * timeline is a note the app or the extension wrote about an action.
 */
const HIGHLIGHT_STREAMS: ReadonlySet<NotebookStream> = new Set<NotebookStream>([
  'highlights',
  'saved-words',
]);

function kindForStream(stream: NotebookStream): FilesItemKind {
  return HIGHLIGHT_STREAMS.has(stream) ? 'highlight' : 'note';
}

/**
 * One `FilesItem` per Notebook entry.
 *
 * `sizeBytes` stays `null`: a timeline entry has no byte size, and borrowing
 * its detail length would put a number in the size column that means something
 * else entirely. `location` is the localStorage key plus the entry id, which is
 * a real location the Properties panel can name even though gate 12 correctly
 * refuses to reveal it in Explorer — there is no folder to open.
 */
export function notebookFilesItems(
  entries: readonly NotebookTimelineEntry[] = loadNotebookTimeline(),
): FilesItem[] {
  return entries.map((entry) => {
    const kind = kindForStream(entry.stream);
    return {
      id: `notebook:${entry.id}`,
      name: entry.title || entry.id,
      kind,
      categoryId: categoryForKind(kind),
      // A note records what the user or the app did; it is not mined text and
      // carries no claim about how any sentence in it was produced.
      provenance: 'app-generated' as const,
      sizeBytes: null,
      createdAt: typeof entry.ts === 'number' ? entry.ts : null,
      modifiedAt: null,
      lastUsedAt: null,
      location: {
        store: 'localStorage' as const,
        key: NOTEBOOK_TIMELINE_STORAGE_KEY,
        pointer: entry.id,
      },
      flags: { hasNotes: Boolean(entry.detail) },
      source: 'notebook',
    };
  });
}

/* ------------------------------------------------------------------ *
 * The local flashcard deck — `outputs/decks` and `outputs/mined`.
 * ------------------------------------------------------------------ */

/**
 * A card's text provenance, mapped onto the catalogue's vocabulary.
 *
 * The two vocabularies were deliberately written to agree (see
 * `FlashcardTextProvenance`), with one difference that matters: the deck says
 * `transcript` where the catalogue says `whisper-transcript`. An ABSENT value
 * becomes `unknown`, never `book-text` — the field is additive and every card
 * written before it existed has no value, so guessing here would stamp a trust
 * mark onto thousands of cards nobody claimed anything about.
 */
function provenanceForCard(value: FlashcardTextProvenance | undefined): FilesProvenance {
  switch (value) {
    case 'human-subs':
      return 'human-subs';
    case 'auto-captions':
      return 'auto-captions';
    case 'transcript':
      return 'whisper-transcript';
    case 'book-text':
      return 'book-text';
    default:
      return 'unknown';
  }
}

/** What a card row is called in the list. Words, not ids. */
function cardName(card: DeckFlashcard): string {
  const word = typeof card.word === 'string' ? card.word.trim() : '';
  if (word) return card.reading && card.reading !== word ? `${word}（${card.reading}）` : word;
  const front = typeof card.front === 'string' ? card.front.trim() : '';
  return front || card.id;
}

/**
 * The local deck: one `deck` row per folder, one `mined-card` row per card.
 *
 * This store is why `outputs/mined` read 0 while the app held 3,238 mined
 * cards. The earlier census justified that zero with "no per-card store exists
 * outside the Anki mirror", which was simply wrong — `jp-flashcard-deck` is
 * exactly that store, and it is renderer-owned, so main could never see it.
 *
 * Cards carrying no `folder` are counted under a synthetic *unfiled* row only
 * if some card actually is unfiled; an empty deck therefore produces no folder
 * rows at all rather than one permanently-empty placeholder.
 */
export function flashcardDeckFilesItems(
  raw: string | null = readLocalStorage(FLASHCARD_DECK_STORAGE_KEY),
): FilesItem[] {
  const { store } = parseFlashcardDeckStore(raw);
  const out: FilesItem[] = [];

  const perFolder = new Map<string, { count: number; newest: number | null }>();
  for (const folder of store.folders) {
    if (typeof folder === 'string' && folder) perFolder.set(folder, { count: 0, newest: null });
  }

  for (const card of store.cards) {
    if (!card || typeof card.id !== 'string') continue;
    const createdAt = typeof card.addedAt === 'number' ? card.addedAt : null;
    // A never-reviewed card carries `lastReviewedAt: 0` in a fresh SRS state, and
    // 0 is a real epoch. Sorting by "last used" must put it with the nulls.
    const reviewed = card.srs?.lastReviewedAt;
    const lastUsedAt = typeof reviewed === 'number' && reviewed > 0 ? reviewed : null;
    const folder = typeof card.folder === 'string' && card.folder ? card.folder : null;
    if (folder) {
      const bucket = perFolder.get(folder) ?? { count: 0, newest: null };
      bucket.count += 1;
      if (createdAt !== null && (bucket.newest === null || createdAt > bucket.newest)) {
        bucket.newest = createdAt;
      }
      perFolder.set(folder, bucket);
    }
    out.push({
      id: `deck-card:${card.id}`,
      name: cardName(card),
      kind: 'mined-card',
      categoryId: categoryForKind('mined-card'),
      provenance: provenanceForCard(card.textProvenance),
      // A card is rows in a JSON blob; it has no size of its own, and dividing
      // the store's bytes by the card count would be an invented number.
      sizeBytes: null,
      createdAt,
      modifiedAt: null,
      lastUsedAt,
      location: {
        store: 'localStorage' as const,
        key: FLASHCARD_DECK_STORAGE_KEY,
        pointer: card.id,
      },
      // Every row in this store IS a mined card; that is what the store is for.
      flags: {
        mined: true,
        hasNotes: Boolean(card.sentence),
        ...(card.ankiExported ? { exported: true } : {}),
      },
      source: 'local-deck',
    });
  }

  for (const [folder, bucket] of perFolder) {
    out.push({
      id: `deck-folder:${folder}`,
      name: folder,
      kind: 'deck',
      categoryId: categoryForKind('deck'),
      // A folder is a container the user made; it makes no claim about how the
      // text inside it was produced.
      provenance: 'app-generated' as const,
      sizeBytes: null,
      createdAt: null,
      modifiedAt: bucket.newest,
      lastUsedAt: null,
      location: {
        store: 'localStorage' as const,
        key: FLASHCARD_DECK_STORAGE_KEY,
        pointer: `folders/${folder}`,
      },
      flags: { mined: bucket.count > 0 },
      source: 'local-deck',
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Per-book highlights — `outputs/highlights`.
 * ------------------------------------------------------------------ */

/**
 * One row per colour highlight, read through the annotation store's own parser.
 *
 * These live under one `jp-annotations:<bookId>` key per book, so there is no
 * single key to read — the owner's `collectAllAnnotationsMap()` is what walks
 * the prefix, and using it means a legacy row the reader accepts cannot vanish
 * from the catalogue because Files invented a stricter rule.
 */
export function annotationFilesItems(
  byBook: Record<string, Annotation[]> = collectAllAnnotationsMap(),
): FilesItem[] {
  const out: FilesItem[] = [];
  for (const [bookId, marks] of Object.entries(byBook)) {
    for (const mark of marks) {
      if (!mark || typeof mark.id !== 'string') continue;
      const text = typeof mark.text === 'string' ? mark.text.trim() : '';
      out.push({
        id: `annotation:${bookId}:${mark.id}`,
        name: text || mark.id,
        kind: 'highlight',
        categoryId: categoryForKind('highlight'),
        // A highlight is a span the user marked in a book they were reading, so
        // its text came out of the book.
        provenance: 'book-text' as const,
        sizeBytes: null,
        createdAt: typeof mark.createdAt === 'number' ? mark.createdAt : null,
        modifiedAt: null,
        lastUsedAt: null,
        location: {
          store: 'localStorage' as const,
          key: `${ANNOTATIONS_STORAGE_PREFIX}${bookId}`,
          pointer: mark.id,
        },
        flags: {},
        source: 'highlights',
      });
    }
  }
  return out;
}

/** `localStorage.getItem` where a store may not exist at all (tests, preview). */
function readLocalStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Every renderer-owned enumerator, in one place. */
export const RENDERER_FILES_ENUMERATORS: readonly {
  source: string;
  run: () => FilesItem[];
}[] = [
  { source: 'notebook', run: () => notebookFilesItems() },
  { source: 'local-deck', run: () => flashcardDeckFilesItems() },
  { source: 'highlights', run: () => annotationFilesItems() },
];

/**
 * Join the renderer-owned items onto a snapshot built in main.
 *
 * Ids already present win, so a store that ever becomes readable from both
 * sides cannot produce two rows for one item. Each renderer enumerator reports
 * itself alongside the main ones for the same reason they do: a category at 0
 * has to be distinguishable from a reader that failed.
 */
export function withRendererItems(snapshot: FilesIndexSnapshot): FilesIndexSnapshot {
  const items = [...snapshot.items];
  const seen = new Set(items.map((item) => item.id));
  const reports = [...snapshot.enumerators];

  for (const enumerator of RENDERER_FILES_ENUMERATORS) {
    const started = Date.now();
    try {
      let kept = 0;
      for (const item of enumerator.run()) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
        kept += 1;
      }
      reports.push({ source: enumerator.source, itemCount: kept, elapsedMs: Date.now() - started });
    } catch (err) {
      reports.push({
        source: enumerator.source,
        itemCount: 0,
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ...snapshot, items, counts: countByCategory(items), enumerators: reports };
}
