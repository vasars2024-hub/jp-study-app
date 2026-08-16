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

/** A deck's stored name in whichever place this collection keeps it. */
function readDeckName(db: SqlWritable, storage: 'table' | 'blob', deckId: string): string | undefined {
  if (storage === 'table') {
    const row = firstRow(db, 'SELECT name FROM decks WHERE id = ?', [idParam(deckId)]);
    return row ? String(row[0] ?? '') : undefined;
  }
  const entry = readDeckBlob(db)?.[deckId];
  return entry ? String(entry.name ?? '') : undefined;
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
  // id, so this is only ever the name Anki stores.
  const deckRenames = changes.deckRenames ?? [];
  const storage = deckRenames.length > 0 ? deckStorage(db) : 'none';
  if (deckRenames.length > 0 && storage === 'none') {
    throw new ExportRefusal(
      'deck-missing',
      'The source package stores no deck list, so a deck rename cannot be written.',
    );
  }
  // Every name the collection will hold once the whole batch has run, so two
  // renames cannot be individually legal and jointly a merge. Validated in list
  // order and never reordered: a batch where a later rename would have freed the
  // name an earlier one wants is refused rather than resequenced. `ankiDeckNormalize`
  // never emits one — it refuses a collision while planning — and guessing an
  // order that makes a merge legal is exactly the surprise this code refuses.
  const namesAfter = new Map<string, string>();
  if (storage === 'table') {
    for (const row of db.exec('SELECT id, name FROM decks')[0]?.values ?? []) {
      namesAfter.set(String(row[1] ?? ''), String(row[0]));
    }
  } else if (storage === 'blob') {
    for (const [id, entry] of Object.entries(readDeckBlob(db) ?? {})) {
      namesAfter.set(String(entry?.name ?? ''), String(entry?.id ?? id));
    }
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
  } else if (storage === 'blob' && deckRenames.length > 0) {
    // One parse and one write for the whole batch: the blob is the entire deck
    // list, so writing it per rename would re-serialize it n times.
    const blob = readDeckBlob(db) ?? {};
    for (const rename of deckRenames) {
      const entry = blob[rename.deckId];
      if (entry) blob[rename.deckId] = { ...entry, name: rename.to, mod: modSec, usn: -1 };
    }
    db.run('UPDATE col SET decks = ?', [JSON.stringify(blob)]);
  }
  // `col.mod` is epoch milliseconds in both schemas.
  db.run('UPDATE col SET mod = ?', [options.nowMs]);

  return {
    notesUpdated: notePlans.length,
    cardsUpdated: cardPlans.length,
    decksUpdated: deckRenames.length,
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
  if (renames.length > 0) {
    const storage = deckStorage(db);
    for (const rename of renames) {
      const stored = storage === 'none' ? undefined : readDeckName(db, storage, rename.deckId);
      if (stored === undefined) mismatches.push(`deck ${rename.deckId}: missing`);
      else if (stored !== rename.to) mismatches.push(`deck ${rename.deckId}: name differs`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
