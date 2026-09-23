// The watch-tracking library's pure half: merge rules (idempotent re-import,
// newer wins, manual edits survive), identity matching, linking to local
// media, the query API, and the local-playback progress rule.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyLocalPlayback,
  applyWatchMetadata,
  applyWatchTitlePatch,
  buildWatchIndex,
  emptyWatchLibrary,
  findWatchTitle,
  findWatchTitleForMedia,
  linkMediaToTitles,
  malLibraryEntriesToObservations,
  mergeWatchObservations,
  normalizeLetterboxdUri,
  normalizeWatchDate,
  parseWatchLibraryDocument,
  queryWatchLibrary,
  removeWatchTitle,
  sanitizeWatchAddInput,
  sanitizeWatchQuery,
  sanitizeWatchTitlePatch,
  watchObservationFromAdd,
  watchObservationFromMedia,
  watchTitleIdFor,
  watchTitleKey,
  watchTitleNeedsLookup,
  type WatchLibraryDocument,
  type WatchLinkableMedia,
  type WatchObservation,
  type WatchTitle,
} from '../watchLibrary';
import { malExportRowsToObservations, parseMalExportXml } from '../imports/malExport';
import { letterboxdFilmsToObservations, parseLetterboxdExport, type LetterboxdFile } from '../imports/letterboxdExport';
import type { MalLibraryEntry } from '../malLibrary';

const DAY = 86_400_000;
const T0 = Date.UTC(2025, 0, 1);
const T1 = T0 + DAY;
const T2 = T0 + 2 * DAY;
const T3 = T0 + 3 * DAY;
const T4 = T0 + 4 * DAY;
const T5 = T0 + 5 * DAY;
const T6 = T0 + 6 * DAY;
const NOW = T0 + 30 * DAY;

const FIXTURES = path.resolve(__dirname, '../imports/__fixtures__');
const malRows = parseMalExportXml(fs.readFileSync(path.join(FIXTURES, 'mal/animelist_1758240000_-_9999999.xml'), 'utf-8')).anime;

function readTree(dir: string, prefix = ''): LetterboxdFile[] {
  const out: LetterboxdFile[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...readTree(path.join(dir, entry.name), rel));
    else out.push({ path: rel, text: fs.readFileSync(path.join(dir, entry.name), 'utf-8') });
  }
  return out;
}
const letterboxdFilms = parseLetterboxdExport(readTree(path.join(FIXTURES, 'letterboxd'))).films;

function obs(partial: Omit<Partial<WatchObservation>, 'identity'> & { identity?: Partial<WatchObservation['identity']> }): WatchObservation {
  return {
    source: partial.source ?? 'mal-export',
    asOf: partial.asOf,
    addedAt: partial.addedAt,
    identity: { kind: 'anime', title: 'Mushishi', malId: 457, ...partial.identity },
    fields: partial.fields ?? {},
  };
}

function merge(document: WatchLibraryDocument, observations: WatchObservation[], now = NOW) {
  return mergeWatchObservations(document, observations, now);
}

function only(document: WatchLibraryDocument): WatchTitle {
  expect(document.titles).toHaveLength(1);
  return document.titles[0];
}

function replace(document: WatchLibraryDocument, title: WatchTitle): WatchLibraryDocument {
  return { ...document, titles: document.titles.map((t) => (t.id === title.id ? title : t)) };
}

function makeTitle(partial: Partial<WatchTitle> & { id: string; title: string }): WatchTitle {
  return {
    kind: 'anime',
    status: 'plan',
    watchDates: [],
    tags: [],
    lists: [],
    sources: ['manual'],
    addedAt: T0,
    updatedAt: T0,
    ...partial,
  };
}

// ---------------------------------------------------------------------------

describe('helpers', () => {
  it('normalizes dates, keeping partial ones partial', () => {
    expect(normalizeWatchDate('2024-01-03')).toBe('2024-01-03');
    expect(normalizeWatchDate('2024-1-3')).toBe('2024-01-03');
    expect(normalizeWatchDate('2020-05-00')).toBe('2020-05');
    expect(normalizeWatchDate('2019-00-00')).toBe('2019');
    expect(normalizeWatchDate('0000-00-00')).toBeUndefined();
    expect(normalizeWatchDate('2024-13-01')).toBeUndefined();
    expect(normalizeWatchDate('2026-01-02T03:04:05+00:00')).toBe('2026-01-02');
    expect(normalizeWatchDate(20240101)).toBeUndefined();
  });

  it('normalizes Letterboxd URIs, keeping short-code case', () => {
    expect(normalizeLetterboxdUri('https://boxd.it/2a1M/')).toBe('boxd.it/2a1M');
    expect(normalizeLetterboxdUri('https://letterboxd.com/film/spirited-away/')).toBe('letterboxd.com/film/spirited-away');
    expect(normalizeLetterboxdUri('https://example.com/x')).toBeUndefined();
    expect(normalizeLetterboxdUri('')).toBeUndefined();
  });

  it('derives ids from the strongest external key, else a stable name hash', () => {
    expect(watchTitleIdFor({ kind: 'anime', title: 'X', malId: 5 })).toBe('mal:5');
    expect(watchTitleIdFor({ kind: 'film', title: 'X', tmdbId: 9 })).toBe('tmdb:movie:9');
    expect(watchTitleIdFor({ kind: 'film', title: 'X', letterboxdUri: 'https://boxd.it/2a1m' })).toBe('lb:boxd.it/2a1m');
    const a = watchTitleIdFor({ kind: 'film', title: 'Solaris', year: 1972 });
    expect(a).toMatch(/^t:film:/);
    expect(watchTitleIdFor({ kind: 'film', title: 'SOLARIS', year: 1972 })).toBe(a);
    expect(watchTitleIdFor({ kind: 'film', title: 'Solaris', year: 2002 })).not.toBe(a);
  });

  it('folds titles the same way MediaItem.seriesKey is folded', () => {
    expect(watchTitleKey('Re:Zero kara Hajimeru Isekai Seikatsu')).toBe('re zero kara hajimeru isekai seikatsu');
  });
});

// ---------------------------------------------------------------------------

