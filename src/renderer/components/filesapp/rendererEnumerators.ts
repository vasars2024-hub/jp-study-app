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
  deriveMinedFlags,
  filesItemPathKey,
  type FilesIndexSnapshot,
  type FilesItem,
  type FilesItemKind,
  type FilesProvenance,
} from '../../../shared/filesApp/catalog';
import { minedSourceIdFromBookId } from '../../../shared/filesApp/mining';
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
import { LEGACY_SAVED_KEY, loadSaved, savedWordsKey, type SavedWord } from '../../savedWords';
import {
  LOOKUP_HISTORY_STORAGE_KEY,
  loadLookupHistory,
  type LookupHistoryEntry,
} from '../../lookupHistory';
import {
  TRANSLATION_HISTORY_STORAGE_KEY,
  loadTranslationHistory,
  type TranslationHistoryEntry,
} from '../../translationHistory';
import { knowledgeKey, listKnownEntries } from '../../knownWords';
import { loadClipboardHistory, type ClipboardEntry } from '../../clipboardHistory';
import { LS_KEYS } from '../../storage/storage';

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

/* ------------------------------------------------------------------ *
 * The four study-record streams Notebook aggregated and Files could not see.
 * ------------------------------------------------------------------ */

/**
 * Gate 7's absorption half, and why these live here rather than in main.
 *
 * `notebook/aggregate.ts` merges twelve streams into one timeline. Four of them
 * — saved words, dictionary lookups, translations and known words — plus the
 * clipboard are renderer `localStorage` stores that had **no Files enumerator
 * at all**, so deleting the Notebook section without them would take a real
 * capability away rather than absorb it. The other seven streams are already
 * covered: `flashcards`/`mining` by `local-deck`, `anki` by the main `decks` and
 * `drafts` enumerators, `highlights` by `highlights`, and `ocr`/`audio`/
 * `extension`/`media` by the timeline store itself, which `notebook` reads.
 *
 * Every row here is `provenance: 'app-generated'` for one reason, stated once:
 * provenance in this catalogue is a claim about how a piece of *text* was
 * produced, and none of these records is mined text. A lookup is a thing the
 * app wrote down about an action. Stamping `book-text` on one because its
 * context sentence came from a book would put a trust mark on a row that makes
 * no such claim.
 *
 * `createdAt` is never synthesised. The Notebook gives known words
 * `Date.now() - level * 1000` so they sort; that number means nothing, and a
 * catalogue that shows it in a Date column is showing an invented value. Here
 * it stays `null`, which gate 14 already sorts predictably (nulls last, both
 * directions).
 */
function studyRecord(
  id: string,
  name: string,
  key: string,
  pointer: string,
  source: string,
  times: { createdAt?: number | null; modifiedAt?: number | null; lastUsedAt?: number | null },
  flags: FilesItem['flags'] = {},
): FilesItem {
  return {
    id,
    name,
    kind: 'note',
    categoryId: categoryForKind('note'),
    provenance: 'app-generated',
    // A row in a JSON blob has no size of its own; dividing the store's bytes
    // by the row count would be an invented number.
    sizeBytes: null,
    createdAt: times.createdAt ?? null,
    modifiedAt: times.modifiedAt ?? null,
    lastUsedAt: times.lastUsedAt ?? null,
    location: { store: 'localStorage', key, pointer },
    flags,
    source,
  };
}

/** A word the user saved from the dictionary. `word` is the store's own key. */
export function savedWordFilesItems(
  entries: readonly SavedWord[] = loadSavedWordsSafely(),
  key: string = savedWordsKeySafely(),
): FilesItem[] {
  return entries.flatMap((entry) => {
    const word = typeof entry?.word === 'string' ? entry.word.trim() : '';
    if (!word) return [];
    const reading = typeof entry.reading === 'string' ? entry.reading.trim() : '';
    return [
      studyRecord(
        `saved-word:${word}`,
        reading && reading !== word ? `${word}（${reading}）` : word,
        key,
        word,
        'saved-words',
        { createdAt: typeof entry.addedAt === 'number' ? entry.addedAt : null },
        { hasNotes: Boolean(entry.meaning) },
      ),
    ];
  });
}

/**
 * One row per dictionary lookup.
 *
 * `firstAt` is when it was created and `at` is when it was last looked up, so
 * both columns say something true and different — this store is the one place
 * in the app where a "looked up 9 times" row exists, and it is exactly what a
 * user comes to a filing system to find again.
 */
