// Write a workbench change set back out as an Anki CSV/TSV text export — the
// destination half of source adapter 3 (ANKI_DECK_WORKBENCH_PLAN.md).
//
// `ankiCsv.ts` has read this format since Phase 1, but nothing could ever write
// it: `DeckWorkbenchApply` recognised only `apkg`/`colpkg` (a new package) and
// `ankiconnect` (a live commit), so a `csv` draft reached step 7 and was told
// there was no file to write. A user could import their `.txt`, edit all of it,
// and have nowhere to put the result. This module is that third destination.
//
// It works the way the package exporter does and for the same reason: the
// SOURCE file is re-read and edited, never rebuilt from the draft. Columns the
// draft does not model — a notetype column, a deck column, the six empty
// trailing columns in a real export — are copied through verbatim, so a round
// trip cannot quietly drop what the reader chose not to interpret.
//
// Four decisions this module encodes.
//
// **Note identity is positional, and it says so.** Anki's own round trip keys on
// a `#guid column:`; this file format does not have to carry one, and the user's
// own export does not. `buildAnkiCsvCollection` therefore mints `csv-row-N` from
// the row's position in the body, and this writer resolves the same ids the same
// way. That is honest only because the fingerprint check guarantees the bytes
// have not moved since the read. The result reports `noteIdentity: 'row-order'`
// so the surface can say plainly that the exported file re-imports as new notes
// rather than merging into existing ones. Inventing a guid to fake identity
// would produce a file that collides in the user's real collection.
//
// **An unsupported change refuses the whole export, by name.** A text export has
// no cards, no scheduling, no flags and no templates — `buildAnkiCsvCollection`
// emits `cards: []` on purpose. A writer that dropped those silently would
// report a successful export of an edit that did not happen. Every such kind is
// named in the refusal instead.
//
// **`#html:false` survives in both directions.** Those fields are plain text.
// They are not HTML-escaped on the way out, exactly as they are not
// HTML-stripped on the way in (`csvDraftRead.ts` picks `collapsePlainText` for
// them). Only RFC 4180 quoting is applied, which is a delimiter concern and not
// a markup one.
//
// **A cell that would re-read as a directive is quoted.** `parseAnkiCsvMeta`
// ends the header block at the first line not starting with `#`. A first-column
// value beginning with `#` — a hashtag in a sentence — would therefore be
// swallowed as a directive on re-import. Quoting it moves the `"` to the line
// start and the row survives.

import {
  ANKI_CSV_SEPARATORS,
  parseAnkiCsvMeta,
  parseDelimitedRows,
  type AnkiCsvMeta,
} from './ankiCsv';
import type { ApkgExportChangeSet } from './ankiApkgExport';

/** Change kinds a text export cannot represent, in the order they are reported. */
const UNSUPPORTED_KINDS: ReadonlyArray<{
  key: keyof ApkgExportChangeSet;
  /** Never translated: it names a contract field, and the UI prints it verbatim. */
  label: string;
}> = [
  { key: 'cardMoves', label: 'card-repositions' },
  { key: 'cardDeckMoves', label: 'card-deck-moves' },
  { key: 'deckCreates', label: 'deck-creates' },
  { key: 'deckRenames', label: 'deck-renames' },
  { key: 'templateRemovals', label: 'template-removals' },
  { key: 'cardFlags', label: 'card-flags' },
  { key: 'cardQueues', label: 'card-suspends' },
  { key: 'cardScheduling', label: 'card-scheduling' },
];

export type AnkiCsvExportErrorCode =
  | 'cancelled'
  | 'nothing-to-export'
  | 'no-source'
  | 'source-changed'
  | 'overwrite-source'
  /** A change names a `csv-row-N` the source body does not have. */
  | 'note-missing'
  /** Replacement fields do not fill the row's non-special columns exactly. */
  | 'field-count-mismatch'
  /** Tags changed on a file with no `#tags column:` to put them in. */
  | 'no-tags-column'
  /** The change set carries a kind a text export has no place for. */
  | 'unsupported-change'
  | 'verify-failed'
  | 'io';

export class CsvExportRefusal extends Error {
  constructor(
    readonly code: AnkiCsvExportErrorCode,
    message: string,
    /**
     * Structured detail for the surface, carried rather than re-parsed out of
     * `message`: the only consumer is the `unsupported-change` list, and a shell
     * that split the sentence back apart would break on the first reword.
     */
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'CsvExportRefusal';
  }
}

