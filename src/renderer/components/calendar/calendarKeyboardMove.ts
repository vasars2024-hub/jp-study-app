import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

/** The drag payload a chip carries: which event, and which of its occurrences was picked up. */
export const CAL_DRAG_TYPE = 'application/x-gum-calendar-occurrence';

export function readDraggedOccurrence(e: Pick<ReactDragEvent, 'dataTransfer'>): { id: string; from: string } | null {
  try {
    const raw = JSON.parse(e.dataTransfer.getData(CAL_DRAG_TYPE)) as { id?: unknown; from?: unknown };
    return typeof raw.id === 'string' && typeof raw.from === 'string' ? { id: raw.id, from: raw.from } : null;
  } catch {
    return null;
  }
}

/**
 * Alt+Arrow on a focused event: the keyboard route to what dragging does (the same chord
 * every reorderable list here uses). Left/Right move a day; Up/Down a week (month grid), or
 * 15 minutes earlier/later on the same day (week grid's hour lanes).
 */
export function keyboardMoveFor(
  e: Pick<ReactKeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key'>,
  upDown: 'week' | 'minutes',
): { days: number; minutes: number } | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  switch (e.key) {
    case 'ArrowLeft': return { days: -1, minutes: 0 };
    case 'ArrowRight': return { days: 1, minutes: 0 };
    case 'ArrowUp': return upDown === 'week' ? { days: -7, minutes: 0 } : { days: 0, minutes: -15 };
    case 'ArrowDown': return upDown === 'week' ? { days: 7, minutes: 0 } : { days: 0, minutes: 15 };
    default: return null;
  }
}

export const KEYBOARD_MOVE_KEYS = 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown';
