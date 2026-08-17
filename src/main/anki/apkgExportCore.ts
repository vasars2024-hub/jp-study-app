// Apply a workbench change set to an Anki collection database — the pure half
// of the .apkg exporter (Phase 6 of ANKI_DECK_WORKBENCH_PLAN.md).
//
// No Electron and no filesystem: the caller hands over an already-open sql.js
// database, exactly as `apkgDraftRead.ts` takes one, and for the same reason —
// the SQL round trip is where a silent wrong answer lives, so it has to be
// unit-testable against a real collection in both schemas.
//
// All-or-nothing by construction: every change is validated against the
// database before the first UPDATE runs, so a refusal never leaves a
// half-written collection. The caller only ever serializes a database this
// module returned from cleanly.

import crypto from 'node:crypto';
import { ANKI_FIELD_SEP, splitNoteFields } from '../../shared/ankiDraft';
import type { ApkgExportChangeSet, ApkgExportErrorCode } from '../../shared/ankiApkgExport';
import { readRawCollection, type SqlReadable } from './apkgDraftRead';

/** What sql.js will bind: its own `SqlValue`, minus BigInt which Anki never needs. */
type SqlParam = number | string | Uint8Array | null;

/** The slice of sql.js's `Database` this module writes through. */
export interface SqlWritable extends SqlReadable {
  exec(sql: string, params?: SqlParam[]): Array<{ columns: string[]; values: unknown[][] }>;
  run(sql: string, params?: SqlParam[]): unknown;
}

/** What the user can actually do about a deck name this build cannot write. */
const DECK_COLLATION_HELP =
  'This package stores deck names with a text rule (Anki’s "unicase" collation) that this build cannot apply, so nothing was written. Export the deck from Anki with "Support older Anki versions" checked and rename decks in that copy — every other edit exports from this package normally.';

