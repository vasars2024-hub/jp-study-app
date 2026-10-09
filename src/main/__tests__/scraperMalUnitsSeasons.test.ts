// @vitest-environment node
//
// `listMalUnits` walks an entry's prequel chain so a later season's units carry
// the numbers its releases use (season, cour, absolute). Answered at the HTTP
// layer like scraperMalUnits.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Static: the `vi.mock` calls below are hoisted above it.
import { listMalUnits, setMalUnitsHopDelay } from '../scraper/malUnits';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const routes = vi.hoisted(() => ({
  jikan: new Map<number, unknown>(),
  anilist: new Map<number, unknown>(),
  failIds: new Set<number>(),
  hits: [] as string[],
}));

vi.mock('../scraper/http', async () => {
  const actual = await vi.importActual<typeof import('../scraper/http')>('../scraper/http');
  const answer = (url: string, status: number, body: string) => ({
    status, statusText: 'OK', headers: {}, body, bytes: body.length, truncated: false, finalUrl: url,
    timingMs: { dns: 0, connect: 0, tls: 0, ttfb: 1, total: 1 },
  });
  return {
    ...actual,
    scraperRequest: async (url: string, options: { body?: string } = {}) => {
      routes.hits.push(url);
      if (url.startsWith('https://graphql.anilist.co')) {
        const id = Number((JSON.parse(String(options.body ?? '{}')) as { variables?: { id?: number } }).variables?.id);
        const media = routes.anilist.get(id);
        if (!media || routes.failIds.has(id)) return answer(url, 500, '');
        return answer(url, 200, JSON.stringify({ data: { Media: media } }));
      }
      const full = /\/anime\/(\d+)\/full/.exec(url);
      if (full) {
        const id = Number(full[1]);
        if (routes.failIds.has(id) || !routes.jikan.has(id)) return answer(url, 503, '');
        return answer(url, 200, JSON.stringify({ data: routes.jikan.get(id) }));
      }
      if (url.includes('/episodes?page=')) {
        return answer(url, 200, JSON.stringify({ data: [1, 2, 3].map((n) => ({ mal_id: n, title: `Ep ${n}` })), pagination: { has_next_page: false } }));
      }
      return answer(url, 404, '');
    },
  };
});


const prequel = (id: number) => [{ relation: 'Prequel', entry: [{ mal_id: id, type: 'anime', name: `#${id}` }] }];

beforeEach(() => {
  routes.jikan.clear();
  routes.anilist.clear();
  routes.failIds.clear();
  routes.hits = [];
  setMalUnitsHopDelay(0);
  // Season 3 Part 2 (12) <- Season 3 (12) <- a movie <- Season 2 (12) <- Season 1 (25)
  routes.jikan.set(5, { mal_id: 5, title: 'Show Season 3 Part 2', type: 'TV', episodes: 12, relations: prequel(4) });
  routes.jikan.set(4, { mal_id: 4, title: 'Show Season 3', type: 'TV', episodes: 12, relations: prequel(3) });
  routes.jikan.set(3, { mal_id: 3, title: 'Show the Movie', type: 'Movie', episodes: 1, relations: prequel(2) });
  routes.jikan.set(2, { mal_id: 2, title: 'Show Season 2', type: 'TV', episodes: 12, relations: prequel(1) });
  routes.jikan.set(1, { mal_id: 1, title: 'Show', type: 'TV', episodes: 25, relations: [] });
});

describe('listMalUnits season mapping', () => {
  it('walks the prequel chain: season 3, cour offset 12, absolute offset 49 (the movie not counted)', async () => {
    const result = await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 5 });
    expect(result.target).toMatchObject({ seasonNumber: 3, absoluteOffset: 49 });
    expect(result.units[0]).toMatchObject({ number: 1, seasonEpisode: 13, absoluteNumber: 50 });
    expect(result.units[2]).toMatchObject({ number: 3, seasonEpisode: 15, absoluteNumber: 52 });
  });

  it('a first season is season 1 and its units keep only their own numbers', async () => {
    const result = await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 1 });
    expect(result.target).toMatchObject({ seasonNumber: 1, absoluteOffset: 0 });
    expect(result.units[0].absoluteNumber).toBeUndefined();
    expect(result.units[0].seasonEpisode).toBeUndefined();
  });

  it('a chain the catalogue would not finish answering invents no absolute number', async () => {
    routes.failIds.add(2);
    const result = await listMalUnits({ contentType: 'anime', provider: 'jikan', id: 5 });
    expect(result.target).toMatchObject({ seasonNumber: 3, absoluteOffset: null });
    expect(result.units[0].absoluteNumber).toBeUndefined();
    // The cour offset only needs the nearest entry, which did answer.
    expect(result.units[0].seasonEpisode).toBe(13);
  });

  it('follows AniList PREQUEL edges, TV first', async () => {
    const media = (id: number, title: string, format: string, episodes: number, prequels: Array<[number, string]>) => ({
      id, format, episodes, title: { romaji: title, english: title },
      relations: { edges: prequels.map(([pid, f]) => ({ relationType: 'PREQUEL', node: { id: pid, type: 'ANIME', format: f } })) },
    });
    routes.anilist.set(20, media(20, 'Show 2nd Season', 'TV', 12, [[30, 'OVA'], [10, 'TV']]));
    routes.anilist.set(10, media(10, 'Show', 'TV', 13, []));
    routes.anilist.set(30, media(30, 'Show OVA', 'OVA', 1, []));
    const result = await listMalUnits({ contentType: 'anime', provider: 'anilist', id: 20 });
    expect(result.target).toMatchObject({ seasonNumber: 2, absoluteOffset: 13 });
    expect(routes.hits.every((hit) => hit.startsWith('https://graphql.anilist.co'))).toBe(true);
  });
});
