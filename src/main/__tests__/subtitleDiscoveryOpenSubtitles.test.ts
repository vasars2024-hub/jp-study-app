// @vitest-environment node
//
// OpenSubtitles for TV, drama and film: what is asked, in which order, how the
// replies are read, and that a season is asked about once — not once per episode.
// No network: the client's pure halves run for real against fixture replies, and
// the orchestrator is handed a scripted search.

import { describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';

vi.mock('electron', () => ({
  app: { getPath: () => '.' },
  net: { request: () => { throw new Error('no network in tests'); } },
  safeStorage: { isEncryptionAvailable: () => false },
}));
vi.mock('../credentials/subtitles', () => ({
  readSubtitleProviderSecret: () => 'test-key',
  writeSubtitleProviderSecret: () => ({ ok: true }),
}));
vi.mock('../credentials/vault', () => ({ recordTestResult: () => undefined }));

const {
  openSubtitlesCandidatesFromReply,
  openSubtitlesSearchParams,
  readOpenSubtitlesTicket,
} = await import('../subtitleProviderClients');
const {
  MAX_BATCH_PAGES,
  createOpenSubtitlesBatch,
  planOpenSubtitlesSearch,
  readExternalIds,
  searchOpenSubtitlesForItem,
} = await import('../subtitleDiscoveryOpenSubtitles');
type Query = import('../subtitleProviderClients').OpenSubtitlesQuery;
type Match = import('../subtitleProviderClients').OpenSubtitlesMatch;
type Candidate = import('../subtitleProviderClients').ProviderSubtitleCandidate;

function item(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'bb-3',
    title: 'Breaking Bad - S01E03',
    seriesTitle: 'Breaking Bad',
    seriesKey: 'breaking bad',
    fileName: 'Breaking.Bad.S01E03.720p.BluRay.x264-DEMAND.mkv',
    path: 'D:/TV/Breaking.Bad.S01E03.720p.BluRay.x264-DEMAND.mkv',
    addedAt: 1,
    kind: 'video',
    season: 1,
    episode: 3,
    year: 2008,
    ...over,
  } as MediaItem;
}

function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    providerId: 'opensubtitles',
    providerItemId: 'opensubtitles:1',
    language: 'en',
    format: 'srt',
    releaseName: 'Breaking.Bad.S01E03.720p.BluRay.x264-DEMAND',
    featureTitle: 'Breaking Bad',
    season: 1,
    episode: 3,
    year: 2008,
    releaseGroup: null,
    hearingImpaired: false,
    hashMatch: false,
    downloads: 100,
    fetchToken: '1',
    ...over,
  };
}

/** A scripted `/subtitles`: each call gets the next reply; every query is recorded. */
function scripted(replies: ((query: Query) => Match)[]): { search: (q: Query) => Promise<Match>; asked: Query[] } {
  const asked: Query[] = [];
  let index = 0;
  return {
    asked,
    search: async (query) => {
      asked.push(query);
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return reply(query);
    },
  };
}

// ------------------------------------------------------------------ the client

describe('openSubtitlesSearchParams', () => {
  it('sorts parameters, lower-cases values, and strips the IMDb prefix', () => {
    const params = openSubtitlesSearchParams({
      title: 'Breaking Bad', season: 1, episode: 3, languages: ['ja', 'EN'], parentImdbId: 'tt0903747',
    });
    expect(params).toBe('episode_number=3&languages=en%2Cja&parent_imdb_id=903747&query=breaking%20bad&season_number=1');
  });

  it('sends only what a hash search needs', () => {
    expect(openSubtitlesSearchParams({ title: '', season: null, episode: null, languages: ['ja'], movieHash: 'ABCDEF0123456789' }))
      .toBe('languages=ja&moviehash=abcdef0123456789');
  });

  it('drops malformed ids rather than sending them', () => {
    expect(openSubtitlesSearchParams({ title: '', season: null, episode: null, languages: [], tmdbId: 'abc', imdbId: 'tt' }))
      .toBe('');
  });
});

