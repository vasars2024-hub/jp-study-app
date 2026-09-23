// MyAnimeList XML export parser, on a realistic fixture
// (`imports/__fixtures__/mal/animelist_1758240000_-_9999999.xml`, invented user).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  looksLikeMalExport,
  malExportRowsToListEntries,
  malExportRowsToObservations,
  malExportTimestampFromFileName,
  malStatusFromExport,
  parseMalExportXml,
  watchKindForMalType,
} from '../imports/malExport';

const FIXTURES = path.resolve(__dirname, '../imports/__fixtures__/mal');
const ANIME_FILE = 'animelist_1758240000_-_9999999.xml';
const MANGA_FILE = 'mangalist_1758240000_-_9999999.xml';
const animeXml = fs.readFileSync(path.join(FIXTURES, ANIME_FILE), 'utf-8');
const mangaXml = fs.readFileSync(path.join(FIXTURES, MANGA_FILE), 'utf-8');

describe('parseMalExportXml — anime list', () => {
  const parsed = parseMalExportXml(animeXml);
  const byId = new Map(parsed.anime.map((row) => [row.malId, row]));

  it('reads the envelope: list type, user, declared total', () => {
    expect(parsed.listType).toBe('anime');
    expect(parsed.user).toEqual({ id: 9999999, name: 'sample_user' });
    expect(parsed.declaredTotal).toBe(9);
  });

  it('keeps every row with an id and counts the one without', () => {
    expect(parsed.anime.map((row) => row.malId)).toEqual([5081, 1, 32281, 16498, 37999, 790, 457, 199]);
    expect(parsed.invalid).toBe(1);
    expect(parsed.manga).toEqual([]);
  });

  it('reads a full row: CDATA title, counts, score, tags, rewatches', () => {
    expect(byId.get(5081)).toEqual({
      malId: 5081,
      title: 'Bakemonogatari',
      type: 'TV',
      totalEpisodes: 15,
      watchedEpisodes: 15,
      startDate: undefined,
      finishDate: '2020-05',
      score: 9,
      status: 'completed',
      rawStatus: 'Completed',
      timesWatched: 1,
      rewatching: false,
      tags: ['monogatari', 'shaft'],
      comments: undefined,
    });
  });

  it('turns 0000-00-00 into absent and 00 day/month into a partial date', () => {
    expect(byId.get(1)?.startDate).toBe('2024-01-03');
    expect(byId.get(1)?.finishDate).toBeUndefined();
    expect(byId.get(37999)?.startDate).toBe('2021-07');
    expect(byId.get(790)?.startDate).toBe('2019');
  });

  it('does not end a row at a </anime> that sits inside CDATA', () => {
    const kaguya = byId.get(37999);
    expect(kaguya?.title).toBe('Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen');
    expect(kaguya?.comments).toBe('Paused at ep 4 <b>on purpose</b> & will resume. Not the end: </anime> is text here.');
    expect(kaguya?.status).toBe('on_hold');
    expect(kaguya?.tags).toEqual(['romcom']);
  });

  it('decodes entities in plain (non-CDATA) text', () => {
    expect(byId.get(790)?.title).toBe('Ergo Proxy');
    expect(byId.get(790)?.comments).toBe('Too slow & too grey — maybe later');
    expect(byId.get(790)?.status).toBe('dropped');
  });

  it('maps the old numeric series_type and my_status codes', () => {
    expect(byId.get(199)?.type).toBe('Movie');
    expect(byId.get(199)?.status).toBe('completed');
    expect(byId.get(199)?.rewatching).toBe(false);
  });

  it('reads my_rewatching as a flag in both spellings', () => {
    expect(byId.get(457)?.rewatching).toBe(true);
    expect(byId.get(457)?.timesWatched).toBe(2);
    expect(byId.get(5081)?.rewatching).toBe(false);
  });

  it('is unaffected by a UTF-8 BOM', () => {
    expect(parseMalExportXml(`\uFEFF${animeXml}`)).toEqual(parsed);
  });

  it('decodes named, decimal and hex entities, and self-closing tags', () => {
    const xml = `<myanimelist><anime><series_animedb_id>42</series_animedb_id>
      <series_title>Tom &amp; Jerry&#39;s &#x2605; &quot;Show&quot; &lt;3</series_title>
      <series_type/><series_episodes>0</series_episodes><my_watched_episodes>3</my_watched_episodes>
      <my_status>Watching</my_status><my_score>0</my_score><my_tags/></anime></myanimelist>`;
    const [row] = parseMalExportXml(xml).anime;
    expect(row.title).toBe('Tom & Jerry\'s ★ "Show" <3');
    expect(row.type).toBeUndefined();
    expect(row.totalEpisodes).toBe(0);
    expect(row.tags).toEqual([]);
  });

  it('ignores comments, including ones that mention <anime>', () => {
    const xml = '<myanimelist><!-- <anime><series_animedb_id>9</series_animedb_id></anime> --></myanimelist>';
    expect(parseMalExportXml(xml).anime).toEqual([]);
  });
});

