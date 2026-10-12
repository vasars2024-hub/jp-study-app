/**
 * This window's unsaved work, for "Restart to update" (main/unsavedWork.ts).
 *
 * A component that holds something a restart would lose — a note or card being
 * edited, a review part-way through — calls `useUnsavedWork(kind, active)`. The
 * window keeps one list and sends the WHOLE list to main whenever it changes
 * (batched to one message per tick), so main always has this window's truth and
 * forgets it when the window closes. Works the same in the main window, Blanc,
 * the companion overlay and every pop-out: they all share the preload bridge.
 */
import { useEffect } from 'react';
import type { AppUpdateUnsavedKind } from '../shared/appUpdate';

const held = new Map<number, AppUpdateUnsavedKind>();
let seq = 0;
let scheduled = false;

function send(): void {
  scheduled = false;
  try {
    window.api?.reportUnsavedWork?.([...held.values()]);
  } catch {
    /* no bridge (a test page): nothing to report to */
  }
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(send);
}

/** Hold `kind` until the returned release is called (twice is harmless). */
export function holdWindowUnsavedWork(kind: AppUpdateUnsavedKind): () => void {
  const id = ++seq;
  held.set(id, kind);
  schedule();
  return () => {
    if (held.delete(id)) schedule();
  };
}

/** While `active`, this component's `kind` is listed when a restart is asked for. */
export function useUnsavedWork(kind: AppUpdateUnsavedKind, active: boolean): void {
  useEffect(() => (active ? holdWindowUnsavedWork(kind) : undefined), [kind, active]);
}

/** What this window holds now (tests). */
export function heldUnsavedWork(): AppUpdateUnsavedKind[] {
  return [...held.values()];
}
