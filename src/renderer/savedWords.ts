// A tiny local store of words the user saved from the dictionary, used by the
// Flashcards view. Persisted to localStorage (renderer-only, no main process).

export interface SavedWord {
  /** The kanji/expression form — also the unique key. */
  word: string;
  reading: string;
  meaning: string;
  addedAt: number;
}

const KEY = 'jp-saved-words';

export function loadSaved(): SavedWord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedWord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(list: SavedWord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full/unavailable — nothing we can do */
  }
  // Let other open views (Flashcards, Dictionary) react to the change.
  window.dispatchEvent(new CustomEvent('saved-words-changed'));
}

export function isSaved(word: string): boolean {
  return loadSaved().some((w) => w.word === word);
}

export function addSaved(entry: SavedWord): SavedWord[] {
  const list = loadSaved();
  if (list.some((w) => w.word === entry.word)) return list;
  const next = [entry, ...list];
  persist(next);
  return next;
}

export function removeSaved(word: string): SavedWord[] {
  const next = loadSaved().filter((w) => w.word !== word);
  persist(next);
  return next;
}

/** Subscribe to saved-list changes (from any view). Returns an unsubscribe fn. */
export function onSavedChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  window.addEventListener('saved-words-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('saved-words-changed', handler);
    window.removeEventListener('storage', handler);
  };
}
