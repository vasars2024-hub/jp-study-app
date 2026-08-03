// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd(), getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

// The catalogue client hard-codes the two public endpoints, so the test server
// is put in front of them by rewriting the request URL inside the HTTP layer —
// the parsing, the fallback order and the shape of what comes out are what
// matter here, not which host answered.
const routes = vi.hoisted(() => ({
  jikanSearchStatus: 200,
  jikanSearchBody: '',
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
    scraperRequest: async (url: string, options: Record<string, unknown> = {}) => {
      routes.hits.push(url);
      if (url.startsWith('https://graphql.anilist.co')) {
        return {
          status: routes.anilistStatus,
          statusText: 'OK',
          headers: {},
          body: routes.anilistBody,
          bytes: routes.anilistBody.length,
          truncated: false,
          finalUrl: url,
          timingMs: { dns: 0, connect: 0, tls: 0, ttfb: 1, total: 1 },
        };
      }
      let body = '';
      let status = 200;
      if (url.includes('/anime?q=')) {
        status = routes.jikanSearchStatus;
        body = routes.jikanSearchBody;
      } else if (url.includes('/full')) {
        body = routes.jikanDetailBody;
      } else if (url.includes('/episodes?page=')) {
        const page = Number(/page=(\d+)/.exec(url)?.[1] ?? '1');
        body = routes.jikanEpisodePages[page - 1] ?? JSON.stringify({ data: [] });
      }
      void options;
      return {
        status,
        statusText: 'OK',
        headers: {},
        body,
        bytes: body.length,
        truncated: false,
        finalUrl: url,
        timingMs: { dns: 0, connect: 0, tls: 0, ttfb: 1, total: 1 },
      };
    },
  };
});

const {
  catalogueDetail,
  catalogueEpisodes,
  parseDurationSec,
  providerLabel,
  searchCatalogue,
  toCatalogueWork,
  toSeriesMetadata,
} = await import('../scraper/catalogue');

const JIKAN_ANIME = {
  mal_id: 52991,
  title: 'Sousou no Frieren',
  title_english: 'Frieren: Beyond Journey’s End',
  title_japanese: '葬送のフリーレン',
  synopsis: 'After the party defeats the Demon King…',
  type: 'TV',
  status: 'Finished Airing',
  episodes: 28,
  duration: '24 min per ep',
  rating: 'PG-13',
  score: 9.3,
  season: 'fall',
  year: 2023,
  genres: [{ name: 'Adventure' }, { name: 'Drama' }],
  studios: [{ name: 'Madhouse' }],
  images: { jpg: { large_image_url: 'https://cdn.test/frieren-l.jpg' } },
  external: [{ name: 'Official Site', url: 'https://frieren-anime.jp/' }],
};

const ANILIST_MEDIA = {
  id: 154587,
  idMal: 52991,
  title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey’s End', native: '葬送のフリーレン' },
  description: 'The demon king <i>has</i> been defeated.',
  format: 'TV',
  status: 'FINISHED',
  season: 'FALL',
  seasonYear: 2023,
  episodes: 3,
  duration: 24,
  averageScore: 91,
  isAdult: false,
  genres: ['Adventure', 'Drama'],
  studios: { nodes: [{ name: 'Madhouse' }] },
  coverImage: { extraLarge: 'https://cdn.anilist.test/frieren.jpg' },
  externalLinks: [{ site: 'Official Site', url: 'https://frieren-anime.jp/' }],
  airingSchedule: {
    nodes: [
      { episode: 1, airingAt: 1_695_950_000 },
      { episode: 2, airingAt: 1_696_554_800 },
    ],
  },
  streamingEpisodes: [
    { title: 'Episode 1 - The Journey’s End' },
    { title: 'Episode 2 - The Priest’s Lie' },
  ],
};

beforeEach(() => {
  routes.jikanSearchStatus = 200;
  routes.jikanSearchBody = JSON.stringify({ data: [JIKAN_ANIME] });
  routes.jikanDetailBody = JSON.stringify({ data: JIKAN_ANIME });
  routes.jikanEpisodePages = [
    JSON.stringify({
      data: [
        {
          mal_id: 1,
          title: 'The Journey’s End',
          title_japanese: '冒険の終わり',
          title_romanji: 'Bouken no Owari',
          aired: '2023-09-29T00:00:00+00:00',
          filler: false,
          recap: false,
          url: 'https://myanimelist.net/anime/52991/episode/1',
        },
        {
          mal_id: 2,
          title: 'It Didn’t Have to Be Magic',
          title_japanese: '魔法じゃなくても',
          aired: '2023-10-06T00:00:00+00:00',
          filler: true,
          recap: false,
        },
      ],
      pagination: { has_next_page: false },
    }),
  ];
  routes.anilistStatus = 200;
  routes.anilistBody = JSON.stringify({ data: { Page: { media: [ANILIST_MEDIA] } } });
  routes.hits = [];
});

