// Anki's CSV/TSV text export, read into the normalized draft model.
//
// Phase 1 of ANKI_DECK_WORKBENCH_PLAN.md, source adapter 3. Anki writes a text
// export as a block of `#directive:value` lines followed by delimited rows, and
// its own importer reads those directives back. The header block is what makes
// the file self-describing; without it a `.txt` full of tabs is just a guess.
//
// Everything here is pure string work so it unit-tests in the node vitest
// environment. Reading the file, sniffing its encoding and hashing it stay in
// src/main/anki/.
//
// The directives below were derived from real Anki exports on this machine
// rather than from memory. `#separator:`, `#html:`, `#columns:` and
// `#tags column:` appear verbatim in those files; `#guid column:`,
// `#notetype column:`, `#deck column:`, `#notetype:`, `#deck:` and `#tags:` are
// the documented siblings of the same block and are read the same way. An
// unrecognised directive is preserved in `unknownDirectives` instead of being
// silently dropped, so a file this reader is too old for says so.

import { ANKI_FIELD_SEP } from './ankiDraft';
import type {
  AnkiDraft,
  RawAnkiCollection,
  RawAnkiNoteRow,
  RawAnkiNoteTypeRow,
} from './ankiDraft';

/**
 * The separator names Anki accepts in `#separator:`. A value that is not one of
 * these is taken as a literal single character, which is what Anki does too.
 */
export const ANKI_CSV_SEPARATORS: Readonly<Record<string, string>> = {
  tab: '\t',
  space: ' ',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  colon: ':',
};

/**
 * Candidates tried when a file carries no `#separator:`. `space` and `colon`
 * are deliberately absent: both occur inside ordinary field text often enough
 * that sniffing them splits real content into columns.
 */
const SNIFF_ORDER: readonly string[] = ['\t', ',', ';', '|'];

export interface AnkiCsvMeta {
  separator: string;
  /** Where the separator came from. A sniffed one is a guess and is reported as such. */
  separatorSource: 'header' | 'sniffed' | 'default';
  /** `#html:` — false means the fields are plain text and must not be HTML-stripped. */
  html: boolean;
  /** `#columns:` names, verbatim and in file order, including any special columns. */
  columnNames: string[];
  /** 1-based column numbers, exactly as the directives write them. */
  guidColumn?: number;
  noteTypeColumn?: number;
  deckColumn?: number;
  tagsColumn?: number;
  /** `#notetype:` / `#deck:` — one value for every row in the file. */
  noteTypeName?: string;
  deckName?: string;
  /** `#tags:` — added to every note in the file. */
  globalTags: string[];
  /** Directive lines this reader does not interpret, verbatim. */
  unknownDirectives: string[];
  /** Character offset in the input where the delimited data starts. */
  bodyOffset: number;
}

/** U+FEFF. A spreadsheet's Save as CSV writes one; Anki's own exporter does not. */
const BYTE_ORDER_MARK = '\uFEFF';

const DIRECTIVE_RE = /^#([A-Za-z]+(?: [A-Za-z]+)*)\s*:(.*)$/;

