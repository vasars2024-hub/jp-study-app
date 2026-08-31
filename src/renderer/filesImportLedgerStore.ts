/**
 * Gate 29's persistence. The model is `shared/filesApp/importLedger.ts`; this
 * is the one place it is read from and written to.
 *
 * localStorage rather than main, for the same reason the collections and view
 * state stores are: the review sheet is renderer-owned, and a main round trip
 * would put an IPC call between a scan finishing and its report rendering. A
 * ledger that fails to persist is a re-offer, never a duplicate — the importers
 * dedupe on their own — so this store fails soft on purpose.
 */
import {
  emptyImportLedger,
  forgetImports,
  normalizeImportLedger,
  recordImports,
  type ImportLedger,
} from '../shared/filesApp/importLedger';
import type { DropTargetId } from '../shared/fileRouting';

const KEY = 'jp-filesapp-import-ledger-v1';

/**
 * Survives a storage failure the same way `filesViewStateStore` does: the last
 * value stays usable for this session, so a quota error degrades to "forgotten
 * on restart" rather than to "gate 29 stops working now".
 */
let memory: ImportLedger | null = null;

export function loadImportLedger(): ImportLedger {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeImportLedger(JSON.parse(raw) as unknown);
  } catch {
    /* unreadable or unparsable — fall through to whatever this session holds */
  }
  return memory ?? emptyImportLedger();
}

function persist(next: ImportLedger): ImportLedger {
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* see `memory` above */
  }
  return next;
}

export function recordImportedFiles(
  imports: readonly { path: string; sizeBytes: number; target: DropTargetId }[],
): ImportLedger {
  if (!imports.length) return loadImportLedger();
  return persist(recordImports(loadImportLedger(), imports));
}

/** An undo must forget, or a reversed import reads as already held. */
export function forgetImportedFiles(paths: readonly string[]): ImportLedger {
  if (!paths.length) return loadImportLedger();
  return persist(forgetImports(loadImportLedger(), paths));
}

/** Test seam and a user-facing reset: forget every recorded import. */
export function clearImportLedger(): ImportLedger {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return emptyImportLedger();
}
