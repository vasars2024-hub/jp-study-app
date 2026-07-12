/** Persist CSV editor state — localStorage cache + IndexedDB write-through. */

import { emptyTable, type CsvTable } from '../../../shared/csvEditor';
import type { CsvEditorSnapshot } from '../../../shared/csvEditorHistory';
import { IDB_KEYS, mirrorToIdb } from '../../storage/storage';

const STORAGE_KEY = 'jp-study-csv-editor-v1';

export interface StoredCsvEditorState {
  table: CsvTable;
  title: string;
  hiddenColumns: number[];
  savedAt: number;
}

export function loadStoredEditor(): CsvEditorSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCsvEditorState;
    if (!parsed?.table?.headers || !Array.isArray(parsed.table.rows)) return null;
    return {
      table: parsed.table,
      title: parsed.title ?? 'imported-deck',
      hiddenColumns: Array.isArray(parsed.hiddenColumns) ? parsed.hiddenColumns : [],
    };
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

export function defaultEditorSnapshot(): CsvEditorSnapshot {
  return {
    table: emptyTable(4, 8),
    title: 'imported-deck',
    hiddenColumns: [],
  };
}