export interface AnkiCsvExportRequest {
  /** `AnkiDraftSource.fingerprint` of the draft these changes were computed on. */
  fingerprint: string;
  changes: ApkgExportChangeSet;
  /** Skip the save dialog when set (tests and bridge probes). */
  outPath?: string;
  /** Skip the "locate the original" dialog. The fingerprint is still enforced. */
  sourcePath?: string;
}

/** How the writer matched change-set note ids to rows in the file. */
export type AnkiCsvNoteIdentity = 'guid' | 'row-order';

export interface AnkiCsvExportResult {
  ok: boolean;
  filePath?: string;
  fileName?: string;
  notesUpdated?: number;
  /** Rows in the written body, blank ones included — the file's own shape. */
  rowsWritten?: number;
  /** Notes whose tag cell was rewritten. Counted apart: a different column. */
  tagsUpdated?: number;
  /**
   * Positional unless the source declares a `#guid column:`. Reported so the
   * surface can warn that a positional round trip re-imports as new notes.
   */
  noteIdentity?: AnkiCsvNoteIdentity;
  /** Change kinds that caused an `unsupported-change` refusal, by contract name. */
  unsupported?: string[];
  /** The written file was re-read FROM DISK and every change was found in it. */
  verified?: boolean;
  /** sha1 of the written bytes, so a later edit can be made against this file. */
  fingerprint?: string;
  errorCode?: AnkiCsvExportErrorCode;
  error?: string;
}

// ----- serialization ------------------------------------------------------------

/**
 * Quote one cell if the delimited form would otherwise be ambiguous.
 *
 * `firstOfRow` exists only for the `#` case in the module note. Nothing here
 * escapes markup: a `#html:false` file's `<` is data.
 */
