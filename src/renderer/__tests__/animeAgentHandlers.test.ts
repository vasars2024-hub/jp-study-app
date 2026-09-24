// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MergedMediaResult } from '../../shared/mediaResultPresentation';

const merged = vi.fn<() => MergedMediaResult[]>(() => []);
vi.mock('../../shared/mediaResultPresentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/mediaResultPresentation')>();
  return { ...actual, mergeStoredMediaResults: () => merged() };
});

const resolveMedia = vi.fn();
const analyzeSubtitles = vi.fn();
vi.mock('../mediaAgentHandlers', () => ({
  resolveMedia: (...args: unknown[]) => resolveMedia(...args),
  analyzeSubtitles: (...args: unknown[]) => analyzeSubtitles(...args),
}));

import { createEmptyMediaTrackingDocument } from '../../shared/mediaTracking';
import { createAnimeAgentHandlers } from '../animeAgentHandlers';
import {
  loadMediaTrackingDocument,
  saveMediaTrackingDocument,
  upsertMediaTrackingEntry,
} from '../mediaTrackingStore';

const t = (key: string): string => key;
const handlers = () => createAnimeAgentHandlers(t);

const result = (patch: Partial<MergedMediaResult> & { identityId: string; title: string }): MergedMediaResult => ({
  partition: 'p',
  contentType: 'anime',
  originalTitle: null,
  japaneseTitle: null,
  chineseTitle: null,
  koreanTitle: null,
  romajiTitle: null,
  year: null,
  studio: null,
  director: null,
  episodeCount: null,
  broadcastNetwork: null,
  episodesPerWeek: null,
  country: null,
  runtimeMinutes: null,
  ageRating: null,
  alternativeTitles: [],
  actors: [],
  languages: [],
  releaseRegions: [],
  identifiers: [],
  availability: 'unknown',
  sourceCount: 1,
  sources: [],
  ...patch,
} as unknown as MergedMediaResult);

beforeEach(() => {
  localStorage.clear();
  // `localStorage.clear()` alone does NOT reset this store: it keeps a
  // module-level `memoryFallback` and returns it whenever the key is absent, so
  // a cleared storage reads back as the last document written. Writing an empty
  // one is what actually resets it.
  saveMediaTrackingDocument(createEmptyMediaTrackingDocument());
  resolveMedia.mockReset();
  analyzeSubtitles.mockReset();
  merged.mockReset().mockReturnValue([
    result({ identityId: 'a-1', title: 'Snow Bound', japaneseTitle: '雪の絆', year: 2021, episodeCount: 12 }),
    result({ identityId: 'a-2', title: 'Harbour Lights' }),
    result({ identityId: 'd-1', title: 'A Drama', contentType: 'jdrama' } as never),
  ]);
});

describe('anime.search', () => {
  it('joins the local catalogue with the tracking record and marks which are tracked', async () => {
    upsertMediaTrackingEntry('a-1', 'anime', { status: 'watching', favorite: true });

    const found = await handlers()['anime.search']?.({ query: 'snow' }) as {
      catalogue: number;
      tracked: number;
      anime: Array<{ identityId: string; tracked: boolean; tracking?: { status: string } }>;
    };

    expect(found.catalogue).toBe(2);
    expect(found.tracked).toBe(1);
    expect(found.anime).toHaveLength(1);
    expect(found.anime[0]).toMatchObject({ identityId: 'a-1', tracked: true });
    expect(found.anime[0].tracking?.status).toBe('watching');
  });

  it('never returns a non-anime title from the shared catalogue', async () => {
    const all = await handlers()['anime.search']?.({}) as {
      anime: Array<{ identityId: string }>;
    };
    // Title order, which is what `presentStoredMediaResults` applies without a query.
    expect(all.anime.map((row) => row.identityId)).toEqual(['a-2', 'a-1']);
  });

  it('still lists a tracked record whose catalogue entry has gone', async () => {
    upsertMediaTrackingEntry('gone-1', 'anime', { status: 'watching' });

    const all = await handlers()['anime.search']?.({}) as {
      anime: Array<{ identityId: string; catalogueEntryMissing?: boolean }>;
    };

    const orphan = all.anime.find((row) => row.identityId === 'gone-1');
    expect(orphan).toMatchObject({ catalogueEntryMissing: true, tracked: true });
  });

  it('filters to a tracking status', async () => {
    upsertMediaTrackingEntry('a-1', 'anime', { status: 'watching' });
    upsertMediaTrackingEntry('a-2', 'anime', { status: 'completed' });

    const watching = await handlers()['anime.search']?.({ status: 'watching' }) as {
      anime: Array<{ identityId: string }>;
    };
    expect(watching.anime.map((row) => row.identityId)).toEqual(['a-1']);
  });
});

