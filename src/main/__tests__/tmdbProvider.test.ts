// @vitest-environment node
/**
 * TMDB, against fixtures built to TMDB's v3 reference shapes
 * (`fixtures/metadata/tmdb-*.json`). Recording live answers needs a key, which
 * the repository must not hold — so these pin the mapping and the request
 * rules, and the HTTP layer is replaced by a router over the fixtures.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, net: { request: () => undefined } }));

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'metadata', name), 'utf8')) as T;

const vault = { key: '' };
vi.mock('../credentials/vault', () => ({ readSecret: () => vault.key }));

const routes: Array<[string, number, unknown]> = [];
const requested: Array<{ url: string; headers?: Record<string, string> }> = [];

vi.mock('../providers/providerHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../providers/providerHttp')>();
  return {
    ...actual,
    readCache: () => null,
    writeCache: () => undefined,
    requestJsonStatus: async (url: string, _limiter: unknown, options: { headers?: Record<string, string> } = {}) => {
      requested.push({ url, headers: options.headers });
      const route = routes.find(([needle]) => url.includes(needle));
      if (!route) return { status: 0, data: null };
      return { status: route[1], data: route[1] >= 200 && route[1] < 300 ? route[2] : null };
    },
  };
});

const {
  findTmdbMovie,
  findTmdbTv,
  tmdbAuth,
  tmdbAvailable,
  tmdbImageUrl,
  tmdbMovieToWork,
} = await import('../providers/tmdb');

const V3 = '0123456789abcdef0123456789abcdef';
const V4 = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJl';

beforeEach(() => {
  routes.length = 0;
  requested.length = 0;
  vault.key = V3;
});

describe('tmdbAuth', () => {
  it('sends a v3 key as api_key and a v4 read token as a Bearer header', () => {
    expect(tmdbAuth(V3)).toEqual({ query: `api_key=${V3}` });
    expect(tmdbAuth(` ${V4} `)).toEqual({ headers: { Authorization: `Bearer ${V4}` } });
    expect(tmdbAuth('')).toBeNull();
    expect(tmdbAuth(undefined)).toBeNull();
  });

  it('reports availability from the vault', () => {
    expect(tmdbAvailable()).toBe(true);
    vault.key = '';
    expect(tmdbAvailable()).toBe(false);
  });
});

describe('tmdbMovieToWork', () => {
  it('maps details: genres, runtime, IMDb id, poster and backdrop sizes', () => {
    const work = tmdbMovieToWork(fixture('tmdb-movie-129.json'));
    expect(work).toMatchObject({
      provider: 'tmdb',
      tmdbId: 129,
      tmdbType: 'movie',
      displayTitle: 'Spirited Away',
      nativeTitle: '千と千尋の神隠し',
      year: 2001,
      format: 'Movie',
      runtimeMin: 125,
      imdbId: 'tt0245429',
      genres: ['Animation', 'Family', 'Fantasy'],
      language: 'ja',
      country: 'JP',
      animation: true,
    });
    expect(work.posterUrl).toBe('https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg');
    expect(work.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/Ab8mkHmkYADjU7wQiOkia9BzGvS.jpg');
  });

  it('names search-row genres from their ids and leaves unrated films unrated', () => {
    const [film, documentary] = fixture<{ results: Array<Parameters<typeof tmdbMovieToWork>[0]> }>(
      'tmdb-search-movie-spirited-away.json',
    ).results.map(tmdbMovieToWork);
    expect(film?.genres).toEqual(['Animation', 'Family', 'Fantasy']);
    expect(documentary?.rating).toBeUndefined();
    expect(documentary?.posterUrl).toBeUndefined();
  });

  it('builds image URLs only from real paths', () => {
    expect(tmdbImageUrl('/x.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/x.jpg');
    expect(tmdbImageUrl(null, 'w500')).toBeUndefined();
    expect(tmdbImageUrl('https://elsewhere/x.jpg', 'w500')).toBeUndefined();
  });
});

describe('findTmdbMovie', () => {
  const target = { title: 'Spirited Away', year: 2001, format: 'movie' };

  it('searches with the year, then fetches details for the match', async () => {
    routes.push(
      ['/search/movie', 200, fixture('tmdb-search-movie-spirited-away.json')],
      ['/movie/129', 200, fixture('tmdb-movie-129.json')],
    );
    const found = await findTmdbMovie(target);
    expect(found.down).toBe(false);
    expect(found.match?.candidate).toMatchObject({ tmdbId: 129, runtimeMin: 125, imdbId: 'tt0245429' });
    expect(requested[0]?.url).toContain('query=Spirited%20Away&year=2001');
    expect(requested[0]?.url).toContain(`api_key=${V3}`);
    expect(requested[1]?.url).toContain('/movie/129?');
  });

  it('repeats an empty dated search without the year', async () => {
    routes.push(
      ['year=2002', 200, { results: [] }],
      ['/search/movie', 200, fixture('tmdb-search-movie-spirited-away.json')],
      ['/movie/129', 200, fixture('tmdb-movie-129.json')],
    );
    const found = await findTmdbMovie({ ...target, year: 2002 });
    expect(found.match?.candidate.tmdbId).toBe(129);
    expect(requested.map((entry) => entry.url.includes('year=')).slice(0, 2)).toEqual([true, false]);
  });

  it('uses the Bearer header, and keeps the token out of the URL, for a v4 token', async () => {
    vault.key = V4;
    routes.push(['/search/movie', 200, { results: [] }]);
    await findTmdbMovie({ title: 'Nothing' });
    expect(requested[0]?.headers).toEqual({ Authorization: `Bearer ${V4}` });
    expect(requested[0]?.url).not.toContain(V4);
  });

  it('treats no key, a refused key and no answer as down — never as "no such film"', async () => {
    vault.key = '';
    expect(await findTmdbMovie(target)).toEqual({ match: null, down: true });
    expect(requested).toHaveLength(0);

    vault.key = V3;
    routes.push(['/search/movie', 401, null]);
    expect(await findTmdbMovie(target)).toEqual({ match: null, down: true });

    routes.length = 0;
    expect(await findTmdbMovie(target)).toEqual({ match: null, down: true });
  });
});

describe('findTmdbTv', () => {
  it('matches a series by any name the primary provider knows', async () => {
    routes.push(['/search/tv', 200, fixture('tmdb-search-tv-hanzawa.json')]);
    const found = await findTmdbTv({ title: 'Naoki Hanzawa', year: 2013, format: 'tv' }, ['半沢直樹']);
    expect(found.match?.candidate).toMatchObject({ tmdbId: 57184, tmdbType: 'tv' });
    expect(found.match?.candidate.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/hanzawaBackdrop.jpg');
    // Accepted on the first query, so the second name is not searched.
    expect(requested).toHaveLength(1);
  });
});

describe('native titles in every study language', () => {
  it('keeps a Russian film\'s original title as its native title', () => {
    const work = tmdbMovieToWork({ id: 1, title: 'Brother', original_title: 'Брат', original_language: 'ru' } as Parameters<typeof tmdbMovieToWork>[0]);
    expect(work.nativeTitle).toBe('Брат');
  });
});
