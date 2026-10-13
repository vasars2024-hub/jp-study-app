/**
 * "Show this note" across a lazy boundary.
 *
 * A Notebook row, a Files row or a link can ask for a note before the Notes
 * surface that will show it has loaded (Blanc's Quick Notes panel is a lazy
 * chunk; the Notes dialog is imported on first use). The request is parked
 * here and announced; a mounted manager takes it from the event, a mounting
 * one from `takeNoteFocus`.
 */
export const NOTE_FOCUS_EVENT = 'notes:focus';

let pending: string | null = null;

export function requestNoteFocus(id: string): void {
  pending = id;
  try {
    window.dispatchEvent(new CustomEvent(NOTE_FOCUS_EVENT, { detail: id }));
  } catch {
    /* no window */
  }
}

/** The parked request, cleared. */
export function takeNoteFocus(): string | null {
  const id = pending;
  pending = null;
  return id;
}
