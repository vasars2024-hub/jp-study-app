// Read a whole Anki collection into the raw rows `shared/ankiDraft.ts` builds a
// draft from — Phase 1 of ANKI_DECK_WORKBENCH_PLAN.md.
//
// `apkgImport.ts` reads two columns of `notes` because the Level Meter and the
// simplified card importer need two columns. This reads everything: both
// schemas' note types, the deck tree, all of `cards`, and `revlog` when the
// export carried one.
//
// No Electron and no filesystem here — the caller hands over an already-open
// database. That keeps the SQL unit-testable against a real sql.js collection,
// which matters because the two schemas disagree about where almost everything
// lives and a wrong table silently yields an empty deck.

import type {
  RawAnkiCardRow,
  RawAnkiCollection,
  RawAnkiDeckRow,
  RawAnkiNoteRow,
  RawAnkiNoteTypeRow,
  RawAnkiRevlogRow,
} from '../../shared/ankiDraft';

/** The slice of sql.js's `Database` this module uses. */
export interface SqlReadable {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
}

function rows(db: SqlReadable, sql: string): unknown[][] {
  try {
    return db.exec(sql)[0]?.values ?? [];
  } catch {
    // A missing table is the normal way one schema announces it is the other one.
    return [];
  }
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ----- note types ---------------------------------------------------------------

interface LegacyModel {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  css?: unknown;
  sortf?: unknown;
  latexPre?: unknown;
  latexPost?: unknown;
  flds?: Array<Record<string, unknown>>;
  tmpls?: Array<Record<string, unknown>>;
}

/**
 * Note types from the legacy `col.models` JSON blob.
 *
 * This is the only place a collection states a template's question and answer
 * format in plain text. Schema 18 moved both into a protobuf blob, which is why
 * `readNormalizedNoteTypes` below can only report their names.
 */
function readLegacyNoteTypes(db: SqlReadable): RawAnkiNoteTypeRow[] {
  const raw = rows(db, 'SELECT models FROM col LIMIT 1')[0]?.[0];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  let parsed: Record<string, LegacyModel>;
  try {
    parsed = JSON.parse(raw) as Record<string, LegacyModel>;
  } catch {
    return [];
  }

  const out: RawAnkiNoteTypeRow[] = [];
  for (const [id, model] of Object.entries(parsed ?? {})) {
    if (!model || typeof model !== 'object') continue;
    out.push({
      id: str(model.id ?? id),
      name: str(model.name),
      type: num(model.type),
      css: str(model.css),
      sortf: num(model.sortf),
      latexPre: model.latexPre == null ? undefined : str(model.latexPre),
      latexPost: model.latexPost == null ? undefined : str(model.latexPost),
      fields: (model.flds ?? []).map((f, index) => ({
        ord: f.ord == null ? index : num(f.ord),
        name: str(f.name),
        sticky: Boolean(f.sticky),
        rtl: Boolean(f.rtl),
        font: f.font == null ? undefined : str(f.font),
        size: f.size == null ? undefined : num(f.size),
      })),
      templates: (model.tmpls ?? []).map((t, index) => ({
        ord: t.ord == null ? index : num(t.ord),
        name: str(t.name),
        qfmt: str(t.qfmt),
        afmt: str(t.afmt),
        bqfmt: str(t.bqfmt),
        bafmt: str(t.bafmt),
        // Anki writes `null` for "no override" and a deck id otherwise.
        did: t.did == null ? null : str(t.did),
      })),
    });
  }
  return out;
}

/**
 * Note types from schema 18's normalized tables.
 *
 * `notetypes.config`, `fields.config` and `templates.config` are protobuf blobs,
 * so a template's `qfmt`/`afmt`, the note type's CSS and its cloze/standard kind
 * are NOT readable here. Rather than default them to empty — which would export
 * a deck whose cards render blank and look like the user's own edit — every note
 * type read this way is marked `formatsUnavailable`, and the draft turns that
 * into a blocking diagnostic. Names, ordinals and the note-to-field mapping are
 * real columns and are read normally.
 */
function readNormalizedNoteTypes(db: SqlReadable): RawAnkiNoteTypeRow[] {
  const noteTypeRows = rows(db, 'SELECT id, name FROM notetypes');
  if (!noteTypeRows.length) return [];

  const fieldsById = new Map<string, RawAnkiNoteTypeRow['fields']>();
  for (const row of rows(db, 'SELECT ntid, ord, name FROM fields ORDER BY ntid, ord')) {
    const id = str(row[0]);
    const list = fieldsById.get(id) ?? [];
    list.push({ ord: num(row[1]), name: str(row[2]) });
    fieldsById.set(id, list);
  }

  const templatesById = new Map<string, RawAnkiNoteTypeRow['templates']>();
  for (const row of rows(db, 'SELECT ntid, ord, name FROM templates ORDER BY ntid, ord')) {
    const id = str(row[0]);
    const list = templatesById.get(id) ?? [];
    list.push({ ord: num(row[1]), name: str(row[2]) });
    templatesById.set(id, list);
  }

  return noteTypeRows.map((row) => {
    const id = str(row[0]);
    return {
      id,
      name: str(row[1]),
      fields: fieldsById.get(id) ?? [],
      templates: templatesById.get(id) ?? [],
      formatsUnavailable: true,
    };
  });
}

// ----- decks ---------------------------------------------------------------------

/**
 * A schema-18 `decks.kind` blob is a protobuf oneof: field 1 is a normal deck,
 * field 2 a filtered one. A protobuf key byte is `(field << 3) | wire_type`, and
 * both variants are length-delimited (wire type 2), so the first byte is 0x0a
 * for normal and 0x12 for filtered. That one byte is the whole test; anything
 * else is read as not-filtered, which is the safe answer because the workbench
 * only ever *restricts* what it will edit in a filtered deck.
 */
function kindBlobIsFiltered(value: unknown): boolean {
  if (value instanceof Uint8Array) return value[0] === 0x12;
  return false;
}

function readDecks(db: SqlReadable): RawAnkiDeckRow[] {
  const normalized = rows(db, 'SELECT id, name, kind FROM decks');
  if (normalized.length) {
    return normalized.map((row) => ({
      id: str(row[0]),
      name: str(row[1]),
      dyn: kindBlobIsFiltered(row[2]) ? 1 : 0,
    }));
  }

  const raw = rows(db, 'SELECT decks FROM col LIMIT 1')[0]?.[0];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return Object.entries(parsed ?? {}).map(([id, deck]) => ({
      id: str(deck?.id ?? id),
      name: str(deck?.name),
      dyn: num(deck?.dyn),
      conf: deck?.conf == null ? undefined : str(deck.conf),
    }));
  } catch {
    return [];
  }
}