function splitTags(value: string): string[] {
  return value
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function columnNumber(value: string): number | undefined {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

/**
 * Read the leading `#` block.
 *
 * The block ends at the first line that does not start with `#`, which is also
 * why a `#` inside the data cannot be mistaken for a directive. Values are
 * trimmed: a real export on this machine writes `#html:false` followed by seven
 * tabs, because the writer pads the header out to the column count.
 */
export function parseAnkiCsvMeta(input: string): AnkiCsvMeta {
  const text = input.startsWith(BYTE_ORDER_MARK) ? input.slice(1) : input;
  const bomOffset = input.length - text.length;

  const meta: AnkiCsvMeta = {
    separator: '\t',
    separatorSource: 'default',
    html: true,
    columnNames: [],
    globalTags: [],
    unknownDirectives: [],
    bodyOffset: bomOffset,
  };

  let offset = 0;
  let rawColumns: string | undefined;
  while (offset < text.length && text[offset] === '#') {
    let end = text.indexOf('\n', offset);
    if (end < 0) end = text.length;
    const line = text.slice(offset, end).replace(/\r$/, '');
    offset = end + 1;
    meta.bodyOffset = bomOffset + Math.min(offset, text.length);

    const match = DIRECTIVE_RE.exec(line);
    if (!match) {
      meta.unknownDirectives.push(line);
      continue;
    }
    const name = match[1].toLowerCase();
    const value = match[2].trim();
    switch (name) {
      case 'separator': {
        const named = ANKI_CSV_SEPARATORS[value.toLowerCase()];
        // An empty value would split every character into its own column.
        if (named) {
          meta.separator = named;
          meta.separatorSource = 'header';
        } else if (value.length >= 1) {
          meta.separator = value;
          meta.separatorSource = 'header';
        } else {
          meta.unknownDirectives.push(line);
        }
        break;
      }
      case 'html':
        meta.html = value.toLowerCase() !== 'false';
        break;
      case 'columns':
        // Kept raw: it is separated by the separator, which the directive above
        // may not have set yet if a file writes them out of order.
        rawColumns = match[2];
        break;
      case 'guid column':
        meta.guidColumn = columnNumber(value);
        break;
      case 'notetype column':
        meta.noteTypeColumn = columnNumber(value);
        break;
      case 'deck column':
        meta.deckColumn = columnNumber(value);
        break;
      case 'tags column':
        meta.tagsColumn = columnNumber(value);
        break;
      case 'notetype':
        if (value) meta.noteTypeName = value;
        break;
      case 'deck':
        if (value) meta.deckName = value;
        break;
      case 'tags':
        meta.globalTags = splitTags(value);
        break;
      default:
        meta.unknownDirectives.push(line);
        break;
    }
  }

  if (meta.separatorSource === 'default') {
    const sniffed = sniffSeparator(text.slice(offset));
    if (sniffed) {
      meta.separator = sniffed;
      meta.separatorSource = 'sniffed';
    }
  }

  if (rawColumns != null) {
    const names = parseDelimitedRows(rawColumns, meta.separator)[0] ?? [];
    // The writer pads the header row out to the column count with empty cells;
    // a genuinely unnamed column in the middle is kept.
    while (names.length && names[names.length - 1].trim() === '') names.pop();
    meta.columnNames = names;
  }

  return meta;
}

/** First body line that would split into the most columns, tried in `SNIFF_ORDER`. */
function sniffSeparator(body: string): string | undefined {
  let line = '';
  for (const candidate of body.split(/\r?\n/)) {
    if (candidate.trim()) {
      line = candidate;
      break;
    }
  }
  if (!line) return undefined;
  let best: string | undefined;
  let bestCount = 1;
  for (const sep of SNIFF_ORDER) {
    const count = (parseDelimitedRows(line, sep)[0] ?? []).length;
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Split delimited text into rows.
 *
 * RFC 4180 quoting, which is what Anki's writer emits: a field may be wrapped in
 * `"`, an inner `"` is doubled, and a quoted field may contain the separator and
 * newlines. A quote only opens a field at the field's start — `a"b` is a literal
 * quote, the same reading a spreadsheet gives it. An unterminated quote at
 * end-of-input flushes what it has rather than throwing, because a truncated
 * file must still open with the damage visible.
 */
export function parseDelimitedRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endRow = (): void => {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
  };

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (separator && text.startsWith(separator, i)) {
      row.push(field);
      field = '';
      i += separator.length;
      continue;
    }
    if (ch === '\r') {
      endRow();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // A trailing newline ends the last row; it does not start an empty one.
  if (field !== '' || row.length) endRow();
  return rows;
}

export interface BuildAnkiCsvOptions {
  /** Name for the placeholder note type when the file names none. */
  defaultNoteTypeName?: string;
}

export interface AnkiCsvCollection {
  meta: AnkiCsvMeta;
  raw: RawAnkiCollection;
  /** Delimited rows read from the body, before blank rows were dropped. */
  rowCount: number;
  /** Rows whose every cell was empty. Anki skips these and so does this. */
  blankRows: number;
}

interface NoteTypeAccumulator {
  row: RawAnkiNoteTypeRow;
  fieldCount: number;
}

/**
 * Read an Anki text export into raw rows `buildAnkiDraft` can consume.
 *
 * Two things this deliberately does **not** invent:
 *
 * - **Cards.** A CSV row is a note. How many cards it becomes is decided by the
 *   note type the user assigns on import, which the file does not carry, so
 *   emitting one would fabricate a `due`, a `queue` and an ordinal the source
 *   never had. The builder's `note-without-cards` diagnostic reports the state
 *   instead, and a `#deck:`/`#deck column:` is preserved on the note as
 *   `targetDeckId`.
 * - **A card design.** The placeholder note type carries the file's columns as
 *   fields and no templates, and is flagged `unassigned`, which the builder
 *   turns into the blocking `note-type-unassigned`. The draft opens; nothing
 *   can be exported from it until a real note type is chosen.
 */
export function buildAnkiCsvCollection(
  input: string,
  options: BuildAnkiCsvOptions = {},
): AnkiCsvCollection {
  const meta = parseAnkiCsvMeta(input);
  const body = input.slice(meta.bodyOffset);
  const rows = parseDelimitedRows(body, meta.separator);

  const special = new Set<number>();
  for (const n of [meta.guidColumn, meta.noteTypeColumn, meta.deckColumn, meta.tagsColumn]) {
    if (n != null) special.add(n - 1);
  }

  const noteTypes = new Map<string, NoteTypeAccumulator>();
  const decks = new Map<string, string>();
  const notes: RawAnkiNoteRow[] = [];
  let blankRows = 0;

  const deckId = (name: string): string => {
    const existing = decks.get(name);
    if (existing) return existing;
    const id = `csv-deck-${decks.size + 1}`;
    decks.set(name, id);
    return id;
  };

  rows.forEach((cells, index) => {
    if (cells.every((cell) => cell === '')) {
      blankRows += 1;
      return;
    }

    const at = (column: number | undefined): string =>
      column == null ? '' : (cells[column - 1] ?? '').trim();

    const fieldCells: string[] = [];
    for (let c = 0; c < cells.length; c += 1) {
      if (!special.has(c)) fieldCells.push(cells[c]);
    }

    const noteTypeName =
      at(meta.noteTypeColumn) ||
      meta.noteTypeName ||
      options.defaultNoteTypeName ||
      'Unassigned (CSV import)';
    let accumulator = noteTypes.get(noteTypeName);
    if (!accumulator) {
      // The field count is fixed by the first row that uses this note type. A
      // later row with a different count is a real field-count mismatch and the
      // builder is the thing that says so.
      const fieldCount = meta.columnNames.length
        ? meta.columnNames.filter((_name, c) => !special.has(c)).length
        : fieldCells.length;
      accumulator = {
        fieldCount,
        row: {
          id: `csv-notetype-${noteTypes.size + 1}`,
          name: noteTypeName,
          type: 0,
          css: '',
          sortf: 0,
          fields: Array.from({ length: fieldCount }, (_unused, ord) => ({
            ord,
            name: fieldNameAt(meta, special, ord) ?? `Field ${ord + 1}`,
          })),
          templates: [],
          unassigned: true,
        },
      };
      noteTypes.set(noteTypeName, accumulator);
    }

    const deckName = at(meta.deckColumn) || meta.deckName || '';
    const tags = [...meta.globalTags, ...splitTags(at(meta.tagsColumn))];

    notes.push({
      // Row number in the body, so a diagnostic points at a line the user can
      // open. `guid` stays empty when the file has no guid column: a CSV has no
      // cross-collection identity and inventing one that looks like Anki's
      // would survive an export and collide.
      id: `csv-row-${index + 1}`,
      guid: at(meta.guidColumn),
      mid: accumulator.row.id,
      flds: fieldCells.join(ANKI_FIELD_SEP),
      tags: tags.join(' '),
      targetDid: deckName ? deckId(deckName) : undefined,
    });
  });

  return {
    meta,
    rowCount: rows.length,
    blankRows,
    raw: {
      notes,
      cards: [],
      decks: [...decks.entries()].map(([name, id]) => ({ id, name })),
      noteTypes: [...noteTypes.values()].map((entry) => entry.row),
      // Neither absent-because-unread nor empty: a text export has no review
      // log and no media manifest, and both stay undefined so the builder
      // reports "not read" rather than accusing the file of missing media.
    },
  };
}

/** The `#columns:` name for the nth *field* column, skipping the special ones. */
function fieldNameAt(meta: AnkiCsvMeta, special: Set<number>, ord: number): string | undefined {
  if (!meta.columnNames.length) return undefined;
  let seen = -1;
  for (let c = 0; c < meta.columnNames.length; c += 1) {
    if (special.has(c)) continue;
    seen += 1;
    if (seen === ord) return meta.columnNames[c].trim() || undefined;
  }
  return undefined;
}

// ----- IPC contract ---------------------------------------------------------------

/**
 * Byte ceiling for `anki:readCsvDraft`.
 *
 * The read is synchronous string work on the main process, like its `.apkg`
 * sibling. The largest real export on this machine is 3.7 MB and parses+drafts
 * in 368 ms, so this caps the worst case at roughly one and a half seconds
 * rather than leaving it unbounded. Moving both readers off the main event loop
 * is Phase 7's large-deck performance work, not this slice's.
 */
export const ANKI_CSV_MAX_BYTES = 16 * 1024 * 1024;

export type AnkiCsvEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

/**
 * What the reader made of the file, beside the draft itself.
 *
 * Every guess it had to make is named here — a sniffed separator, an encoding
 * inferred from a byte-order mark, a directive it did not understand — so the
 * workbench can show the user what was assumed rather than presenting a
 * misparsed file as a clean one.
 */
export interface AnkiCsvDraftSummary {
  separator: string;
  separatorSource: AnkiCsvMeta['separatorSource'];
  html: boolean;
  columnNames: string[];
  guidColumn?: number;
  noteTypeColumn?: number;
  deckColumn?: number;
  tagsColumn?: number;
  globalTags: string[];
  unknownDirectives: string[];
  /** Delimited rows in the body, and how many of them were blank and skipped. */
  rowCount: number;
  blankRows: number;
  encoding: AnkiCsvEncoding;
  byteLength: number;
}

export interface CsvDraftRequest {
  /**
   * Required. Unlike `apkg:readDraft` this channel opens no file dialog: the
   * surface that picks the file is Phase 2's workbench shell, and a dialog here
   * would need user-visible strings before there is anything to show them in.
   */
  filePath?: string;
  /**
   * Read the file a previous page came from, named by that page's fingerprint
   * (the main process remembers the path; the renderer never holds one). A
   * file whose bytes no longer match is refused as `source-changed`.
   */
  fingerprint?: string;
  noteOffset?: number;
  noteLimit?: number;
}

export interface CsvDraftResult {
  ok: boolean;
  /** One page: the full header, `counts` for the whole file, windowed notes. */
  draft?: AnkiDraft;
  fileName?: string;
  noteOffset?: number;
  totalNotes?: number;
  csv?: AnkiCsvDraftSummary;
  error?: string;
}

/** The `AnkiCsvDraftSummary` half a caller can compute without touching a file. */
export function summarizeAnkiCsv(
  collection: AnkiCsvCollection,
): Omit<AnkiCsvDraftSummary, 'encoding' | 'byteLength'> {
  const { meta } = collection;
  return {
    separator: meta.separator,
    separatorSource: meta.separatorSource,
    html: meta.html,
    columnNames: meta.columnNames,
    guidColumn: meta.guidColumn,
    noteTypeColumn: meta.noteTypeColumn,
    deckColumn: meta.deckColumn,
    tagsColumn: meta.tagsColumn,
    globalTags: meta.globalTags,
    unknownDirectives: meta.unknownDirectives,
    rowCount: collection.rowCount,
    blankRows: collection.blankRows,
  };
}
