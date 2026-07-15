// Lightweight global undo stack for desktop + shortcut-driven actions.
// Entries are pure functions; callers register how to reverse their own work.

export type UndoKind = 'window' | 'anki' | 'generic';

export interface UndoEntry {
  id: string;
  label: string;
  kind: UndoKind;
  undo: () => void | Promise<void>;
  createdAt: number;
}

const MAX = 40;
const EVENT = 'action-history-changed';

let stack: UndoEntry[] = [];

function emit(): void {
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT, {
        detail: { size: stack.length, top: stack[stack.length - 1]?.label ?? null },
      }),
    );
  } catch {
    /* tests / early boot */
  }
}

function newId(): string {
  return `undo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Push a reversible action. Label is shown in the undo command feedback. */
export function pushUndo(label: string, undo: () => void | Promise<void>, kind: UndoKind = 'generic'): void {
  stack.push({ id: newId(), label, kind, undo, createdAt: Date.now() });
  if (stack.length > MAX) stack = stack.slice(stack.length - MAX);
  emit();
}

export function canUndo(): boolean {
  return stack.length > 0;
}

export function peekUndo(): UndoEntry | null {
  return stack[stack.length - 1] ?? null;
}

/** Pop and run the most recent undo. Returns the label, or null if empty. */
export async function performUndo(): Promise<string | null> {
  const entry = stack.pop();
  emit();
  if (!entry) return null;
  try {
    await entry.undo();
  } catch (err) {
    console.error('[undo]', entry.label, err);
  }
  return entry.label;
}

export function clearUndoStack(): void {
  stack = [];
  emit();
}

export function onActionHistoryChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
