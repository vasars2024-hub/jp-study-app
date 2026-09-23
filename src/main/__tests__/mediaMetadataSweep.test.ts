// @vitest-environment node
/**
 * The sweep end to end, per kind of title, with every provider scripted.
 *
 * TVmaze and TMDB works are built by the real mappers from the recorded
 * fixtures (`fixtures/metadata/`), so the shapes flowing through the sweep are
 * the ones the providers really answer with. No network: the provider modules
 * are replaced, and the in-memory host below stands in for `media.json`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';
import type { ProviderWork } from '../mediaProviderClients';
import type { MetadataMatch } from '../../shared/mediaMetadataMatch';

const sent: Array<{ channel: string; payload: unknown }> = [];

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
    }],
  },
  net: { request: () => undefined },
}));

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'metadata', name), 'utf8')) as T;

const match = (work: ProviderWork, confidence = 0.95): MetadataMatch<ProviderWork> =>
  ({ candidate: work, confidence, matchedTitle: work.displayTitle, reasons: [] });

/** What every provider answers this test; reset before each case. */
const script = {
  jikan: [] as ProviderWork[] | null,
  anilist: [] as ProviderWork[] | null,
  anilistByMal: null as ProviderWork | null,
  jikanById: null as ProviderWork | null,
  malEpisodes: {} as Record<string, { title?: string; airedAt?: number }>,
  tvmaze: { match: null, down: false } as { match: MetadataMatch<ProviderWork> | null; down: boolean },
  tvmazeById: null as ProviderWork | null,
  tvmazeSearch: [] as ProviderWork[],
  tmdbKey: false,
  tmdbMovie: { match: null, down: false } as { match: MetadataMatch<ProviderWork> | null; down: boolean },
  tmdbTv: { match: null, down: false } as { match: MetadataMatch<ProviderWork> | null; down: boolean },
  localArt: {} as { posterPath?: string; backdropPath?: string },
};
const calls = {
  jikanSearch: [] as string[],
  jikanById: [] as number[],
  tmdbMovie: [] as Array<{ title: string; year?: number | null }>,
  localArt: [] as Array<{ files: readonly string[] }>,
};

vi.mock('../mediaProviderClients', () => ({
  jikanSearch: async (title: string) => {
    calls.jikanSearch.push(title);
    return script.jikan;
  },
  anilistSearch: async () => script.anilist,
  jikanById: async (id: number) => {
    calls.jikanById.push(id);
    return script.jikanById;
  },
  anilistById: async () => null,
  anilistByMalId: async () => script.anilistByMal,
  jikanEpisodeInfo: async () => script.malEpisodes,
  // "Downloads" into a predictable relative path, like the real one returns.
  downloadArtwork: async (url: string, name: string) => (url ? `artwork/${name}.jpg` : null),
  artworkName: (prefix: string, key: string, work?: string) => `${prefix}-${key}-${encodeURIComponent(work ?? '')}`,
  clearMetadataCache: () => undefined,
}));
vi.mock('../providers/tvmaze', () => ({
  findTvmazeShow: async () => script.tvmaze,
  tvmazeSearch: async () => script.tvmazeSearch,
  tvmazeShowById: async () => script.tvmazeById,
}));
vi.mock('../providers/tmdb', () => ({
  findTmdbMovie: async (target: { title: string; year?: number | null }) => {
    calls.tmdbMovie.push(target);
    return script.tmdbKey ? script.tmdbMovie : { match: null, down: true };
  },
  findTmdbTv: async () => (script.tmdbKey ? script.tmdbTv : { match: null, down: true }),
  tmdbAvailable: () => script.tmdbKey,
  tmdbMovieById: async () => null,
  tmdbSearchMovie: async () => (script.tmdbKey ? [] : null),
}));
vi.mock('../watchLibraryMetadata', () => ({
  cancelWatchLibraryMetadata: () => undefined,
  registerWatchLibraryMetadata: () => undefined,
  scheduleWatchLibraryMetadata: () => undefined,
}));
vi.mock('../mediaArtwork', () => ({
  findLocalArtwork: async (request: { files: readonly string[] }) => {
    calls.localArt.push(request);
    return script.localArt;
  },
}));

const { registerMediaMetadataIpc, runMediaMetadata, searchMediaMetadata } = await import('../mediaMetadata');
const realTvmaze = await vi.importActual<typeof import('../providers/tvmaze')>('../providers/tvmaze');
const realTmdb = await vi.importActual<typeof import('../providers/tmdb')>('../providers/tmdb');

const hanzawa = (): ProviderWork => realTvmaze.tvmazeToWork(fixture('tvmaze-singlesearch-hanzawa.json'));
const frierenTv = (): ProviderWork => realTvmaze.tvmazeToWork(fixture('tvmaze-singlesearch-frieren.json'));
const spiritedAway = (): ProviderWork => realTmdb.tmdbMovieToWork(fixture('tmdb-movie-129.json'));

