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
// **…which is exactly why inline provenance cannot go out verbatim.** Measured
// 2026-08-18, gate 15's translate half: a `translate-field` batch approved into
// a `#html:false` file wrote
// `<span class="jp-ai-gen" data-jp-ai="gemini|gemini-2.5-flash">тётя</span>`
// into the cell, the export reported `ok`/`verified: true`, and re-reading
// through this app's own reader gave the markup back as the field's TEXT —
// which is what Anki shows on the card, because the file's own header says
// these fields are not HTML. `wrapAiProvenance` is unconditional on purpose
// (an unmarked generation is indistinguishable from the user's own writing),
// and the tray cannot know the destination, so the fidelity contract has to be
// honoured here: on a plain-text file the wrapper is unwrapped to its text and
// the provenance is re-stated as a note-level `#tags column:` tag, which is
// Anki's own plain-text-safe channel. It is an honest DOWNGRADE — field-level
// becomes note-level — so it is counted and reported rather than done quietly.
// With no tags column there is nowhere for the marker at all, and the export
// refuses by name instead of laundering generated text as hand-written.
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
import { AI_PROVENANCE_ATTR, AI_PROVENANCE_CLASS } from './ankiAiAdditions';
import { ENRICH_PROVENANCE_ATTR, ENRICH_PROVENANCE_CLASS } from './ankiEnrich';
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
  /**
   * A generated/enriched value was written into a plain-text file that has no
   * `#tags column:`, so its provenance marker has nowhere to go. Distinct from
   * `no-tags-column`: the user did not ask to change tags, and the fix is a
   * different one — export as a package, or add a tags column to the source.
   */
  | 'generated-provenance-unrepresentable'
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
   * Notes whose inline provenance wrapper was unwrapped and re-stated as a tag
   * because the file is `#html:false`. Its own count, not folded into
   * `tagsUpdated`: it is the one number that says the marker the user reviewed
   * at field level is on the note instead, and a surface that cannot see it
   * would present a silent downgrade as a clean round trip.
   */
  provenanceTagged?: number;
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
  /** See `AnkiCsvExportResult.provenanceTagged`. */
  provenanceTagged: number;
  /**
   * The field values actually written, ONLY for notes this writer rewrote —
   * today, the plain-text provenance unwrap. Read-back verification compares
   * against the caller's change set everywhere else on purpose, because that is
   * the stronger check: a pass-through that mangles a value must not be able to
   * verify green against its own mangling. This is the narrow exception where
   * the writer legitimately does not write what it was handed, so it declares
   * exactly which notes those are.
   */
  effectiveFields: Map<string, string[]>;
}

// ----- inline provenance on a plain-text destination ----------------------------

/**
 * The two inline provenance wrappers this app writes, with the tag root each
 * becomes on a plain-text destination.
 *
 * The roots reuse the wrappers' own class names rather than inventing a second
 * vocabulary: someone grepping an exported deck for `jp-ai-gen` finds generated
 * content whether the export was a package or a text file, which is the whole
 * point of `AI_PROVENANCE_CLASS`'s "tell the two apart without knowing the
 * attribute names".
 */
const PROVENANCE_WRAPPERS: ReadonlyArray<{ cls: string; attr: string; tagRoot: string }> = [
  { cls: AI_PROVENANCE_CLASS, attr: AI_PROVENANCE_ATTR, tagRoot: AI_PROVENANCE_CLASS },
  { cls: ENRICH_PROVENANCE_CLASS, attr: ENRICH_PROVENANCE_ATTR, tagRoot: ENRICH_PROVENANCE_CLASS },
];

const CLOSE_SPAN = '</span>';

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * An Anki tag is whitespace-delimited and `::` is its hierarchy separator, so
 * `provider|model` becomes `jp-ai-gen::gemini::gemini-2.5-flash`. Whitespace
 * inside a part collapses to `-` rather than splitting the tag in two.
 *
 * An empty attribute still produces the bare root: `wrapAiProvenance` states
 * that an unattributed generation is still marked — "generated, source
 * unrecorded" is the honest statement, not silence — and dropping the tag here
 * would undo exactly that.
 */
