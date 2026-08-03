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

// Stub the provider clients: this file tests grouping, backfill decisions and the
// concurrency guard, none of which should wait on real HTTP retry backoff.
vi.mock('../mediaProviderClients', () => ({
  jikanSearch: async () => [],
  anilistSearch: async () => [],
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
