// Map AnkiConnect's read responses onto the normalized draft's raw rows —
// Phase 1 source adapter 2 of ANKI_DECK_WORKBENCH_PLAN.md.
//
// Pure and I/O-free on purpose: every shape below was captured from a live
// AnkiConnect 6 on a real collection, so a fixture is a literal and the mapping
// can be tested without Anki running. The transport half lives in
// `main/anki/connectDraftRead.ts`.
//
// The one action that matters is `findModelsByName`: it returns Anki's whole
// model row (`id`, `type`, `sortf`, `flds`, `tmpls`, `css`, `latexPre/Post`),
// which is `RawAnkiNoteTypeRow` almost verbatim. `modelFieldNames` +
// `modelTemplates` + `modelStyling` would need three round trips per note type
// and still would not report `type` (cloze) or `sortf`.

import {
  ANKI_FIELD_SEP,
  type RawAnkiCardRow,
  type RawAnkiCollection,
  type RawAnkiDeckRow,
  type RawAnkiNoteRow,
  type RawAnkiNoteTypeRow,
} from './ankiDraft';

/** `notesInfo` — fields arrive keyed by name, with their own ordinal. */
export interface AnkiConnectNoteInfo {
  noteId: number;
  modelName?: string;
  tags?: string[];
  fields?: Record<string, { value?: string; order?: number }>;
  /** Epoch seconds. */
  mod?: number;
  cards?: number[];
  profile?: string;
}

/** `cardsInfo` — the scheduler columns, plus the deck by name rather than by id. */
export interface AnkiConnectCardInfo {
  cardId: number;
  note?: number;
  deckName?: string;
  modelName?: string;
  ord?: number;
  type?: number;
  queue?: number;
  due?: number;
  interval?: number;
  factor?: number;
  reps?: number;
  lapses?: number;
  left?: number;
  mod?: number;
  flags?: number;
}

/** `findModelsByName` / `findModelsById` — Anki's model row as stored. */
export interface AnkiConnectModel {
  id: number;
  name: string;
  type?: number;
  css?: string;
  sortf?: number;
  latexPre?: string;
  latexPost?: string;
  flds?: Array<{ name?: string; ord?: number; sticky?: boolean; rtl?: boolean; font?: string; size?: number }>;
  tmpls?: Array<{
    name?: string;
    ord?: number;
    qfmt?: string;
    afmt?: string;
    bqfmt?: string;
    bafmt?: string;
    did?: number | null;
  }>;
}

export interface AnkiConnectDraftInput {
  /** `deckNamesAndIds`: deck name to deck id. */
  deckNamesAndIds: Readonly<Record<string, number>>;
  models: readonly AnkiConnectModel[];
  notes: readonly AnkiConnectNoteInfo[];
  cards: readonly AnkiConnectCardInfo[];
  /**
   * Decks the reader confirmed are filtered ("custom study"). AnkiConnect's
   * `deckNamesAndIds` does not report `dyn`, and a filtered deck's cards are on
   * loan — the workbench marks them read-only, so guessing `false` for all of
   * them would offer edits that cannot be applied.
   */
  filteredDeckNames?: readonly string[];
}

export interface AnkiConnectDraftShape {
  raw: RawAnkiCollection;
  /** Model names a note referenced that `findModelsByName` did not return. */
  unknownModelNames: string[];
  /** Deck names a card referenced that `deckNamesAndIds` did not list. */
  unknownDeckNames: string[];
}

// ----- the `anki:readConnectDraft` contract -------------------------------------

/** Notes read in one `notesInfo`/`cardsInfo` round trip. Anki's own Browser pages far smaller. */
export const CONNECT_READ_CHUNK = 200;

/** Decks probed for `dyn` per read. A collection can hold thousands; a page touches few. */
export const CONNECT_FILTERED_PROBE_LIMIT = 32;

export interface ConnectDraftRequest {
  /** Anki search syntax. Empty reads the whole collection, exactly as `deck:*` would. */
  query?: string;
  noteOffset?: number;
  noteLimit?: number;
}

export interface ConnectDraftSummary {
  /** The query as sent, so a surface can show what was actually asked. */
  query: string;
  /** AnkiConnect API version the add-on reported. */
  apiVersion: number;
  /** Anki profile name, when a note reported one. */
  profile?: string;
  /** Notes the query matched before paging. */
  matchedNotes: number;
  /** Note types fetched for this page — only the ones its notes reference. */
  modelsRead: number;
  decksRead: number;
  filteredDecks: string[];
  /** True when more decks were referenced than `CONNECT_FILTERED_PROBE_LIMIT` allowed probing. */
  filteredProbeTruncated: boolean;
  unknownModelNames: string[];
  unknownDeckNames: string[];
}

export interface ConnectDraftResult {
  ok: boolean;
  /** One page: whole-collection deck/note-type headers, windowed notes and their cards. */
  draft?: import('./ankiDraft').AnkiDraft;
  noteOffset?: number;
  totalNotes?: number;
  connect?: ConnectDraftSummary;
  error?: string;
}

