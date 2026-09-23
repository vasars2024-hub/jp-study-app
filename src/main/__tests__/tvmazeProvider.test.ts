// @vitest-environment node
/**
 * TVmaze, against answers recorded from the live API on 2026-09-23
 * (`fixtures/metadata/tvmaze-*.json`, `_links` stripped, Frieren's run trimmed
 * to six episodes). No test here touches the network: the HTTP layer is
 * replaced by a router over those recordings.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, net: { request: () => undefined } }));

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'metadata', name), 'utf8')) as T;

/** url substring → [status, body]; unmatched URLs answer 0 (no answer). */
const routes: Array<[string, number, unknown]> = [];
const requested: string[] = [];

vi.mock('../providers/providerHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../providers/providerHttp')>();
  return {
    ...actual,
    readCache: () => null,
    writeCache: () => undefined,
    requestJsonStatus: async (url: string) => {
      requested.push(url);
      const route = routes.find(([needle]) => url.includes(needle));
      if (!route) return { status: 0, data: null };
      return { status: route[1], data: route[1] >= 200 && route[1] < 300 ? route[2] : null };
    },
  };
});

const { findTvmazeShow, tvmazeEpisodes, tvmazeImages, tvmazeToWork } = await import('../providers/tvmaze');
type Show = Parameters<typeof tvmazeToWork>[0];

beforeEach(() => {
  routes.length = 0;
  requested.length = 0;
});

describe('tvmazeToWork (recorded answers)', () => {
  it('maps a Japanese live-action drama with its whole run', () => {
    const work = tvmazeToWork(fixture<Show>('tvmaze-singlesearch-hanzawa.json'));
    expect(work).toMatchObject({
      provider: 'tvmaze',
      id: 13017,
      tvmazeId: 13017,
      displayTitle: 'Naoki Hanzawa',
      year: 2013,
      format: 'TV',
      imdbId: 'tt2930136',
      network: 'TBS',
      language: 'japanese',
      country: 'JP',
      animation: false,
      showType: 'scripted',
      runtimeMin: 52,
    });
    expect(work.synopsis).toMatch(/^It follows the story of Naoki Hanzawa/);
    expect(work.synopsis).not.toMatch(/<p>/);
    expect(work.episodes).toHaveLength(20);
    expect(new Set(work.episodes?.map((episode) => episode.season))).toEqual(new Set([1, 2]));
    expect(work.episodes?.[0]).toMatchObject({ season: 1, number: 1, runtimeMin: 50 });
    expect(work.episodes?.[0]?.airedAt).toBe(Date.parse('2013-07-07T03:00:00+00:00'));
    // The embedded images: TVmaze's main poster and its 1920x1080 background.
    expect(work.posterUrl).toBe('https://static.tvmaze.com/uploads/images/original_untouched/44/111597.jpg');
    expect(work.backdropUrl).toBe('https://static.tvmaze.com/uploads/images/original_untouched/221/552834.jpg');
  });

  it('maps TV anime as Japanese animation, with its romaji alias and episode stills', () => {
    const work = tvmazeToWork(fixture<Show>('tvmaze-singlesearch-frieren.json'));
    expect(work.animation).toBe(true);
    expect(work.language).toBe('japanese');
    expect(work.titles).toContain('Sousou no Frieren');
    expect(work.episodes?.[0]?.title).toBe("The Journey's End");
    expect(work.episodes?.[0]?.stillUrl).toMatch(/^https:\/\/static\.tvmaze\.com\//);
  });

  it('reads the standalone images endpoint the same way', () => {
    const images = tvmazeImages(fixture('tvmaze-images-13017.json'));
    expect(images.poster).toMatch(/111597\.jpg$/);
    expect(images.background).toMatch(/552834\.jpg$/);
  });

  it('drops specials, which TVmaze numbers null', () => {
    expect(tvmazeEpisodes([
      { season: 1, number: 1, type: 'regular', name: 'One' },
      { season: 1, number: null, type: 'significant_special', name: 'Recap' },
    ])).toEqual([expect.objectContaining({ number: 1, title: 'One' })]);
  });
});

describe('findTvmazeShow', () => {
  const target = { title: 'Hanzawa Naoki', year: 2013, episodeCount: 10, format: 'tv' };

  it('takes the single best hit when it scores, in one request', async () => {
    routes.push(['singlesearch/shows?q=Hanzawa%20Naoki', 200, fixture('tvmaze-singlesearch-hanzawa.json')]);
    const found = await findTvmazeShow(target);
    expect(found.down).toBe(false);
    expect(found.match?.candidate.tvmazeId).toBe(13017);
    // Family-name-first romaji against TVmaze's given-name-first title.
    expect(found.match?.confidence).toBeGreaterThanOrEqual(0.82);
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain('embed%5B%5D=episodes');
  });

  it('reports a 404 as "no such show", not as an outage', async () => {
    routes.push(['singlesearch', 404, null], ['search/shows', 200, []]);
    expect(await findTvmazeShow({ title: 'zzzqqq' })).toEqual({ match: null, down: false });
  });

  it('reports no answer at all as down', async () => {
    expect(await findTvmazeShow({ title: 'Anything' })).toEqual({ match: null, down: true });
  });

  it('falls back to the runners-up and fetches the embeds of the one it picks', async () => {
    const decoy = { ...fixture<Show>('tvmaze-singlesearch-frieren.json'), id: 1, name: 'Something Else', _embedded: null };
    routes.push(
      ['singlesearch', 200, decoy],
      ['search/shows', 200, fixture('tvmaze-search-hanzawa.json')],
      ['/shows/13017?', 200, fixture('tvmaze-singlesearch-hanzawa.json')],
    );
    const found = await findTvmazeShow(target);
    expect(found.match?.candidate.id).toBe(13017);
    expect(found.match?.candidate.episodes).toHaveLength(20);
  });
});