const frierenMal = (): ProviderWork => ({
  provider: 'jikan',
  id: 52991,
  malId: 52991,
  titles: ['Sousou no Frieren', "Frieren: Beyond Journey's End", '葬送のフリーレン'],
  displayTitle: "Frieren: Beyond Journey's End",
  nativeTitle: '葬送のフリーレン',
  synopsis: 'During their decade-long quest…',
  year: 2023,
  format: 'TV',
  episodeCount: 28,
  posterUrl: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  animation: true,
});
const frierenAnilist = (): ProviderWork => ({
  provider: 'anilist',
  id: 154587,
  anilistId: 154587,
  malId: 52991,
  titles: ['Sousou no Frieren'],
  displayTitle: "Frieren: Beyond Journey's End",
  posterUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587.jpg',
  bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587.jpg',
  runtimeMin: 24,
  animation: true,
});

// ---- the in-memory library ------------------------------------------------

let items: MediaItem[] = [];
const patches: Array<Partial<MediaItem>> = [];

function host(): void {
  registerMediaMetadataIpc({
    listItems: () => items.map((item) => ({ ...item })),
    patchItems: (ids, patch) => {
      patches.push(patch);
      items = items.map((item) => (ids.includes(item.id) ? { ...item, ...patch } : item));
    },
    patchEachItem: (entries) => {
      const byId = new Map(entries);
      items = items.map((item) => (byId.has(item.id) ? { ...item, ...byId.get(item.id) } : item));
    },
  });
}

const file = (id: string, extra: Partial<MediaItem>): MediaItem => ({
  id,
  title: extra.seriesTitle ?? id,
  path: `C:/lib/${id}.mkv`,
  fileName: `${id}.mkv`,
  addedAt: 1,
  kind: 'video',
  episodeKind: 'episode',
  ...extra,
});

const byId = (id: string): MediaItem | undefined => items.find((item) => item.id === id);
const updates = () => sent.filter((entry) => entry.channel === 'media:metadataUpdated').map((entry) => entry.payload);

beforeEach(() => {
  Object.assign(script, {
    jikan: [], anilist: [], anilistByMal: null, jikanById: null, malEpisodes: {},
    tvmaze: { match: null, down: false }, tvmazeById: null, tvmazeSearch: [],
    tmdbKey: false, tmdbMovie: { match: null, down: false }, tmdbTv: { match: null, down: false },
    localArt: {},
  });
  for (const list of Object.values(calls)) list.length = 0;
  patches.length = 0;
  sent.length = 0;
  items = [];
  host();
});

describe('anime', () => {
  it('enriches a MyAnimeList match from AniList by MAL id, and takes stills from TVmaze', async () => {
    items = [1, 2].map((n) => file(`f${n}`, {
      category: 'anime', seriesKey: 'sousou no frieren', seriesTitle: 'Sousou no Frieren', episode: n,
      fileName: `[SubsPlease] Sousou no Frieren - 0${n} (1080p).mkv`,
    }));
    script.jikan = [frierenMal()];
    script.anilistByMal = frierenAnilist();
    script.tvmaze = { match: match(frierenTv()), down: false };
    script.malEpisodes = { 1: { title: "The Journey's End", airedAt: 1_695_988_800_000 }, 2: { title: 'It Didn’t Have to Be Magic…' } };

    const result = await runMediaMetadata({});
    expect(result).toMatchObject({ ok: true, matched: 1 });

    const first = byId('f1');
    expect(first).toMatchObject({
      metadataSource: 'jikan',
      malId: 52991,
      anilistId: 154587,
      tvmazeId: 69956,
      runtimeMin: 24,
      category: 'anime',
      episodeTitles: { 1: "The Journey's End", 2: 'It Didn’t Have to Be Magic…' },
    });
    // AniList's cover replaces MyAnimeList's smaller one; the banner is AniList's.
    expect(first?.posterPath).toMatch(/^artwork\/poster-/);
    expect(first?.bannerPath).toMatch(/^artwork\/banner-/);
    expect(first?.backdropPath).toMatch(/^artwork\/backdrop-/);
    expect(first?.metadataAttempt?.providers).toEqual(['jikan', 'anilist', 'tvmaze']);
    // Per file: its own still, and MAL's air date where MAL has one.
    expect(first?.stillPath).toMatch(/^artwork\/still-/);
    expect(byId('f2')?.stillPath).toMatch(/^artwork\/still-/);
    expect(byId('f2')?.stillPath).not.toBe(first?.stillPath);
    expect(first?.airedAt).toBe(1_695_988_800_000);
    // The guide is MyAnimeList's numbering, which is the files' numbering.
    expect(first?.episodeGuide?.map((entry) => entry.number)).toEqual([1, 2]);

    expect(updates()).toEqual([{ ids: ['f1', 'f2'], artwork: true }]);
  });
});