export function quoteCsvCell(value: string, separator: string, firstOfRow: boolean): string {
  const needsQuote =
    (separator !== '' && value.includes(separator)) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    (firstOfRow && value.startsWith('#'));
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** The separator's directive name, when it has one. Anki writes `tab`, not a tab. */
function separatorDirectiveValue(separator: string): string {
  for (const [name, char] of Object.entries(ANKI_CSV_SEPARATORS)) {
    if (char === separator) return name;
  }
  return separator;
}

/**
 * Rebuild the `#` block from what the reader understood.
 *
 * Written in Anki's own directive order and deliberately WITHOUT the trailing
 * separator padding a real Anki export uses — that padding is cosmetic column
 * alignment, `parseAnkiCsvMeta` trims it, and a file written without it re-reads
 * to an identical `AnkiCsvMeta`. Directives the reader did not interpret are
 * emitted verbatim so a file this build is too old for survives the round trip.
 */
export function buildAnkiCsvHeader(meta: AnkiCsvMeta): string {
  const lines: string[] = [`#separator:${separatorDirectiveValue(meta.separator)}`];
  // Always written, both ways: a file that omitted it defaults to HTML, and
  // making that explicit is what stops a second round trip from changing it.
  lines.push(`#html:${meta.html ? 'true' : 'false'}`);
  if (meta.guidColumn != null) lines.push(`#guid column:${meta.guidColumn}`);
  if (meta.noteTypeColumn != null) lines.push(`#notetype column:${meta.noteTypeColumn}`);
  if (meta.deckColumn != null) lines.push(`#deck column:${meta.deckColumn}`);
  if (meta.tagsColumn != null) lines.push(`#tags column:${meta.tagsColumn}`);
  if (meta.noteTypeName) lines.push(`#notetype:${meta.noteTypeName}`);
  if (meta.deckName) lines.push(`#deck:${meta.deckName}`);
  if (meta.globalTags.length) lines.push(`#tags:${meta.globalTags.join(' ')}`);
  for (const line of meta.unknownDirectives) lines.push(line);
  if (meta.columnNames.length) {
    const cells = meta.columnNames.map((name, i) => quoteCsvCell(name, meta.separator, i === 0));
    lines.push(`#columns:${cells.join(meta.separator)}`);
  }
  return lines.map((line) => `${line}\n`).join('');
}

/** Serialize body rows. A trailing newline ends the last row; it starts no new one. */
export function serializeCsvRows(rows: ReadonlyArray<readonly string[]>, separator: string): string {
  return rows
    .map((cells) => cells.map((c, i) => quoteCsvCell(c, separator, i === 0)).join(separator))
    .map((line) => `${line}\n`)
    .join('');
}

// ----- applying the change set --------------------------------------------------

export interface CsvApplyOutcome {
  text: string;
  notesUpdated: number;
  tagsUpdated: number;
  rowsWritten: number;
  noteIdentity: AnkiCsvNoteIdentity;
}

/** Zero-based indices of the columns the reader treats as special, not fields. */
function specialColumns(meta: AnkiCsvMeta): Set<number> {
  const special = new Set<number>();
  for (const n of [meta.guidColumn, meta.noteTypeColumn, meta.deckColumn, meta.tagsColumn]) {
    if (n != null) special.add(n - 1);
  }
  return special;
}

/**
 * `csv-row-N` → index into the body rows.
 *
 * `buildAnkiCsvCollection` numbers from `rows.forEach((cells, index))` and
 * assigns `csv-row-${index + 1}` — the position among ALL rows, blank ones
 * included, even though a blank row produces no note. Resolving the id any other
 * way (counting only non-blank rows) would slide every note after the first
 * blank line by one and edit the wrong row.
 */
function rowIndexForNoteId(noteId: string): number | null {
  const match = /^csv-row-(\d+)$/.exec(noteId);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n >= 1 ? n - 1 : null;
}

/**
 * Apply a change set to the source text and return the new file's text.
 *
 * Refuses rather than guesses, in every case: an unknown note id, a field count
 * that does not fill the row, tags with no column to hold them, and any change
 * kind a text file cannot represent. Pure — no I/O, no Electron — so the whole
 * decision table is unit-testable.
 */
export function applyCsvExportChanges(
  sourceText: string,
  changes: ApkgExportChangeSet,
): CsvApplyOutcome {
  const unsupported: string[] = [];
  for (const { key, label } of UNSUPPORTED_KINDS) {
    const list = changes[key];
    if (Array.isArray(list) && list.length > 0) unsupported.push(`${label}:${list.length}`);
  }
  if (unsupported.length) {
    throw new CsvExportRefusal(
      'unsupported-change',
      `A text export has no place for these edits: ${unsupported.join(', ')}. Undo them, or export this deck as a package instead.`,
      unsupported,
    );
  }

  const meta = parseAnkiCsvMeta(sourceText);
  const rows = parseDelimitedRows(sourceText.slice(meta.bodyOffset), meta.separator).map((cells) => [
    ...cells,
  ]);
  const special = specialColumns(meta);

  let notesUpdated = 0;
  let tagsUpdated = 0;

  for (const change of changes.notes ?? []) {
    const index = rowIndexForNoteId(change.noteId);
    if (index == null || index >= rows.length) {
      throw new CsvExportRefusal(
        'note-missing',
        `The source file has no row for ${change.noteId}.`,
      );
    }
    const cells = rows[index];

    const fields = change.fields;
    if (fields) {
      // Positions of this row's field columns, in the order the reader read them.
      const fieldPositions: number[] = [];
      for (let c = 0; c < cells.length; c += 1) {
        if (!special.has(c)) fieldPositions.push(c);
      }
      if (fieldPositions.length !== fields.length) {
        throw new CsvExportRefusal(
          'field-count-mismatch',
          `${change.noteId} has ${fieldPositions.length} field columns but the edit carries ${fields.length}.`,
        );
      }
      fieldPositions.forEach((position, ord) => {
        cells[position] = fields[ord];
      });
      notesUpdated += 1;
    }

    if (change.tags) {
      if (meta.tagsColumn == null) {
        throw new CsvExportRefusal(
          'no-tags-column',
          'This file declares no `#tags column:`, so there is nowhere to write tags. Export as a package instead.',
        );
      }
      // `#tags:` applies to every note in the file and the reader prepends it to
      // each note's tags. Writing the full list back into the column would
      // duplicate those on the next read, so the global prefix is removed again.
      const tags = [...change.tags];
      for (const global of meta.globalTags) {
        const at = tags.indexOf(global);
        if (at >= 0) tags.splice(at, 1);
      }
      const column = meta.tagsColumn - 1;
      while (cells.length <= column) cells.push('');
      cells[column] = tags.join(' ');
      tagsUpdated += 1;
    }
  }

  return {
    text: buildAnkiCsvHeader(meta) + serializeCsvRows(rows, meta.separator),
    notesUpdated,
    tagsUpdated,
    rowsWritten: rows.length,
    noteIdentity: meta.guidColumn != null ? 'guid' : 'row-order',
  };
}