// ----- the collection --------------------------------------------------------------

export interface ReadRawCollectionOptions {
  /** Media file names the package carries, for the missing-media check. */
  mediaFiles?: readonly string[];
}

/**
 * Read every table the draft model needs.
 *
 * Total by construction: each table degrades to empty rather than throwing, so a
 * collection missing `revlog` (which Anki omits from an export unless the user
 * ticks "include scheduling") reads as a deck with no review history rather than
 * as a failed import.
 */
export function readRawCollection(
  db: SqlReadable,
  options: ReadRawCollectionOptions = {},
): RawAnkiCollection {
  const col = rows(db, 'SELECT ver, crt, mod FROM col LIMIT 1')[0];

  const legacy = readLegacyNoteTypes(db);
  const noteTypes = legacy.length ? legacy : readNormalizedNoteTypes(db);

  const notes: RawAnkiNoteRow[] = rows(
    db,
    'SELECT id, guid, mid, mod, tags, flds, flags, data FROM notes',
  ).map((r) => ({
    id: str(r[0]),
    guid: str(r[1]),
    mid: str(r[2]),
    mod: num(r[3]),
    tags: str(r[4]),
    flds: str(r[5]),
    flags: num(r[6]),
    data: str(r[7]),
  }));

  const cards: RawAnkiCardRow[] = rows(
    db,
    `SELECT id, nid, did, ord, mod, type, queue, due, ivl, factor, reps, lapses,
            left, odue, odid, flags
     FROM cards`,
  ).map((r) => ({
    id: str(r[0]),
    nid: str(r[1]),
    did: str(r[2]),
    ord: num(r[3]),
    mod: num(r[4]),
    type: num(r[5]),
    queue: num(r[6]),
    due: num(r[7]),
    ivl: num(r[8]),
    factor: num(r[9]),
    reps: num(r[10]),
    lapses: num(r[11]),
    left: num(r[12]),
    odue: num(r[13]),
    odid: str(r[14]),
    flags: num(r[15]),
  }));

  // An absent revlog and an empty one are different claims, and the draft says
  // so — `undefined` means "this export carries no history", `[]` means "it does,
  // and it is empty". Probe for the table before deciding which.
  let revlog: RawAnkiRevlogRow[] | undefined;
  let hasRevlog = false;
  try {
    db.exec('SELECT 1 FROM revlog LIMIT 1');
    hasRevlog = true;
  } catch {
    hasRevlog = false;
  }
  if (hasRevlog) {
    revlog = rows(db, 'SELECT id, cid, ease, ivl, lastIvl, factor, time, type FROM revlog').map(
      (r) => ({
        id: str(r[0]),
        cid: str(r[1]),
        ease: num(r[2]),
        ivl: num(r[3]),
        lastIvl: num(r[4]),
        factor: num(r[5]),
        time: num(r[6]),
        type: num(r[7]),
      }),
    );
  }

  return {
    col: col ? { ver: num(col[0]), crt: num(col[1]), mod: num(col[2]) } : undefined,
    notes,
    cards,
    decks: readDecks(db),
    noteTypes,
    revlog,
    mediaFiles: options.mediaFiles,
  };
}