function modelRow(model: AnkiConnectModel): RawAnkiNoteTypeRow {
  return {
    id: String(model.id),
    name: String(model.name ?? ''),
    type: Number(model.type ?? 0),
    css: String(model.css ?? ''),
    sortf: Number(model.sortf ?? 0),
    latexPre: model.latexPre,
    latexPost: model.latexPost,
    fields: (model.flds ?? []).map((field, index) => ({
      ord: Number(field.ord ?? index),
      name: String(field.name ?? ''),
      sticky: Boolean(field.sticky),
      rtl: Boolean(field.rtl),
      font: field.font,
      size: field.size,
    })),
    templates: (model.tmpls ?? []).map((tmpl, index) => ({
      ord: Number(tmpl.ord ?? index),
      name: String(tmpl.name ?? ''),
      qfmt: String(tmpl.qfmt ?? ''),
      afmt: String(tmpl.afmt ?? ''),
      bqfmt: String(tmpl.bqfmt ?? ''),
      bafmt: String(tmpl.bafmt ?? ''),
      // Anki writes null, not 0, for "no deck override" here.
      did: tmpl.did ?? undefined,
    })),
  };
}

/**
 * Order a note's fields the way its model does.
 *
 * `notesInfo` returns an object, and object key order is insertion order, not
 * field order. Sorting on the reported `order` is what makes the joined `flds`
 * line up with the model's field names; getting it wrong would silently swap two
 * fields' contents on every note.
 */
export function joinConnectFields(fields: AnkiConnectNoteInfo['fields']): string {
  const entries = Object.entries(fields ?? {});
  entries.sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
  return entries.map(([, value]) => String(value?.value ?? '')).join(ANKI_FIELD_SEP);
}

/**
 * Build the raw collection from one page of live reads.
 *
 * Total: an unresolvable model or deck name is carried through as the name
 * itself rather than dropped, so `buildAnkiDraft` reports it as an
 * `unknown-note-type` (blocking) or `missing-deck` (warning) instead of the
 * draft quietly losing a note.
 */
export function buildAnkiConnectCollection(input: AnkiConnectDraftInput): AnkiConnectDraftShape {
  const filtered = new Set(input.filteredDeckNames ?? []);
  const decks: RawAnkiDeckRow[] = Object.entries(input.deckNamesAndIds).map(([name, id]) => ({
    id: String(id),
    name,
    dyn: filtered.has(name) ? 1 : 0,
  }));
  const deckIdByName = new Map(Object.entries(input.deckNamesAndIds).map(([name, id]) => [name, String(id)]));

  const noteTypes = input.models.map(modelRow);
  const modelIdByName = new Map(noteTypes.map((row) => [row.name, String(row.id)]));

  const unknownModelNames = new Set<string>();
  const unknownDeckNames = new Set<string>();

  const notes: RawAnkiNoteRow[] = input.notes.map((note) => {
    const modelName = String(note.modelName ?? '');
    const mid = modelIdByName.get(modelName);
    if (!mid) unknownModelNames.add(modelName);
    return {
      id: String(note.noteId),
      // AnkiConnect exposes no `guid`. It is left empty rather than filled with
      // the note id: a guid is what survives an export/reimport into another
      // collection, and a note id is exactly what does not.
      guid: '',
      mid: mid ?? modelName,
      mod: Number(note.mod ?? 0),
      tags: (note.tags ?? []).join(' '),
      flds: joinConnectFields(note.fields),
      // `notes.flags` and `notes.data` are not exposed either; both are
      // Anki-reserved and neither is edited by the workbench.
      flags: 0,
      data: '',
    };
  });

  const cards: RawAnkiCardRow[] = input.cards.map((card) => {
    const deckName = String(card.deckName ?? '');
    const did = deckIdByName.get(deckName);
    if (!did) unknownDeckNames.add(deckName);
    return {
      id: String(card.cardId),
      nid: String(card.note ?? ''),
      did: did ?? deckName,
      ord: Number(card.ord ?? 0),
      mod: Number(card.mod ?? 0),
      type: card.type,
      queue: card.queue,
      due: Number(card.due ?? 0),
      ivl: Number(card.interval ?? 0),
      factor: Number(card.factor ?? 0),
      reps: Number(card.reps ?? 0),
      lapses: Number(card.lapses ?? 0),
      left: Number(card.left ?? 0),
      flags: Number(card.flags ?? 0),
      // `odue`/`odid` are not in `cardsInfo`, so a card on loan to a filtered
      // deck cannot report its real deck. The deck's own `dyn` flag is what
      // makes the workbench treat it as read-only instead.
    };
  });

  return {
    unknownModelNames: [...unknownModelNames],
    unknownDeckNames: [...unknownDeckNames],
    raw: {
      notes,
      cards,
      decks,
      noteTypes,
      // Undefined, not empty: AnkiConnect has no revlog action and no media
      // manifest action, so neither was read. An empty `mediaFiles` would
      // accuse every real `[sound:]` in the collection of being missing.
    },
  };
}
