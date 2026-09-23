/**
 * RFC 4180 CSV, read tolerantly — the parser under the Letterboxd importer.
 *
 * Letterboxd's export is ordinary spreadsheet CSV, which is exactly why a
 * `split(',')` reader is wrong for it: a film called `Crouching Tiger, Hidden
 * Dragon` arrives quoted, a diary row's `Tags` column is `"anime, rewatch"`, and
 * a review is free text with embedded newlines and doubled quotes. Every one of
 * those shifts every later column by one under a naive split, and the damage is
 * silent — the row still has "enough" cells, they are just the wrong ones.
 *
 * Pure: a string in, rows out. No I/O, no clock.
 */

/** Strips a leading UTF-8 byte-order mark, which Excel-saved CSVs carry. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Splits CSV text into rows of cells.
 *
 * - Fields are separated by `,`; records by `\r\n`, `\n` or a lone `\r`.
 * - A field that starts with `"` is quoted: it runs to the next unpaired `"`,
 *   may contain commas and newlines, and `""` inside it is one literal quote.
 * - A stray quote in the middle of an unquoted field is kept literally rather
 *   than thrown over — real exports are hand-edited more often than one thinks.
 * - A blank line is returned as `['']`, not dropped: Letterboxd's list files
 *   separate their metadata block from their film block with one, and a caller
 *   that needs the boundary can see it. Only the final empty line (the file's
 *   trailing newline) is dropped.
 */
export function parseCsv(input: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStart = true;
  let i = 0;
  const n = text.length;

  const endField = (): void => {
    row.push(field);
    field = '';
    fieldStart = true;
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
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
    if (ch === '"' && fieldStart) {
      quoted = true;
      fieldStart = false;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRow();
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    fieldStart = false;
    i += 1;
  }

  // Whatever is left after the last separator is a final row — unless the file
  // simply ended with a newline, in which case there is nothing left at all.
  if (field !== '' || row.length > 0 || quoted) endRow();
  return rows;
}

/** True for a row that is nothing but one empty cell — a blank line. */
export function isBlankCsvRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

export interface CsvTable {
  header: string[];
  records: Record<string, string>[];
}

/**
 * The first non-blank row as the header, every later non-blank row keyed by it.
 *
 * Header names are trimmed. A record shorter than the header gets `''` for the
 * missing cells; cells past the header's width are dropped.
 */
export function csvTable(rows: readonly (readonly string[])[]): CsvTable {
  let start = 0;
  while (start < rows.length && isBlankCsvRow(rows[start])) start += 1;
  if (start >= rows.length) return { header: [], records: [] };
  const header = rows[start].map((cell) => cell.trim());
  const records: Record<string, string>[] = [];
  for (let r = start + 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (isBlankCsvRow(row)) continue;
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = row[index] ?? '';
    });
    records.push(record);
  }
  return { header, records };
}