/**
 * A stand-in for main's watch library (`window.api.watchAdd` / `watchUpdate` /
 * `watchList`), the app's one tracking store. `anime.track` used to write the
 * old `jp-media-tracking-v1` localStorage document instead, so an anime the
 * Agent tracked never appeared in the library the rest of the app reads.
 */
interface FakeWatchTitle {
  id: string;
  kind: string;
  title: string;
  originalTitle?: string;
  status: string;
  score?: number;
  favorite?: boolean;
  notes?: string;
  progress?: number;
  episodeCount?: number;
  malId?: number;
  altTitles?: string[];
  updatedAt: number;
}

let watchTitles: FakeWatchTitle[] = [];
const watchCalls: Array<[string, unknown]> = [];

function installWatchLibrary(): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    watchList: async (query: { search?: string }) => {
      watchCalls.push(['watchList', query]);
      return { total: watchTitles.length, offset: 0, items: watchTitles.map((title) => ({ ...title })), facets: {} };
    },
    watchAdd: async (input: Record<string, unknown>) => {
      watchCalls.push(['watchAdd', input]);
      const title: FakeWatchTitle = {
        id: `w-${watchTitles.length + 1}`,
        kind: String(input.kind),
        title: String(input.title),
        status: String(input.status ?? 'plan'),
        ...(typeof input.episodeCount === 'number' ? { episodeCount: input.episodeCount } : {}),
        ...(typeof input.malId === 'number' ? { malId: input.malId } : {}),
        ...(typeof input.originalTitle === 'string' ? { originalTitle: input.originalTitle } : {}),
        updatedAt: 1,
      };
      watchTitles.push(title);
      return { ok: true, created: true, title: { ...title } };
    },
    watchUpdate: async (id: string, patch: Record<string, unknown>) => {
      watchCalls.push(['watchUpdate', { id, patch }]);
      const title = watchTitles.find((entry) => entry.id === id);
      if (!title) return { ok: false, error: 'not found', errorKey: 'watchLibrary.error.notFound' };
      Object.assign(title, patch, { updatedAt: title.updatedAt + 1 });
      return { ok: true, title: { ...title } };
    },
  };
}

