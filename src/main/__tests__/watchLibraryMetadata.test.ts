// @vitest-environment node
/**
 * The watch library's metadata pass: Letterboxd films through TMDB, MAL titles
 * through AniList by MAL id, TV through TVmaze. Providers and the watch-library
 * store are replaced; the TMDB and TVmaze works come from the recorded
 * fixtures through the real mappers.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchMetadataPatch, WatchTitle } from '../../shared/watchLibrary';
import type { ProviderWork } from '../mediaProviderClients';
import type { MetadataMatch } from '../../shared/mediaMetadataMatch';

const userData = mkdtempSync(join(tmpdir(), 'watch-meta-'));
vi.mock('electron', () => ({ app: { getPath: () => userData }, net: { request: () => undefined } }));

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'metadata', name), 'utf8')) as T;
const match = (work: ProviderWork): MetadataMatch<ProviderWork> =>
  ({ candidate: work, confidence: 0.97, matchedTitle: work.displayTitle, reasons: [] });

const store = { titles: [] as WatchTitle[] };
const written: Array<{ id: string; meta: WatchMetadataPatch }> = [];
const script = {
  tmdbKey: true,
  tmdbMovie: null as MetadataMatch<ProviderWork> | null,
  /** TMDB unanswered (offline, refused key, 429/5xx after retries). */
  tmdbDown: false,
  tvmaze: null as MetadataMatch<ProviderWork> | null,
  anilistByMal: null as ProviderWork | null,
  anilistSearch: [] as ProviderWork[],
};
const merges: number[] = [];
const asked: string[] = [];

vi.mock('../watchLibrary', () => ({
  listWatchTitlesNeedingLookup: () => [],
  readWatchLibrary: () => ({ titles: store.titles }),
  setWatchTitleMetadata: (id: string, meta: WatchMetadataPatch) => {
    written.push({ id, meta });
    return store.titles.find((title) => title.id === id) ?? null;
  },
  onWatchLibraryChanged: () => () => undefined,
  mergeWatchLibraryDuplicates: (now: number) => {
    merges.push(now);
    return [];
  },
}));
vi.mock('../mediaProviderClients', () => ({
  anilistByMalId: async (id: number) => {
    asked.push(`anilist:mal:${id}`);
    return script.anilistByMal;
  },
  anilistById: async () => null,
  anilistSearch: async (query: string) => {
    asked.push(`anilist:search:${query}`);
    return script.anilistSearch;
  },
  jikanById: async () => null,
  jikanSearch: async () => [],
  downloadArtwork: async (url: string, name: string) => `artwork/${name}${url.length}.jpg`,
  artworkName: (prefix: string, key: string) => `${prefix}-${key}-`,
}));
vi.mock('../providers/tvmaze', () => ({
  findTvmazeShow: async () => {
    asked.push('tvmaze:search');
    return { match: script.tvmaze, down: false };
  },
  tvmazeShowById: async () => null,
}));
vi.mock('../providers/tmdb', () => ({
  tmdbAvailable: () => script.tmdbKey,
  findTmdbMovie: async (target: { title: string; year?: number | null }) => {
    asked.push(`tmdb:movie:${target.title}:${target.year}`);
    return { match: script.tmdbDown ? null : script.tmdbMovie, down: script.tmdbDown };
  },
  findTmdbTv: async () => ({ match: null, down: false }),
  tmdbMovieById: async () => null,
}));

const {
  cancelWatchLibraryMetadata,
  runWatchLibraryMetadata,
  watchLibraryMetadataStatus,
  WATCH_METADATA_RETRY_BASE_MS,
  watchAttemptRests,
  watchLookupPlan,
  watchRuntimeMinutes,
  watchTitleWantsMetadata,
} = await import('../watchLibraryMetadata');
const { tvmazeToWork } = await vi.importActual<typeof import('../providers/tvmaze')>('../providers/tvmaze');
const { tmdbMovieToWork } = await vi.importActual<typeof import('../providers/tmdb')>('../providers/tmdb');

const title = (id: string, extra: Partial<WatchTitle>): WatchTitle => ({
  id,
  kind: 'film',
  title: id,
  status: 'completed',
  watchDates: [],
  tags: [],
  lists: [],
  sources: ['letterboxd'],
  addedAt: 1,
  updatedAt: 1,
  ...extra,
} as WatchTitle);

beforeEach(() => {
  store.titles = [];
  written.length = 0;
  asked.length = 0;
  Object.assign(script, { tmdbKey: true, tmdbMovie: null, tmdbDown: false, tvmaze: null, anilistByMal: null, anilistSearch: [] });
  merges.length = 0;
  rmSync(join(userData, 'watch-metadata-attempts.json'), { force: true });
});

afterAll(() => rmSync(userData, { recursive: true, force: true }));

