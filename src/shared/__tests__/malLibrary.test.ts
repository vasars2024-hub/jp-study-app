import { describe, it, expect } from 'vitest';
import {
  emptyMalLibrary,
  malLibraryKey,
  mergeMalDerivatives,
  mergeMalListEntries,
  parseMalLibraryDocument,
  summarizeMalLibrary,
  MAL_LIBRARY_SCHEMA_VERSION,
  type MalLibraryDocument,
} from '../malLibrary';
import type { MalDerivative, MalListEntry } from '../malSync';

function listEntry(over: Partial<MalListEntry> = {}): MalListEntry {
  return {
    animeId: 5081,
    title: 'Bakemonogatari',
    posterUrl: 'https://cdn.example/5081.jpg',
    totalEpisodes: 15,
    status: 'completed',
    episodesWatched: 15,
    score: 9,
    rewatching: false,
    updatedAt: '2026-01-02T03:04:05+00:00',
    ...over,
  };
}

function derivative(over: Partial<MalDerivative> = {}): MalDerivative {
  return {
    animeId: 11597,
    title: 'Nisemonogatari',
    posterUrl: 'https://cdn.example/11597.jpg',
    relation: 'sequel',
    relationLabel: 'Sequel',
    fromAnimeId: 5081,
    depth: 1,
    ...over,
  };
}

describe('mergeMalListEntries', () => {
  it('writes the fetched list into an empty library', () => {
    const result = mergeMalListEntries(emptyMalLibrary(), [listEntry(), listEntry({ animeId: 9253, title: 'Steins;Gate' })], 1000);
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.document.entries.map((entry) => entry.malId)).toEqual([5081, 9253]);
    expect(result.document.lastSyncAt).toBe(1000);
    expect(result.document.entries[0].origin).toBe('list');
  });

  it('produces no duplicates on a second identical sync — gate 11', () => {
    const first = mergeMalListEntries(emptyMalLibrary(), [listEntry()], 1000);
    const second = mergeMalListEntries(first.document, [listEntry()], 2000);
    expect(second.document.entries).toHaveLength(1);
    expect(second.added).toBe(0);
    expect(second.unchanged).toBe(1);
    expect(second.updated).toBe(0);
  });

  it('stores MALs other names, and a re-sync of them is still unchanged', () => {
    // The trap this pins: `MERGEABLE_FIELDS` was compared with `===`, and two
    // arrays with identical contents are different objects. Without the array
    // case in `sameFieldValue`, every one of the user's 1,426 rows reports as
    // *updated* on every re-sync — which is the exact count gate 11 reads.
    const withAliases = listEntry({ altTitles: ['Ghost Hound', '心霊狩り'] });
    const first = mergeMalListEntries(emptyMalLibrary(), [withAliases], 1000);
    expect(first.document.entries[0].altTitles).toEqual(['Ghost Hound', '心霊狩り']);

    const second = mergeMalListEntries(first.document, [listEntry({
      altTitles: ['Ghost Hound', '心霊狩り'],
    })], 2000);
    expect(second.unchanged).toBe(1);
    expect(second.updated).toBe(0);
  });

  it('treats a genuinely different alias list as a change', () => {
    // The positive control for the comparison above: an array check that always
    // said "same" would be just as wrong, and would silently pin the aliases at
    // whatever the first sync happened to see.
    const first = mergeMalListEntries(emptyMalLibrary(), [listEntry({ altTitles: ['Ghost Hound'] })], 1000);
    const second = mergeMalListEntries(first.document, [listEntry({
      altTitles: ['Ghost Hound', 'Shinreigari: Ghost Hound'],
    })], 2000);
    expect(second.updated).toBe(1);
    expect(second.document.entries[0].altTitles).toEqual(['Ghost Hound', 'Shinreigari: Ghost Hound']);
  });

  it('round-trips a row with no aliases to the same bytes', () => {
    // Absent, not `[]` — otherwise the first sync after this change rewrites
    // every row in a 641 KB file for no fact that changed.
    const merged = mergeMalListEntries(emptyMalLibrary(), [listEntry()], 1000);
    expect('altTitles' in merged.document.entries[0]).toBe(false);
    const reparsed = parseMalLibraryDocument(JSON.parse(JSON.stringify(merged.document)));
    expect(JSON.stringify(reparsed)).toBe(JSON.stringify(merged.document));
  });

  it('keeps addedAt from the first sync and moves syncedAt', () => {
    const first = mergeMalListEntries(emptyMalLibrary(), [listEntry()], 1000);
    const second = mergeMalListEntries(first.document, [listEntry()], 2000);
    expect(second.document.entries[0].addedAt).toBe(1000);
    expect(second.document.entries[0].syncedAt).toBe(2000);
  });

  it('reflects a change the user made on MAL — gate 12', () => {
    const first = mergeMalListEntries(emptyMalLibrary(), [listEntry({ score: 7, episodesWatched: 3, status: 'watching' })], 1000);
    const second = mergeMalListEntries(
      first.document,
      [listEntry({ score: 10, episodesWatched: 15, status: 'completed' })],
      2000,
    );
    expect(second.updated).toBe(1);
    expect(second.unchanged).toBe(0);
    expect(second.document.entries[0]).toMatchObject({ score: 10, episodesWatched: 15, status: 'completed' });
  });

  it('promotes a row that was only a derivative, keeping how it was reached', () => {
    const walked = mergeMalDerivatives(emptyMalLibrary(), [derivative()], 1000);
    expect(walked.document.entries[0].origin).toBe('derivative');

    const synced = mergeMalListEntries(
      walked.document,
      [listEntry({ animeId: 11597, title: 'Nisemonogatari', episodesWatched: 11, status: 'completed' })],
      2000,
    );
    expect(synced.document.entries).toHaveLength(1);
    expect(synced.document.entries[0]).toMatchObject({
      origin: 'list',
      episodesWatched: 11,
      relation: 'sequel',
      relationLabel: 'Sequel',
      fromMalId: 5081,
      depth: 1,
    });
    // Promotion is a real change, not a re-sighting.
    expect(synced.updated).toBe(1);
  });
});

