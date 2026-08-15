// Read the app's own local Flashcards deck into the normalized Anki draft —
// Phase 1 source adapter 4 of ANKI_DECK_WORKBENCH_PLAN.md, the sibling of
// `ankiCsv.ts` (adapter 3) and `apkgDraftRead.ts` (adapter 1).
//
// This one is pure and lives in `shared/` with no main-process half on purpose:
// `jp-flashcard-deck` is a **renderer** localStorage store (see
// `renderer/flashcardDeck.ts`), so there is no file for main to read and an IPC
// round trip would only ship the deck out and the draft back. The renderer calls
// this directly with the cards it already holds.

import {
  ANKI_FIELD_SEP,
  buildAnkiDraft,
  type AnkiDraft,
  type RawAnkiCardRow,
  type RawAnkiCollection,
  type RawAnkiDeckRow,
  type RawAnkiNoteRow,
  type RawAnkiNoteTypeRow,
} from './ankiDraft';
import { isLocalSrsState, LOCAL_SRS_DEFAULT_EASE, type LocalSrsState } from './localSrs';

/**
 * The subset of `DeckFlashcard` this adapter reads.
 *
 * Structurally typed rather than imported: `renderer/flashcardDeck.ts` pulls in
 * localStorage, IndexedDB mirroring and companion events at module scope, and
 * `shared/` may not depend on any of that.
 */
export interface LocalDeckCardInput {
  id: string;
  word?: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
  front?: string;
  back?: string;
  source?: string;
  bookTitle?: string;
  folder?: string;
  studyKind?: string;
  frequency?: number;
  jlptLevel?: string;
  audioDataUrl?: string;
  audioPath?: string;
  imagePath?: string;
  known?: boolean;
  srs?: unknown;
  addedAt?: number;
}

export const LOCAL_DECK_NOTE_TYPE_ID = 'local-notetype-1';
export const LOCAL_DECK_NOTE_TYPE_NAME = 'JP Study Local';
export const LOCAL_DECK_ROOT_ID = 'local-deck-root';

/**
 * The note type this adapter synthesizes.
 *
 * One note type, not two. A local card carries `word/reading/meaning/sentence`
 * *and* optionally a free-form `front`/`back` override, and splitting those into
 * a vocabulary type and a basic type would make the same card change note type
 * the moment a user typed a custom front — which in Anki means deleting the note
 * and its scheduling. The template does the switching instead, exactly as an
 * Anki user would write it, and every card keeps one identity.
 */
export const LOCAL_DECK_FIELD_NAMES: readonly string[] = [
  'Expression',
  'Reading',
  'Meaning',
  'Sentence',
  'Front',
  'Back',
  'Audio',
  'Image',
];

const FRONT_TEMPLATE =
  '{{#Front}}{{Front}}{{/Front}}{{^Front}}{{Expression}}{{/Front}}\n{{Audio}}';
const BACK_TEMPLATE =
  '{{FrontSide}}\n<hr id=answer>\n{{#Back}}{{Back}}{{/Back}}{{^Back}}' +
  '<div class=reading>{{Reading}}</div>\n<div class=meaning>{{Meaning}}</div>\n' +
  '<div class=sentence>{{Sentence}}</div>{{/Back}}\n{{Image}}';

const LOCAL_DECK_CSS =
  '.card { font-family: sans-serif; font-size: 24px; text-align: center; }\n' +
  '.reading { font-size: 18px; opacity: 0.8; }\n' +
  '.sentence { font-size: 16px; opacity: 0.7; }';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BuildLocalDeckOptions {
  /** Root deck name. Folders become subdecks of it. */
  rootDeckName?: string;
  /** Folder list from the store, so an empty folder still appears as a deck. */
  folders?: readonly string[];
  /** Origin for review-card day numbers; defaults to the earliest `addedAt`. */
  nowMs?: number;
}

export interface LocalDeckSummary {
  /** Cards read out of the store, before any of them became notes. */
  cardsRead: number;
  /** Cards skipped because they carry no id. */
  skipped: number;
  /** Cards that reached a real SRS state; the rest are new. */
  scheduled: number;
  /** Cards whose audio is an inline `data:` URL — real audio Anki cannot file. */
  inlineAudio: number;
  /** Distinct folder names that became subdecks, including empty ones. */
  folders: number;
}

export interface LocalDeckCollection {
  raw: RawAnkiCollection;
  summary: LocalDeckSummary;
  /** Collection origin in epoch seconds — `source.createdAtSec` for the draft. */
  createdAtSec: number;
  fingerprint: string;
}

