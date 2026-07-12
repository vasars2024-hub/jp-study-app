/** Column operations and data transformations for the CSV editor. */

import {
  normalizeTable,
  insertColumn,
  type CsvTable,
} from './csvEditor';

export type CaseMode = 'upper' | 'lower' | 'title';

export function reorderColumns(table: CsvTable, fromIndex: number, toIndex: number): CsvTable {
  const next = normalizeTable(table);
  if (fromIndex === toIndex) return next;
  if (fromIndex < 0 || fromIndex >= next.headers.length) return next;
  if (toIndex < 0 || toIndex >= next.headers.length) return next;

  const headers = [...next.headers];
  const [movedHeader] = headers.splice(fromIndex, 1);
  headers.splice(toIndex, 0, movedHeader);

  const rows = next.rows.map((row) => {
    const r = [...row];
    const [movedCell] = r.splice(fromIndex, 1);
    r.splice(toIndex, 0, movedCell);
    return r;
  });

  return normalizeTable({ ...next, headers, rows });
}

export function splitColumn(table: CsvTable, colIndex: number, delimiter: string): CsvTable {
  const next = normalizeTable(table);
  if (colIndex < 0 || colIndex >= next.headers.length) return next;
  const delim = delimiter || ':';
  const baseHeader = next.headers[colIndex];
  const leftHeader = `${baseHeader} (1)`;
  const rightHeader = `${baseHeader} (2)`;

  const headers = [...next.headers];
  headers.splice(colIndex, 1, leftHeader, rightHeader);

  const rows = next.rows.map((row) => {
    const value = row[colIndex] ?? '';
    const splitAt = value.indexOf(delim);
    const left = splitAt >= 0 ? value.slice(0, splitAt).trim() : value;
    const right = splitAt >= 0 ? value.slice(splitAt + delim.length).trim() : '';
    const r = [...row];
    r.splice(colIndex, 1, left, right);
    return r;
  });

  return normalizeTable({ ...next, headers, rows });
}

export function mergeColumns(
  table: CsvTable,
  colIndices: number[],
  separator: string,
  newHeader?: string,
): CsvTable {
  const next = normalizeTable(table);
  const sorted = [...new Set(colIndices)].filter((i) => i >= 0 && i < next.headers.length).sort((a, b) => a - b);
  if (sorted.length < 2) return next;

  const sep = separator ?? ' ';
  const mergedHeader =
    newHeader?.trim() ||
    sorted.map((i) => next.headers[i]).join(' + ');

  const newHeaders: string[] = [];
  let mergedPlaced = false;
  for (let i = 0; i < next.headers.length; i++) {
    if (sorted.includes(i)) {
      if (!mergedPlaced) {
        newHeaders.push(mergedHeader);
        mergedPlaced = true;
      }
    } else {
      newHeaders.push(next.headers[i]);
    }
  }

  const rows = next.rows.map((row) => {
    const parts = sorted.map((i) => row[i] ?? '').filter((p) => p.length > 0);
    const merged = parts.join(sep);
    const newRow: string[] = [];
    let placed = false;
    for (let i = 0; i < row.length; i++) {
      if (sorted.includes(i)) {
        if (!placed) {
          newRow.push(merged);
          placed = true;
        }
      } else {
        newRow.push(row[i]);
      }
    }
    return newRow;
  });

  return normalizeTable({ ...next, headers: newHeaders, rows });
}

export function findAndReplace(
  table: CsvTable,
  find: string,
  replace: string,
  colIndices?: number[],
  useRegex = false,
): CsvTable {
  const next = normalizeTable(table);
  if (!find) return next;

  const cols =
    colIndices?.length
      ? new Set(colIndices.filter((i) => i >= 0 && i < next.headers.length))
      : null;

  let pattern: RegExp | string = find;
  if (useRegex) {
    try {
      pattern = new RegExp(find, 'g');
    } catch {
      return next;
    }
  }

  const rows = next.rows.map((row) =>
    row.map((cell, ci) => {
      if (cols && !cols.has(ci)) return cell;
      if (useRegex && pattern instanceof RegExp) {
        return cell.replace(pattern, replace);
      }
      if (!find) return cell;
      return cell.split(find).join(replace);
    }),
  );

  return { ...next, rows };
}

