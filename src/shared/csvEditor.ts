/** Parse, edit, and serialize CSV tables (RFC-style quoting). */

export type CsvDelimiter = ',' | '\t' | ';';

export interface CsvTable {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  headers: string[];
  rows: string[][];
}

export interface CsvParseOptions {
  delimiter?: CsvDelimiter;
  hasHeader?: boolean;
  /**
   * Template for generated column names, `{n}` standing for the 1-based
   * index. Passed explicitly because the parse runs in a Web Worker, whose
   * copy of this module never sees `setCsvColumnLabel`.
   */
  columnLabel?: string;
}

/*
  Generated column names ("Column 3") are chrome, not content, so the editor
  passes the UI language's `csv.columnN` template in. The English default stays
  for callers that never set one (and for tests).
*/
const DEFAULT_COLUMN_LABEL = 'Column {n}';
let columnLabelTemplate = DEFAULT_COLUMN_LABEL;

/** Set the template generated column names use; `{n}` is the 1-based index. */
export function setCsvColumnLabel(template: string | null | undefined): void {
  columnLabelTemplate = template && template.includes('{n}') ? template : DEFAULT_COLUMN_LABEL;
}

/** The current template, for handing to the parse worker. */
export function csvColumnLabel(): string {
  return columnLabelTemplate;
}

/** The generated name for column `index` (0-based). */
export function defaultColumnName(index: number, template = columnLabelTemplate): string {
  return template.split('{n}').join(String(index + 1));
}

function templatePattern(template: string): RegExp {
  const parts = template.split('{n}').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('\\d+')}$`);
}

/**
 * True for a header the editor made up rather than one a file supplied: the
 * current template, the English default (grids saved before the label was
 * translated), or blank.
 */
export function isGeneratedColumnName(header: string): boolean {
  const h = header.trim();
  if (!h) return true;
  return templatePattern(columnLabelTemplate).test(h) || templatePattern(DEFAULT_COLUMN_LABEL).test(h);
}

/** A grid with no content in any cell — nothing the user would lose by replacing it. */
export function isBlankTable(table: CsvTable): boolean {
  return table.rows.every((row) => row.every((cell) => !cell.trim()));
}

export function detectDelimiter(line: string): CsvDelimiter {
  const counts: Array<[CsvDelimiter, number]> = [
    ['\t', (line.match(/\t/g) ?? []).length],
    [';', (line.match(/;/g) ?? []).length],
    [',', (line.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function firstPhysicalLine(raw: string): string {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === '\n') return text.slice(0, i);
  }
  return text;
}

/** Parse full CSV text into records, respecting quoted newlines. */
export function parseCsvRecords(raw: string, delimiter: string): string[][] {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      record.push(field);
      field = '';
      continue;
    }
    if (!inQuotes && ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      continue;
    }
    field += ch;
  }

  record.push(field);
  records.push(record);

  while (records.length && records[records.length - 1].every((c) => c === '')) {
    records.pop();
  }

  return records;
}

export function escapeCsvField(value: string, delimiter: CsvDelimiter): string {
  const needsQuotes =
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes(delimiter);
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function serializeCsvTable(table: CsvTable): string {
  const delim = table.delimiter;
  const lines: string[] = [];
  if (table.hasHeader && table.headers.length) {
    lines.push(table.headers.map((h) => escapeCsvField(h, delim)).join(delim));
  }
  for (const row of table.rows) {
    const padded = padRow(row, table.headers.length);
    lines.push(padded.map((c) => escapeCsvField(c, delim)).join(delim));
  }
  return lines.join('\n');
}

function padRow(row: string[], width: number): string[] {
  if (width <= 0) return [...row];
  const out = row.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

export function normalizeTable(table: CsvTable): CsvTable {
  // Loop instead of Math.max(...spread): spreading 100k+ rows as arguments
  // overflows the call stack on large imports.
  let width = Math.max(table.headers.length, 1);
  let rowsUniform = true;
  for (const r of table.rows) {
    if (r.length > width) width = r.length;
  }
  for (const r of table.rows) {
    if (r.length !== width) {
      rowsUniform = false;
      break;
    }
  }
  // Fast path: already normalized → return the SAME object. Editing helpers
  // call normalizeTable on every keystroke; preserving identity here keeps
  // untouched row arrays shared between snapshots, which is what allows
  // memoized grid rows and cheap dirty checks to work.
  if (rowsUniform && table.headers.length === width) return table;
  const headers =
    table.headers.length >= width
      ? table.headers.slice(0, width)
      : [...table.headers, ...Array.from({ length: width - table.headers.length }, (_, i) => defaultColumnName(table.headers.length + i))];
  return {
    ...table,
    headers,
    rows: table.rows.map((r) => padRow(r, width)),
  };
}

/**
 * Anki's "Notes in Plain Text" export starts with `#key:value` lines
 * (`#separator:tab`, `#html:true`, `#columns:…`). They are instructions, not
 * rows: read the separator and column names from them, and drop them.
 */
interface AnkiTextHeader {
  body: string;
  delimiter?: CsvDelimiter;
  columns?: string;
  present: boolean;
}

const ANKI_SEPARATORS: Record<string, CsvDelimiter> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  '\t': '\t',
  ',': ',',
  ';': ';',
};

function readAnkiTextHeader(text: string): AnkiTextHeader {
  let rest = text;
  let delimiter: CsvDelimiter | undefined;
  let columns: string | undefined;
  let present = false;
  for (;;) {
    const m = /^#([a-z][a-z ]*):([^\n]*)(?:\n|$)/i.exec(rest);
    if (!m) break;
    present = true;
    const key = m[1].trim().toLowerCase();
    const value = m[2].replace(/\r$/, '');
    if (key === 'separator') delimiter = ANKI_SEPARATORS[value.trim().toLowerCase()] ?? delimiter;
    if (key === 'columns') columns = value;
    rest = rest.slice(m[0].length);
  }
  return { body: rest, delimiter, columns, present };
}

