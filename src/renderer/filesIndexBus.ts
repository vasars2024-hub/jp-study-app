/**
 * Gate 11 — "a file dragged in from Explorer … appears in the tree **without a
 * manual refresh**."
 *
 * The Files index is built by walking real directories and a SQLite table in
 * main, so `useFilesIndex` deliberately fetches it once and never per keystroke.
 * That is the right default and it is also exactly why an import performed
 * somewhere else in the app is invisible until the user presses Refresh — the
 * window showing the file system does not know the file system changed.
 *
 * **Why an event and not a poll.** A timer would rebuild an index nobody is
 * looking at, on a walk that touches ~5 GB of `downloads`; the plan's
 * performance constraint is explicit that heavy work must not run on the
 * window's own thread for no reason. The importer knows precisely when
 * something landed, so it says so.
 *
 * **Why a renderer module and not `shared/`.** This is a DOM event on one
 * window. `sectionSurface.ts` is the same shape and the same reasoning: a bus
 * with one name, so a second dispatcher cannot invent a slightly different one.
 *
 * The event is fired AFTER the import resolves, never optimistically — a tree
 * that added a row and then had to take it away would be worse than one that
 * was briefly stale.
 */

export const FILES_INDEX_CHANGED_EVENT = 'filesapp:index-changed';

/**
 * Announce that something the Files index enumerates has changed on disk.
 *
 * Callers do not need to know whether a Files window is open; if none is, the
 * event lands in nothing, which costs nothing.
 */
export function announceFilesIndexChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FILES_INDEX_CHANGED_EVENT));
}

/** Subscribe. Returns the unsubscribe, for a `useEffect` cleanup. */
export function onFilesIndexChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(FILES_INDEX_CHANGED_EVENT, handler);
  return () => window.removeEventListener(FILES_INDEX_CHANGED_EVENT, handler);
}