/** Anki tags are whitespace-separated, so a tag may not contain whitespace. */
export function localDeckTag(prefix: string, value: string): string {
  // Trim before collapsing, not after: `'  '` collapses to `'_'`, which is
  // truthy and would ship a tag made of one underscore.
  const cleaned = String(value ?? '')
    .trim()
    .replace(/"/g, '')
    .replace(/\s+/g, '_');
  return cleaned ? `${prefix}::${cleaned}` : '';
}

function leafName(reference: string): string {
  const cut = String(reference ?? '').split(/[\\/]/);
  return cut[cut.length - 1] ?? reference;
}

/**
 * Deterministic content fingerprint.
 *
 * `node:crypto` is not available to a renderer module and the fingerprint only
 * has to answer "did the store move under this preview", so a 64-bit FNV-1a over
 * the identity-plus-mutable fields of every card is enough. Two 32-bit lanes
 * because JavaScript bitwise math is 32-bit.
 */
export function fingerprintLocalDeck(cards: readonly LocalDeckCardInput[]): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const feed = (text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      a = Math.imul(a ^ code, 0x01000193) >>> 0;
      b = Math.imul(b ^ (code + i), 0x85ebca6b) >>> 0;
    }
  };
  for (const card of cards) {
    const srs = isLocalSrsState(card.srs) ? card.srs : undefined;
    feed(
      [
        card.id,
        card.word ?? '',
        card.reading ?? '',
        card.meaning ?? '',
        card.sentence ?? '',
        card.front ?? '',
        card.back ?? '',
        card.folder ?? '',
        card.known ? '1' : '0',
        srs ? `${srs.dueAt}:${srs.intervalDays}:${srs.ease}:${srs.repetitions}:${srs.lapses}` : '',
      ].join(' '),
    );
  }
  return `fnv1a64:${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

function noteTypeRow(): RawAnkiNoteTypeRow {
  return {
    id: LOCAL_DECK_NOTE_TYPE_ID,
    name: LOCAL_DECK_NOTE_TYPE_NAME,
    type: 0,
    css: LOCAL_DECK_CSS,
    sortf: 0,
    fields: LOCAL_DECK_FIELD_NAMES.map((name, ord) => ({ ord, name })),
    templates: [
      {
        ord: 0,
        name: 'Recognition',
        qfmt: FRONT_TEMPLATE,
        afmt: BACK_TEMPLATE,
        bqfmt: '',
        bafmt: '',
      },
    ],
    // Deliberately *not* `unassigned`: unlike a CSV, this source really does
    // define a card design, so the draft is exportable rather than blocked.
  };
}

/**
 * Map one local SRS state onto Anki's card columns.
 *
 * The local scheduler is a two-button SM-2 with a ten-minute relearning step, so
 * only three of Anki's states are reachable and the mapping is total. `newIndex`
 * is the new-card queue position Anki wants in `due` for an unscheduled card —
 * the store has no such column, so insertion order is used and stays stable.
 */
export function localSrsToCardColumns(
  srs: LocalSrsState | undefined,
  newIndex: number,
  createdAtSec: number,
): Pick<RawAnkiCardRow, 'type' | 'queue' | 'due' | 'ivl' | 'factor' | 'reps' | 'lapses'> {
  if (!srs) {
    return {
      type: 0,
      queue: 0,
      due: newIndex + 1,
      ivl: 0,
      // 0, not the default ease: Anki writes 0 on a card that never graduated,
      // and inventing 2500 here would claim a review history that never happened.
      factor: 0,
      reps: 0,
      lapses: 0,
    };
  }
  const factor = Math.round((srs.ease || LOCAL_SRS_DEFAULT_EASE) * 1000);
  if (srs.intervalDays < 1) {
    // A lapse: local `again` puts the card on a ten-minute step, which is Anki's
    // relearning type in the learning queue with an epoch-second due.
    return {
      type: 3,
      queue: 1,
      due: Math.round(srs.dueAt / 1000),
      ivl: 0,
      factor,
      reps: srs.repetitions,
      lapses: srs.lapses,
    };
  }
  return {
    type: 2,
    queue: 2,
    // A review card's `due` is a day number counted from the collection origin.
    due: Math.round((srs.dueAt - createdAtSec * 1000) / DAY_MS),
    ivl: Math.round(srs.intervalDays),
    factor,
    reps: srs.repetitions,
    lapses: srs.lapses,
  };
}

/**
 * Read the local store into raw rows `buildAnkiDraft` can consume.
 *
 * Total: a malformed card never throws, because a store this adapter refuses to
 * open is a deck the user can see in the app and not in the workbench.
 */
export function buildLocalDeckCollection(
  cards: readonly LocalDeckCardInput[],
  options: BuildLocalDeckOptions = {},
): LocalDeckCollection {
  const rootName = (options.rootDeckName ?? 'Local flashcards').trim() || 'Local flashcards';
  const usable = cards.filter((card) => card && typeof card.id === 'string' && card.id);
  const skipped = cards.length - usable.length;

  const addedTimes = usable
    .map((card) => Number(card.addedAt))
    .filter((value) => Number.isFinite(value) && value > 0);
  const originMs = addedTimes.length ? Math.min(...addedTimes) : options.nowMs ?? Date.now();
  // Midnight UTC of the earliest card, which is what Anki's `crt` is: the origin
  // day numbers count from. Truncating to a day keeps it stable when a card is
  // added later in the same day.
  const createdAtSec = Math.floor(originMs / DAY_MS) * (DAY_MS / 1000);

  const decks = new Map<string, RawAnkiDeckRow>();
  decks.set(rootName, { id: LOCAL_DECK_ROOT_ID, name: rootName });
  const deckIdFor = (folder: string | undefined): string => {
    const name = folder?.trim() ? `${rootName}::${folder.trim()}` : rootName;
    const existing = decks.get(name);
    if (existing) return String(existing.id);
    const id = `local-deck-${decks.size}`;
    decks.set(name, { id, name });
    return id;
  };
  for (const folder of options.folders ?? []) deckIdFor(folder);
  const foldersBefore = decks.size - 1;

  const notes: RawAnkiNoteRow[] = [];
  const cardRows: RawAnkiCardRow[] = [];
  let scheduled = 0;
  let inlineAudio = 0;

  usable.forEach((card, index) => {
    const srs = isLocalSrsState(card.srs) ? card.srs : undefined;
    if (srs) scheduled += 1;
    if (card.audioDataUrl && !card.audioPath) inlineAudio += 1;

    // A managed clip becomes the `[sound:]` / `<img>` markup Anki stores inside
    // the field, which is the only representation an export can carry. An inline
    // `data:` URL is left as-is: `mediaRefsInField` skips it by design, so it
    // reports as text rather than as a media file that is missing.
    const audio = card.audioPath
      ? `[sound:${leafName(card.audioPath)}]`
      : card.audioDataUrl
        ? `[sound:${card.audioDataUrl}]`
        : '';
    const image = card.imagePath ? `<img src="${leafName(card.imagePath)}">` : '';

    const fields = [
      card.word ?? '',
      card.reading ?? '',
      card.meaning ?? '',
      card.sentence ?? '',
      card.front ?? '',
      card.back ?? '',
      audio,
      image,
    ];

    const tags = [
      localDeckTag('src', card.source ?? ''),
      localDeckTag('jlpt', card.jlptLevel ?? ''),
      localDeckTag('book', card.bookTitle ?? ''),
      localDeckTag('study', card.studyKind ?? ''),
      // The app's own rollup, named as the app's own: the plan forbids letting
      // an app label look like Anki review evidence.
      card.known ? 'jp-study::known' : '',
    ].filter(Boolean);

    const deckId = deckIdFor(card.folder);
    const modifiedAtSec = Math.round(Number(card.addedAt ?? originMs) / 1000);

    notes.push({
      id: card.id,
      // The store's own card id *is* the stable cross-collection identity here:
      // it survives export, reimport and folder moves, which is exactly what a
      // guid is for. Nothing is invented.
      guid: card.id,
      mid: LOCAL_DECK_NOTE_TYPE_ID,
      mod: modifiedAtSec,
      tags: tags.join(' '),
      flds: fields.join(ANKI_FIELD_SEP),
    });

    cardRows.push({
      id: `${card.id}-c0`,
      nid: card.id,
      did: deckId,
      ord: 0,
      mod: modifiedAtSec,
      left: 0,
      flags: 0,
      ...localSrsToCardColumns(srs, index, createdAtSec),
    });
  });

  return {
    createdAtSec,
    fingerprint: fingerprintLocalDeck(usable),
    summary: {
      cardsRead: cards.length,
      skipped,
      scheduled,
      inlineAudio,
      folders: Math.max(foldersBefore, decks.size - 1),
    },
    raw: {
      col: { crt: createdAtSec, mod: Date.now() },
      notes,
      cards: cardRows,
      decks: [...decks.values()],
      noteTypes: [noteTypeRow()],
      // `revlog` and `mediaFiles` stay undefined — "not read", not "empty". The
      // local store keeps no per-review log, and the renderer cannot see the
      // managed media folder, so claiming an empty manifest would make every
      // real clip report as missing media.
    },
  };
}

export interface LocalDeckDraftResult {
  draft: AnkiDraft;
  summary: LocalDeckSummary;
}

/** The whole adapter: local cards in, normalized draft out. */
export function buildLocalDeckDraft(
  cards: readonly LocalDeckCardInput[],
  normalize: (raw: string) => string,
  options: BuildLocalDeckOptions = {},
): LocalDeckDraftResult {
  const collection = buildLocalDeckCollection(cards, options);
  const draft = buildAnkiDraft(collection.raw, {
    source: {
      kind: 'local-deck',
      label: (options.rootDeckName ?? 'Local flashcards').trim() || 'Local flashcards',
      createdAtSec: collection.createdAtSec,
      modifiedAtMs: options.nowMs ?? Date.now(),
      fingerprint: collection.fingerprint,
    },
    normalize,
  });
  return { draft, summary: collection.summary };
}