describe('anime.track', () => {
  beforeEach(() => {
    watchTitles = [];
    watchCalls.length = 0;
    installWatchLibrary();
  });

  it('adds a planned title to the watch library, not the old tracking document', async () => {
    const created = await handlers()['anime.track']?.({ identityId: 'Snow Bound' }) as {
      created: boolean;
      identityId: string;
      watchTitleId: string;
      status: string;
    };

    expect(created).toMatchObject({ created: true, identityId: 'a-1', watchTitleId: 'w-1', status: 'plan' });
    expect(watchCalls.find(([name]) => name === 'watchAdd')?.[1]).toMatchObject({
      kind: 'anime',
      title: 'Snow Bound',
      originalTitle: '雪の絆',
      year: 2021,
      episodeCount: 12,
      status: 'plan',
    });
    // The legacy localStorage store is no longer written at all.
    expect(loadMediaTrackingDocument().records).toEqual([]);
  });

  it('does not re-report an existing title as created, and keeps its status', async () => {
    watchTitles.push({ id: 'w-9', kind: 'anime', title: 'Snow Bound', status: 'watching', updatedAt: 1 });

    const again = await handlers()['anime.track']?.({ identityId: 'a-1' }) as {
      created: boolean;
      status: string;
      watchTitleId: string;
    };

    expect(again).toMatchObject({ created: false, status: 'watching', watchTitleId: 'w-9' });
    expect(watchCalls.some(([name]) => name === 'watchAdd')).toBe(false);
  });

  it('maps a status change and records watched episodes as progress', async () => {
    watchTitles.push({ id: 'w-9', kind: 'anime', title: 'Snow Bound', status: 'plan', progress: 1, updatedAt: 1 });

    const tracked = await handlers()['anime.track']?.({
      identityId: 'a-1',
      status: 'on-hold',
      watchedEpisodes: [1, 2, { season: 1, episode: 3 }],
    }) as { status: string; progress: { watched: number } };

    expect(tracked).toMatchObject({ status: 'on_hold', progress: { watched: 3 } });
    expect(watchCalls.find(([name]) => name === 'watchUpdate')?.[1]).toEqual({
      id: 'w-9',
      patch: { status: 'on_hold', progress: 3 },
    });
  });

  it('never writes an airing date: main fetches those', async () => {
    await handlers()['anime.track']?.({ identityId: 'a-1', status: 'watching' });
    const written = JSON.stringify(watchCalls.filter(([name]) => name !== 'watchList'));
    expect(written).not.toContain('nextAirDate');
    expect(written).not.toContain('schedule');
  });

  it('refuses an identity the local catalogue does not know', async () => {
    await expect(handlers()['anime.track']?.({ identityId: 'Not In Catalogue' }))
      .rejects.toThrow('blanc.agent.error.animeNotFound');
    expect(watchCalls.some(([name]) => name === 'watchAdd')).toBe(false);
  });
});

describe('anime.check-releases', () => {
  it('reads the stored schedule and never reports a fetch time', async () => {
    upsertMediaTrackingEntry('a-1', 'anime', {
      status: 'watching',
      schedule: { status: 'airing', nextEpisodeNumber: 5, nextAirDate: '2026-08-14' },
    });

    const releases = await handlers()['anime.check-releases']?.({}) as {
      checkedAt: null;
      tracked: number;
      releases: Array<{ identityId: string; nextEpisodeNumber: number; title: string }>;
    };

    expect(releases.checkedAt).toBeNull();
    expect(releases.tracked).toBe(1);
    expect(releases.releases[0]).toMatchObject({
      identityId: 'a-1',
      title: 'Snow Bound',
      nextEpisodeNumber: 5,
    });
  });
});

describe('anime.update-metadata', () => {
  beforeEach(() => {
    watchTitles = [];
    watchCalls.length = 0;
    installWatchLibrary();
  });

  it('patches only what it was given, in the library, and reads the answer back', async () => {
    watchTitles.push({ id: 'w-1', kind: 'anime', title: 'Snow Bound', status: 'watching', score: 4, updatedAt: 1 });

    const updated = await handlers()['anime.update-metadata']?.({
      identityId: 'a-1',
      rating: 88,
      notes: 'strong second cour',
    }) as { updated: string[]; rating: number; status: string };

    expect(updated.updated.sort()).toEqual(['notes', 'rating']);
    expect(updated.rating).toBe(88);
    expect(updated.status).toBe('watching');
    expect(watchTitles[0]).toMatchObject({ score: 8.8, notes: 'strong second cour' });
  });

  it('clamps a rating instead of storing it out of range', async () => {
    watchTitles.push({ id: 'w-1', kind: 'anime', title: 'Snow Bound', status: 'plan', updatedAt: 1 });
    const updated = await handlers()['anime.update-metadata']?.({ identityId: 'a-1', rating: 900 }) as {
      rating: number;
    };
    expect(updated.rating).toBe(100);
  });

  it('refuses a schedule by name: airing dates come from main', async () => {
    watchTitles.push({ id: 'w-1', kind: 'anime', title: 'Snow Bound', status: 'watching', updatedAt: 1 });
    const updated = await handlers()['anime.update-metadata']?.({
      identityId: 'a-1',
      favorite: true,
      schedule: { nextAirDate: '2026-10-01' },
    }) as { updated: string[]; ignored: string[] };
    expect(updated).toMatchObject({ updated: ['favorite'], ignored: ['schedule'] });
    expect(JSON.stringify(watchCalls)).not.toContain('2026-10-01');
  });

  it('refuses an untracked anime and an empty patch', async () => {
    await expect(handlers()['anime.update-metadata']?.({ identityId: 'a-1', rating: 5 }))
      .rejects.toThrow('blanc.agent.error.animeNotTracked');

    watchTitles.push({ id: 'w-1', kind: 'anime', title: 'Snow Bound', status: 'plan', updatedAt: 1 });
    await expect(handlers()['anime.update-metadata']?.({ identityId: 'a-1' }))
      .rejects.toThrow('blanc.agent.error.nothingToUpdate');
  });
});