function provenanceTagFor(tagRoot: string, rawAttr: string): string {
  const parts = unescapeAttr(rawAttr)
    .split('|')
    .map((part) => part.trim().replace(/[\s"]+/gu, '-'))
    .filter(Boolean);
  return parts.length ? `${tagRoot}::${parts.join('::')}` : tagRoot;
}

/**
 * Index of the `</span>` that closes the span whose body starts at `from`, or
 * `-1` when the markup is unbalanced.
 *
 * Depth-counted rather than `lastIndexOf` (which `readAiProvenance` can use
 * because it only ever reads the outermost wrapper of a whole field): here the
 * value may hold several wrappers in a row — an `append` conflict writes the
 * old value, a separator, then the new one — and taking the last close would
 * swallow everything between them.
 */
function matchingSpanEnd(value: string, from: number): number {
  let depth = 0;
  let i = from;
  while (i < value.length) {
    if (value.startsWith(CLOSE_SPAN, i)) {
      if (depth === 0) return i;
      depth -= 1;
      i += CLOSE_SPAN.length;
      continue;
    }
    if (/^<span[\s>]/u.test(value.slice(i, i + 6))) {
      depth += 1;
      i += 5;
      continue;
    }
    i += 1;
  }
  return -1;
}

/**
 * Strip this app's provenance wrappers out of one field value, returning the
 * plain text and the tags that now carry what the wrappers said.
 *
 * Only these two wrappers are touched. Any other markup the user put in the
 * field is left exactly as it was: this module's job is to keep the app's OWN
 * additions representable, not to sanitize a file the user typed HTML into.
 */
export function unwrapProvenanceForPlainText(value: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  let out = '';
  let i = 0;
  outer: while (i < value.length) {
    if (value.startsWith('<span', i)) {
      for (const wrapper of PROVENANCE_WRAPPERS) {
        const open = new RegExp(`^<span class="${wrapper.cls}" ${wrapper.attr}="([^"]*)">`, 'u');
        const match = open.exec(value.slice(i));
        if (!match) continue;
        const bodyStart = i + match[0].length;
        const end = matchingSpanEnd(value, bodyStart);
        // Unbalanced markup is copied through untouched rather than guessed at.
        if (end < 0) continue;
        tags.push(provenanceTagFor(wrapper.tagRoot, match[1]));
        // A generated value can sit on top of an enriched one, so the body is
        // unwrapped too and both markers survive as two tags.
        const inner = unwrapProvenanceForPlainText(value.slice(bodyStart, end));
        out += inner.text;
        tags.push(...inner.tags);
        i = end + CLOSE_SPAN.length;
        continue outer;
      }
    }
    out += value[i];
    i += 1;
  }
  return { text: out, tags };
}

/**
 * The tag cell's own tags. Local rather than reaching into `ankiCsv.ts`'s
 * private splitter, and deliberately the same rule the reader uses: whitespace
 * delimited, empties dropped.
 */
function splitCellTags(cell: string): string[] {
  return cell
    .split(/\s+/u)
    .map((tag) => tag.trim())
    .filter(Boolean);
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
  let provenanceTagged = 0;
  const effectiveFields = new Map<string, string[]>();

  for (const change of changes.notes ?? []) {
    const index = rowIndexForNoteId(change.noteId);
    if (index == null || index >= rows.length) {
      throw new CsvExportRefusal(
        'note-missing',
        `The source file has no row for ${change.noteId}.`,
      );
    }
    const cells = rows[index];
    // Provenance markers this note's fields could not carry as markup. Collected
    // across all its fields so one note contributes one tag-cell rewrite.
    const provenanceTags: string[] = [];

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
      const written = [...fields];
      fieldPositions.forEach((position, ord) => {
        // Only a plain-text file needs this. An `#html:true` export carries the
        // wrapper verbatim and round-trips it, which is the better answer where
        // it is available — see the module note.
        if (!meta.html) {
          const stripped = unwrapProvenanceForPlainText(written[ord]);
          if (stripped.tags.length) {
            written[ord] = stripped.text;
            provenanceTags.push(...stripped.tags);
          }
        }
        cells[position] = written[ord];
      });
      notesUpdated += 1;
      if (provenanceTags.length) {
        provenanceTagged += 1;
        effectiveFields.set(change.noteId, written);
      }
    }

    if (change.tags || provenanceTags.length) {
      if (meta.tagsColumn == null) {
        if (provenanceTags.length) {
          throw new CsvExportRefusal(
            'generated-provenance-unrepresentable',
            `${change.noteId} carries generated or dictionary-sourced text, but this file is plain text (\`#html:false\`) and declares no \`#tags column:\`, so there is nowhere to record where that text came from. Export as a package instead, or add a tags column to the source file.`,
          );
        }
        throw new CsvExportRefusal(
          'no-tags-column',
          'This file declares no `#tags column:`, so there is nowhere to write tags. Export as a package instead.',
        );
      }
      const column = meta.tagsColumn - 1;
      // The change set's list when the user edited tags, otherwise the row's own
      // cell — a provenance tag ADDS to what the note already has and must never
      // be the whole list.
      const tags = change.tags ? [...change.tags] : splitCellTags(cells[column] ?? '');
      // `#tags:` applies to every note in the file and the reader prepends it to
      // each note's tags. Writing the full list back into the column would
      // duplicate those on the next read, so the global prefix is removed again.
      for (const global of meta.globalTags) {
        const at = tags.indexOf(global);
        if (at >= 0) tags.splice(at, 1);
      }
      // Deduped so exporting the same edit twice does not stack the marker.
      for (const tag of provenanceTags) if (!tags.includes(tag)) tags.push(tag);
      while (cells.length <= column) cells.push('');
      cells[column] = tags.join(' ');
      tagsUpdated += 1;
    }
  }

  return {
    text: buildAnkiCsvHeader(meta) + serializeCsvRows(rows, meta.separator),
    notesUpdated,
    tagsUpdated,
    provenanceTagged,
    effectiveFields,
    rowsWritten: rows.length,
    noteIdentity: meta.guidColumn != null ? 'guid' : 'row-order',
  };
}