describe('TV and drama', () => {
  it('finds a fansubbed J-drama on TVmaze and moves it from anime to drama', async () => {
    items = [file('d1', {
      category: 'anime', seriesKey: 'hanzawa naoki', seriesTitle: 'Hanzawa Naoki', episode: 1,
      fileName: '[JDramaSubs] Hanzawa Naoki - 01.mkv',
    })];
    script.tvmaze = { match: match(hanzawa(), 0.97), down: false };

    await runMediaMetadata({});
    const item = byId('d1');
    expect(item).toMatchObject({
      metadataSource: 'tvmaze',
      category: 'drama',
      tvmazeId: 13017,
      imdbId: 'tt2930136',
      network: 'TBS',
      year: 2013,
      seriesTitle: 'Naoki Hanzawa',
    });
    expect(item?.episodeGuide).toHaveLength(20);
    expect(item?.episodeTitles?.['1']).toMatch(/^Payback in twofold/);
    expect(item?.airedAt).toBe(Date.parse('2013-07-07T03:00:00+00:00'));
    // TVmaze's background is the hero when there is no banner strip.
    expect(item?.bannerPath).toBe(item?.backdropPath);
    expect(item?.posterPath).toMatch(/^artwork\/poster-/);
  });

  it('hands a scene-named anime found on TVmaze to MyAnimeList and files it as anime', async () => {
    items = [file('s1', {
      category: 'tv', seriesKey: 'frieren', seriesTitle: 'Frieren', season: 1, episode: 1,
      fileName: 'Frieren.S01E01.1080p.WEB.H264.mkv',
    })];
    script.tvmaze = { match: match(frierenTv()), down: false };
    script.jikan = [frierenMal()];
    script.anilistByMal = frierenAnilist();

    await runMediaMetadata({});
    const item = byId('s1');
    expect(item).toMatchObject({ metadataSource: 'jikan', malId: 52991, anilistId: 154587, tvmazeId: 69956, category: 'anime' });
    expect(item?.stillPath).toMatch(/^artwork\/still-/);
  });
});

describe('films', () => {
  const film = (): MediaItem => file('m1', {
    category: 'movie', seriesKey: 'spirited away', seriesTitle: 'spirited away', episodeKind: 'movie',
    path: 'D:/Films/Spirited Away (2001)/spirited.away.1080p.bluray.mkv',
    fileName: 'spirited.away.1080p.bluray.mkv',
  });

  it('without a key: local art and an attempt, and no claim about the title', async () => {
    items = [film()];
    script.localArt = { posterPath: 'artwork/local-poster-abc.jpg' };

    await runMediaMetadata({});
    const item = byId('m1');
    expect(calls.jikanSearch).toEqual([]);
    expect(calls.localArt[0]?.files).toEqual(['D:/Films/Spirited Away (2001)/spirited.away.1080p.bluray.mkv']);
    expect(item?.metadataSource).toBeUndefined();
    expect(item?.posterPath).toBe('artwork/local-poster-abc.jpg');
    expect(item?.metadataAttempt).toMatchObject({ category: 'movie', providers: [] });
    expect(updates()).toEqual([{ ids: ['m1'], artwork: true }]);

    // Resting: a second sweep asks nothing and writes nothing.
    patches.length = 0;
    await runMediaMetadata({});
    expect(patches).toEqual([]);
  });

  it('adding a TMDB key re-opens the film, looked up by its folder title and year', async () => {
    items = [{ ...film(), metadataAttempt: { at: Date.now(), category: 'movie', providers: [] }, posterPath: 'artwork/local-poster-abc.jpg' }];
    script.tmdbKey = true;
    script.tmdbMovie = { match: match(spiritedAway(), 0.98), down: false };

    await runMediaMetadata({});
    expect(calls.tmdbMovie[0]).toMatchObject({ title: 'Spirited Away', year: 2001 });
    const item = byId('m1');
    expect(item).toMatchObject({
      metadataSource: 'tmdb',
      tmdbId: 129,
      tmdbType: 'movie',
      imdbId: 'tt0245429',
      runtimeMin: 125,
      year: 2001,
      genres: ['Animation', 'Family', 'Fantasy'],
      nativeTitle: '千と千尋の神隠し',
    });
    expect(item?.posterPath).toMatch(/^artwork\/poster-/);
    expect(item?.backdropPath).toMatch(/^artwork\/backdrop-/);
    expect(item?.bannerPath).toBe(item?.backdropPath);
  });

  it('moves an inbox file inside a `Title (Year)` folder to movie', async () => {
    items = [{ ...film(), category: 'inbox', episodeKind: undefined }];
    await runMediaMetadata({});
    expect(byId('m1')?.category).toBe('movie');
  });
});

