/**
 * "The installed dictionaries changed" — one renderer-side signal for every session
 * cache that answers from them.
 *
 * Dictionary installs, removals, toggles and relabels all run as jobs on main's import
 * stream (`dictImport:changed`), and each ends in a terminal snapshot; a `committed` one
 * is the moment an answer read before it may be wrong. Caches that hold answers "for the
 * session" (per-word frequency, per-character facts) drop them here, so a dictionary
 * installed mid-session shows up without a restart.
 */
const listeners = new Set<() => void>();
let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed) return;
  const subscribe = typeof window !== 'undefined' ? window.api?.onDictImportChanged : undefined;
  if (typeof subscribe !== 'function') return;
  subscribed = true;
  subscribe((snapshot) => {
    if (snapshot?.terminal?.state !== 'committed') return;
    for (const listener of [...listeners]) listener();
  });
}

/** Run `listener` after every committed dictionary job. Returns the unsubscribe. */
export function onDictionariesChanged(listener: () => void): () => void {
  ensureSubscribed();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function resetDictionaryChangeSignalForTests(): void {
  listeners.clear();
  subscribed = false;
}