export function lookupHistoryFilesItems(
  entries: readonly LookupHistoryEntry[] = loadLookupHistorySafely(),
): FilesItem[] {
  return entries.flatMap((entry) => {
    const lemma = typeof entry?.lemma === 'string' ? entry.lemma.trim() : '';
    const query = typeof entry?.query === 'string' ? entry.query.trim() : '';
    const name = lemma || query;
    if (!name) return [];
    return [
      studyRecord(
        `lookup:${query || lemma}`,
        name,
        LOOKUP_HISTORY_STORAGE_KEY,
        query || lemma,
        'lookups',
        {
          createdAt: typeof entry.firstAt === 'number' ? entry.firstAt : null,
          lastUsedAt: typeof entry.at === 'number' ? entry.at : null,
        },
        { hasNotes: Boolean(entry.meaning) },
      ),
    ];
  });
}

/** One row per translation, named by its source text rather than its id. */
export function translationHistoryFilesItems(
  entries: readonly TranslationHistoryEntry[] = loadTranslationHistorySafely(),
): FilesItem[] {
  return entries.flatMap((entry) => {
    if (!entry || typeof entry.id !== 'string') return [];
    const source = typeof entry.sourceText === 'string' ? entry.sourceText.trim() : '';
    return [
      studyRecord(
        `translation:${entry.id}`,
        source.slice(0, 120) || entry.id,
        TRANSLATION_HISTORY_STORAGE_KEY,
        entry.id,
        'translations',
        { createdAt: typeof entry.ts === 'number' ? entry.ts : null },
        { hasNotes: Boolean(entry.resultText) },
      ),
    ];
  });
}

/**
 * One row per known word, at level 1 or higher.
 *
 * `listKnownEntries` already drops level 0 — an unknown word is not a record of
 * anything — so the count here is the same one the Notebook's `known` stream
 * reports, not a differently-filtered number that would read as a discrepancy.
 */
export function knownWordFilesItems(
  entries: readonly { word: string; level: number }[] = listKnownEntriesSafely(),
  key: string = knowledgeKeySafely(),
): FilesItem[] {
  return entries.flatMap((entry) => {
    const word = typeof entry?.word === 'string' ? entry.word.trim() : '';
    if (!word) return [];
    return [
      studyRecord(`known-word:${word}`, word, key, word, 'known-words', {}, {
        // The level is the whole content of this row; without it the row is a
        // bare word and the store it came from is unguessable.
        hasNotes: entry.level > 0,
      }),
    ];
  });
}

/**
 * One row per clipboard capture.
 *
 * `pinned` and `favorite` are deliberately NOT mapped onto a flag: there is no
 * `starred` in `FilesItemFlags` yet, and gate 18 is where Favorites is built.
 * Borrowing `referenced` or `enabled` to carry it would put a wrong word in a
 * column that means something else.
 */
export function clipboardFilesItems(
  entries: readonly ClipboardEntry[] = loadClipboardHistorySafely(),
): FilesItem[] {
  return entries.flatMap((entry) => {
    if (!entry || typeof entry.id !== 'string') return [];
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';
    return [
      studyRecord(
        `clipboard:${entry.id}`,
        text.slice(0, 120) || entry.id,
        LS_KEYS.clipboardHistory,
        entry.id,
        'clipboard',
        { createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : null },
        { hasNotes: Boolean(text) },
      ),
    ];
  });
}

/* ------------------------------------------------------------------ *
 * Safe readers. Each owner's loader touches `localStorage` (and, for saved and
 * known words, the study-language setting) at call time; in a test or a preview
 * window neither need exist. A throwing enumerator would take the whole index
 * down, and gate 1 wants an honest zero, not a failed build.
 * ------------------------------------------------------------------ */

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

const loadSavedWordsSafely = () => safely(loadSaved, [] as SavedWord[]);
const savedWordsKeySafely = () => safely(() => savedWordsKey(), `${LEGACY_SAVED_KEY}-ja`);
const loadLookupHistorySafely = () => safely(loadLookupHistory, [] as LookupHistoryEntry[]);
const loadTranslationHistorySafely = () =>
  safely(loadTranslationHistory, [] as TranslationHistoryEntry[]);
const listKnownEntriesSafely = () => safely(listKnownEntries, [] as { word: string; level: number }[]);
const knowledgeKeySafely = () => safely(() => knowledgeKey(), 'jp-word-knowledge-ja');
const loadClipboardHistorySafely = () => safely(loadClipboardHistory, [] as ClipboardEntry[]);