describe('watchLookupPlan', () => {
  it('goes by id when there is one, by title otherwise', () => {
    expect(watchLookupPlan(title('m', { kind: 'anime', malId: 5081 }), { tmdb: false })?.step).toBe('anilist-by-mal');
    expect(watchLookupPlan(title('f', { kind: 'film' }), { tmdb: true })?.step).toBe('tmdb-movie-search');
    expect(watchLookupPlan(title('t', { kind: 'tv' }), { tmdb: false })).toEqual({ step: 'tvmaze-search', providers: ['tvmaze'] });
    expect(watchLookupPlan(title('a', { kind: 'anime' }), { tmdb: false })?.step).toBe('anime-search');
  });

  it('asks AniList about a Letterboxd film without a TMDB key, only when it has a year', () => {
    expect(watchLookupPlan(title('f', { kind: 'film' }), { tmdb: false })).toBeNull();
    expect(watchLookupPlan(title('f', { kind: 'film', year: 2001 }), { tmdb: false }))
      .toEqual({ step: 'anime-film-search', providers: ['anilist'] });
    expect(watchLookupPlan(title('f', { kind: 'film', anime: true }), { tmdb: false })?.step).toBe('anime-search');
  });

  it('cannot look up a title known only by its IMDb id', () => {
    expect(watchLookupPlan(title('i', { kind: 'film', imdbId: 'tt0245429' }), { tmdb: false })).toBeNull();
  });
});

describe('watch pass helpers', () => {
  it('wants metadata while an id, a poster or a wide image is missing', () => {
    const complete = title('c', { tmdbId: 1, posterPath: 'artwork/p.jpg', backdropPath: 'artwork/b.jpg' });
    expect(watchTitleWantsMetadata(complete)).toBe(false);
    expect(watchTitleWantsMetadata({ ...complete, backdropPath: undefined })).toBe(true);
    expect(watchTitleWantsMetadata({ ...complete, tmdbId: undefined })).toBe(true);
  });

  it('rests an attempt for the retry window unless a provider appeared', () => {
    const plan = { step: 'tmdb-movie-search' as const, providers: ['tmdb' as const] };
    expect(watchAttemptRests({ at: 1_000, providers: ['tmdb'] }, plan, 2_000)).toBe(true);
    expect(watchAttemptRests({ at: 1_000, providers: [] }, plan, 2_000)).toBe(false);
    expect(watchAttemptRests({ at: 0, providers: ['tmdb'] }, plan, 8 * 86_400_000)).toBe(false);
  });

  it('counts a series\' runtime in total, as the view derives it', () => {
    const work = { runtimeMin: 24, episodeCount: 12 } as ProviderWork;
    expect(watchRuntimeMinutes('anime', work)).toBe(288);
    expect(watchRuntimeMinutes('film', { runtimeMin: 125 } as ProviderWork)).toBe(125);
  });
});