describe('anime.analyze-difficulty', () => {
  it('reaches the subtitles through the media library, reusing the media analysis', async () => {
    upsertMediaTrackingEntry('a-1', 'anime', { status: 'watching' });
    resolveMedia.mockResolvedValue({ id: 'm-9', title: 'Snow Bound' });
    analyzeSubtitles.mockResolvedValue({
      record: { id: 's-ja', lang: 'ja', source: 'sidecar' },
      cueCount: 40,
      analysis: {
        vocabulary: [{ word: '雪' }],
        kanji: [{ character: '雪' }],
        truncated: false,
        level: { scheme: 'jlpt', label: 'N3', confidence: 0.9, metThreshold: true },
        comprehensibility: { score: 0.7 },
        grammar: [{ id: 'te-form' }],
      },
    });

    const result_ = await handlers()['anime.analyze-difficulty']?.({ identityId: 'a-1' }) as {
      identityId: string;
      mediaId: string;
      cues: number;
      level: { label: string };
    };

    // The tracked TITLE is what identifies the media item when no mediaId is given.
    expect(resolveMedia.mock.calls[0][1]).toBe('Snow Bound');
    expect(result_).toMatchObject({ identityId: 'a-1', mediaId: 'm-9', cues: 40 });
    expect(result_.level.label).toBe('N3');
  });

  it('prefers an explicit mediaId over the tracked title', async () => {
    resolveMedia.mockResolvedValue({ id: 'm-3', title: 'Episode 3' });
    analyzeSubtitles.mockResolvedValue({
      record: { id: 's', lang: 'ja', source: 'sidecar' },
      cueCount: 1,
      analysis: {
        vocabulary: [], kanji: [], truncated: false, level: null,
        comprehensibility: {}, grammar: [],
      },
    });

    await handlers()['anime.analyze-difficulty']?.({ identityId: 'a-1', mediaId: 'm-3' });

    expect(resolveMedia.mock.calls[0][1]).toBe('m-3');
  });
});

describe('anime.fetch-external-metadata', () => {
  it('bounds the window it asks for and surfaces a schedule error', async () => {
    const calls: unknown[] = [];
    (window as unknown as { api: Record<string, unknown> }).api = {
      animeSchedule: async (input: unknown) => {
        calls.push(input);
        return {
          rows: [{ id: 'r1' }],
          summary: { total: 1 },
          scheduleError: null,
          scheduleTotal: 9,
          fetchedAt: 1234,
        };
      },
    };

    const fetched = await handlers()['anime.fetch-external-metadata']?.({ days: 999 }) as {
      days: number;
      returned: number;
      available: number;
    };

    expect(fetched).toMatchObject({ days: 31, returned: 1, available: 9 });
    const request = calls[0] as { from: number; to: number; limit: number };
    expect(request.to - request.from).toBe(31 * 86_400);
    expect(request.limit).toBe(50);
  });

  it('throws the schedule error rather than returning an empty success', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {
      animeSchedule: async () => ({
        rows: [],
        summary: {},
        scheduleError: 'catalogue unreachable',
        scheduleTotal: 0,
        fetchedAt: 1,
      }),
    };

    await expect(handlers()['anime.fetch-external-metadata']?.({}))
      .rejects.toThrow('catalogue unreachable');
  });
});
