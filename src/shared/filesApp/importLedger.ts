/**
 * Gate 29 — "Re-scan is idempotent. Running the same scan twice imports nothing
 * the second time **and says so** — a duplicate library entry is a FAIL."
 *
 * Two halves, and only one of them is the importers'. `library:importPaths`
 * already skips a `sourcePath` it holds and `media:addOrGetItem` gets-or-adds,
 * so a second import of the same path does not create a second row. That is the
 * "imports nothing" half and it is checked against the real handlers.
 *
 * **"And says so" is this module.** Without it a second scan re-offers every
 * file it offered the first time, the user confirms them, the importers
 * silently swallow the lot, and the report claims N imported when N rows were
 * created and nothing happened. A report that cannot distinguish "brought in"
 * from "was already here" is exactly the false success this plan's gates keep
 * refusing.
 *
 * **Identity is path + size, never path alone.** A file replaced in place — a
 * re-download, a better rip under the same name — is a different file that
 * deserves to be offered again. Size is the cheapest signal that separates the
 * two and the scan already has it, so recognising a re-download costs nothing.
 * mtime is deliberately NOT part of it: copying a file forward preserves bytes
 * and changes mtime on some tools, which would re-offer something genuinely
 * already held.
 */
import type { DropTargetId } from '../fileRouting';

export interface ImportLedgerRow {
  path: string;
  sizeBytes: number;
  target: DropTargetId;
  importedAt: number;
}

export interface ImportLedger {
  version: 1;
  rows: ImportLedgerRow[];
}

export const IMPORT_LEDGER_VERSION = 1;

/** How many rows are kept. Old rows fall off; a re-offer is a lesser harm. */
export const IMPORT_LEDGER_LIMIT = 5_000;

export function emptyImportLedger(): ImportLedger {
  return { version: IMPORT_LEDGER_VERSION, rows: [] };
}

/**
 * Windows paths are case-insensitive and mix separators, so a ledger keyed on
 * the raw string would fail to recognise `C:\DL\a.srt` as `C:/dl/a.srt`.
 */
export function ledgerKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

export function isAlreadyImported(
  ledger: ImportLedger,
  entry: { path: string; sizeBytes: number },
): boolean {
  const key = ledgerKey(entry.path);
  return ledger.rows.some((row) => ledgerKey(row.path) === key && row.sizeBytes === entry.sizeBytes);
}

/**
 * Record imports. Re-recording the same path replaces its row rather than
 * appending, so a ledger cannot grow without bound on one much-rescanned file.
 */
export function recordImports(
  ledger: ImportLedger,
  imports: readonly { path: string; sizeBytes: number; target: DropTargetId }[],
  now = Date.now(),
): ImportLedger {
  const byKey = new Map(ledger.rows.map((row) => [ledgerKey(row.path), row]));
  for (const entry of imports) {
    byKey.set(ledgerKey(entry.path), {
      path: entry.path,
      sizeBytes: entry.sizeBytes,
      target: entry.target,
      importedAt: now,
    });
  }
  const rows = [...byKey.values()]
    .sort((a, b) => b.importedAt - a.importedAt)
    .slice(0, IMPORT_LEDGER_LIMIT);
  return { version: IMPORT_LEDGER_VERSION, rows };
}

/** Forget one path — what an undo must do, or a reversed import reads as held. */
export function forgetImports(
  ledger: ImportLedger,
  paths: readonly string[],
): ImportLedger {
  const drop = new Set(paths.map(ledgerKey));
  return {
    version: IMPORT_LEDGER_VERSION,
    rows: ledger.rows.filter((row) => !drop.has(ledgerKey(row.path))),
  };
}

export function normalizeImportLedger(raw: unknown): ImportLedger {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<ImportLedger>;
  if (!Array.isArray(source.rows)) return emptyImportLedger();
  const rows: ImportLedgerRow[] = [];
  for (const candidate of source.rows) {
    if (!candidate || typeof candidate !== 'object') continue;
    const row = candidate as Partial<ImportLedgerRow>;
    if (typeof row.path !== 'string' || !row.path) continue;
    if (typeof row.sizeBytes !== 'number' || !Number.isFinite(row.sizeBytes)) continue;
    rows.push({
      path: row.path,
      sizeBytes: row.sizeBytes,
      target: (typeof row.target === 'string' ? row.target : 'unknown') as DropTargetId,
      importedAt:
        typeof row.importedAt === 'number' && Number.isFinite(row.importedAt) ? row.importedAt : 0,
    });
  }
  return { version: IMPORT_LEDGER_VERSION, rows: rows.slice(0, IMPORT_LEDGER_LIMIT) };
}