describe('mergeWatchObservations — idempotent re-import', () => {
  const EXPORT_AT = 1758240000 * 1000;

  it('MAL export: first import adds every row, the second adds and changes nothing', () => {
    const observations = malExportRowsToObservations(malRows, EXPORT_AT);
    const first = merge(emptyWatchLibrary(), observations);
    expect([first.added, first.updated, first.unchanged]).toEqual([8, 0, 0]);
    expect(first.document.titles.map((t) => t.id)).toEqual(
      ['mal:5081', 'mal:1', 'mal:32281', 'mal:16498', 'mal:37999', 'mal:790', 'mal:457', 'mal:199'],
    );

    const second = merge(first.document, observations, NOW + DAY);
    expect([second.added, second.updated, second.unchanged]).toEqual([0, 0, 8]);
    expect(second.document.titles).toEqual(first.document.titles);
  });

  it('survives a JSON round trip: re-importing into the stored document is still a no-op', () => {
    const observations = malExportRowsToObservations(malRows, EXPORT_AT);
    const stored = parseWatchLibraryDocument(JSON.parse(JSON.stringify(merge(emptyWatchLibrary(), observations).document)));
    const again = merge(stored, observations, NOW + DAY);
    expect([again.added, again.updated, again.unchanged]).toEqual([0, 0, 8]);
  });

  it('Letterboxd export: 7 films added, then 7 unchanged', () => {
    const observations = letterboxdFilmsToObservations(letterboxdFilms, T0);
    const first = merge(emptyWatchLibrary(), observations);
    expect(first.added).toBe(7);
    const second = merge(first.document, observations, NOW + DAY);
    expect([second.added, second.updated, second.unchanged]).toEqual([0, 0, 7]);
  });

  it('stores the MAL export faithfully', () => {
    const doc = merge(emptyWatchLibrary(), malExportRowsToObservations(malRows, EXPORT_AT)).document;
    const film = doc.titles.find((t) => t.id === 'mal:32281');
    expect(film).toMatchObject({
      kind: 'film', anime: true, format: 'Movie', title: 'Kimi no Na wa.', status: 'completed',
      score: 8, scoreScale: 'ten', progress: 1, episodeCount: 1, startedAt: '2017-02-11', finishedAt: '2017-02-11',
      sources: ['mal-export'], addedAt: NOW,
    });
    expect(doc.titles.find((t) => t.id === 'mal:457')).toMatchObject({ status: 'rewatching', rewatchCount: 2 });
    expect(doc.titles.find((t) => t.id === 'mal:1')?.score).toBeUndefined();
  });
});

describe('mergeWatchObservations — newer data wins, manual edits survive', () => {
  const base = merge(emptyWatchLibrary(), [obs({ asOf: T1, fields: { status: 'watching', progress: 5, score: { score: 8, scale: 'ten' } } })]).document;

  it('ignores an observation older than the stored value', () => {
    const older = merge(base, [obs({ asOf: T0, fields: { status: 'plan', progress: 2 } })]);
    expect(older.unchanged).toBe(1);
    expect(only(older.document)).toMatchObject({ status: 'watching', progress: 5 });
  });

  it('applies a newer observation', () => {
    const newer = merge(base, [obs({ asOf: T2, fields: { status: 'completed', progress: 26 } })]);
    expect(newer.updated).toBe(1);
    expect(only(newer.document)).toMatchObject({ status: 'completed', progress: 26, updatedAt: NOW });
    expect(only(newer.document).fieldAt?.status).toBe(T2);
  });

  it('never erases: a field the source is silent about is kept', () => {
    const silent = merge(base, [obs({ asOf: T2, fields: { status: 'watching' } })]);
    expect(only(silent.document).score).toBe(8);
    expect(only(silent.document).progress).toBe(5);
  });

  it('keeps a manual edit against older data, yields to newer data', () => {
    const edited = applyWatchTitlePatch(only(base), { status: 'dropped' }, { now: T3, today: '2025-01-04' });
    expect(edited.manual).toContain('status');
    const doc = replace(base, edited);

    const olderImport = merge(doc, [obs({ asOf: T2, fields: { status: 'completed' } })]);
    expect(only(olderImport.document).status).toBe('dropped');
    expect(olderImport.unchanged).toBe(1);

    const sameTimeImport = merge(doc, [obs({ asOf: T3, fields: { status: 'completed' } })]);
    expect(only(sameTimeImport.document).status).toBe('dropped');

    const undatedImport = merge(doc, [obs({ asOf: undefined, fields: { status: 'completed' } })]);
    expect(only(undatedImport.document).status).toBe('dropped');

    const newerImport = merge(doc, [obs({ asOf: T4, fields: { status: 'completed' } })]);
    expect(only(newerImport.document).status).toBe('completed');
    expect(only(newerImport.document).manual ?? []).not.toContain('status');
  });

  it('keeps a manual *clearing* too', () => {
    const cleared = applyWatchTitlePatch(only(base), { score: null }, { now: T3, today: '2025-01-04' });
    expect(cleared.score).toBeUndefined();
    const doc = replace(base, cleared);
    expect(only(merge(doc, [obs({ asOf: T2, fields: { score: { score: 9, scale: 'ten' } } })]).document).score).toBeUndefined();
    expect(only(merge(doc, [obs({ asOf: T4, fields: { score: { score: 9, scale: 'ten' } } })]).document).score).toBe(9);
  });

  it('unions tags from several imports, but a manual removal survives older data', () => {
    let doc = merge(emptyWatchLibrary(), [obs({ asOf: T1, fields: { tags: ['a', 'b'] } })]).document;
    doc = merge(doc, [obs({ asOf: T2, fields: { tags: ['c', 'B'] } })]).document;
    expect(only(doc).tags).toEqual(['a', 'b', 'c']);
    doc = replace(doc, applyWatchTitlePatch(only(doc), { tags: ['a'] }, { now: T3, today: '2025-01-04' }));
    doc = merge(doc, [obs({ asOf: T2, fields: { tags: ['b'] } })]).document;
    expect(only(doc).tags).toEqual(['a']);
  });

  it('fills identity gaps from another source and merges cross-source by name + kind', () => {
    const mal = obs({
      asOf: T0,
      identity: { kind: 'film', anime: true, title: 'Perfect Blue', malId: 437, format: 'Movie' },
      fields: { kind: 'film', status: 'completed', score: { score: 8, scale: 'ten' } },
    });
    const lb = letterboxdFilmsToObservations(letterboxdFilms, T1).find((o) => o.identity.title === 'Perfect Blue') as WatchObservation;
    const result = merge(merge(emptyWatchLibrary(), [mal]).document, [lb]);
    expect(result.updated).toBe(1);
    expect(only(result.document)).toMatchObject({
      id: 'mal:437', malId: 437, letterboxdUri: 'https://boxd.it/1Qak', year: 1997,
      score: 9, stars: 4.5, scoreScale: 'stars', sources: ['mal-export', 'letterboxd'], favorite: true,
    });
  });

  it('records the other name when two sources call one work differently', () => {
    const a = obs({ asOf: T0, identity: { kind: 'anime', title: 'Shingeki no Kyojin', malId: 16498 } });
    const b = obs({ asOf: T1, source: 'mal-sync', identity: { kind: 'anime', title: 'Attack on Titan', malId: 16498 } });
    const doc = merge(merge(emptyWatchLibrary(), [a]).document, [b]).document;
    expect(only(doc)).toMatchObject({ title: 'Shingeki no Kyojin', altTitles: ['Attack on Titan'] });
  });

  it('only ever lowers addedAt', () => {
    let doc = merge(emptyWatchLibrary(), [obs({ asOf: T1, addedAt: T1 })]).document;
    doc = merge(doc, [obs({ asOf: T2, addedAt: T2 })]).document;
    expect(only(doc).addedAt).toBe(T1);
    doc = merge(doc, [obs({ asOf: T2, addedAt: T0 })]).document;
    expect(only(doc).addedAt).toBe(T0);
  });

  it('merges two rows for one work inside a single import', () => {
    const result = merge(emptyWatchLibrary(), [
      obs({ asOf: T1, fields: { status: 'watching' } }),
      obs({ asOf: T2, fields: { progress: 3 } }),
    ]);
    expect([result.added, result.updated]).toEqual([1, 1]);
    expect(only(result.document)).toMatchObject({ status: 'watching', progress: 3 });
  });

  it('reports an observation with neither name nor id as invalid', () => {
    const result = merge(emptyWatchLibrary(), [obs({ identity: { title: '  ', malId: undefined } })]);
    expect(result.outcomes).toEqual([{ outcome: 'invalid' }]);
    expect(result.document.titles).toEqual([]);
  });
});