function applyCase(value: string, mode: CaseMode): string {
  if (mode === 'upper') return value.toUpperCase();
  if (mode === 'lower') return value.toLowerCase();
  return value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function changeCase(
  table: CsvTable,
  mode: CaseMode,
  opts?: { colIndices?: number[]; rowIndices?: number[] },
): CsvTable {
  const next = normalizeTable(table);
  const colSet = opts?.colIndices?.length
    ? new Set(opts.colIndices.filter((i) => i >= 0 && i < next.headers.length))
    : null;
  const rowSet = opts?.rowIndices?.length ? new Set(opts.rowIndices) : null;

  const rows = next.rows.map((row, ri) => {
    if (rowSet && !rowSet.has(ri)) return row;
    return row.map((cell, ci) => {
      if (colSet && !colSet.has(ci)) return cell;
      return applyCase(cell, mode);
    });
  });

  if (colSet) {
    const headers = next.headers.map((h, i) => (colSet.has(i) ? applyCase(h, mode) : h));
    return { ...next, headers, rows };
  }

  return { ...next, rows };
}

export function trimWhitespace(table: CsvTable): CsvTable {
  const next = normalizeTable(table);
  return {
    ...next,
    headers: next.headers.map((h) => h.trim()),
    rows: next.rows.map((row) => row.map((cell) => cell.trim())),
  };
}

export function deduplicateRows(table: CsvTable, columnIndex: number): CsvTable {
  const next = normalizeTable(table);
  if (columnIndex < 0 || columnIndex >= next.headers.length) return next;
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const row of next.rows) {
    const key = (row[columnIndex] ?? '').trim().toLowerCase();
    if (!key) {
      rows.push(row);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return { ...next, rows };
}

export function addTagColumn(table: CsvTable, header: string, value: string): CsvTable {
  const next = normalizeTable(table);
  const tagHeader = header.trim() || 'Tag';
  const withCol = insertColumn(next, next.headers.length);
  const colIndex = withCol.headers.length - 1;
  withCol.headers[colIndex] = tagHeader;
  withCol.rows = withCol.rows.map((row) => {
    const r = [...row];
    r[colIndex] = value;
    return r;
  });
  return withCol;
}

export function addAutoNumberColumn(table: CsvTable, header = 'ID'): CsvTable {
  const next = normalizeTable(table);
  const withCol = insertColumn(next, 0);
  withCol.headers[0] = header.trim() || 'ID';
  withCol.rows = withCol.rows.map((row, i) => {
    const r = [...row];
    r[0] = String(i + 1);
    return r;
  });
  return withCol;
}

export function appendTables(base: CsvTable, incoming: CsvTable): CsvTable {
  const a = normalizeTable(base);
  const b = normalizeTable(incoming);
  const width = Math.max(a.headers.length, b.headers.length);
  const padHeaders = (headers: string[], w: number): string[] => {
    const out = headers.slice(0, w);
    while (out.length < w) out.push(`Column ${out.length + 1}`);
    return out;
  };
  const headers = padHeaders(a.headers, width);
  const padRow = (row: string[], w: number): string[] => {
    const out = row.slice(0, w);
    while (out.length < w) out.push('');
    return out;
  };
  const rows = [
    ...a.rows.map((r) => padRow(r, width)),
    ...b.rows.map((r) => padRow(r, width)),
  ];
  return normalizeTable({
    delimiter: a.delimiter,
    hasHeader: a.hasHeader,
    headers,
    rows,
  });
}

export function buildSearchPattern(query: string, useRegex: boolean): RegExp | null {
  if (!query) return null;
  if (useRegex) {
    try {
      return new RegExp(query, 'i');
    } catch {
      return null;
    }
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

export function cellMatchesSearch(value: string, pattern: RegExp | null): boolean {
  if (!pattern) return true;
  return pattern.test(value);
}

export function rowMatchesFilters(
  row: string[],
  globalPattern: RegExp | null,
  columnFilters: Record<number, string>,
  useRegex: boolean,
): boolean {
  if (globalPattern) {
    const any = row.some((cell) => globalPattern.test(cell));
    if (!any) return false;
  }
  for (const [colStr, filterText] of Object.entries(columnFilters)) {
    const col = Number(colStr);
    const text = filterText.trim();
    if (!text) continue;
    const cell = row[col] ?? '';
    const pat = buildSearchPattern(text, useRegex);
    if (!pat || !pat.test(cell)) return false;
  }
  return true;
}
