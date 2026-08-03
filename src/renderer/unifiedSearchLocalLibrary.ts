// Renderer adapter that feeds the local flashcard deck into the offline-first
// local-library Unified Search connector (MASTER_PLAN §6). Everything here is
// pure and node-testable: it imports only the `DeckFlashcard` type and the shared
// executor. The live `loadDeck` binding is injected by the caller (the hook), so
// this module never pulls the deck store's import chain into a test.

import type { LibraryItem, MediaItem } from '../shared/types';
import type { DeckFlashcard } from './flashcardDeck';
import {
  createLocalLibraryExecutor,
  type LocalLibraryEntry,
} from '../shared/unifiedSearchLocalLibrary';
import type { UnifiedSearchProviderExecutor } from '../shared/unifiedSearchExecution';

/** Keywords carried per book so searching a mined word finds its source. */
const KEYWORDS_PER_BOOK = 400;

function pushKeyword(seen: Set<string>, out: string[], value: string | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(trimmed);
}

/**
 * Groups deck cards by their source book into one searchable library entry each.
 * A book's mined words, readings, and meanings become the entry's keywords, so a
 * query for any card surfaces the book it came from. Entries are ordered by book
 * title for a stable, deterministic snapshot.
 */
export function deckToLocalLibraryEntries(cards: readonly DeckFlashcard[]): LocalLibraryEntry[] {
  const groups = new Map<string, { bookTitle: string; cards: DeckFlashcard[] }>();
  for (const card of cards) {
    const bookId = card.bookId || 'unknown';
    const bookTitle = card.bookTitle || 'Unknown source';
    const key = `${bookId}::${bookTitle}`;
    const existing = groups.get(key);
    if (existing) existing.cards.push(card);
    else groups.set(key, { bookTitle, cards: [card] });
  }

  return [...groups.entries()]
    .sort(([, left], [, right]) => left.bookTitle.localeCompare(right.bookTitle))
    .map(([key, group]) => {
      const seen = new Set<string>();
      const keywords: string[] = [];
      for (const card of group.cards) {
        pushKeyword(seen, keywords, card.word);
        pushKeyword(seen, keywords, card.reading);
        pushKeyword(seen, keywords, card.meaning);
        if (keywords.length >= KEYWORDS_PER_BOOK) break;
      }
      return {
        id: `deck:${key}`,
        title: group.bookTitle,
        mediaType: 'novel',
        keywords,
      } satisfies LocalLibraryEntry;
    });
}

/** Projects the existing reader library without reading book files or cover data. */
export function readerLibraryToLocalLibraryEntries(items: readonly LibraryItem[]): LocalLibraryEntry[] {
  return items
    .map((item) => ({
      id: `reader:${item.id}`,
      title: item.title,
      language: item.inboxMeta?.lang ?? item.levelMeta?.lang ?? null,
      mediaType: item.kind === 'manga' ? 'manga' as const : 'novel' as const,
      trackingStatus: item.progress?.percent === 1 ? 'completed' as const
        : item.progress ? 'watching' as const : 'untracked' as const,
      keywords: [item.folder, item.sourcePath].filter((value): value is string => Boolean(value)),
    }))
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

/** Projects the existing on-disk media index; no files are opened or played. */
export function mediaLibraryToLocalLibraryEntries(items: readonly MediaItem[]): LocalLibraryEntry[] {
  return items
    .map((item) => ({
      id: `media:${item.id}`,
      title: item.title || item.fileName,
      language: item.lang ?? null,
      mediaType: 'other' as const,
      trackingStatus: item.lastPlayedAt ? 'watching' as const : 'untracked' as const,
      keywords: [item.fileName, item.path],
    }))
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

export interface OfflineLocalLibraryLoaders {
  loadDeck: () => readonly DeckFlashcard[];
  listReaderLibrary: () => Promise<readonly LibraryItem[]>;
  listMediaLibrary: () => Promise<readonly MediaItem[]>;
}

export type OfflineLocalLibrarySourceId = 'reader-library' | 'media-library' | 'flashcard-deck';

export interface OfflineLocalLibrarySourceCapability {
  id: OfflineLocalLibrarySourceId;
  label: string;
  offline: true;
  searchableFields: readonly string[];
}

export interface OfflineLocalLibrarySourceDiagnostic {
  sourceId: OfflineLocalLibrarySourceId;
  status: 'available' | 'unavailable';
  itemCount: number | null;
  error: string | null;
}

/** Static capability declaration; it performs no probes and cannot trigger I/O. */
export const OFFLINE_LOCAL_LIBRARY_CAPABILITIES: readonly OfflineLocalLibrarySourceCapability[] = Object.freeze([
  Object.freeze({ id: 'reader-library', label: 'Reader library', offline: true, searchableFields: Object.freeze(['title', 'folder', 'sourcePath']) }),
  Object.freeze({ id: 'media-library', label: 'Media library', offline: true, searchableFields: Object.freeze(['title', 'fileName', 'path']) }),
  Object.freeze({ id: 'flashcard-deck', label: 'Flashcard deck', offline: true, searchableFields: Object.freeze(['bookTitle', 'word', 'reading', 'meaning']) }),
]);

export interface OfflineLocalLibraryExecutorOptions {
  onDiagnostics?: (diagnostics: readonly OfflineLocalLibrarySourceDiagnostic[]) => void;
}

function sourceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 300);
  return 'Source could not be loaded.';
}