describe('removal tombstones', () => {
  it('a removed title is not resurrected by older data, but newer data brings it back', () => {
    const doc = merge(emptyWatchLibrary(), [obs({ asOf: T1, fields: { status: 'watching' } })]).document;
    const { document: removed, removed: gone } = removeWatchTitle(doc, 'mal:457', T5);
    expect(gone?.title).toBe('Mushishi');
    expect(removed.titles).toEqual([]);
    expect(removed.removed).toEqual([{ keys: ['mal:457'], title: 'Mushishi', at: T5 }]);

    const older = merge(removed, [obs({ asOf: T4, fields: { status: 'completed' } })]);
    expect(older.skippedRemoved).toBe(1);
    expect(older.document.titles).toEqual([]);

    const newer = merge(removed, [obs({ asOf: T6, fields: { status: 'completed' } })]);
    expect(newer.added).toBe(1);
    expect(newer.document.removed).toEqual([]);
  });

  it('removing an unknown id changes nothing', () => {
    const doc = emptyWatchLibrary();
    expect(removeWatchTitle(doc, 'nope', T1)).toEqual({ document: doc, removed: undefined });
  });
});

describe('findWatchTitle — identity matching', () => {
  const titles = [
    makeTitle({ id: 'mal:19', title: 'Monster', kind: 'anime', malId: 19 }),
    makeTitle({ id: 'h48', title: 'Hamlet', kind: 'film', year: 1948 }),
    makeTitle({ id: 'h96', title: 'Hamlet', kind: 'film', year: 1996 }),
    makeTitle({ id: 's72', title: 'Solaris', kind: 'film', year: 1972 }),
    makeTitle({ id: 'lb', title: 'Paprika', kind: 'film', letterboxdUri: 'https://boxd.it/1Ls4' }),
  ];
  const index = buildWatchIndex(titles);

  it('matches on an external id whatever the name', () => {
    expect(findWatchTitle(index, { kind: 'anime', title: 'Naoki Urasawa no Monster', malId: 19 })?.id).toBe('mal:19');
  });

  it('refuses a name match whose ids contradict', () => {
    expect(findWatchTitle(index, { kind: 'anime', title: 'Monster', malId: 20 })).toBeUndefined();
  });

  it('never matches a film to a series', () => {
    expect(findWatchTitle(index, { kind: 'film', title: 'Monster', year: 2003 })).toBeUndefined();
  });

  it('uses the year to split same-named works, and refuses to guess without one', () => {
    expect(findWatchTitle(index, { kind: 'film', title: 'Hamlet', year: 1996 })?.id).toBe('h96');
    expect(findWatchTitle(index, { kind: 'film', title: 'Hamlet' })).toBeUndefined();
    expect(findWatchTitle(index, { kind: 'film', title: 'Solaris', year: 2002 })).toBeUndefined();
    expect(findWatchTitle(index, { kind: 'film', title: 'Solaris' })?.id).toBe('s72');
  });

  it('treats two boxd.it codes as different films but a boxd.it and a slug URL as possibly the same', () => {
    expect(findWatchTitle(index, { kind: 'film', title: 'Paprika', letterboxdUri: 'https://boxd.it/9999' })).toBeUndefined();
    expect(findWatchTitle(index, { kind: 'film', title: 'Paprika', letterboxdUri: 'https://letterboxd.com/film/paprika/' })?.id).toBe('lb');
  });
});

