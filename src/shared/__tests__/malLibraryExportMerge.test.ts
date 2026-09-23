// A MAL XML export lands in the same mal-library.json the OAuth sync writes,
// without blanking what only the sync knows (aliases, poster, updated_at).
import { describe, expect, it } from 'vitest';
import { emptyMalLibrary, mergeMalExportEntries, mergeMalListEntries, mergeMalDerivatives } from '../malLibrary';
import type { MalListEntry } from '../malSync';

const T_SYNC = Date.UTC(2025, 5, 1);
const EXPORT_OLD = Date.UTC(2025, 0, 1);
const EXPORT_NEW = Date.UTC(2025, 11, 1);

const synced: MalListEntry = {
  animeId: 2596,
  title: 'Shinreigari',
  altTitles: ['Ghost Hound'],
  posterUrl: 'https://cdn.myanimelist.net/images/anime/x.jpg',
  totalEpisodes: 22,
  status: 'watching',
  episodesWatched: 10,
  score: 8,
  rewatching: false,
  updatedAt: '2025-06-01T00:00:00+00:00',
};

const exported: MalListEntry = {
  animeId: 2596,
  title: 'Shinreigari',
  totalEpisodes: 0,
  status: 'completed',
  episodesWatched: 22,
  score: 9,
  rewatching: false,
};

const syncedLibrary = () => mergeMalListEntries(emptyMalLibrary(), [synced], T_SYNC).document;

describe('mergeMalExportEntries', () => {
  it('adds export rows to an empty library', () => {
    const result = mergeMalExportEntries(emptyMalLibrary(), [exported], EXPORT_NEW, EXPORT_NEW);
    expect([result.added, result.updated, result.unchanged]).toEqual([1, 0, 0]);
    expect(result.document.entries[0]).toMatchObject({ malId: 2596, media: 'anime', origin: 'list', status: 'completed', totalEpisodes: 0 });
  });

  it('a newer export updates list fields but keeps aliases, poster, updated_at and a known episode count', () => {
    const result = mergeMalExportEntries(syncedLibrary(), [exported], EXPORT_NEW + 1, EXPORT_NEW);
    expect(result.updated).toBe(1);
    expect(result.document.entries[0]).toMatchObject({
      status: 'completed',
      episodesWatched: 22,
      score: 9,
      altTitles: ['Ghost Hound'],
      posterUrl: 'https://cdn.myanimelist.net/images/anime/x.jpg',
      malUpdatedAt: '2025-06-01T00:00:00+00:00',
      totalEpisodes: 22,
      addedAt: T_SYNC,
    });
  });

  it('an export older than the synced row does not roll it back', () => {
    const result = mergeMalExportEntries(syncedLibrary(), [exported], EXPORT_NEW, EXPORT_OLD);
    expect(result.unchanged).toBe(1);
    expect(result.document.entries[0]).toMatchObject({ status: 'watching', episodesWatched: 10, score: 8 });
  });

  it('is idempotent', () => {
    const once = mergeMalExportEntries(emptyMalLibrary(), [exported], EXPORT_NEW, EXPORT_NEW).document;
    const twice = mergeMalExportEntries(once, [exported], EXPORT_NEW + 1, EXPORT_NEW);
    expect([twice.added, twice.updated, twice.unchanged]).toEqual([0, 0, 1]);
  });

  it('promotes a derivative row to a list row and keeps how it was reached', () => {
    const withDerivative = mergeMalDerivatives(emptyMalLibrary(), [{
      animeId: 2596, title: 'Shinreigari', relation: 'sequel', relationLabel: 'Sequel', fromAnimeId: 1, depth: 1,
    }], T_SYNC).document;
    const result = mergeMalExportEntries(withDerivative, [exported], EXPORT_NEW, EXPORT_NEW);
    expect(result.document.entries[0]).toMatchObject({ origin: 'list', status: 'completed', relation: 'sequel', fromMalId: 1 });
  });
});