describe('openSubtitlesCandidatesFromReply', () => {
  // Trimmed from a real `/api/v1/subtitles` reply shape.
  const fixture = {
    total_pages: 1,
    data: [{
      id: '7001',
      attributes: {
        language: 'en',
        release: 'Breaking.Bad.S01E03.720p.BluRay.x264-DEMAND',
        hearing_impaired: false,
        download_count: 1234,
        moviehash_match: false,
        ai_translated: false,
        machine_translated: true,
        from_trusted: true,
        feature_details: {
          season_number: 1, episode_number: 3, title: '...And the Bag\'s in the River',
          parent_title: 'Breaking Bad', year: 2008,
        },
        files: [{ file_id: 555, file_name: 'Breaking.Bad.S01E03.srt' }],
      },
    }, { attributes: { language: 'en', files: [] } }],
  };

  it('maps the fields scoring reads, and skips rows with no file', () => {
    const [one, ...rest] = openSubtitlesCandidatesFromReply(fixture);
    expect(rest).toEqual([]);
    expect(one).toMatchObject({
      providerItemId: 'opensubtitles:555',
      fetchToken: '555',
      language: 'en',
      season: 1,
      episode: 3,
      featureTitle: 'Breaking Bad',
      year: 2008,
      machineTranslated: true,
      trusted: true,
      downloads: 1234,
      hashMatch: false,
    });
  });
});

describe('readOpenSubtitlesTicket', () => {
  it('reads a granted download', () => {
    expect(readOpenSubtitlesTicket(200, JSON.stringify({ link: 'https://dl/x.srt', remaining: 4 })))
      .toEqual({ link: 'https://dl/x.srt', quotaExceeded: false, resetAt: null, remaining: 4 });
  });

  it('reads a 406 as the daily quota, with its reset time', () => {
    const out = readOpenSubtitlesTicket(406, JSON.stringify({
      message: 'You have downloaded your allowed 5 subtitles for 24h', remaining: 0,
      reset_time_utc: '2026-09-24T00:00:00.000Z',
    }));
    expect(out.quotaExceeded).toBe(true);
    expect(out.link).toBeNull();
    expect(out.resetAt).toBe(Date.parse('2026-09-24T00:00:00.000Z'));
  });

  it('reads an exhausted 429 as quota and a plain 500 as not', () => {
    expect(readOpenSubtitlesTicket(429, '{"remaining":0}').quotaExceeded).toBe(true);
    expect(readOpenSubtitlesTicket(500, 'oops').quotaExceeded).toBe(false);
  });
});

// ------------------------------------------------------------ the orchestrator

describe('readExternalIds / planOpenSubtitlesSearch', () => {
  it('reads the metadata ids defensively, nested shape included', () => {
    expect(readExternalIds(item({ imdbId: 'tt0903747', tmdbId: 1396, tmdbType: 'tv' } as Partial<MediaItem>)))
      .toMatchObject({ imdb: 'tt0903747', tmdb: '1396', tmdbType: 'tv' });
    expect(readExternalIds({ ...item(), externalIds: { imdb: 'tt1' } } as unknown as MediaItem).imdb).toBe('tt1');
    expect(readExternalIds(item())).toMatchObject({ imdb: null, tmdb: null });
  });

  it('asks hash, then the show id by season, then the title — for an episode', () => {
    const steps = planOpenSubtitlesSearch(item({ imdbId: 'tt0903747' } as Partial<MediaItem>), 'abc');
    expect(steps.map((step) => [step.basis, step.batch])).toEqual([['hash', false], ['id', true], ['query', true]]);
    expect(steps[1].query).toMatchObject({ parentImdbId: 'tt0903747', season: 1, episode: null });
    expect(steps[1].fallback).toMatchObject({ episode: 3 });
    expect(steps[2].query).toMatchObject({ title: 'Breaking Bad', season: 1, episode: null });
  });

  it('asks a film by its own id and by title with year', () => {
    const film = item({
      title: 'Spirited Away', seriesTitle: 'Spirited Away', season: undefined, episode: undefined, year: 2001,
      tmdbId: 129, tmdbType: 'movie',
    } as Partial<MediaItem>);
    const steps = planOpenSubtitlesSearch(film, null);
    expect(steps.map((step) => step.basis)).toEqual(['id', 'query']);
    expect(steps[0].query).toMatchObject({ tmdbId: '129' });
    expect(steps[1].query).toMatchObject({ title: 'Spirited Away', year: 2001 });
  });

  it('never sends a TMDB id in the wrong namespace', () => {
    const steps = planOpenSubtitlesSearch(item({ tmdbId: 129, tmdbType: 'movie' } as Partial<MediaItem>), null);
    expect(steps.map((step) => step.basis)).toEqual(['query']);
  });
});

