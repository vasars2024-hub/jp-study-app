/** Undo/redo history for CSV editor documents. */

import type { CsvTable } from './csvEditor';

export interface CsvEditorSnapshot {
  table: CsvTable;
  title: string;
  hiddenColumns: number[];
  /**
   * The flashcard deck group this grid imports into. Set when a file is
   * loaded and kept through title edits, so renaming the deck updates the same
   * cards instead of starting a second deck. Absent on grids saved before it
   * existed; the panel derives it from the title then.
   */
  deckId?: string;
}

export interface CsvEditorHistory {
  past: CsvEditorSnapshot[];
  present: CsvEditorSnapshot;
  future: CsvEditorSnapshot[];
}

const MAX_HISTORY = 80;

// Snapshots are treated as immutable: every editing operation in
// csvEditor.ts / csvEditorTransforms.ts returns fresh objects and never
// mutates rows in place. History therefore stores snapshots BY REFERENCE.
// The previous implementation deep-cloned the whole table twice per edit,
// which made every keystroke O(rows × cols) and destroyed the structural
// sharing that lets memoized grid rows skip re-rendering.
function cloneSnapshot(snap: CsvEditorSnapshot): CsvEditorSnapshot {
  return {
    title: snap.title,
    hiddenColumns: [...snap.hiddenColumns],
    ...(snap.deckId ? { deckId: snap.deckId } : {}),
    table: {
      ...snap.table,
      headers: [...snap.table.headers],
      rows: snap.table.rows.map((r) => [...r]),
    },
  };
}

export function createHistory(present: CsvEditorSnapshot): CsvEditorHistory {
  // One defensive clone at creation, so a snapshot loaded from storage can
  // never be aliased by the caller. After this point immutability holds.
  return { past: [], present: cloneSnapshot(present), future: [] };
}

export function pushHistory(history: CsvEditorHistory, next: CsvEditorSnapshot): CsvEditorHistory {
  const past = [...history.past, history.present];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, present: next, future: [] };
}

export function undoHistory(history: CsvEditorHistory): CsvEditorHistory | null {
  if (!history.past.length) return null;
  const previous = history.past[history.past.length - 1];
  const past = history.past.slice(0, -1);
  const future = [history.present, ...history.future];
  return { past, present: previous, future };
}

export function redoHistory(history: CsvEditorHistory): CsvEditorHistory | null {
  if (!history.future.length) return null;
  const [next, ...future] = history.future;
  const past = [...history.past, history.present];
  return { past, present: next, future };
}

export function canUndo(history: CsvEditorHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: CsvEditorHistory): boolean {
  return history.future.length > 0;
}