/** Provider-level failure retaining the source diagnostics for non-UI consumers. */
export class OfflineLocalLibraryLoadError extends Error {
  readonly diagnostics: readonly OfflineLocalLibrarySourceDiagnostic[];

  constructor(diagnostics: readonly OfflineLocalLibrarySourceDiagnostic[]) {
    const failures = diagnostics.filter((item) => item.status === 'unavailable');
    super(`Offline local library unavailable: ${failures.map((item) => `${item.sourceId}: ${item.error}`).join('; ')}`);
    this.name = 'OfflineLocalLibraryLoadError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

/**
 * One offline provider boundary over the app's already-present local stores.
 * Source snapshots are concatenated in a fixed order and retain source-prefixed
 * IDs; no result merging or identity resolution occurs here.
 */
export function createOfflineLocalLibraryExecutor(
  loaders: OfflineLocalLibraryLoaders,
  options: OfflineLocalLibraryExecutorOptions = {},
): UnifiedSearchProviderExecutor {
  return createLocalLibraryExecutor({
    getEntries: async () => {
      const [readerResult, mediaResult, deckResult] = await Promise.allSettled([
        loaders.listReaderLibrary(),
        loaders.listMediaLibrary(),
        Promise.resolve().then(() => loaders.loadDeck()),
      ]);
      const settled = [readerResult, mediaResult, deckResult] as const;
      const sourceIds: readonly OfflineLocalLibrarySourceId[] = ['reader-library', 'media-library', 'flashcard-deck'];
      const diagnostics = Object.freeze(settled.map((result, index): OfflineLocalLibrarySourceDiagnostic =>
        result.status === 'fulfilled'
          ? Object.freeze({ sourceId: sourceIds[index], status: 'available', itemCount: result.value.length, error: null })
          : Object.freeze({ sourceId: sourceIds[index], status: 'unavailable', itemCount: null, error: sourceErrorMessage(result.reason) })));
      try { options.onDiagnostics?.(diagnostics); } catch { /* diagnostics observers cannot alter search */ }
      if (diagnostics.some((item) => item.status === 'unavailable')) {
        throw new OfflineLocalLibraryLoadError(diagnostics);
      }
      const readerItems = readerResult.status === 'fulfilled' ? readerResult.value : [];
      const mediaItems = mediaResult.status === 'fulfilled' ? mediaResult.value : [];
      const deckCards = deckResult.status === 'fulfilled' ? deckResult.value : [];
      return [
        ...readerLibraryToLocalLibraryEntries(readerItems),
        ...mediaLibraryToLocalLibraryEntries(mediaItems),
        ...deckToLocalLibraryEntries(deckCards),
      ];
    },
  });
}

/**
 * Builds the deck-backed local-library executor. `loadCards` is read lazily on
 * each search (the hook passes the live `loadDeck`) so newly mined cards are
 * searchable without rebuilding the session.
 */
export function createDeckLibraryExecutor(
  loadCards: () => readonly DeckFlashcard[],
): UnifiedSearchProviderExecutor {
  return createLocalLibraryExecutor({ getEntries: () => deckToLocalLibraryEntries(loadCards()) });
}