/** `localStorage.getItem` where a store may not exist at all (tests, preview). */
function readLocalStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The Files rows the local deck proves have been mined, read from the same
 * store the cards themselves come from (D421).
 *
 * Kept separate from {@link flashcardDeckFilesItems} rather than folded into it:
 * that one answers "what rows does the deck contribute", this one answers "what
 * does the deck say about rows somebody else contributed", and only the second
 * may reach across into another enumerator's output.
 */
export function minedSourceIdsFromDeck(
  raw: string | null = readLocalStorage(FLASHCARD_DECK_STORAGE_KEY),
): Set<string> {
  const { store } = parseFlashcardDeckStore(raw);
  const out = new Set<string>();
  for (const card of store.cards) {
    const id = minedSourceIdFromBookId(card?.bookId);
    if (id) out.add(id);
  }
  return out;
}

/** Every renderer-owned enumerator, in one place. */
export const RENDERER_FILES_ENUMERATORS: readonly {
  source: string;
  run: () => FilesItem[];
}[] = [
  { source: 'notebook', run: () => notebookFilesItems() },
  { source: 'local-deck', run: () => flashcardDeckFilesItems() },
  { source: 'highlights', run: () => annotationFilesItems() },
  { source: 'saved-words', run: () => savedWordFilesItems() },
  { source: 'lookups', run: () => lookupHistoryFilesItems() },
  { source: 'translations', run: () => translationHistoryFilesItems() },
  { source: 'known-words', run: () => knownWordFilesItems() },
  { source: 'clipboard', run: () => clipboardFilesItems() },
];

/**
 * Join the renderer-owned items onto a snapshot built in main.
 *
 * Ids already present win, so a store that ever becomes readable from both
 * sides cannot produce two rows for one item. Each renderer enumerator reports
 * itself alongside the main ones for the same reason they do: a category at 0
 * has to be distinguishable from a reader that failed.
 *
 * File-backed rows additionally dedupe on `filesItemPathKey`, the same rule
 * `buildFilesIndex` applies, because namespaced ids do not collide when two
 * stores describe one file. Every renderer enumerator is localStorage-backed
 * today, so this drops nothing now — it is here so that the first one which
 * ever points at a real path cannot silently double a row main already has.
 */
export function withRendererItems(snapshot: FilesIndexSnapshot): FilesIndexSnapshot {
  const items = [...snapshot.items];
  const seen = new Set(items.map((item) => item.id));
  const seenPaths = new Set(
    items.map((item) => filesItemPathKey(item)).filter((key): key is string => key !== null),
  );
  const reports = [...snapshot.enumerators];

  for (const enumerator of RENDERER_FILES_ENUMERATORS) {
    const started = Date.now();
    try {
      let kept = 0;
      let duplicatePaths = 0;
      for (const item of enumerator.run()) {
        if (seen.has(item.id)) continue;
        const pathKey = filesItemPathKey(item);
        if (pathKey !== null && seenPaths.has(pathKey)) {
          duplicatePaths += 1;
          continue;
        }
        seen.add(item.id);
        if (pathKey !== null) seenPaths.add(pathKey);
        items.push(item);
        kept += 1;
      }
      reports.push({
        source: enumerator.source,
        itemCount: kept,
        elapsedMs: Date.now() - started,
        ...(duplicatePaths ? { duplicatePathCount: duplicatePaths } : {}),
      });
    } catch (err) {
      reports.push({
        source: enumerator.source,
        itemCount: 0,
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // After the join, never inside it: the deck is one enumerator's output and the
  // rows it marks belong to others, so this can only run once every side has
  // contributed. Same placement rule, and same reason, as `deriveCrossStoreFlags`.
  //
  // Guarded on the same terms as the enumerators above, and for a reason worth
  // keeping: this pass reads a store, so it can fail the way a reader fails, and
  // it runs OUTSIDE the loop that catches those. Unguarded it took the entire
  // index down — every category to 0 — when the deck module was unreadable. A
  // failure here must cost the mined flags and nothing else, and it is reported
  // rather than swallowed so "no source is mined" stays distinguishable from
  // "the deck could not be read".
  const derivedStarted = Date.now();
  let derived = items;
  try {
    derived = deriveMinedFlags(items, minedSourceIdsFromDeck());
  } catch (err) {
    reports.push({
      source: 'local-deck-mined',
      itemCount: 0,
      elapsedMs: Date.now() - derivedStarted,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { ...snapshot, items: derived, counts: countByCategory(derived), enumerators: reports };
}
