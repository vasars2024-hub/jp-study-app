/**
 * One reader for every "import your own" file in the app: CSV, TSV or JSON.
 *
 * Each importer (game word lists, Mirror Writing texts, resources, example
 * sentences) has its own columns, but they all had to answer the same
 * questions — which separator, is there a header, what does a quoted comma
 * mean, what shape of JSON — and answering them once keeps the templates the
 * dialogs show and the files the parsers accept from drifting apart.
 *
 * Pure: no DOM, no storage. Rows come back as `Record<column, string>` with
 * column names lower-cased and stripped of spaces, dashes and underscores, so
 * "Example Sentence", "example_sentence" and "examplesentence" are one column.
 */

export type ImportFormat = 'csv' | 'tsv' | 'json';

export interface ImportTable {
  format: ImportFormat;
  rows: Array<Record<string, string>>;
}

/** `Example Sentence` / `example_sentence` / `example-sentence` → `examplesentence`. */
export function normalizeColumn(name: string): string {
  return String(name ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/** Split one delimited line. Quoted cells may hold the separator; `""` is a quote. */
export function splitDelimitedLine(line: string, sep: string): string[] {
  if (sep === '\t') return line.split('\t').map((cell) => cell.trim());
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(stringify).filter(Boolean).join(', ');
  return '';
}

/**
 * Read a delimited or JSON file into rows.
 *
 * `knownColumns` decides whether the first line is a header: if any of its
 * cells names a known column it is; otherwise every line is data and
 * `positional` names the columns in order. JSON is an array of objects, or an
 * object holding one under `items`, `rows`, `entries` or `data`.
 */
export function readImportTable(
  text: string,
  fileName: string,
  knownColumns: readonly string[],
  positional: readonly string[],
): ImportTable {
  const clean = String(text ?? '').replace(/^\ufeff/, '');
  if (/\.json$/i.test(fileName) || /^\s*[[{]/.test(clean)) {
    try {
      const parsed = JSON.parse(clean) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object'
          ? (['items', 'rows', 'entries', 'data', 'points', 'texts', 'resources']
              .map((key) => (parsed as Record<string, unknown>)[key])
              .find(Array.isArray) as unknown[] | undefined) ?? []
          : [];
      const rows = list
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
        .map((row) => {
          const out: Record<string, string> = {};
          for (const [key, value] of Object.entries(row)) {
            const v = stringify(value);
            if (v) out[normalizeColumn(key)] = v;
          }
          return out;
        });
      return { format: 'json', rows };
    } catch {
      return { format: 'json', rows: [] };
    }
  }
  const lines = clean.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  if (!lines.length) return { format: 'csv', rows: [] };
  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const known = new Set(knownColumns.map(normalizeColumn));
  const header = splitDelimitedLine(first, sep).map(normalizeColumn);
  const hasHeader = header.some((cell) => known.has(cell));
  const columns = hasHeader ? header : positional.map(normalizeColumn);
  const rows = (hasHeader ? lines.slice(1) : lines).map((line) => {
    const cells = splitDelimitedLine(line, sep);
    const out: Record<string, string> = {};
    columns.forEach((column, i) => {
      const value = cells[i] ?? '';
      if (column && value) out[column] = value;
    });
    return out;
  });
  return { format: sep === '\t' ? 'tsv' : 'csv', rows };
}

/** The first non-empty value among several column aliases. */
export function pick(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[normalizeColumn(alias)];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

/** A stable short id for imported content, from the text that identifies it. */
export function importId(prefix: string, text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}
