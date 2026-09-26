/**
 * The learner's grammar lists: favourites and the study queue.
 *
 * These lived as private state inside the Explorer, which wrote them to
 * storage and never read them anywhere else — Favourite and "Add to study
 * queue" were buttons that led nowhere. They are shared here so the filter
 * layer (the Favourites / Queued filters), the Practice screen's "Practice
 * queue" preset and the Review tab all read the same two sets.
 *
 * The storage keys are the Explorer's original ones, so lists a learner
 * already built survive the move.
 */
import { writeLocalStorageJson } from './localStorageWrite';
import type { NormalizedGrammarPoint } from './data/grammar';
import type { WithCollections } from './data/grammar/practiceFilters';

export const FAVORITES_KEY = 'jp-grammarx-explorer-favorites-v1';
export const STUDY_QUEUE_KEY = 'jp-grammarx-explorer-study-v1';
const CHANGED_EVENT = 'grammar-collections-changed';

export interface GrammarCollections {
  favorites: Set<string>;
  queue: Set<string>;
}

function loadIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function loadCollections(): GrammarCollections {
  return { favorites: loadIds(FAVORITES_KEY), queue: loadIds(STUDY_QUEUE_KEY) };
}

export function saveCollections(next: GrammarCollections): void {
  writeLocalStorageJson(FAVORITES_KEY, [...next.favorites]);
  writeLocalStorageJson(STUDY_QUEUE_KEY, [...next.queue]);
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  } catch {
    /* non-browser context */
  }
}

/** Add or remove ids from one list; returns a new value, never mutates. */
export function withListMembership(
  current: GrammarCollections,
  list: keyof GrammarCollections,
  ids: readonly string[],
  member: boolean,
): GrammarCollections {
  const next = new Set(current[list]);
  for (const id of ids) {
    if (member) next.add(id);
    else next.delete(id);
  }
  return { ...current, [list]: next };
}

export function onCollectionsChanged(callback: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, callback);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === FAVORITES_KEY || event.key === STUDY_QUEUE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}

/** Decorate points with list membership so the shared filter can read it. */
export function applyCollections<T extends NormalizedGrammarPoint>(
  points: readonly T[],
  collections: GrammarCollections,
): Array<T & WithCollections> {
  return points.map((p) => ({
    ...p,
    favorite: collections.favorites.has(p.id),
    queued: collections.queue.has(p.id),
  }));
}