describe('retrying and topping up', () => {
  const stamped = (ago: number): MediaItem => file('u1', {
    category: 'anime', seriesKey: 'obscure', seriesTitle: 'Obscure', episode: 1,
    metadataSource: 'unmatched',
    metadataUpdatedAt: Date.now() - ago,
    metadataAttempt: { at: Date.now() - ago, category: 'anime', providers: ['jikan', 'anilist', 'tvmaze'] },
  });

  it('lets an unmatched title rest, then asks again after the window', async () => {
    items = [stamped(24 * 60 * 60 * 1000)];
    await runMediaMetadata({});
    expect(calls.jikanSearch).toEqual([]);

    items = [stamped(8 * 24 * 60 * 60 * 1000)];
    await runMediaMetadata({});
    expect(calls.jikanSearch).toEqual(['Obscure']);
  });

  it('tops up a legacy match by its MAL id, filling only what is missing', async () => {
    items = [file('l1', {
      category: 'anime', seriesKey: 'sousou no frieren', seriesTitle: 'Sousou no Frieren', episode: 1,
      metadataSource: 'jikan', metadataUpdatedAt: 1, metadataConfidence: 0.95, malId: 52991,
      synopsis: 'The synopsis the user has been reading.', posterPath: 'artwork/old-poster.jpg',
      episodeTitles: { 1: 'Existing' },
    })];
    script.jikanById = frierenMal();
    script.anilistByMal = frierenAnilist();

    await runMediaMetadata({});
    expect(calls.jikanSearch).toEqual([]);
    expect(calls.jikanById).toEqual([52991]);
    const item = byId('l1');
    expect(item).toMatchObject({
      anilistId: 154587,
      synopsis: 'The synopsis the user has been reading.',
      posterPath: 'artwork/old-poster.jpg',
      metadataUpdatedAt: 1,
    });
    expect(item?.bannerPath).toMatch(/^artwork\/banner-/);
    expect(item?.metadataAttempt?.providers).toContain('tvmaze');
  });

  it('clears what the wrong match left behind when the user corrects it', async () => {
    items = [file('w1', {
      category: 'anime', seriesKey: 'hanzawa', seriesTitle: 'Hanzawa', episode: 1,
      metadataSource: 'jikan', metadataUpdatedAt: 1, malId: 999, anilistId: 888, studio: 'Wrong Studio',
      posterPath: 'artwork/wrong-poster.jpg', stillPath: 'artwork/wrong-still.jpg', episodeTitles: { 1: 'Wrong' },
    })];
    script.tvmazeById = hanzawa();
    await runMediaMetadata({ mediaIds: ['w1'], force: true, override: { provider: 'tvmaze', id: 13017 } });
    const item = byId('w1');
    expect(item?.tvmazeId).toBe(13017);
    expect(item?.malId).toBeUndefined();
    expect(item?.anilistId).toBeUndefined();
    expect(item?.studio).toBeUndefined();
    expect(item?.posterPath).toMatch(/^artwork\/poster-/);
    // Hanzawa's episodes have no stills: the wrong show's still must go.
    expect(item?.stillPath).toBeUndefined();
    expect(item?.episodeTitles?.['1']).toMatch(/^Payback in twofold/);
    expect(updates()).toEqual([{ ids: ['w1'], artwork: true }]);
  });

  it('stamps a manual correction and never re-searches it', async () => {
    items = [file('c1', { category: 'anime', seriesKey: 'hanzawa', seriesTitle: 'Hanzawa', episode: 1 })];
    script.tvmazeById = hanzawa();
    await runMediaMetadata({ mediaIds: ['c1'], force: true, override: { provider: 'tvmaze', id: 13017 } });
    expect(byId('c1')?.metadataAttempt?.manual).toBe(true);
    expect(byId('c1')?.metadataSource).toBe('tvmaze');

    patches.length = 0;
    await runMediaMetadata({});
    expect(patches).toEqual([]);
    expect(calls.jikanSearch).toEqual([]);
  });
});

describe('searchMediaMetadata', () => {
  it('returns one ranked list across providers, with no remote image the CSP would block', async () => {
    script.jikan = [frierenMal()];
    script.tvmazeSearch = [hanzawa()];
    const hits = await searchMediaMetadata('Hanzawa Naoki');
    expect(Array.isArray(hits)).toBe(true);
    expect(hits[0]).toMatchObject({ provider: 'tvmaze', id: 13017, mediaKind: 'tv', imageUrl: undefined });
    expect(hits.find((hit) => hit.provider === 'jikan')?.imageUrl).toMatch(/myanimelist/);
  });
});