describe('parseMalExportXml — manga list', () => {
  it('parses manga rows and reports the list type, with no anime rows', () => {
    const parsed = parseMalExportXml(mangaXml);
    expect(parsed.listType).toBe('manga');
    expect(parsed.anime).toEqual([]);
    expect(parsed.manga).toHaveLength(2);
    expect(parsed.manga[0]).toMatchObject({ malId: 2, title: 'Berserk', readChapters: 95, readVolumes: 12, rawStatus: 'Reading', score: 9 });
    expect(parsed.declaredTotal).toBe(2);
  });
});

describe('export helpers', () => {
  it('sniffs the envelope and rejects other XML', () => {
    expect(looksLikeMalExport(animeXml)).toBe(true);
    expect(looksLikeMalExport(`\uFEFF${mangaXml}`)).toBe(true);
    expect(looksLikeMalExport('<?xml version="1.0"?><rss><channel/></rss>')).toBe(false);
    expect(looksLikeMalExport('Date,Name,Year')).toBe(false);
  });

  it('reads the export time from MAL\'s file name', () => {
    expect(malExportTimestampFromFileName(ANIME_FILE)).toBe(1758240000 * 1000);
    expect(malExportTimestampFromFileName(`${MANGA_FILE}.gz`)).toBe(1758240000 * 1000);
    expect(malExportTimestampFromFileName('my-list.xml')).toBeUndefined();
  });

  it('maps statuses case-insensitively and knows nothing else', () => {
    expect(malStatusFromExport('Plan to Watch')).toBe('plan_to_watch');
    expect(malStatusFromExport('on-hold')).toBe('on_hold');
    expect(malStatusFromExport('6')).toBe('plan_to_watch');
    expect(malStatusFromExport('Reading')).toBeUndefined();
  });

  it('files a MAL Movie as a film and everything else as anime', () => {
    expect(watchKindForMalType('Movie')).toBe('film');
    expect(watchKindForMalType('OVA')).toBe('anime');
    expect(watchKindForMalType(undefined)).toBe('anime');
  });
});

describe('malExportRowsToObservations', () => {
  const rows = parseMalExportXml(animeXml).anime;
  const asOf = 1758240000 * 1000;
  const obs = new Map(malExportRowsToObservations(rows, asOf).map((o) => [o.identity.malId, o]));

  it('stamps every observation with the export time and the mal-export source', () => {
    for (const o of obs.values()) {
      expect(o.source).toBe('mal-export');
      expect(o.asOf).toBe(asOf);
      expect(o.identity.anime).toBe(true);
    }
  });

  it('asserts kind film for a MAL Movie, still marked anime', () => {
    const film = obs.get(32281);
    expect(film?.identity).toMatchObject({ kind: 'film', anime: true, format: 'Movie', title: 'Kimi no Na wa.' });
    expect(film?.fields).toMatchObject({ kind: 'film', status: 'completed', progress: 1, episodeCount: 1, finishedAt: '2017-02-11' });
  });

  it('maps status, score (0 = unrated), progress, rewatching', () => {
    expect(obs.get(5081)?.fields).toMatchObject({
      status: 'completed', score: { score: 9, scale: 'ten' }, progress: 15, episodeCount: 15,
      rewatchCount: 1, tags: ['monogatari', 'shaft'], finishedAt: '2020-05',
    });
    expect(obs.get(1)?.fields.score).toBeUndefined();
    expect(obs.get(1)?.fields.status).toBe('watching');
    expect(obs.get(16498)?.fields.status).toBe('plan');
    expect(obs.get(457)?.fields.status).toBe('rewatching');
    expect(obs.get(790)?.fields.notes).toBe('Too slow & too grey — maybe later');
  });

  it('keeps a row with an unknown status as a plan-to-watch title', () => {
    const [o] = malExportRowsToObservations([{ ...rows[0], status: undefined, rawStatus: 'Weird' }]);
    expect(o.fields.status).toBe('plan');
  });
});

describe('malExportRowsToListEntries', () => {
  it('produces MalListEntry rows for mal-library.json with MAL semantics intact', () => {
    const entries = malExportRowsToListEntries(parseMalExportXml(animeXml).anime);
    expect(entries).toHaveLength(8);
    expect(entries.find((e) => e.animeId === 16498)).toEqual({
      animeId: 16498, title: 'Shingeki no Kyojin', totalEpisodes: 25, status: 'plan_to_watch',
      episodesWatched: 0, score: 0, rewatching: false,
    });
    expect(entries.find((e) => e.animeId === 457)?.rewatching).toBe(true);
  });
});