describe('runWatchLibraryMetadata', () => {
  it('fills a Letterboxd film from TMDB: ids, runtime, genres, poster and backdrop', async () => {
    store.titles = [title('lb:boxd.it/abc', { title: 'Spirited Away', year: 2001, letterboxdUri: 'https://boxd.it/abc' })];
    script.tmdbMovie = match(tmdbMovieToWork(fixture('tmdb-movie-129.json')));

    const result = await runWatchLibraryMetadata();
    expect(result).toEqual({ looked: 1, filled: 1, unavailable: 0, providersDown: [] });
    expect(asked).toEqual(['tmdb:movie:Spirited Away:2001']);
    expect(written[0]?.meta).toMatchObject({
      tmdbId: 129,
      tmdbType: 'movie',
      imdbId: 'tt0245429',
      runtimeMinutes: 125,
      genres: ['Animation', 'Family', 'Fantasy'],
    });
    expect(written[0]?.meta.posterPath).toMatch(/^artwork\/watch-poster-/);
    expect(written[0]?.meta.backdropPath).toMatch(/^artwork\/watch-backdrop-/);
    // No banner strip on TMDB: the backdrop is the hero.
    expect(written[0]?.meta.bannerPath).toBe(written[0]?.meta.backdropPath);
  });

  it('fills a MAL title by its id through AniList, with the banner', async () => {
    store.titles = [title('mal:52991', { kind: 'anime', malId: 52991, title: 'Sousou no Frieren', sources: ['mal-export'] })];
    script.anilistByMal = {
      provider: 'anilist', id: 154587, anilistId: 154587, malId: 52991, titles: [], displayTitle: 'Frieren',
      posterUrl: 'https://s4.anilist.co/cover.jpg', bannerUrl: 'https://s4.anilist.co/banner.jpg',
      runtimeMin: 24, episodeCount: 28, genres: ['Adventure'],
    };
    await runWatchLibraryMetadata();
    expect(asked).toEqual(['anilist:mal:52991']);
    expect(written[0]?.meta).toMatchObject({ anilistId: 154587, episodeCount: 28, runtimeMinutes: 672 });
    expect(written[0]?.meta.bannerPath).toMatch(/^artwork\/watch-banner-/);
  });

  it('fills a TV title from TVmaze without any key', async () => {
    script.tmdbKey = false;
    store.titles = [title('manual:hanzawa', { kind: 'tv', title: 'Hanzawa Naoki', year: 2013 })];
    script.tvmaze = match(tvmazeToWork(fixture('tvmaze-singlesearch-hanzawa.json')));
    await runWatchLibraryMetadata();
    expect(written[0]?.meta).toMatchObject({ tvmazeId: 13017, imdbId: 'tt2930136', episodeCount: 20 });
  });

  it('does not ask again about a title that found nothing, until the window passes', async () => {
    store.titles = [title('lb:boxd.it/zzz', { title: 'Nothing Like It', year: 1999 })];
    await runWatchLibraryMetadata();
    expect(asked).toHaveLength(1);
    expect(written).toEqual([]);
    await runWatchLibraryMetadata();
    expect(asked).toHaveLength(1);
  });

  it('without a TMDB key, identifies an anime film through AniList and stores every name', async () => {
    script.tmdbKey = false;
    store.titles = [title('lb:boxd.it/abc', { title: 'Spirited Away', year: 2001 })];
    const film: ProviderWork = {
      provider: 'anilist', id: 199, anilistId: 199, malId: 199, year: 2001, format: 'MOVIE',
      titles: ['Sen to Chihiro no Kamikakushi', 'Spirited Away', '千と千尋の神隠し'],
      displayTitle: 'Spirited Away', englishTitle: 'Spirited Away', romajiTitle: 'Sen to Chihiro no Kamikakushi', nativeTitle: '千と千尋の神隠し',
    };
    // Same name, wrong year and wrong format: never accepted.
    script.anilistSearch = [{ ...film, id: 5, anilistId: 5, malId: 5, year: 2019, format: 'TV' }, film];
    expect(await runWatchLibraryMetadata()).toMatchObject({ looked: 1, filled: 1, unavailable: 0 });
    expect(asked).toEqual(['anilist:search:Spirited Away']);
    expect(written[0].meta).toMatchObject({
      anilistId: 199, malId: 199, anime: true,
      englishTitle: 'Spirited Away', romajiTitle: 'Sen to Chihiro no Kamikakushi', originalTitle: '千と千尋の神隠し',
    });
    expect(written[0].meta.altTitles).toContain('Sen to Chihiro no Kamikakushi');
    expect(merges, 'the pass re-merges duplicates once it is done').toHaveLength(1);
  });

  it('leaves a live-action film alone when AniList has no film of that year', async () => {
    script.tmdbKey = false;
    store.titles = [title('lb:boxd.it/1Ekq', { title: 'Crouching Tiger, Hidden Dragon', year: 2000 })];
    expect(await runWatchLibraryMetadata()).toMatchObject({ looked: 1, filled: 0, unavailable: 0 });
    expect(written).toEqual([]);
    // …and a key added later reaches it at once: TMDB is a new provider for the plan.
    script.tmdbKey = true;
    asked.length = 0;
    await runWatchLibraryMetadata();
    expect(asked).toEqual(['tmdb:movie:Crouching Tiger, Hidden Dragon:2000']);
  });
});

// Resilience audit #18: an outage used to be discarded — the pass returned
// only looked/filled, its caller dropped even that, and nothing retried until
// the next launch, import or MAL sync.
describe('a metadata outage is visible and retried on its own', () => {
  it('reports unanswered lookups, schedules a bounded retry, and recovers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      store.titles = [title('lb:boxd.it/down', { title: 'Spirited Away', year: 2001, letterboxdUri: 'https://boxd.it/down' })];
      script.tmdbDown = true;
      const first = await runWatchLibraryMetadata(() => 1_000);
      expect(first).toMatchObject({ looked: 1, filled: 0, unavailable: 1, providersDown: ['tmdb'] });
      expect(watchLibraryMetadataStatus()).toMatchObject({
        lastResult: { unavailable: 1 },
        nextRetryAt: 1_000 + WATCH_METADATA_RETRY_BASE_MS,
      });

      // The service comes back; the retry fires without any import or restart.
      script.tmdbDown = false;
      script.tmdbMovie = match(tmdbMovieToWork(fixture('tmdb-movie-129.json')));
      await vi.advanceTimersByTimeAsync(WATCH_METADATA_RETRY_BASE_MS + 1);
      await vi.waitFor(() => expect(written).toHaveLength(1));
      await vi.waitFor(() => expect(watchLibraryMetadataStatus().running).toBe(false));
      expect(watchLibraryMetadataStatus()).toMatchObject({ lastResult: { filled: 1, unavailable: 0 }, nextRetryAt: null });
    } finally {
      cancelWatchLibraryMetadata();
      vi.useRealTimers();
    }
  });

  it('keeps the unanswered title eligible (its attempt is not recorded as "nothing found")', async () => {
    store.titles = [title('lb:boxd.it/down2', { title: 'Kiki', year: 1989 })];
    script.tmdbDown = true;
    await runWatchLibraryMetadata();
    cancelWatchLibraryMetadata();
    script.tmdbDown = false;
    await runWatchLibraryMetadata();
    cancelWatchLibraryMetadata();
    expect(asked.filter((entry) => entry.startsWith('tmdb:movie:Kiki'))).toHaveLength(2);
  });
});
