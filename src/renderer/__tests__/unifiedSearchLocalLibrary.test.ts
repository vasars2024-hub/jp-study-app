// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DeckFlashcard } from '../flashcardDeck';
import {
  OFFLINE_LOCAL_LIBRARY_CAPABILITIES,
  OfflineLocalLibraryLoadError,
  createDeckLibraryExecutor,
  createOfflineLocalLibraryExecutor,
  deckToLocalLibraryEntries,
  mediaLibraryToLocalLibraryEntries,
  readerLibraryToLocalLibraryEntries,
} from '../unifiedSearchLocalLibrary';

function card(overrides: Partial<DeckFlashcard>): DeckFlashcard {
  return {
    id: 'card-1',
    word: '魔法',
    reading: 'まほう',
    meaning: 'magic',
    source: 'reader',
    addedAt: 1,
    ...overrides,
  };
}

describe('deck-backed local-library search', () => {
  it('groups cards into stable book entries with searchable deck content', () => {
    const entries = deckToLocalLibraryEntries([
      card({ id: '2', bookId: 'b', bookTitle: 'Zoo', word: '猫' }),
      card({ id: '1', bookId: 'a', bookTitle: 'Alpha', word: '魔法' }),
      card({ id: '3', bookId: 'a', bookTitle: 'Alpha', word: '魔法', meaning: 'sorcery' }),
    ]);

    expect(entries.map((entry) => entry.title)).toEqual(['Alpha', 'Zoo']);
    expect(entries[0]).toMatchObject({ id: 'deck:a::Alpha', mediaType: 'novel' });
    expect(entries[0].keywords).toEqual(['魔法', 'まほう', 'magic', 'sorcery']);
  });

  it('reads the current deck on every execution and keeps results under the planned provider', async () => {
    let cards = [card({ bookId: 'a', bookTitle: 'First Book' })];
    const executor = createDeckLibraryExecutor(() => cards);
    const request = (query: string) => executor({
      query,
      step: { providerId: 'owned-library', providerName: 'Owned library', providerKind: 'local-library', priority: 0, groupIds: [] },
      signal: new AbortController().signal,
    });

    expect(await request('magic')).toMatchObject([{
      providerId: 'owned-library',
      providerResultId: 'deck:a::First Book',
      title: 'First Book',
      availability: 'available',
    }]);

    cards = [card({ bookId: 'b', bookTitle: 'Second Book', word: '剣', reading: 'けん', meaning: 'sword' })];
    expect(await request('sword')).toMatchObject([{
      providerId: 'owned-library',
      providerResultId: 'deck:b::Second Book',
      title: 'Second Book',
    }]);
    expect(await request('magic')).toEqual([]);
  });
});

describe('richer offline local-library sources', () => {
  it('declares narrow offline-only capabilities without probing any source', () => {
    expect(OFFLINE_LOCAL_LIBRARY_CAPABILITIES.map((capability) => capability.id)).toEqual([
      'reader-library', 'media-library', 'flashcard-deck',
    ]);
    expect(OFFLINE_LOCAL_LIBRARY_CAPABILITIES.every((capability) => capability.offline)).toBe(true);
  });

  it('projects reader and media stores with stable source-prefixed IDs', () => {
    expect(readerLibraryToLocalLibraryEntries([
      { id: 'm1', title: 'Manga', kind: 'manga', createdAt: 1, progress: { percent: 1 } },
      { id: 'b1', title: 'Book', kind: 'book', createdAt: 2, folder: 'Novels' },
    ])).toMatchObject([
      { id: 'reader:b1', title: 'Book', mediaType: 'novel', trackingStatus: 'untracked' },
      { id: 'reader:m1', title: 'Manga', mediaType: 'manga', trackingStatus: 'completed' },
    ]);
    expect(mediaLibraryToLocalLibraryEntries([
      { id: 'v1', title: 'Local Anime', fileName: 'anime.mkv', path: 'D:/anime.mkv', addedAt: 1, lang: 'ja' },
    ])).toMatchObject([
      { id: 'media:v1', title: 'Local Anime', language: 'ja', keywords: ['anime.mkv', 'D:/anime.mkv'] },
    ]);
  });

  it('searches all existing local stores through one deterministic provider partition', async () => {
    const executor = createOfflineLocalLibraryExecutor({
      loadDeck: () => [card({ bookId: 'd1', bookTitle: 'Deck Source', meaning: 'shared term' })],
      listReaderLibrary: async () => [{ id: 'r1', title: 'Reader Source', kind: 'book', createdAt: 1, folder: 'shared term' }],
      listMediaLibrary: async () => [{ id: 'm1', title: 'Media Source', fileName: 'shared term.mkv', path: 'D:/shared term.mkv', addedAt: 1 }],
    });
    const request = {
      query: 'shared term',
      step: { providerId: 'owned-library', providerName: 'Owned library', providerKind: 'local-library' as const, priority: 0, groupIds: [] },
      signal: new AbortController().signal,
    };

    const first = await executor(request);
    const second = await executor(request);
    expect(first.map((result) => result.providerResultId)).toEqual([
      'reader:r1', 'media:m1', 'deck:d1::Deck Source',
    ]);
    expect(first).toEqual(second);
    expect(first.every((result) => result.providerId === 'owned-library')).toBe(true);
  });

  it('reports availability counts in fixed source order without changing result order', async () => {
    const diagnostics: unknown[] = [];
    const executor = createOfflineLocalLibraryExecutor({
      loadDeck: () => [card({ bookId: 'd1', bookTitle: 'Deck Source' })],
      listReaderLibrary: async () => [{ id: 'r1', title: 'Reader Source', kind: 'book', createdAt: 1 }],
      listMediaLibrary: async () => [],
    }, { onDiagnostics: (value) => diagnostics.push(value) });

    await executor({
      query: 'source',
      step: { providerId: 'local', providerName: 'Local', providerKind: 'local-library', priority: 0, groupIds: [] },
      signal: new AbortController().signal,
    });
    expect(diagnostics).toEqual([[
      { sourceId: 'reader-library', status: 'available', itemCount: 1, error: null },
      { sourceId: 'media-library', status: 'available', itemCount: 0, error: null },
      { sourceId: 'flashcard-deck', status: 'available', itemCount: 1, error: null },
    ]]);
  });

  it('exposes every source-specific loading failure and returns no partial partition', async () => {
    let observed: readonly { sourceId: string; status: string }[] = [];
    const executor = createOfflineLocalLibraryExecutor({
      loadDeck: () => { throw new Error('deck database is corrupt'); },
      listReaderLibrary: async () => [{ id: 'r1', title: 'Still readable', kind: 'book', createdAt: 1 }],
      listMediaLibrary: async () => { throw new Error('media index is locked'); },
    }, { onDiagnostics: (value) => { observed = value; } });

    const execution = executor({
      query: 'readable',
      step: { providerId: 'local', providerName: 'Local', providerKind: 'local-library', priority: 0, groupIds: [] },
      signal: new AbortController().signal,
    });
    await expect(execution).rejects.toBeInstanceOf(OfflineLocalLibraryLoadError);
    await expect(execution).rejects.toThrow('media-library: media index is locked; flashcard-deck: deck database is corrupt');
    expect(observed).toMatchObject([
      { sourceId: 'reader-library', status: 'available', itemCount: 1 },
      { sourceId: 'media-library', status: 'unavailable', error: 'media index is locked' },
      { sourceId: 'flashcard-deck', status: 'unavailable', error: 'deck database is corrupt' },
    ]);
  });
});