/** A refusal that names what it refused, so the IPC result can carry a code. */
export class ExportRefusal extends Error {
  readonly code: ApkgExportErrorCode;
  constructor(code: ApkgExportErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Anki's `notes.csum`: the first 8 hex digits of the SHA-1 of the *stripped*
 * first field, as an integer. It feeds duplicate detection; leaving it stale
 * after a field edit would make Anki miss (or invent) duplicates for exactly
 * the notes the workbench touched.
 */
export function fieldChecksum(strippedFirstField: string): number {
  const hex = crypto.createHash('sha1').update(strippedFirstField, 'utf8').digest('hex');
  return parseInt(hex.slice(0, 8), 16);
}

/** Anki stores tags as ` a b ` — space-joined with sentinel spaces, or empty. */
function encodeTags(tags: readonly string[]): string {
  return tags.length ? ` ${tags.join(' ')} ` : '';
}

/**
 * The draft strips the `marked` tag into a flag and no journal op changes it,
 * so the source's own token (whatever its case) is preserved verbatim.
 */
function withMarkedToken(existingTagsStr: string, newTags: readonly string[]): string[] {
  const markedToken = existingTagsStr
    .split(/\s+/)
    .find((t) => t.toLowerCase() === 'marked');
  if (!markedToken || newTags.some((t) => t.toLowerCase() === 'marked')) return [...newTags];
  return [...newTags, markedToken];
}

/** Bind an Anki id — an integer column — as a number when it is one. */
function idParam(id: string): number | string {
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : id;
}

function firstRow(db: SqlWritable, sql: string, params: SqlParam[]): unknown[] | undefined {
  return db.exec(sql, params)[0]?.values?.[0];
}

export interface ApplyExportOptions {
  nowMs: number;
  /** The same normalizer the draft was read with (`stripFieldHtml`). */
  normalize: (raw: string) => string;
}

export interface ApplyExportResult {
  notesUpdated: number;
  cardsUpdated: number;
  decksUpdated: number;
  /** Recipe 17's remove half: card templates dropped from their note types. */
  templatesRemoved: number;
  /**
   * Cards those removals DELETED. Reported separately from `cardsUpdated`
   * because it is the only number in this result that describes destruction, and
   * folding it into an "updated" total would hide it.
   */
  cardsDeleted: number;
}

/**
 * Where a deck's name lives, decided by the same table test the reader uses:
 * schema 18 keeps `decks` normalized, everything older keeps a JSON blob in
 * `col.decks`. `undefined` means the collection has neither, which is a refusal
 * rather than a silent skip — a rename the user asked for must not evaporate.
 */
function deckStorage(db: SqlWritable): 'table' | 'blob' | 'none' {
  try {
    if (db.exec('SELECT id FROM decks LIMIT 1')[0]?.values?.length) return 'table';
  } catch {
    // A missing table is how the older schema announces itself.
  }
  const raw = firstRow(db, 'SELECT decks FROM col LIMIT 1', []);
  return typeof raw?.[0] === 'string' && raw[0].trim() !== '' ? 'blob' : 'none';
}

/**
 * Where a note type's TEMPLATE LIST lives — the same two-schema ladder as
 * `deckStorage`, decided independently because a collection can normalize one
 * and not the other.
 *
 * `table` is schema 18's `templates` row per template, whose `ord` is a plain
 * integer column: removing one is a DELETE and a renumbering UPDATE, and the
 * `config` protobuf beside it never has to be decoded, let alone re-encoded.
 * `models` is the older `col.models` JSON. `none` is a refusal.
 */
function templateStorage(db: SqlWritable): 'table' | 'models' | 'none' {
  try {
    if (db.exec('SELECT ntid FROM templates LIMIT 1')[0]?.values?.length) return 'table';
  } catch {
    // A missing table is how the older schema announces itself.
  }
  const raw = firstRow(db, 'SELECT models FROM col LIMIT 1', [])?.[0];
  if (typeof raw !== 'string' || !raw.trim()) return 'none';
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? 'models' : 'none';
  } catch {
    return 'none';
  }
}

/** Ords a note type currently has a template at, ascending. */
function templateOrdsOf(
  db: SqlWritable,
  storage: 'table' | 'models',
  noteTypeId: string,
): number[] | undefined {
  if (storage === 'table') {
    const values = db.exec('SELECT ord FROM templates WHERE ntid = ? ORDER BY ord', [
      idParam(noteTypeId),
    ])[0]?.values;
    if (!values?.length) return undefined;
    return values.map((row) => Number(row[0]));
  }
  const raw = firstRow(db, 'SELECT models FROM col LIMIT 1', [])?.[0];
  if (typeof raw !== 'string') return undefined;
  const parsed = JSON.parse(raw) as Record<string, { tmpls?: Array<{ ord?: number }> }>;
  const model = parsed[noteTypeId];
  if (!model) return undefined;
  // `ord` is written by Anki but read positionally as a fallback, exactly as
  // `apkgDraftRead.ts` reads it — the two must agree about what ord 2 is.
  return (model.tmpls ?? []).map((t, index) => (t.ord == null ? index : Number(t.ord)));
}

/** The legacy blob, parsed, or `undefined` when it is not the JSON Anki writes. */
function readDeckBlob(db: SqlWritable): Record<string, Record<string, unknown>> | undefined {
  const raw = firstRow(db, 'SELECT decks FROM col LIMIT 1', [])?.[0];
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Anki's schema 18 declares `decks.name` as `text NOT NULL COLLATE unicase` and
 * puts a UNIQUE index on it. `unicase` is a collation Anki registers in its own
 * SQLite build; sql.js has neither it nor an API to add one, so *any* write to
 * that column fails with "no such collation sequence: unicase" while the index
 * is maintained. Measured on a real package (`N1 Vocab-20260102173058.apkg`,
 * ver 18): `notes.flds` and `notes.tags` both write fine and `decks.name` is
 * the only column that fails, which is why this is scoped to deck renames
 * rather than being a blanket schema refusal.
 *
 * Detected from the stored DDL before the first write, so the refusal keeps
 * this module's all-or-nothing promise instead of failing halfway.
 */
function deckNameNeedsMissingCollation(db: SqlWritable): boolean {
  const row = firstRow(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'decks'", []);
  return /collate\s+unicase/i.test(String(row?.[0] ?? ''));
}

/** A deck's stored name in whichever place this collection keeps it. */
function readDeckName(db: SqlWritable, storage: 'table' | 'blob', deckId: string): string | undefined {
  if (storage === 'table') {
    const row = firstRow(db, 'SELECT name FROM decks WHERE id = ?', [idParam(deckId)]);
    return row ? String(row[0] ?? '') : undefined;
  }
  const entry = readDeckBlob(db)?.[deckId];
  return entry ? String(entry.name ?? '') : undefined;
}

/** A protobuf varint, which is all the deck `kind` blob below needs. */
function varint(value: number): number[] {
  const out: number[] = [];
  let rest = Math.max(0, Math.floor(value));
  do {
    const byte = rest & 0x7f;
    rest = Math.floor(rest / 128);
    out.push(rest > 0 ? byte | 0x80 : byte);
  } while (rest > 0);
  return out;
}

/**
 * A schema-18 `decks.kind` blob for a NORMAL deck carrying its options preset.
 *
 * The column is a protobuf oneof: field 1 is `Normal`, field 2 `Filtered`, both
 * length-delimited — so the leading byte is 0x0a, which is exactly the byte
 * `apkgDraftRead`'s `kindBlobIsFiltered` tests. Inside `Normal`, field 1 is
 * `config_id`. Only that field is written: every other one (`extend_new`,
 * `description`, …) is a protobuf default in Anki's own reader, whereas omitting
 * `config_id` would leave the new subdeck pointing at preset 0, which no
 * collection has.
 */
function normalDeckKindBlob(configId: number): Uint8Array {
  const normal = [0x08, ...varint(configId)];
  return new Uint8Array([0x0a, ...varint(normal.length), ...normal]);
}

/**
 * A legacy `col.decks` entry for a deck this export creates. The keys Anki's own
 * schema-11 writer emits, with the per-day counters zeroed — a brand-new deck has
 * studied nothing, and a missing counter makes older Anki builds throw on open.
 */
function legacyDeckEntry(
  id: number,
  name: string,
  configId: number,
  modSec: number,
): Record<string, unknown> {
  return {
    id,
    name,
    mod: modSec,
    usn: -1,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    browserCollapsed: false,
    desc: '',
    dyn: 0,
    conf: configId,
    extendNew: 0,
    extendRev: 0,
  };
}

/**
 * Apply the change set. Throws `ExportRefusal` — before any write — when a
 * named note or card is absent or a field count disagrees with the database.
 */
export function applyExportChanges(
  db: SqlWritable,
  changes: ApkgExportChangeSet,
  options: ApplyExportOptions,
): ApplyExportResult {
  // sortf per note type, through the same two-schema ladder the draft reader
  // uses — schema 18 keeps it inside a protobuf config, so this is the one
  // correct way to learn it.
  const sortfByNoteType = new Map<string, number>();
  for (const nt of readRawCollection(db).noteTypes) {
    sortfByNoteType.set(String(nt.id), Number(nt.sortf ?? 0));
  }

  // --- validate everything first, so a refusal writes nothing
  interface NotePlan {
    id: number | string;
    mid: string;
    flds?: string;
    sfld?: string;
    csum?: number;
    tags?: string;
  }
  const notePlans: NotePlan[] = [];
  for (const change of changes.notes) {
    const row = firstRow(db, 'SELECT mid, flds, tags FROM notes WHERE id = ?', [
      idParam(change.noteId),
    ]);
    if (!row) {
      throw new ExportRefusal('note-missing', `Note ${change.noteId} is not in the source package.`);
    }
    const plan: NotePlan = { id: idParam(change.noteId), mid: String(row[0]) };
    if (change.fields) {
      const existing = splitNoteFields(String(row[1] ?? ''));
      if (existing.length !== change.fields.length) {
        throw new ExportRefusal(
          'field-count-mismatch',
          `Note ${change.noteId} has ${existing.length} fields in the source but the edit carries ${change.fields.length}.`,
        );
      }
      const sortf = sortfByNoteType.get(plan.mid) ?? 0;
      plan.flds = change.fields.join(ANKI_FIELD_SEP);
      plan.sfld = options.normalize(change.fields[sortf] ?? change.fields[0] ?? '');
      plan.csum = fieldChecksum(options.normalize(change.fields[0] ?? ''));
    }
    if (change.tags) {
      plan.tags = encodeTags(withMarkedToken(String(row[2] ?? ''), change.tags));
    }
    notePlans.push(plan);
  }

  interface CardPlan {
    id: number | string;
    due: number;
  }
  const cardPlans: CardPlan[] = [];
  for (const move of changes.cardMoves) {
    const row = firstRow(db, 'SELECT id FROM cards WHERE id = ?', [idParam(move.cardId)]);
    if (!row) {
      throw new ExportRefusal(
        'card-missing',
        `Card ${move.cardId} (note ${move.noteId}) is not in the source package.`,
      );
    }
    cardPlans.push({ id: idParam(move.cardId), due: move.due });
  }

  // Recipe 12's deck half. A rename touches no card: a card names its deck by
  // id, so this is only ever the name Anki stores. Recipe 13's split is the
  // mirror image — it writes no name on an existing deck and only `cards.did`,
  // plus a row for each subdeck it invented.
  const deckRenames = changes.deckRenames ?? [];
  const deckMoves = changes.cardDeckMoves ?? [];
  const touchesDecks = deckRenames.length > 0 || deckMoves.length > 0;
  const storage = touchesDecks ? deckStorage(db) : 'none';
  if (touchesDecks && storage === 'none') {
    throw new ExportRefusal(
      'deck-missing',
      'The source package stores no deck list, so a deck change cannot be written.',
    );
  }
  // Every name the collection will hold once the whole batch has run, so two
  // renames cannot be individually legal and jointly a merge. Validated in list
  // order and never reordered: a batch where a later rename would have freed the
  // name an earlier one wants is refused rather than resequenced. `ankiDeckNormalize`
  // never emits one — it refuses a collision while planning — and guessing an
  // order that makes a merge legal is exactly the surprise this code refuses.
  const namesAfter = new Map<string, string>();
  const deckIdsPresent = new Set<string>();
  if (storage === 'table') {
    for (const row of db.exec('SELECT id, name FROM decks')[0]?.values ?? []) {
      namesAfter.set(String(row[1] ?? ''), String(row[0]));
      deckIdsPresent.add(String(row[0]));
    }
  } else if (storage === 'blob') {
    for (const [id, entry] of Object.entries(readDeckBlob(db) ?? {})) {
      namesAfter.set(String(entry?.name ?? ''), String(entry?.id ?? id));
      deckIdsPresent.add(String(entry?.id ?? id));
    }
  }

  // Which move targets the source does not have. Keyed on presence rather than on
  // the `split:` prefix so a stale numeric id refuses too, instead of being
  // written into `cards.did` as a deck that is not in the package.
  const createNeeded = new Set<string>();
  for (const move of deckMoves) {
    if (!deckIdsPresent.has(move.deckId)) createNeeded.add(move.deckId);
  }
  // Both a rename and a create write `decks.name`, so both are impossible in a
  // package that declares Anki's own `unicase` collation. A split that only
  // refiles into decks the source already has writes no name and is allowed.
  if (
    (deckRenames.length > 0 || createNeeded.size > 0) &&
    storage === 'table' &&
    deckNameNeedsMissingCollation(db)
  ) {
    throw new ExportRefusal('deck-collation-unsupported', DECK_COLLATION_HELP);
  }

  for (const rename of deckRenames) {
    const stored = storage === 'none' ? undefined : readDeckName(db, storage, rename.deckId);
    if (stored === undefined) {
      throw new ExportRefusal(
        'deck-missing',
        `Deck ${rename.deckId} is not in the source package.`,
      );
    }
    if (stored !== rename.from) {
      throw new ExportRefusal(
        'deck-changed',
        `Deck ${rename.deckId} is named "${stored}" in the source, not "${rename.from}".`,
      );
    }
    const holder = namesAfter.get(rename.to);
    if (holder !== undefined && holder !== rename.deckId) {
      throw new ExportRefusal(
        'deck-name-taken',
        `Another deck already holds the name "${rename.to}". Renaming onto it would merge two decks.`,
      );
    }
    namesAfter.delete(rename.from);
    namesAfter.set(rename.to, rename.deckId);
  }

  // Recipe 13's split, validated after the renames so a create can legally take a
  // name a rename in the same batch just freed.
  interface DeckCreatePlan {
    mintedId: string;
    /** The real Anki id this run allocates — epoch milliseconds, like Anki's own. */
    realId: number;
    name: string;
    configId: number;
  }
  const creates: DeckCreatePlan[] = [];
  const realDeckId = new Map<string, string>();
  if (createNeeded.size > 0) {
    const byMintedId = new Map(
      (changes.deckCreates ?? []).map((create) => [create.deckId, create]),
    );
    // Allocated from `nowMs` upward, skipping anything the source or this batch
    // already holds. Anki's own ids are creation timestamps, so this is the same
    // shape a real Anki would have written.
    const takenIds = new Set(deckIdsPresent);
    let nextId = Math.max(1, Math.floor(options.nowMs));
    for (const mintedId of createNeeded) {
      const create = byMintedId.get(mintedId);
      if (!create) {
        throw new ExportRefusal(
          'deck-missing',
          `Deck ${mintedId} is not in the source package and the change set carries no name for it, `
            + 'so the cards moved into it have nowhere to go.',
        );
      }
      if (create.name.trim() === '') {
        throw new ExportRefusal('deck-missing', `Deck ${mintedId} carries no name.`);
      }
      const holder = namesAfter.get(create.name);
      if (holder !== undefined) {
        throw new ExportRefusal(
          'deck-name-taken',
          `The source already holds a deck called "${create.name}", so the split cannot create a `
            + 'second one. Re-read the source and run the split again.',
        );
      }
      while (takenIds.has(String(nextId))) nextId += 1;
      const realId = nextId;
      takenIds.add(String(realId));
      nextId += 1;
      namesAfter.set(create.name, String(realId));
      realDeckId.set(mintedId, String(realId));
      creates.push({
        mintedId,
        realId,
        name: create.name,
        // Anki's default preset is 1 and every collection has it. A created
        // subdeck with `conf: 0` would point at a preset that does not exist.
        configId: Number(create.configId ?? 1) || 1,
      });
    }
  }

  interface DeckMovePlan {
    id: number | string;
    did: number | string;
  }
  const movePlans: DeckMovePlan[] = [];
  for (const move of deckMoves) {
    const row = firstRow(db, 'SELECT odid FROM cards WHERE id = ?', [idParam(move.cardId)]);
    if (!row) {
      throw new ExportRefusal(
        'card-missing',
        `Card ${move.cardId} (note ${move.noteId}) is not in the source package.`,
      );
    }
    if (Number(row[0] ?? 0) !== 0) {
      throw new ExportRefusal(
        'card-filtered',
        `Card ${move.cardId} (note ${move.noteId}) is on loan to a filtered deck, so its deck is `
          + 'not this export’s to change. Empty the filtered deck in Anki first.',
      );
    }
    const target = realDeckId.get(move.deckId) ?? move.deckId;
    movePlans.push({ id: idParam(move.cardId), did: idParam(target) });
  }

  // Recipe 17's remove half. The change set carries only the ords; the ord map
  // and the doomed card rows are derived HERE, from the collection about to be
  // written, so a draft read minutes ago cannot disagree with the package.
  interface TemplateRemovalPlan {
    noteTypeId: string;
    removedOrds: number[];
    /** Surviving source ord to its ord afterwards; only the ones that move. */
    renumber: Array<{ from: number; to: number }>;
  }
  const templateRemovals = changes.templateRemovals ?? [];
  const removalPlans: TemplateRemovalPlan[] = [];
  const templates = templateRemovals.length > 0 ? templateStorage(db) : 'none';
  if (templateRemovals.length > 0 && templates === 'none') {
    throw new ExportRefusal(
      'template-storage-unsupported',
      'This package stores no readable note-type list, so a card template cannot be removed from it.',
    );
  }
  for (const removal of templateRemovals) {
    if (templates === 'none') break; // unreachable — refused above
    const present = templateOrdsOf(db, templates, removal.noteTypeId);
    if (!present) {
      throw new ExportRefusal(
        'note-type-missing',
        `Note type ${removal.noteTypeId} is not in the source package.`,
      );
    }
    const removed = [...new Set(removal.removedOrds)].sort((a, b) => a - b);
    for (const ord of removed) {
      if (!present.includes(ord)) {
        throw new ExportRefusal(
          'template-missing',
          `Note type ${removal.noteTypeId} has no card template at position ${ord + 1}.`,
        );
      }
    }
    const survivors = present.filter((ord) => !removed.includes(ord));
    if (survivors.length === 0) {
      throw new ExportRefusal(
        'last-template',
        `Removing every card template of note type ${removal.noteTypeId} would leave its notes `
          + 'generating no cards at all.',
      );
    }
    // Ranked among the survivors, never "subtract the removals below me" applied
    // one at a time — see `shared/ankiTemplateRemoval.ts` for why that is only
    // the same arithmetic in descending order.
    const renumber: Array<{ from: number; to: number }> = [];
    survivors.forEach((ord, index) => {
      if (ord !== index) renumber.push({ from: ord, to: index });
    });
    removalPlans.push({ noteTypeId: removal.noteTypeId, removedOrds: removed, renumber });
  }

  // --- write
  const modSec = Math.floor(options.nowMs / 1000);
  for (const plan of notePlans) {
    if (plan.flds != null) {
      db.run('UPDATE notes SET flds = ?, sfld = ?, csum = ?, mod = ?, usn = -1 WHERE id = ?', [
        plan.flds,
        plan.sfld ?? '',
        plan.csum ?? 0,
        modSec,
        plan.id,
      ]);
    }
    if (plan.tags != null) {
      db.run('UPDATE notes SET tags = ?, mod = ?, usn = -1 WHERE id = ?', [
        plan.tags,
        modSec,
        plan.id,
      ]);
    }
  }
  for (const plan of cardPlans) {
    db.run('UPDATE cards SET due = ?, mod = ?, usn = -1 WHERE id = ?', [
      plan.due,
      modSec,
      plan.id,
    ]);
  }
  if (storage === 'table') {
    for (const rename of deckRenames) {
      // `mtime_secs`/`usn` alongside the name, the same freshness the note and
      // card writes record. Both columns exist in every schema-18 collection.
      db.run('UPDATE decks SET name = ?, mtime_secs = ?, usn = -1 WHERE id = ?', [
        rename.to,
        modSec,
        idParam(rename.deckId),
      ]);
    }
    for (const create of creates) {
      db.run(
        'INSERT INTO decks (id, name, mtime_secs, usn, common, kind) VALUES (?, ?, ?, -1, ?, ?)',
        [create.realId, create.name, modSec, new Uint8Array(0), normalDeckKindBlob(create.configId)],
      );
    }
  } else if (storage === 'blob' && (deckRenames.length > 0 || creates.length > 0)) {
    // One parse and one write for the whole batch: the blob is the entire deck
    // list, so writing it per rename would re-serialize it n times.
    const blob = readDeckBlob(db) ?? {};
    for (const rename of deckRenames) {
      const entry = blob[rename.deckId];
      if (entry) blob[rename.deckId] = { ...entry, name: rename.to, mod: modSec, usn: -1 };
    }
    for (const create of creates) {
      blob[String(create.realId)] = legacyDeckEntry(create.realId, create.name, create.configId, modSec);
    }
    db.run('UPDATE col SET decks = ?', [JSON.stringify(blob)]);
  }
  // After the deck rows exist, so a card never points at a deck that is not there
  // yet — the order matters for a package Anki opens without a "missing deck" fix-up.
  for (const plan of movePlans) {
    db.run('UPDATE cards SET did = ?, mod = ?, usn = -1 WHERE id = ?', [
      plan.did,
      modSec,
      plan.id,
    ]);
  }
  // Recipe 17's removal, last: it DELETEs card rows, so running it before the
  // updates above would let a `due` write target a card this removal is about to
  // drop and report it as written.
  //
  // Both renumbering loops run ASCENDING by source ord, and that is load-bearing
  // rather than tidy: every survivor's new ord is <= its old one, so ascending
  // order guarantees the destination has already been vacated. Descending would
  // collide two templates on one ord.
  let templatesRemoved = 0;
  let cardsDeleted = 0;
  for (const plan of removalPlans) {
    const mid = idParam(plan.noteTypeId);
    for (const ord of plan.removedOrds) {
      const count = firstRow(
        db,
        'SELECT COUNT(*) FROM cards WHERE ord = ? AND nid IN (SELECT id FROM notes WHERE mid = ?)',
        [ord, mid],
      );
      cardsDeleted += Number(count?.[0] ?? 0);
      db.run('DELETE FROM cards WHERE ord = ? AND nid IN (SELECT id FROM notes WHERE mid = ?)', [
        ord,
        mid,
      ]);
    }
    for (const move of plan.renumber) {
      db.run(
        'UPDATE cards SET ord = ?, mod = ?, usn = -1 WHERE ord = ? AND nid IN '
          + '(SELECT id FROM notes WHERE mid = ?)',
        [move.to, modSec, move.from, mid],
      );
    }
    if (templates === 'table') {
      for (const ord of plan.removedOrds) {
        db.run('DELETE FROM templates WHERE ntid = ? AND ord = ?', [mid, ord]);
      }
      for (const move of plan.renumber) {
        db.run('UPDATE templates SET ord = ?, mtime_secs = ?, usn = -1 WHERE ntid = ? AND ord = ?', [
          move.to,
          modSec,
          mid,
          move.from,
        ]);
      }
      // The note type itself is untouched apart from freshness: schema 18 keeps
      // the template list in its own table, so `notetypes.config` never has to
      // be decoded or re-encoded to remove one.
      db.run('UPDATE notetypes SET mtime_secs = ?, usn = -1 WHERE id = ?', [modSec, mid]);
    }
    templatesRemoved += plan.removedOrds.length;
  }
  if (templates === 'models' && removalPlans.length > 0) {
    // One parse and one write for the whole batch, like the deck blob above.
    const raw = firstRow(db, 'SELECT models FROM col LIMIT 1', [])?.[0];
    const parsed = JSON.parse(String(raw)) as Record<
      string,
      { tmpls?: Array<Record<string, unknown>>; mod?: number; usn?: number }
    >;
    for (const plan of removalPlans) {
      const model = parsed[plan.noteTypeId];
      if (!model) continue; // unreachable — validated above
      const kept = (model.tmpls ?? []).filter(
        (t, index) => !plan.removedOrds.includes(t.ord == null ? index : Number(t.ord)),
      );
      parsed[plan.noteTypeId] = {
        ...model,
        tmpls: kept.map((t, index) => ({ ...t, ord: index })),
        mod: modSec,
        usn: -1,
      };
    }
    db.run('UPDATE col SET models = ?', [JSON.stringify(parsed)]);
  }

  // `col.mod` is epoch milliseconds in both schemas.
  db.run('UPDATE col SET mod = ?', [options.nowMs]);

  return {
    templatesRemoved,
    cardsDeleted,
    notesUpdated: notePlans.length,
    // Distinct card ROWS written. A card both repositioned and refiled counts
    // once: the number is what the user would count in Anki, not a total of two
    // change lists that may name the same card.
    cardsUpdated: new Set([
      ...cardPlans.map((p) => String(p.id)),
      ...movePlans.map((p) => String(p.id)),
    ]).size,
    decksUpdated: deckRenames.length + creates.length,
  };
}

/**
 * Confirm every change is present in a collection — run by the exporter against
 * the bytes it re-read FROM DISK, so "verified" means the written file, not the
 * in-memory database it was serialized from.
 */
export function verifyExportChanges(
  db: SqlWritable,
  changes: ApkgExportChangeSet,
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  for (const change of changes.notes) {
    const row = firstRow(db, 'SELECT flds, tags FROM notes WHERE id = ?', [
      idParam(change.noteId),
    ]);
    if (!row) {
      mismatches.push(`note ${change.noteId}: missing`);
      continue;
    }
    if (change.fields && String(row[0] ?? '') !== change.fields.join(ANKI_FIELD_SEP)) {
      mismatches.push(`note ${change.noteId}: fields differ`);
    }
    if (change.tags) {
      const stored = String(row[1] ?? '')
        .split(/\s+/)
        .filter((t) => t && t.toLowerCase() !== 'marked');
      const expected = change.tags.filter((t) => t.toLowerCase() !== 'marked');
      if (
        stored.length !== expected.length ||
        !stored.every((t, i) => t === expected[i])
      ) {
        mismatches.push(`note ${change.noteId}: tags differ`);
      }
    }
  }
  for (const move of changes.cardMoves) {
    const row = firstRow(db, 'SELECT due FROM cards WHERE id = ?', [idParam(move.cardId)]);
    if (!row) mismatches.push(`card ${move.cardId}: missing`);
    else if (Number(row[0]) !== move.due) mismatches.push(`card ${move.cardId}: due differs`);
  }
  const renames = changes.deckRenames ?? [];
  const deckMoves = changes.cardDeckMoves ?? [];
  if (renames.length > 0 || deckMoves.length > 0) {
    const storage = deckStorage(db);
    for (const rename of renames) {
      const stored = storage === 'none' ? undefined : readDeckName(db, storage, rename.deckId);
      if (stored === undefined) mismatches.push(`deck ${rename.deckId}: missing`);
      else if (stored !== rename.to) mismatches.push(`deck ${rename.deckId}: name differs`);
    }
    // A minted id is resolved by NAME out of the written file rather than from
    // whatever `applyExportChanges` allocated. That makes this check independent
    // of the writer: it confirms the deck row exists under the name the split
    // promised AND that the card points at that row, which is the whole claim.
    const idByName = new Map<string, string>();
    if (storage === 'table') {
      for (const row of db.exec('SELECT id, name FROM decks')[0]?.values ?? []) {
        idByName.set(String(row[1] ?? ''), String(row[0]));
      }
    } else if (storage === 'blob') {
      for (const [id, entry] of Object.entries(readDeckBlob(db) ?? {})) {
        idByName.set(String(entry?.name ?? ''), String(entry?.id ?? id));
      }
    }
    const createdName = new Map(
      (changes.deckCreates ?? []).map((create) => [create.deckId, create.name]),
    );
    for (const move of deckMoves) {
      const name = createdName.get(move.deckId);
      const expected = name === undefined ? move.deckId : idByName.get(name);
      if (expected === undefined) {
        mismatches.push(`deck ${move.deckId}: missing`);
        continue;
      }
      const row = firstRow(db, 'SELECT did FROM cards WHERE id = ?', [idParam(move.cardId)]);
      if (!row) mismatches.push(`card ${move.cardId}: missing`);
      else if (String(row[0]) !== expected) mismatches.push(`card ${move.cardId}: deck differs`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