describe('parseDurationSec', () => {
  it('reads the duration strings the catalogue publishes', () => {
    expect(parseDurationSec('24 min per ep')).toBe(1_440);
    expect(parseDurationSec('1 hr 52 min')).toBe(6_720);
    expect(parseDurationSec('3 min 30 sec')).toBe(210);
    expect(parseDurationSec('Unknown')).toBe(0);
    expect(parseDurationSec(undefined)).toBe(0);
  });
});

describe('toCatalogueWork', () => {
  it('projects a Jikan record onto the work shape', () => {
    const work = toCatalogueWork(JIKAN_ANIME);
    expect(work.provider).toBe('mal');
    expect(work.titleEn).toContain('Frieren');
    expect(work.titleJa).toBe('葬送のフリーレン');
    expect(work.averageDurationSec).toBe(1_440);
    expect(work.studios).toEqual(['Madhouse']);
    expect(work.season).toBe('fall 2023');
    expect(work.officialSite).toBe('https://frieren-anime.jp/');
  });
});

describe('searchCatalogue', () => {
  it('uses Jikan when it answers', async () => {
    const works = await searchCatalogue('frieren', 'test');
    expect(works).toHaveLength(1);
    expect(works[0].provider).toBe('mal');
    expect(routes.hits.some((h) => h.includes('graphql.anilist.co'))).toBe(false);
  });

  it('falls back to AniList when Jikan is having an outage', async () => {
    // This is the real failure that motivated the fallback: Jikan answers 504
    // when MyAnimeList is unreachable.
    routes.jikanSearchStatus = 504;
    routes.jikanSearchBody = JSON.stringify({ status: 504, message: 'MyAnimeList may be down' });
    const works = await searchCatalogue('frieren', 'test');
    expect(works).toHaveLength(1);
    expect(works[0].provider).toBe('anilist');
    expect(works[0].titleJa).toBe('葬送のフリーレン');
    // AniList scores out of 100, the UI shows out of 10.
    expect(works[0].communityRating).toBeCloseTo(9.1);
    expect(works[0].synopsis).not.toContain('<i>');
  });

  it('falls back when Jikan answers with an empty list', async () => {
    routes.jikanSearchBody = JSON.stringify({ data: [] });
    const works = await searchCatalogue('frieren', 'test');
    expect(works[0].provider).toBe('anilist');
  });

  it('returns nothing when both providers fail', async () => {
    routes.jikanSearchStatus = 504;
    routes.anilistStatus = 500;
    await expect(searchCatalogue('frieren', 'test')).resolves.toEqual([]);
  });
});

describe('catalogueEpisodes', () => {
  it('reads titles, dates and the filler flag from Jikan', async () => {
    const [work] = await searchCatalogue('frieren', 'test');
    const episodes = await catalogueEpisodes(work, 'test');
    expect(episodes).toHaveLength(2);
    expect(episodes[0].titleJa).toBe('冒険の終わり');
    expect(episodes[0].airDate).toBe('2023-09-29');
    expect(episodes[1].filler).toBe(true);
  });

  it('builds an AniList list from the airing schedule without another request', async () => {
    routes.jikanSearchStatus = 504;
    const [work] = await searchCatalogue('frieren', 'test');
    routes.hits = [];
    const episodes = await catalogueEpisodes(work, 'test');
    expect(routes.hits).toEqual([]);
    expect(episodes).toHaveLength(3);
    expect(episodes[0].titleEn).toBe('The Journey’s End');
    expect(episodes[0].airDate).toBe(
      new Date(1_695_950_000_000).toISOString().slice(0, 10),
    );
    // The third episode has no schedule entry and no published title; it is
    // still listed, with the gaps left empty rather than filled in.
    expect(episodes[2].airDate).toBeNull();
    expect(episodes[2].titleEn).toBe('');
  });

  it('does not fetch detail for an AniList work', async () => {
    routes.jikanSearchStatus = 504;
    const [work] = await searchCatalogue('frieren', 'test');
    routes.hits = [];
    const detail = await catalogueDetail(work, 'test');
    expect(routes.hits).toEqual([]);
    expect(detail?.id).toBe(154587);
  });
});

describe('toSeriesMetadata', () => {
  it('records which provider each field came from', async () => {
    const [work] = await searchCatalogue('frieren', 'test');
    const metadata = toSeriesMetadata(work, 'mal-52991');
    expect(metadata.provenance.titleJa).toBe('MyAnimeList (Jikan)');
    expect(providerLabel(work)).toBe('MyAnimeList (Jikan)');
    // Neither endpoint publishes theme songs; empty is honest.
    expect(metadata.openingTheme).toBe('');
  });

  it('labels AniList-sourced metadata as AniList', async () => {
    routes.jikanSearchStatus = 504;
    const [work] = await searchCatalogue('frieren', 'test');
    expect(toSeriesMetadata(work, 'anilist-154587').provenance.titleEn).toBe('AniList');
  });
});
