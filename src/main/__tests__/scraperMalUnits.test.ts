// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd(), getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

// Same shape as `scraperCatalogue.test.ts`: the client hard-codes its two public
// endpoints, so the test answers them at the HTTP layer instead of pretending to
// be a different host.
const routes = vi.hoisted(() => ({
  jikanDetailStatus: 200,
  jikanDetailBody: '',
  jikanEpisodePages: [] as string[],
  anilistStatus: 200,
  anilistBody: '',
  hits: [] as string[],
}));

vi.mock('../scraper/http', async () => {
  const actual = await vi.importActual<typeof import('../scraper/http')>('../scraper/http');
  return {
    ...actual,
    scraperRequest: async (url: string) => {
      routes.hits.push(url);
      const answer = (status: number, body: string) => ({
        status,
        statusText: 'OK',
        headers: {},
        body,
        bytes: body.length,
        truncated: false,
        finalUrl: url,
        timingMs: { dns: 0, connect: 0, tls: 0, ttfb: 1, total: 1 },
      });
      if (url.startsWith('https://graphql.anilist.co')) {
        return answer(routes.anilistStatus, routes.anilistBody);
      }
      if (url.includes('/full')) return answer(routes.jikanDetailStatus, routes.jikanDetailBody);
      if (url.includes('/episodes?page=')) {
        const page = Number(/page=(\d+)/.exec(url)?.[1] ?? '1');
        return answer(200, routes.jikanEpisodePages[page - 1] ?? JSON.stringify({ data: [] }));
      }
      return answer(404, '');
    },
  };
});

const { listMalUnits } = await import('../scraper/malUnits');
const { MAL_UNITS_CATALOGUE_BUSY } = await import('../../shared/malDownload');

const JIKAN_ANIME = {
  mal_id: 52991,
  title: 'Sousou no Frieren',
  title_english: 'Frieren: Beyond Journey’s End',
  title_japanese: '葬送のフリーレン',
  type: 'TV',
  episodes: 28,
  duration: '24 min per ep',
  images: { jpg: { large_image_url: 'https://cdn.test/frieren.jpg' } },
};

const ANILIST_MEDIA = {
  id: 154587,
  idMal: 52991,
  title: { romaji: 'Sousou no Frieren', english: 'Frieren', native: '葬送のフリーレン' },
  format: 'TV',
  episodes: 3,
  averageScore: 91,
  genres: ['Adventure'],
  coverImage: { extraLarge: 'https://cdn.anilist.test/frieren.jpg' },
  airingSchedule: { nodes: [{ episode: 1, airingAt: 1_695_950_000 }] },
  streamingEpisodes: [{ title: 'Episode 1 - The Journey’s End' }],
};

beforeEach(() => {
  routes.jikanDetailStatus = 200;
  routes.jikanDetailBody = JSON.stringify({ data: JIKAN_ANIME });
  routes.jikanEpisodePages = [
    JSON.stringify({
      data: [
        {
          mal_id: 1,
          title: 'The Journey’s End',
          title_japanese: '冒険の終わり',
          aired: '2023-09-29T00:00:00+00:00',
          filler: false,
          recap: false,
        },
        { mal_id: 2, title: 'It Didn’t Have to Be Magic', filler: true, recap: false },
        { mal_id: 3, title: 'Recap', filler: false, recap: true },
      ],
      pagination: { has_next_page: false },
    }),
  ];
  routes.anilistStatus = 200;
  routes.anilistBody = JSON.stringify({ data: { Media: ANILIST_MEDIA } });
  routes.hits = [];
});

