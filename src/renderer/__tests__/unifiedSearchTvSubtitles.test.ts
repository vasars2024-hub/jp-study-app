// @vitest-environment jsdom
/**
 * Unified search reaches dramas/films and subtitle availability, and learners
 * who already had a source list get the two new sources once.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BUILT_IN_UNIFIED_SEARCH_PROVIDERS,
  createSubtitleAvailabilityExecutor,
  createTvFilmExecutor,
} from '../unifiedSearchBackends';
import { addLaterBuiltInsOnce, loadUnifiedSearchDocument, saveUnifiedSearchDocument } from '../unifiedSearchStore';
import { createUnifiedSearchRegistry } from '../unifiedSearchController';

const step = { providerId: 'tv-film' } as never;

beforeEach(() => localStorage.clear());

describe('dramas, films and subtitle availability in unified search', () => {
  it('maps TVmaze / TMDB hits to results', async () => {
    const run = createTvFilmExecutor(async () => [
      { provider: 'tmdb', id: 'tmdb:movie:1', title: 'Drive My Car', nativeTitle: 'ドライブ・マイ・カー', year: 2021, kind: 'movie', genres: ['Drama'], rating: 7.6 },
    ]);
    const [row] = await run({ query: 'drive', step } as never);
    expect(row).toMatchObject({ title: 'Drive My Car', mediaType: 'movie', year: 2021, japaneseTitle: 'ドライブ・マイ・カー', metadataQuality: 76 });
  });

  it('reports subtitle availability per language, and says when a key is missing', async () => {
    const run = createSubtitleAvailabilityExecutor(async () => [{ language: 'ja', releases: 3, sample: ['A', 'B'] }]);
    const [row] = await run({ query: 'x', step: { providerId: 'subtitle-availability' } } as never);
    expect(row).toMatchObject({ language: 'ja', availability: 'available', episodeCount: 3 });
    const none = createSubtitleAvailabilityExecutor(async () => null);
    await expect(none({ query: 'x', step: { providerId: 'subtitle-availability' } } as never)).rejects.toThrow(/key/);
  });

  it('adds the new sources to an existing list exactly once', () => {
    const own = BUILT_IN_UNIFIED_SEARCH_PROVIDERS.slice(0, 2).map((p) => ({ ...p }));
    saveUnifiedSearchDocument({ ...loadUnifiedSearchDocument(), providers: own });
    addLaterBuiltInsOnce();
    const first = loadUnifiedSearchDocument().providers.map((p) => p.id);
    expect(first).toEqual(expect.arrayContaining(['tv-film', 'subtitle-availability']));
    // Removing them afterwards sticks.
    saveUnifiedSearchDocument({ ...loadUnifiedSearchDocument(), providers: own });
    addLaterBuiltInsOnce();
    expect(loadUnifiedSearchDocument().providers.map((p) => p.id)).not.toContain('tv-film');
  });

  it('never sends a TV query to the anime catalogues', () => {
    const doc = { ...loadUnifiedSearchDocument(), providers: BUILT_IN_UNIFIED_SEARCH_PROVIDERS.map((p) => ({ ...p })) };
    const catalogue = async () => [];
    const registry = createUnifiedSearchRegistry(doc, { metadata: catalogue });
    expect(registry['catalogues']).toBe(catalogue);
    expect(registry['tv-film']).not.toBe(catalogue);
  });
});
