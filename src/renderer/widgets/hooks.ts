import { useEffect, useState } from 'react';
import type { LibraryItem } from '../../shared/types';

/**
 * The library, shared by every widget that needs a cover or a title.
 *
 * Module-scoped rather than per-hook because a mosaic renders one `Cover` per
 * tile: four tiles in one widget would otherwise be four `listLibrary` round
 * trips, and a desktop with several reading widgets on it would multiply that
 * again on every mount. One fetch, one subscription, every caller re-rendered.
 */
let libraryItems: LibraryItem[] = [];
let libraryLoaded = false;
const librarySubscribers = new Set<(items: LibraryItem[]) => void>();
let libraryUnsubscribe: (() => void) | null = null;

function publishLibrary(value: unknown): void {
  libraryItems = Array.isArray(value) ? (value as LibraryItem[]) : [];
  libraryLoaded = true;
  for (const notify of librarySubscribers) notify(libraryItems);
}

export function useLibraryItems(): LibraryItem[] {
  const [items, setItems] = useState<LibraryItem[]>(libraryItems);
  useEffect(() => {
    librarySubscribers.add(setItems);
    if (!libraryLoaded) {
      libraryLoaded = true;
      // Guarded: a preload without the method must leave the covers empty
      // rather than take the whole widget layer down.
      void Promise.resolve(window.api?.listLibrary?.())
        .then(publishLibrary)
        .catch(() => publishLibrary([]));
      libraryUnsubscribe = window.api?.onLibraryChanged?.(publishLibrary) ?? null;
    }
    return () => {
      librarySubscribers.delete(setItems);
      if (librarySubscribers.size === 0) {
        libraryUnsubscribe?.();
        libraryUnsubscribe = null;
        libraryLoaded = false;
      }
    };
  }, []);
  return items;
}

/** Re-render on an interval, returning the current Date. Pauses when hidden. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
