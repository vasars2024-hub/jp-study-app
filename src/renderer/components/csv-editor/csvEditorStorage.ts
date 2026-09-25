/** Persist CSV editor state — localStorage cache + IndexedDB write-through. */

import { emptyTable, type CsvTable } from '../../../shared/csvEditor';
import type { CsvEditorSnapshot } from '../../../shared/csvEditorHistory';
import { IDB_KEYS, LS_KEYS, mirrorToIdb, readHeavy } from '../../storage/storage';
import { isOverEncoded, quarantineIfUnrepaired, unwrapOverEncoded } from '../../../shared/overEncodedJson';

const STORAGE_KEY = 'jp-study-csv-editor-v1';

export interface StoredCsvEditorState {
  table: CsvTable;
  title: string;
  hiddenColumns: number[];
  savedAt: number;
  deckId?: string;
}

/** A snapshot plus when it was written, so two copies can be ordered. */
export interface LoadedCsvEditor {
  snapshot: CsvEditorSnapshot;
  savedAt: number;
}

function toSnapshot(parsed: StoredCsvEditorState): CsvEditorSnapshot {
  return {
    table: parsed.table,
    title: parsed.title ?? 'imported-deck',
    hiddenColumns: Array.isArray(parsed.hiddenColumns) ? parsed.hiddenColumns : [],
    ...(typeof parsed.deckId === 'string' && parsed.deckId ? { deckId: parsed.deckId } : {}),
  };
}

function isStoredState(value: unknown): value is StoredCsvEditorState {
  const v = value as StoredCsvEditorState | null;
  return !!v?.table?.headers && Array.isArray(v.table.rows);
}

function stampOf(value: unknown): number {
  if (typeof value === 'string') {
    // An over-encoded cache parses to a string; its stamp is inside.
    return stampOf(unwrapOverEncoded<StoredCsvEditorState>(value).value);
  }
  const at = (value as StoredCsvEditorState | null)?.savedAt;
  return typeof at === 'number' && Number.isFinite(at) ? at : 0;
}

/**
 * The newest saved grid, from whichever of the localStorage cache and the
 * IndexedDB mirror was written last.
 *
 * `saveStoredEditor` writes both, but a grid past the ~5 MB localStorage quota
 * only reaches IndexedDB — and the cache keeps the last copy that fit. The
 * synchronous `loadStoredEditor` can only see that stale cache; this is the
 * read that settles it.
 */
export async function loadNewestStoredEditor(): Promise<LoadedCsvEditor | null> {
  let value: unknown;
  try {
    value = await readHeavy<unknown>(LS_KEYS.csvEditor, IDB_KEYS.csvEditor, stampOf);
  } catch {
    return null;
  }
  if (typeof value === 'string') value = unwrapOverEncoded<StoredCsvEditorState>(value).value;
  if (!isStoredState(value)) return null;
  return { snapshot: toSnapshot(value), savedAt: stampOf(value) };
}

/** When the localStorage copy was written (0 when there is none). */
export function storedEditorSavedAt(): number {
  try {
    return stampOf(localStorage.getItem(STORAGE_KEY) ?? '');
  } catch {
    return 0;
  }
}

export function loadStoredEditor(): CsvEditorSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // v1.0 audit 5.1 — same over-encoding as jp-flashcard-deck: one JSON layer
    // per boot from the old migration runner. Measured live at 11.75 MB, where
    // a single parse returns a string and every check below fails silently.
    const { value, layers } = unwrapOverEncoded<StoredCsvEditorState>(raw);
    const parsed = value as StoredCsvEditorState | null;
    if (!isStoredState(parsed)) {
      // Returning null here makes the panel fall back to an empty table, and its
      // first save overwrites whatever was stored. If the value was damaged
      // rather than merely absent, keep a copy first — this is exactly how the
      // audit lost a 12.3 MB draft.
      quarantineIfUnrepaired(localStorage, STORAGE_KEY, layers);
      return null;
    }
    const snapshot = toSnapshot(parsed);
    // Self-heal once. saveStoredEditor writes the canonical single-layer shape.
    if (isOverEncoded(layers)) saveStoredEditor(snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function saveStoredEditor(snapshot: CsvEditorSnapshot): void {
  const payload: StoredCsvEditorState = {
    table: snapshot.table,
    title: snapshot.title,
    hiddenColumns: snapshot.hiddenColumns,
    savedAt: Date.now(),
    ...(snapshot.deckId ? { deckId: snapshot.deckId } : {}),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full (big grids can exceed the ~5MB quota) — the
    // IndexedDB write-through below is the durable copy either way.
  }
  mirrorToIdb(IDB_KEYS.csvEditor, payload);
}

export function clearStoredEditor(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** A blank grid. `title` is the UI language's default deck name. */
export function defaultEditorSnapshot(title = 'imported-deck'): CsvEditorSnapshot {
  return {
    table: emptyTable(4, 8),
    title,
    hiddenColumns: [],
  };
}