describe('parseWatchLibraryDocument', () => {
  it('reads back what was written', () => {
    const doc = merge(emptyWatchLibrary(), letterboxdFilmsToObservations(letterboxdFilms, T0)).document;
    expect(parseWatchLibraryDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('drops malformed rows and clamps bad values instead of throwing', () => {
    const doc = parseWatchLibraryDocument({
      version: 1,
      titles: [
        { id: 'x' },
        { title: 'no id' },
        {
          id: 'a', title: 'A', kind: 'bogus', status: 'bogus', score: 42, stars: 9, tags: ['a', 'A', ''],
          watchDates: [{ date: '2020-00-00' }, { date: 'nope' }], manual: ['status', 'bogus'], sources: ['letterboxd', 'x'],
          fieldAt: { status: 5, bogus: 1 }, watchedEpisodes: ['s1e2', 'junk'],
        },
        { id: 'a', title: 'duplicate' },
      ],
      removed: [{ keys: ['mal:1'], at: 5, title: 'T' }, { keys: [], at: 1 }],
      imports: [{ at: 1, source: 'letterboxd', fileName: 'f.zip', added: 2 }, { at: 'x', source: 'letterboxd' }],
      malLibraryLastSyncAt: 77,
    });
    expect(doc.titles).toEqual([{
      id: 'a', kind: 'other', title: 'A', status: 'plan', score: 10, stars: 5, tags: ['a'],
      watchDates: [{ date: '2020', source: 'manual' }], lists: [], sources: ['letterboxd'],
      manual: ['status'], fieldAt: { status: 5 }, watchedEpisodes: ['s1e2'], addedAt: 0, updatedAt: 0,
    }]);
    expect(doc.removed).toEqual([{ keys: ['mal:1'], at: 5, title: 'T' }]);
    expect(doc.imports).toEqual([{ at: 1, source: 'letterboxd', fileName: 'f.zip', exportedAt: undefined, added: 2, updated: 0, unchanged: 0 }]);
    expect(doc.malLibraryLastSyncAt).toBe(77);
  });

  it('answers an empty library for garbage', () => {
    expect(parseWatchLibraryDocument(null)).toEqual(emptyWatchLibrary());
    expect(parseWatchLibraryDocument('nope')).toEqual(emptyWatchLibrary());
  });
});

describe('malLibraryEntriesToObservations — the OAuth sync store', () => {
  const entry = (partial: Partial<MalLibraryEntry>): MalLibraryEntry => ({
    malId: 1, media: 'anime', title: 'T', episodesWatched: 0, score: 0, rewatching: false,
    origin: 'list', addedAt: T0, syncedAt: T1, ...partial,
  });

  it('keeps list rows, skips derivatives, manga and status-less rows', () => {
    const out = malLibraryEntriesToObservations([
      entry({ malId: 1, status: 'completed', score: 9, episodesWatched: 12, totalEpisodes: 12, malUpdatedAt: '2025-01-03T00:00:00+00:00', altTitles: ['Alias'], posterUrl: 'https://cdn.myanimelist.net/x.jpg' }),
      entry({ malId: 2, origin: 'derivative', relation: 'sequel' }),
      entry({ malId: 3, media: 'manga', status: 'completed' }),
      entry({ malId: 4 }),
      entry({ malId: 5, status: 'plan_to_watch', totalEpisodes: 0 }),
      entry({ malId: 6, status: 'completed', rewatching: true }),
    ]);
    expect(out.map((o) => o.identity.malId)).toEqual([1, 5, 6]);
    expect(out[0]).toEqual({
      source: 'mal-sync',
      asOf: Date.UTC(2025, 0, 3),
      addedAt: T0,
      identity: { kind: 'anime', anime: true, title: 'T', altTitles: ['Alias'], malId: 1, posterUrl: 'https://cdn.myanimelist.net/x.jpg' },
      fields: { status: 'completed', progress: 12, episodeCount: 12, score: { score: 9, scale: 'ten' } },
    });
    expect(out[1].fields).toMatchObject({ status: 'plan', episodeCount: undefined, score: undefined });
    expect(out[1].asOf).toBe(T1);
    expect(out[2].fields.status).toBe('rewatching');
  });
});

// ---------------------------------------------------------------------------

describe('linking local media to titles', () => {
  const titles = [
    makeTitle({ id: 'A', title: 'Re:Zero kara Hajimeru Isekai Seikatsu', malId: 31240, episodeCount: 25 }),
    makeTitle({ id: 'B', title: 'Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season', malId: 39587 }),
    makeTitle({ id: 'C', title: 'Spirited Away', kind: 'film', year: 2001, altTitles: ['Sen to Chihiro no Kamikakushi'] }),
    makeTitle({ id: 'D', title: 'Breaking Bad', kind: 'tv', tvmazeId: 169, pinnedMediaItemIds: ['i10'] }),
    makeTitle({ id: 'E', title: 'Mushishi', malId: 457 }),
    makeTitle({ id: 'F', title: 'Arrival', kind: 'film', year: 2016, tmdbId: 329865 }),
  ];
  const reZero = { seriesKey: 're zero kara hajimeru isekai seikatsu', seriesTitle: 'Re Zero kara Hajimeru Isekai Seikatsu', category: 'anime' };
  const items: WatchLinkableMedia[] = [
    { id: 'i1', ...reZero, season: 1, episode: 3 },
    { id: 'i2', ...reZero, season: 2, episode: 5 },
    { id: 'i3', ...reZero, season: 3, episode: 1 },
    { id: 'i4', category: 'movie', seriesTitle: 'Spirited Away', seriesKey: 'spirited away', year: 2001, episodeKind: 'movie' },
    { id: 'i5', category: 'movie', title: 'Spirited Away', year: 2010 },
    { id: 'i6', category: 'tv', seriesTitle: 'Totally Different Name', tvmazeId: '169' },
    { id: 'i7', category: 'music', seriesTitle: 'Mushishi' },
    { id: 'i8', kind: 'audio', category: 'anime', seriesTitle: 'Mushishi' },
    { id: 'i9', category: 'anime', malId: 457, seriesTitle: 'Mushi-shi' },
    { id: 'i10', category: 'inbox', title: 'random clip' },
    { id: 'i11', category: 'inbox', title: 'some file', tmdbId: 329865 },
    { id: 'i12', category: 'anime', nativeTitle: 'Sen to Chihiro no Kamikakushi', seriesTitle: 'Sen to Chihiro', episodeKind: 'movie' },
  ];
  const links = linkMediaToTitles(titles, items);
  const linked = (id: string) => (links.get(id) ?? []).map((l) => `${l.item.id}:${l.via}`);

  it('links by id first, whatever the file name says', () => {
    expect(linked('D')).toContain('i6:id');
    expect(linked('E')).toEqual(['i9:id']);
  });

  it('links an unknown-category file by TMDB id as a movie too', () => {
    expect(linked('F')).toEqual(['i11:id']);
  });

  it('honours the file\'s own tmdbType over its category (movie and TV ids collide)', () => {
    const index = buildWatchIndex(titles);
    expect(findWatchTitleForMedia(index, { id: 'x', category: 'tv', tmdbId: 329865, tmdbType: 'movie' })?.title.id).toBe('F');
    expect(findWatchTitleForMedia(index, { id: 'y', category: 'tv', tmdbId: 329865 })).toBeUndefined();
  });

  it('links by folded series name, and files a later season under its own season entry', () => {
    expect(linked('A')).toEqual(['i1:title', 'i3:title-base']);
    expect(linked('B')).toEqual(['i2:title-season']);
  });

  it('links a film by name + year and refuses a year that disagrees', () => {
    expect(linked('C')).toEqual(['i4:title', 'i12:title']);
    expect([...links.values()].flat().some((l) => l.item.id === 'i5')).toBe(false);
  });

  it('never links music or audio, and a pinned link wins over everything', () => {
    const all = [...links.values()].flat().map((l) => l.item.id);
    expect(all).not.toContain('i7');
    expect(all).not.toContain('i8');
    expect(linked('D')).toContain('i10:pinned');
  });

  it('findWatchTitleForMedia answers the same as the bulk linker', () => {
    expect(findWatchTitleForMedia(buildWatchIndex(titles), items[1])).toMatchObject({ title: { id: 'B' }, via: 'title-season' });
    expect(findWatchTitleForMedia(buildWatchIndex(titles), items[6])).toBeUndefined();
  });

  it('builds a local-source observation from a file the library does not know', () => {
    const o = watchObservationFromMedia({ id: 'n', category: 'anime', seriesTitle: 'Frieren', malId: 52991, episodeCount: 28 }, T1);
    expect(o).toEqual({
      source: 'local', asOf: T1, addedAt: T1,
      identity: { kind: 'anime', anime: true, title: 'Frieren', originalTitle: undefined, year: undefined, malId: 52991, anilistId: undefined, tmdbId: undefined, tvmazeId: undefined, imdbId: undefined },
      fields: { episodeCount: 28 },
    });
    expect(watchObservationFromMedia({ id: 'n', category: 'podcast', title: 'x' }, T1)).toBeUndefined();
    expect(watchObservationFromMedia({ id: 'n', category: 'inbox', title: 'x' }, T1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('queryWatchLibrary', () => {
  const titles: WatchTitle[] = [
    makeTitle({ id: 'sa', title: 'Spirited Away', kind: 'film', anime: true, year: 2001, status: 'completed', score: 10, stars: 5, scoreScale: 'stars', sources: ['letterboxd'], addedAt: T1, finishedAt: '2024-06-01', favorite: true, liked: true, lists: ['Ghibli ranked'], tags: ['ghibli'], altTitles: ['Sen to Chihiro no Kamikakushi'], genres: ['Fantasy'], progress: 1 }),
    makeTitle({ id: 'bb', title: 'Breaking Bad', kind: 'tv', year: 2008, status: 'watching', score: 9, sources: ['manual'], addedAt: T3, progress: 31, episodeCount: 62 }),
    makeTitle({ id: 'cb', title: 'Cowboy Bebop', kind: 'anime', anime: true, year: 1998, status: 'watching', sources: ['mal-export'], addedAt: T2, progress: 12, episodeCount: 26, tags: ['space'] }),
    makeTitle({ id: 'pl', title: 'Past Lives', kind: 'film', year: 2023, status: 'plan', sources: ['letterboxd'], addedAt: T0 }),
    makeTitle({ id: 'mu', title: 'Mushishi', kind: 'anime', anime: true, status: 'completed', score: 10, sources: ['mal-export', 'mal-sync'], addedAt: T4, finishedAt: '2015-06-20', progress: 26, episodeCount: 26 }),
  ];
  const media: WatchLinkableMedia[] = [
    { id: 'm1', category: 'anime', seriesTitle: 'Cowboy Bebop', seriesKey: 'cowboy bebop', season: 1, episode: 1, durationSec: 1440, lastPlayedAt: T5, genres: ['Drama', 'Sci-Fi'] },
    { id: 'm2', category: 'anime', seriesTitle: 'Cowboy Bebop', seriesKey: 'cowboy bebop', season: 1, episode: 2, durationSec: 1440 },
    { id: 'm3', category: 'movie', seriesTitle: 'Spirited Away', seriesKey: 'spirited away', year: 2001, durationSec: 7500, genres: ['drama'], posterPath: 'artwork/poster-sa.jpg' },
  ];
  const ids = (query: Parameters<typeof queryWatchLibrary>[2]) => queryWatchLibrary(titles, media, query).items.map((v) => v.id);

  it('defaults to every title sorted by title', () => {
    expect(ids({})).toEqual(['bb', 'cb', 'mu', 'pl', 'sa']);
  });

  it('filters by kind, status, source, anime', () => {
    expect(ids({ kinds: ['film'] })).toEqual(['pl', 'sa']);
    expect(ids({ statuses: ['watching', 'plan'] })).toEqual(['bb', 'cb', 'pl']);
    expect(ids({ sources: ['mal-sync', 'manual'] })).toEqual(['bb', 'mu']);
    expect(ids({ anime: true })).toEqual(['cb', 'mu', 'sa']);
    expect(ids({ anime: false })).toEqual(['bb', 'pl']);
  });

  it('filters by genre through linked media, case-insensitively', () => {
    expect(ids({ genres: ['DRAMA'] })).toEqual(['cb', 'sa']);
    expect(ids({ genres: ['fantasy'] })).toEqual(['sa']);
  });

  it('filters by year and score ranges, excluding titles without a value', () => {
    expect(ids({ yearMin: 2000, yearMax: 2010 })).toEqual(['bb', 'sa']);
    expect(ids({ scoreMin: 9.5 })).toEqual(['mu', 'sa']);
    expect(ids({ scoreMax: 9 })).toEqual(['bb']);
  });

  it('filters by on-disk, favourite, liked, lists, tags, search and ids', () => {
    expect(ids({ onDisk: true })).toEqual(['cb', 'sa']);
    expect(ids({ onDisk: false })).toEqual(['bb', 'mu', 'pl']);
    expect(ids({ favorite: true })).toEqual(['sa']);
    expect(ids({ liked: false })).toEqual(['bb', 'cb', 'mu', 'pl']);
    expect(ids({ lists: ['ghibli RANKED'] })).toEqual(['sa']);
    expect(ids({ tags: ['space'] })).toEqual(['cb']);
    expect(ids({ search: 'bebop' })).toEqual(['cb']);
    expect(ids({ search: 'Chihiro' })).toEqual(['sa']);
    expect(ids({ ids: ['pl', 'mu', 'zz'] })).toEqual(['mu', 'pl']);
  });

  it('sorts by every key, missing values last in both directions', () => {
    expect(ids({ sort: 'score', direction: 'desc' })).toEqual(['mu', 'sa', 'bb', 'cb', 'pl']);
    expect(ids({ sort: 'score', direction: 'asc' })).toEqual(['bb', 'mu', 'sa', 'cb', 'pl']);
    expect(ids({ sort: 'year', direction: 'desc' })).toEqual(['pl', 'bb', 'sa', 'cb', 'mu']);
    expect(ids({ sort: 'added', direction: 'desc' })).toEqual(['mu', 'bb', 'cb', 'sa', 'pl']);
    expect(ids({ sort: 'lastWatched', direction: 'desc' })).toEqual(['cb', 'sa', 'mu', 'bb', 'pl']);
    expect(ids({ sort: 'finished', direction: 'desc' })).toEqual(['sa', 'mu', 'bb', 'cb', 'pl']);
    expect(ids({ sort: 'progress', direction: 'desc' })).toEqual(['mu', 'sa', 'bb', 'cb', 'pl']);
    expect(ids({ sort: 'runtime', direction: 'desc' })).toEqual(['cb', 'sa', 'bb', 'mu', 'pl']);
    expect(ids({ sort: 'title', direction: 'desc' })).toEqual(['sa', 'pl', 'mu', 'cb', 'bb']);
  });

  it('derives view fields from linked files', () => {
    const [cb] = queryWatchLibrary(titles, media, { ids: ['cb'] }).items;
    expect(cb).toMatchObject({
      mediaItemIds: ['m1', 'm2'], onDisk: true, episodesOnDisk: 2, allGenres: ['Drama', 'Sci-Fi'],
      runtime: 624, lastWatched: T5, progressRatio: 12 / 26,
    });
    const [sa] = queryWatchLibrary(titles, media, { ids: ['sa'] }).items;
    expect(sa).toMatchObject({ runtime: 125, poster: 'artwork/poster-sa.jpg', allGenres: ['Fantasy', 'drama'], progressRatio: 1 });
    expect(sa.lastWatched).toBe(Date.UTC(2024, 5, 1));
  });

  it('pages with offset and limit and reports the total before paging', () => {
    const page = queryWatchLibrary(titles, media, { offset: 1, limit: 2 });
    expect(page.total).toBe(5);
    expect(page.offset).toBe(1);
    expect(page.items.map((v) => v.id)).toEqual(['cb', 'mu']);
  });

  it('counts facets over the whole library, not the filtered set', () => {
    const { facets } = queryWatchLibrary(titles, media, { kinds: ['film'] });
    expect(facets).toMatchObject({
      total: 5,
      byKind: { film: 2, tv: 1, anime: 2 },
      byStatus: { completed: 2, watching: 2, plan: 1 },
      bySource: { letterboxd: 2, manual: 1, 'mal-export': 2, 'mal-sync': 1 },
      onDisk: 2,
      years: { min: 1998, max: 2023 },
    });
    expect(facets.genres).toEqual([{ name: 'Drama', count: 2 }, { name: 'Fantasy', count: 1 }, { name: 'Sci-Fi', count: 1 }]);
    expect(facets.lists).toEqual([{ name: 'Ghibli ranked', count: 1 }]);
  });

  it('sanitizes a query from the renderer', () => {
    expect(sanitizeWatchQuery({
      kinds: ['film', 'nope'], statuses: 'watching', sort: 'bogus', direction: 'up', limit: -3,
      offset: 2, scoreMin: '5', search: '  bebop ', genres: ['', 'Drama'], anime: 'yes',
    })).toEqual({ kinds: ['film'], offset: 2, search: 'bebop', genres: ['Drama'] });
    expect(sanitizeWatchQuery(null)).toEqual({});
  });
});

// ---------------------------------------------------------------------------

describe('applyLocalPlayback — the progress rule', () => {
  const at = T5 + 20 * 3600_000;
  const today = '2025-01-06';
  const play = (episode?: number, extra: Partial<Parameters<typeof applyLocalPlayback>[1]> = {}) => ({
    positionSec: 1350, durationSec: 1440, episode, season: 1, at, today, ...extra,
  });

  it('does nothing below 90%', () => {
    const title = makeTitle({ id: 'x', title: 'X', episodeCount: 12 });
    const out = applyLocalPlayback(title, play(1, { positionSec: 1200 }));
    expect(out).toMatchObject({ changed: false, counted: false, reason: 'below-threshold' });
    expect(out.title).toBe(title);
  });

  it('a film played to the end completes', () => {
    const film = makeTitle({ id: 'f', title: 'Arrival', kind: 'film' });
    const out = applyLocalPlayback(film, play(undefined, { positionSec: 6400, durationSec: 7000, episodeKind: 'movie' }));
    expect(out).toMatchObject({ changed: true, counted: true, statusFrom: 'plan', statusTo: 'completed' });
    expect(out.title).toMatchObject({
      status: 'completed', progress: 1, startedAt: today, finishedAt: today, lastWatchedAt: at,
      watchDates: [{ date: today, source: 'local' }], sources: ['local', 'manual'], updatedAt: at,
    });
    expect(out.title.fieldAt?.status).toBe(at);
  });

  it('a completed film watched again is a rewatch, counted once per day', () => {
    const film = makeTitle({ id: 'f', title: 'Spirited Away', kind: 'film', status: 'completed', watchDates: [{ date: '2023-01-04', source: 'letterboxd' }] });
    const first = applyLocalPlayback(film, play(undefined, { episodeKind: 'movie' }));
    expect(first.title.watchDates).toEqual([
      { date: '2023-01-04', source: 'letterboxd' },
      { date: today, rewatch: true, source: 'local' },
    ]);
    expect(first.title.rewatchCount).toBe(1);
    const again = applyLocalPlayback(first.title, play(undefined, { episodeKind: 'movie', at: at + 60_000 }));
    expect(again).toMatchObject({ changed: false, reason: 'already-counted' });
  });

  it('an episode advances progress and moves plan to watching', () => {
    const show = makeTitle({ id: 'mal:1', title: 'Cowboy Bebop', malId: 1, episodeCount: 26 });
    const out = applyLocalPlayback(show, play(3));
    expect(out.title).toMatchObject({ status: 'watching', progress: 3, startedAt: today, watchedEpisodes: ['s1e3'] });
    expect(out.statusTo).toBe('watching');
  });

  it('the last episode completes the title', () => {
    const show = makeTitle({ id: 'mal:1', title: 'Cowboy Bebop', malId: 1, episodeCount: 26, status: 'watching', progress: 25, startedAt: '2024-01-03' });
    const out = applyLocalPlayback(show, play(26));
    expect(out.title).toMatchObject({ status: 'completed', progress: 26, startedAt: '2024-01-03', finishedAt: today });
    expect(out.title.watchDates).toEqual([{ date: today, source: 'local' }]);
  });

  it('never lowers progress', () => {
    const show = makeTitle({ id: 'mal:1', title: 'Cowboy Bebop', malId: 1, episodeCount: 26, status: 'watching', progress: 8 });
    const out = applyLocalPlayback(show, play(3));
    expect(out.title.progress).toBe(8);
    expect(out.reason).toBe('already-counted');
  });

  it('refuses to count a later-season file matched only by the base title of a per-season entry', () => {
    const show = makeTitle({ id: 'mal:31240', title: 'Re:Zero', malId: 31240, episodeCount: 25 });
    const out = applyLocalPlayback(show, play(5, { season: 3, via: 'title-base' }));
    expect(out).toMatchObject({ changed: false, counted: true, reason: 'season-ambiguous' });
  });

  it('counts distinct episodes across seasons for a whole-show TV title', () => {
    const show = makeTitle({ id: 'bb', title: 'Breaking Bad', kind: 'tv', episodeCount: 62 });
    const one = applyLocalPlayback(show, play(1, { season: 1 })).title;
    const two = applyLocalPlayback(one, play(1, { season: 2, at: at + 3600_000 })).title;
    const repeat = applyLocalPlayback(two, play(1, { season: 2, at: at + 7200_000 }));
    expect(two).toMatchObject({ progress: 2, watchedEpisodes: ['s1e1', 's2e1'] });
    expect(repeat.title.progress).toBe(2);
  });

  it('finishing a rewatch completes again and counts it', () => {
    const show = makeTitle({ id: 'mal:457', title: 'Mushishi', malId: 457, episodeCount: 26, status: 'rewatching', progress: 26, rewatchCount: 2 });
    const mid = applyLocalPlayback(show, play(10));
    expect(mid.title).toMatchObject({ status: 'rewatching', progress: 26 });
    const end = applyLocalPlayback(show, play(26));
    expect(end.title).toMatchObject({ status: 'completed', rewatchCount: 3, watchDates: [{ date: today, rewatch: true, source: 'local' }] });
  });

  it('outranks a manual status set before the play', () => {
    const edited = applyWatchTitlePatch(
      makeTitle({ id: 'mal:790', title: 'Ergo Proxy', malId: 790, episodeCount: 23, status: 'watching', progress: 4 }),
      { status: 'dropped' },
      { now: T3, today: '2025-01-04' },
    );
    const out = applyLocalPlayback(edited, play(5));
    expect(out.title.status).toBe('watching');
    expect(out.title.manual ?? []).not.toContain('status');
  });

  it('without an episode number only moves the status', () => {
    const show = makeTitle({ id: 's', title: 'Some Show', kind: 'tv', status: 'on_hold' });
    const out = applyLocalPlayback(show, play(undefined));
    expect(out.title).toMatchObject({ status: 'watching', startedAt: today });
    expect(out.title.progress).toBeUndefined();
    expect(out.reason).toBe('no-episode');
  });

  it('does not count specials or OVAs as episodes', () => {
    const show = makeTitle({ id: 'mal:1', title: 'Cowboy Bebop', malId: 1, episodeCount: 26 });
    expect(applyLocalPlayback(show, play(1, { episodeKind: 'special' }))).toMatchObject({ changed: false, reason: 'not-an-episode' });
  });

  it('re-stamps lastWatchedAt on a repeat only after 30 minutes', () => {
    const show = makeTitle({ id: 'mal:1', title: 'Cowboy Bebop', malId: 1, episodeCount: 26, status: 'completed', progress: 26, watchedEpisodes: ['s1e3'], lastWatchedAt: at });
    expect(applyLocalPlayback(show, play(3, { at: at + 60_000 })).changed).toBe(false);
    const later = applyLocalPlayback(show, play(3, { at: at + 31 * 60_000 }));
    expect(later.changed).toBe(true);
    expect(later.title.lastWatchedAt).toBe(at + 31 * 60_000);
    expect(later.title.status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------

describe('applyWatchTitlePatch — manual edits', () => {
  const ctx = { now: T3, today: '2025-01-04' };
  const show = makeTitle({ id: 'mal:1', title: 'Cowboy Bebop', malId: 1, episodeCount: 26, status: 'watching', progress: 4, sources: ['mal-export'] });

  it('completing fills progress and the finish date, and marks the fields manual', () => {
    const out = applyWatchTitlePatch(show, { status: 'completed' }, ctx);
    expect(out).toMatchObject({ status: 'completed', progress: 26, finishedAt: '2025-01-04', updatedAt: T3, sources: ['mal-export', 'manual'] });
    expect(out.manual).toEqual(['status', 'progress', 'finishedAt']);
    expect(out.fieldAt).toEqual({ status: T3, progress: T3, finishedAt: T3 });
  });

  it('starting fills the start date; progress to the end completes; progress from plan starts', () => {
    const plan = { ...show, status: 'plan' as const, progress: 0 };
    expect(applyWatchTitlePatch(plan, { status: 'watching' }, ctx).startedAt).toBe('2025-01-04');
    expect(applyWatchTitlePatch(show, { progress: 26 }, ctx)).toMatchObject({ status: 'completed', finishedAt: '2025-01-04' });
    expect(applyWatchTitlePatch(plan, { progress: 1 }, ctx)).toMatchObject({ status: 'watching', startedAt: '2025-01-04' });
    expect(applyWatchTitlePatch(show, { status: 'completed', finishedAt: '2024-12-31' }, ctx).finishedAt).toBe('2024-12-31');
  });

  it('stars set a 0–10 score on the star scale; a plain score clears the stars', () => {
    const starred = applyWatchTitlePatch(show, { stars: 3.5 }, ctx);
    expect(starred).toMatchObject({ score: 7, stars: 3.5, scoreScale: 'stars' });
    const scored = applyWatchTitlePatch(starred, { score: 8 }, ctx);
    expect(scored).toMatchObject({ score: 8, scoreScale: 'ten' });
    expect(scored.stars).toBeUndefined();
    expect(applyWatchTitlePatch(scored, { score: 12.34 }, ctx).score).toBe(10);
  });

  it('edits notes, flags, lists, dates, viewings and pinned files', () => {
    const out = applyWatchTitlePatch(show, {
      notes: 'rewatch with subs', favorite: true, liked: true, lists: ['Space', 'space', 'Noir'], startedAt: '2024-01-03',
      addWatchDate: { date: '2025-01-02', rewatch: true }, pinnedMediaItemIds: ['m1'], kind: 'tv', title: 'Cowboy Bebop (TV)',
    }, ctx);
    expect(out).toMatchObject({
      notes: 'rewatch with subs', favorite: true, liked: true, lists: ['Space', 'Noir'], startedAt: '2024-01-03',
      watchDates: [{ date: '2025-01-02', rewatch: true, source: 'manual' }], pinnedMediaItemIds: ['m1'], kind: 'tv', title: 'Cowboy Bebop (TV)',
    });
    expect(applyWatchTitlePatch(out, { favorite: false, notes: null }, ctx)).not.toHaveProperty('favorite');
  });

  it('sanitizes a patch from the renderer, dropping junk rather than coercing it', () => {
    expect(sanitizeWatchTitlePatch({
      status: 'nope', score: '7', tags: 'x', notes: 5, startedAt: '2020-13-01', kind: 'movie', title: '  ', favorite: 'yes', id: 'hack',
    })).toEqual({});
    expect(sanitizeWatchTitlePatch({ startedAt: '2020-05-00', finishedAt: null, score: null, progress: 3, tags: ['a', 'a', ''] }))
      .toEqual({ startedAt: '2020-05', finishedAt: null, score: null, progress: 3, tags: ['a'] });
    expect(sanitizeWatchTitlePatch({ addWatchDate: { date: '2025-01-01', stars: 4.3 } }))
      .toEqual({ addWatchDate: { date: '2025-01-01', rewatch: undefined, stars: 4.5 } });
  });
});

describe('manual add and metadata', () => {
  it('a manual add goes through the matcher, so adding an imported title twice does not duplicate it', () => {
    const doc = merge(emptyWatchLibrary(), malExportRowsToObservations(malRows, T0)).document;
    const input = sanitizeWatchAddInput({ kind: 'anime', title: 'Cowboy Bebop', malId: '1', status: 'watching', bogus: 1 });
    expect(input).toEqual({ kind: 'anime', title: 'Cowboy Bebop', malId: 1, status: 'watching' });
    const again = merge(doc, [watchObservationFromAdd({ ...input, kind: 'anime', title: 'Cowboy Bebop' }, T1)], T1);
    expect(again.added).toBe(0);
    const fresh = merge(doc, [watchObservationFromAdd({ kind: 'tv', title: 'Severance', year: 2022 }, T1)], T1);
    expect(fresh.added).toBe(1);
    expect(fresh.document.titles.at(-1)).toMatchObject({ kind: 'tv', title: 'Severance', year: 2022, status: 'plan', sources: ['manual'] });
  });

  it('metadata fills ids and descriptive fields but never overwrites an id or a manual kind', () => {
    const title = applyWatchTitlePatch(
      makeTitle({ id: 'lb', title: 'Chernobyl', kind: 'film', year: 2019, malId: 5, letterboxdUri: 'https://boxd.it/aa' }),
      { kind: 'tv' },
      { now: T1, today: '2025-01-02' },
    );
    expect(watchTitleNeedsLookup(title)).toBe(false);
    const out = applyWatchMetadata(title, {
      kind: 'film', malId: 99, tmdbId: 87108, tmdbType: 'tv', imdbId: 'https://www.imdb.com/title/tt7366338/',
      genres: ['Drama', 'drama', 'History'], runtimeMinutes: 330.4, posterPath: 'artwork/poster-x.jpg', episodeCount: 5,
    }, T2);
    expect(out).toMatchObject({
      kind: 'tv', malId: 5, tmdbId: 87108, tmdbType: 'tv', imdbId: 'tt7366338', genres: ['Drama', 'History'],
      runtimeMinutes: 330, posterPath: 'artwork/poster-x.jpg', episodeCount: 5, updatedAt: T2,
    });
    expect(watchTitleNeedsLookup(makeTitle({ id: 'z', title: 'Z', letterboxdUri: 'https://boxd.it/zz' }))).toBe(true);
  });
});