describe('mergeMalDerivatives', () => {
  it('records the relation type and the title it came from', () => {
    const result = mergeMalDerivatives(emptyMalLibrary(), [derivative()], 1000);
    expect(result.added).toBe(1);
    expect(result.document.entries[0]).toMatchObject({
      malId: 11597,
      origin: 'derivative',
      relation: 'sequel',
      relationLabel: 'Sequel',
      fromMalId: 5081,
      depth: 1,
    });
  });

  /**
   * The negative control this module exists to pass. A derivative row carries
   * `episodesWatched: 0` and no status; merging it wholesale over a list row
   * blanks the user's real progress, and nothing about the resulting document
   * looks wrong afterwards.
   */
  it('never blanks a list row it reaches a second way', () => {
    const synced = mergeMalListEntries(
      emptyMalLibrary(),
      [listEntry({ animeId: 11597, episodesWatched: 11, score: 8, status: 'completed', rewatching: true })],
      1000,
    );
    const walked = mergeMalDerivatives(synced.document, [derivative()], 2000);

    expect(walked.document.entries).toHaveLength(1);
    expect(walked.document.entries[0]).toMatchObject({
      origin: 'list',
      episodesWatched: 11,
      score: 8,
      status: 'completed',
      rewatching: true,
      relation: 'sequel',
      fromMalId: 5081,
    });
  });
});

describe('parseMalLibraryDocument', () => {
  it('drops a row with no id or no media kind rather than the whole file', () => {
    const parsed = parseMalLibraryDocument({
      version: 1,
      lastSyncAt: 42,
      entries: [
        { malId: 5081, media: 'anime', title: 'Bakemonogatari', origin: 'list' },
        { media: 'anime', title: 'no id' },
        { malId: 7, title: 'no media' },
      ],
    });
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.lastSyncAt).toBe(42);
  });

  it('collapses a duplicated key rather than trusting the file', () => {
    const parsed = parseMalLibraryDocument({
      entries: [
        { malId: 5081, media: 'anime', title: 'first' },
        { malId: 5081, media: 'anime', title: 'second' },
      ],
    });
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].title).toBe('first');
  });

  it('keeps anime and manga with the same id apart', () => {
    const parsed = parseMalLibraryDocument({
      entries: [
        { malId: 5081, media: 'anime', title: 'anime 5081' },
        { malId: 5081, media: 'manga', title: 'manga 5081' },
      ],
    });
    expect(parsed.entries).toHaveLength(2);
    expect(malLibraryKey('anime', 5081)).not.toBe(malLibraryKey('manga', 5081));
  });

  it('round-trips a merged document through JSON unchanged', () => {
    const merged = mergeMalListEntries(emptyMalLibrary(), [listEntry()], 1000).document;
    const round = parseMalLibraryDocument(JSON.parse(JSON.stringify(merged)));
    expect(round).toEqual(merged);
    expect(round.version).toBe(MAL_LIBRARY_SCHEMA_VERSION);
  });
});

describe('summarizeMalLibrary', () => {
  it('counts by status and separates derivatives', () => {
    const document: MalLibraryDocument = mergeMalDerivatives(
      mergeMalListEntries(
        emptyMalLibrary(),
        [listEntry(), listEntry({ animeId: 9253, status: 'watching' })],
        1000,
      ).document,
      [derivative()],
      1000,
    ).document;

    expect(summarizeMalLibrary(document)).toEqual({
      total: 3,
      byStatus: { completed: 1, watching: 1 },
      derivatives: 1,
      lastSyncAt: 1000,
    });
  });
});
