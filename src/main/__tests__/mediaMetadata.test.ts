// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { __mediaMetadataTestables, mediaMetadataRunning, registerMediaMetadataIpc, runMediaMetadata } from '../mediaMetadata';
import type { MediaItem } from '../../shared/types';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  net: { request: () => undefined },
}));

/**
 * What the two search providers answer this test.
 *
 * `null` and `[]` are different answers and the whole point of the outage cases
 * below: `null` means the provider never responded, `[]` means it responded with
 * nothing. Defaults to `[]`/`[]` so every pre-existing case behaves as before.
 */
const providerScript: { jikan: unknown[] | null; anilist: unknown[] | null } = { jikan: [], anilist: [] };

// Stub the provider clients: this file tests grouping, backfill decisions and the
// concurrency guard, none of which should wait on real HTTP retry backoff.
vi.mock('../mediaProviderClients', () => ({
  jikanSearch: async () => providerScript.jikan,
  anilistSearch: async () => providerScript.anilist,
  jikanById: async () => null,
  anilistById: async () => null,
  jikanEpisodeInfo: async () => ({}),
  downloadArtwork: async () => null,
  artworkName: (prefix: string, key: string) => `${prefix}-${key}`,
  clearMetadataCache: () => undefined,
}));

const { groupTitles, alreadyFetched, needsEpisodeBackfill } = __mediaMetadataTestables;

const ep = (n: number, extra: Partial<MediaItem> = {}): MediaItem => ({
  id: `e${n}`,
  title: `The Big O - 0${n}`,
  fileName: `The Big O - 0${n}.mkv`,
  path: `C:/x/${n}.mkv`,
  addedAt: n,
  category: 'anime',
  seriesKey: 'the big o',
  seriesTitle: 'The Big O',
  episode: n,
  episodeKind: 'episode',
  ...extra,
});

describe('groupTitles', () => {
  it('collapses a series into one lookup rather than one per file', () => {
    const groups = groupTitles([ep(1), ep(2), ep(3)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toHaveLength(3);
    expect(groups[0].title).toBe('The Big O');
    expect(groups[0].episodeCount).toBe(3);
  });

  it('skips categories with no provider worth asking', () => {
    expect(groupTitles([ep(1, { category: 'music' })])).toEqual([]);
    expect(groupTitles([ep(1, { category: 'personal' })])).toEqual([]);
  });

  it('skips files with no parsed series key', () => {
    expect(groupTitles([ep(1, { seriesKey: undefined })])).toEqual([]);
  });

  it('honours an explicit id restriction', () => {
    const groups = groupTitles([ep(1), ep(2)], new Set(['e1']));
    expect(groups[0].ids).toEqual(['e1']);
  });
});

describe('alreadyFetched', () => {
  it('is true only once a series carries both a source and a timestamp', () => {
    const group = groupTitles([ep(1)])[0];
    expect(alreadyFetched([ep(1)], group)).toBe(false);
    expect(alreadyFetched([ep(1, { metadataSource: 'jikan' })], group)).toBe(false);
    expect(alreadyFetched([ep(1, { metadataSource: 'jikan', metadataUpdatedAt: 1 })], group)).toBe(true);
  });
});

describe('needsEpisodeBackfill', () => {
  const group = groupTitles([ep(1)])[0];
  const matched = (extra: Partial<MediaItem> = {}): MediaItem[] =>
    [ep(1, { metadataSource: 'anilist', metadataUpdatedAt: 1, malId: 567, ...extra })];

  it('catches the outage case: matched via AniList, no episode titles', () => {
    // The regression this guards. Jikan 504s, AniList answers (and supplies a MAL
    // id), the series is stamped as fetched — and without this it would never get
    // its episode titles again, because a non-forced sweep skips it forever.
    expect(needsEpisodeBackfill(matched(), group)).toBe(true);
  });

  it('is done once titles are present', () => {
    expect(needsEpisodeBackfill(matched({ episodeTitles: { '1': 'Roger Smith' } }), group)).toBe(false);
  });

  it('needs a MyAnimeList id, the only source of episode titles', () => {
    expect(needsEpisodeBackfill(matched({ malId: undefined }), group)).toBe(false);
  });

  it('does not top up an unmatched or unswept series', () => {
    expect(needsEpisodeBackfill(matched({ metadataSource: 'unmatched' }), group)).toBe(false);
    expect(needsEpisodeBackfill([ep(1, { malId: 567 })], group)).toBe(false);
  });
});

describe('sweep concurrency', () => {
  it('rejects a second sweep started before the first has settled', async () => {
    // The regression: the flag used to be set *after* the backfill pass, which
    // awaits. A second caller could slip between the guard and the flag and run
    // the same rate-limited provider requests twice over.
    registerMediaMetadataIpc({
      listItems: () => [ep(1)],
      patchItems: () => undefined,
      patchEachItem: () => undefined,
    });

    const first = runMediaMetadata({});
    const second = await runMediaMetadata({});
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already running/i);
    await first;
  });

  it('clears the flag once the sweep settles, so later sweeps still run', async () => {
    registerMediaMetadataIpc({
      listItems: () => [ep(1)],
      patchItems: () => undefined,
      patchEachItem: () => undefined,
    });
    await runMediaMetadata({});
    expect(mediaMetadataRunning()).toBe(false);
    expect((await runMediaMetadata({})).ok).toBe(true);
  });
});

/**
 * An outage must not be written down as "this title does not exist".
 *
 * This path's stamp is PERMANENT — `alreadyFetched` returns true once
 * `metadataSource` and `metadataUpdatedAt` are both set, `needsEpisodeBackfill`
 * explicitly excludes `'unmatched'`, and there is no `retryAfterDays` here at
 * all. So a minute of provider downtime cost the title its AniList id for good,
 * and without that id every later Jimaku subtitle search for it drops from an
 * exact id match to a title match, silently.
 *
 * `jikanSearch`'s own doc already recorded the measurement (Jikan at 504,
 * AniList at 403, on 2026-08-16) and kept the `null`-versus-`[]` contract;
 * `searchProviders` was throwing it away one layer up.
 */
describe('a provider outage is not a fact about the title', () => {
  const patchesFor = async (jikan: unknown[] | null, anilist: unknown[] | null) => {
    providerScript.jikan = jikan;
    providerScript.anilist = anilist;
    const patches: Record<string, unknown>[] = [];
    registerMediaMetadataIpc({
      listItems: () => [ep(1)],
      patchItems: (_ids, patch) => { patches.push(patch as Record<string, unknown>); },
      patchEachItem: () => undefined,
    });
    await runMediaMetadata({});
    providerScript.jikan = [];
    providerScript.anilist = [];
    return patches;
  };

  it('does not stamp unmatched when neither provider answered', async () => {
    expect(await patchesFor(null, null)).toEqual([]);
  });

  it('does not stamp unmatched when the fallback provider is the one that is down', async () => {
    // Jikan answering "nothing" is not a settled answer while AniList — the very
    // provider that exists to carry what MyAnimeList lacks — never replied.
    expect(await patchesFor([], null)).toEqual([]);
  });

  it('still stamps unmatched when both providers answered and had nothing', async () => {
    // The negative control, and the reason the two above mean anything: if the
    // guard were simply "never stamp", the sweep would re-ask a genuinely absent
    // title on every pass forever, which is the behaviour the stamp exists to stop.
    const patches = await patchesFor([], []);
    expect(patches).toHaveLength(1);
    expect(patches[0].metadataSource).toBe('unmatched');
  });
});