export function parseCsvText(raw: string, opts?: CsvParseOptions): CsvTable {
  const label = opts?.columnLabel ?? columnLabelTemplate;
  const name = (i: number): string => defaultColumnName(i, label);
  const anki = readAnkiTextHeader(raw.replace(/^\uFEFF/, ''));
  const trimmed = anki.body.trim();
  if (!trimmed) {
    return { delimiter: ',', hasHeader: true, headers: [name(0)], rows: [] };
  }
  const delimiter =
    opts?.delimiter ?? anki.delimiter ?? detectDelimiter(firstPhysicalLine(trimmed));
  let parsed = parseCsvRecords(trimmed, delimiter);
  if (!parsed.length) {
    return { delimiter: ',', hasHeader: true, headers: [name(0)], rows: [] };
  }
  // An Anki export has no header row; `#columns:` names the columns instead.
  const ankiColumns = anki.columns !== undefined ? splitCsvLine(anki.columns, delimiter) : null;
  if (ankiColumns) parsed = [ankiColumns, ...parsed];
  const hasHeader =
    opts?.hasHeader ??
    (ankiColumns ? true : anki.present ? false : looksLikeHeader(parsed[0], parsed[1]));
  let headers: string[];
  let rows: string[][];
  if (hasHeader) {
    headers = parsed[0].map((h, i) => h.trim() || name(i));
    rows = parsed.slice(1);
  } else {
    let colCount = 1;
    for (const r of parsed) if (r.length > colCount) colCount = r.length;
    headers = Array.from({ length: colCount }, (_, i) => name(i));
    rows = parsed;
  }
  // Name any column wider than the header row here, with the caller's label,
  // rather than leaving it to normalizeTable's module-level one.
  let width = headers.length;
  for (const r of rows) if (r.length > width) width = r.length;
  while (headers.length < width) headers.push(name(headers.length));
  return normalizeTable({ delimiter, hasHeader, headers, rows });
}

function looksLikeHeader(first: string[] | undefined, second: string[] | undefined): boolean {
  if (!first?.length) return true;
  if (!second?.length) return true;
  const headerish = first.some((c) =>
    /expression|reading|meaning|front|back|sentence|word|definition|translation/i.test(c),
  );
  if (headerish) return true;
  const firstNumeric = first.filter((c) => c.trim() && /^\d+$/.test(c.trim())).length;
  const secondNumeric = second.filter((c) => c.trim() && /^\d+$/.test(c.trim())).length;
  return firstNumeric < secondNumeric;
}

export function emptyTable(cols = 3, rows = 5): CsvTable {
  return normalizeTable({
    delimiter: ',',
    hasHeader: true,
    headers: Array.from({ length: cols }, (_, i) => defaultColumnName(i)),
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
  });
}

export function setCell(table: CsvTable, rowIndex: number, colIndex: number, value: string): CsvTable {
  const norm = normalizeTable(table);
  if (rowIndex < 0 || rowIndex >= norm.rows.length) return norm;
  if (norm.rows[rowIndex][colIndex] === value) return norm;
  // Only the edited row gets a new array; all other rows keep their identity
  // so React.memo'd grid rows skip re-rendering. Never mutate `norm` — the
  // fast path in normalizeTable may have returned the caller's object.
  const rows = norm.rows.slice();
  rows[rowIndex] = rows[rowIndex].map((cell, ci) => (ci === colIndex ? value : cell));
  return { ...norm, rows };
}

export function setHeader(table: CsvTable, colIndex: number, value: string): CsvTable {
  const norm = normalizeTable(table);
  if (colIndex < 0 || colIndex >= norm.headers.length) return norm;
  return { ...norm, headers: norm.headers.map((h, i) => (i === colIndex ? value : h)) };
}

export function insertRow(table: CsvTable, index: number): CsvTable {
  const next = normalizeTable(table);
  const blank = Array.from({ length: next.headers.length }, () => '');
  const rows = [...next.rows];
  rows.splice(Math.max(0, Math.min(index, rows.length)), 0, blank);
  return { ...next, rows };
}

export function deleteRow(table: CsvTable, index: number): CsvTable {
  const next = normalizeTable(table);
  if (index < 0 || index >= next.rows.length) return next;
  return { ...next, rows: next.rows.filter((_, i) => i !== index) };
}

export function insertColumn(table: CsvTable, index: number): CsvTable {
  const next = normalizeTable(table);
  const name = defaultColumnName(next.headers.length);
  const headers = [...next.headers];
  headers.splice(Math.max(0, Math.min(index, headers.length)), 0, name);
  const rows = next.rows.map((row) => {
    const r = [...row];
    r.splice(Math.max(0, Math.min(index, r.length)), 0, '');
    return r;
  });
  return normalizeTable({ ...next, headers, rows });
}

export function deleteColumn(table: CsvTable, index: number): CsvTable {
  const next = normalizeTable(table);
  if (next.headers.length <= 1) return next;
  if (index < 0 || index >= next.headers.length) return next;
  return normalizeTable({
    ...next,
    headers: next.headers.filter((_, i) => i !== index),
    rows: next.rows.map((row) => row.filter((_, i) => i !== index)),
  });
}

export function tableStats(table: CsvTable): { rows: number; columns: number } {
  const n = normalizeTable(table);
  return { rows: n.rows.length, columns: n.headers.length };
}