describe('listMalUnits', () => {
  it('reads the episode list for a MyAnimeList entry', async () => {
    const result = await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 52991 });
    expect(result.units).toHaveLength(3);
    expect(result.units[0]).toMatchObject({
      number: 1,
      label: 'EP 01',
      title: 'The Journey’s End',
      nativeTitle: '冒険の終わり',
      airDate: '2023-09-29',
    });
    expect(result.units[1].filler).toBe(true);
    expect(result.units[2].recap).toBe(true);
    expect(result.servedBy).toBe('MyAnimeList (Jikan)');
    expect(result.note).toBe('');
  });

  it('carries the title an index would be searched by', async () => {
    const result = await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 52991 });
    expect(result.target).toMatchObject({
      contentType: 'anime',
      provider: 'jikan',
      id: 52991,
      romajiTitle: 'Sousou no Frieren',
      totalUnits: 28,
    });
  });

  it('asks for the entry by id rather than searching for its name', async () => {
    await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 52991 });
    expect(routes.hits.some((hit) => hit.includes('/anime/52991/full'))).toBe(true);
    expect(routes.hits.some((hit) => hit.includes('/anime?q='))).toBe(false);
  });

  // An unaired or untracked series publishes a count but no list. Offering the
  // declared range beats an empty dialog, and the note is what lets the UI say
  // the titles are missing rather than silently showing blank rows.
  it('offers the declared episode count when no list is published', async () => {
    routes.jikanEpisodePages = [JSON.stringify({ data: [] })];
    routes.jikanDetailBody = JSON.stringify({ data: { ...JIKAN_ANIME, episodes: 12 } });
    const result = await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 52991 });
    expect(result.note).toBe('no-episode-list');
    expect(result.units).toHaveLength(12);
    expect(result.units[11]).toMatchObject({ number: 12, title: '', airDate: null });
  });

  it('reports an entry with neither a list nor a count as listing nothing', async () => {
    routes.jikanEpisodePages = [JSON.stringify({ data: [] })];
    routes.jikanDetailBody = JSON.stringify({ data: { ...JIKAN_ANIME, episodes: 0 } });
    const result = await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 52991 });
    expect(result.note).toBe('nothing-listed');
    expect(result.units).toEqual([]);
  });

  it('builds the list from AniList when the entry is an AniList id', async () => {
    const result = await listMalUnits({ contentType: 'anime', provider: 'anilist', id: 154587 });
    expect(result.servedBy).toBe('AniList');
    expect(result.units).toHaveLength(3);
    expect(result.units[0].title).toBe('The Journey’s End');
    expect(routes.hits.every((hit) => hit.startsWith('https://graphql.anilist.co'))).toBe(true);
  });

  // Round-2 J3: an unanswered lookup used to throw "The catalogue has no jikan entry
  // 34798." — English, jargon, and a dead end. It is a code now, which the dialog
  // translates, and a known episode count still yields a list to pick from.
  it('answers a catalogue that did not respond with a code, not an English sentence', async () => {
    routes.jikanDetailStatus = 404;
    routes.jikanDetailBody = '';
    const result = await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 999_999 });
    expect(result.note).toBe(MAL_UNITS_CATALOGUE_BUSY);
    expect(result.units).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/no jikan entry/i);
  });

  it('falls back to placeholder episodes from the count the library knows', async () => {
    routes.jikanDetailStatus = 404;
    routes.jikanDetailBody = '';
    const result = await listMalUnits({
      contentType: 'anime',
      provider: 'jikan',
      id: 34798,
      known: { title: 'Yuru Camp', nativeTitle: 'ゆるキャン△', episodeCount: 12 },
    });
    expect(result.note).toBe(MAL_UNITS_CATALOGUE_BUSY);
    expect(result.units).toHaveLength(12);
    expect(result.units[0]).toMatchObject({ number: 1, label: 'EP 01', title: '' });
    expect(result.target).toMatchObject({ title: 'Yuru Camp', romajiTitle: 'Yuru Camp', totalUnits: 12 });
  });

  it('ignores a malformed known count instead of flooding the list', async () => {
    routes.jikanDetailStatus = 404;
    const result = await listMalUnits({
      contentType: 'anime',
      provider: 'jikan',
      id: 1,
      known: { title: 'x', episodeCount: Number.NaN },
    });
    expect(result.units).toEqual([]);
  });

  it('refuses manga instead of quietly entering the anime catalogue', async () => {
    await expect(
      listMalUnits({ contentType: 'manga', provider: 'anilist', id: 30_002 }),
    ).rejects.toThrow(/reading providers/i);
  });
});