describe('createOpenSubtitlesBatch — one listing per series per run', () => {
  it('serves a second episode of the same season from the first episode\'s listing', async () => {
    const script = scripted([() => ({
      candidates: [cand({ providerItemId: 'e3', episode: 3 }), cand({ providerItemId: 'e4', episode: 4 })],
      down: false, downStatus: 200, totalPages: 1,
    })]);
    const batch = createOpenSubtitlesBatch(script.search);
    const three = await searchOpenSubtitlesForItem(item(), ['en'], null, batch, 70);
    const four = await searchOpenSubtitlesForItem(item({ id: 'bb-4', episode: 4 }), ['en'], null, batch, 70);
    expect(script.asked).toHaveLength(1);
    expect(three.byLanguage.get('en')?.[0].candidate.providerItemId).toBe('e3');
    expect(four.byLanguage.get('en')?.[0].candidate.providerItemId).toBe('e4');
  });

  it('reads at most MAX_BATCH_PAGES pages, then asks for the one episode it missed', async () => {
    const script = scripted([
      ...Array.from({ length: MAX_BATCH_PAGES }, () => () => ({
        candidates: [cand({ providerItemId: 'e1', episode: 1 })], down: false, downStatus: 200, totalPages: 9,
      })),
      (query: Query) => ({
        // The per-episode request: rows that do not state their episode are that episode.
        candidates: [cand({ providerItemId: `exact-${query.episode}`, episode: null })],
        down: false, downStatus: 200, totalPages: 1,
      }),
    ]);
    const out = await searchOpenSubtitlesForItem(item(), ['en'], null, createOpenSubtitlesBatch(script.search), 70);
    expect(script.asked.map((q) => [q.page, q.episode])).toEqual([[1, null], [2, null], [3, null], [1, 3]]);
    expect(out.byLanguage.get('en')?.[0].candidate.providerItemId).toBe('exact-3');
  });

  it('does not remember an outage: the next episode asks again', async () => {
    const script = scripted([
      () => ({ candidates: [], down: true, downStatus: 503 }),
      () => ({ candidates: [cand()], down: false, downStatus: 200, totalPages: 1 }),
    ]);
    const batch = createOpenSubtitlesBatch(script.search);
    const first = await searchOpenSubtitlesForItem(item(), ['en'], null, batch, 70);
    expect(first.down).toBe(true);
    const second = await searchOpenSubtitlesForItem(item(), ['en'], null, batch, 70);
    expect(second.down).toBe(false);
    expect(second.byLanguage.has('en')).toBe(true);
  });
});

describe('searchOpenSubtitlesForItem — tiers stop once answered', () => {
  it('a hash hit in every language costs one request', async () => {
    const script = scripted([() => ({
      candidates: [cand({ hashMatch: true, language: 'ja' }), cand({ providerItemId: 'h2', hashMatch: true, language: 'en' })],
      down: false, downStatus: 200, totalPages: 1,
    })]);
    const out = await searchOpenSubtitlesForItem(
      item({ imdbId: 'tt0903747' } as Partial<MediaItem>), ['ja', 'en'], 'hash', createOpenSubtitlesBatch(script.search), 70,
    );
    expect(script.asked).toHaveLength(1);
    expect(script.asked[0]).toMatchObject({ movieHash: 'hash', languages: ['ja', 'en'] });
    expect(out.basis.get('ja')).toBe('hash');
    expect(out.basis.get('en')).toBe('hash');
  });

  it('asks the id tier only for what the hash left open', async () => {
    const script = scripted([
      () => ({ candidates: [cand({ hashMatch: true, language: 'ja' })], down: false, downStatus: 200, totalPages: 1 }),
      () => ({ candidates: [cand({ providerItemId: 'id-en' })], down: false, downStatus: 200, totalPages: 1 }),
    ]);
    const out = await searchOpenSubtitlesForItem(
      item({ imdbId: 'tt0903747' } as Partial<MediaItem>), ['ja', 'en'], 'hash', createOpenSubtitlesBatch(script.search), 70,
    );
    expect(script.asked).toHaveLength(2);
    expect(script.asked[1]).toMatchObject({ parentImdbId: 'tt0903747' });
    expect(out.basis.get('en')).toBe('id');
    expect(out.byLanguage.get('en')?.[0].candidate.providerItemId).toBe('id-en');
  });

  it('holds a non-hash row from the hash search to the title rules', async () => {
    const script = scripted([
      () => ({
        candidates: [cand({ releaseName: 'Some.Other.Show.S01E03', featureTitle: 'Some Other Show' })],
        down: false, downStatus: 200, totalPages: 1,
      }),
      () => ({ candidates: [], down: false, downStatus: 200, totalPages: 1 }),
    ]);
    const out = await searchOpenSubtitlesForItem(item(), ['en'], 'hash', createOpenSubtitlesBatch(script.search), 70);
    expect(out.byLanguage.has('en')).toBe(false);
    expect(out.down).toBe(false);
  });
});
