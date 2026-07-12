/**
 * Web Worker: CSV/TSV parsing off the main thread.
 *
 * Parsing a large import (15k+ rows) is a single synchronous pass over the
 * whole file — done on the UI thread it blocks input and animation for the
 * entire parse. The worker keeps the window responsive; the parsed table
 * comes back via structured clone (plain strings/arrays, no serialization
 * cost beyond the copy).
 */
import { parseCsvText, type CsvParseOptions } from '../../shared/csvEditor';

export interface CsvParseRequest {
  id: number;
  raw: string;
  opts?: CsvParseOptions;
}

self.onmessage = (e: MessageEvent<CsvParseRequest>) => {
  const { id, raw, opts } = e.data;
  try {
    const table = parseCsvText(raw, opts);
    (self as unknown as Worker).postMessage({ id, ok: true as const, table });
  } catch (error) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
