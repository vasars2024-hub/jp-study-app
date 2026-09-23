// @vitest-environment jsdom
//
// The media library's adapter onto the backend: editing a title's tracking (tracking an
// untracked title first, preparing subtitles when a show starts), and remembering the
// ingest arrivals that feed Just added and the download toast.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaIngestedEvent } from '../../shared/mediaIngest';
import type { MediaItem } from '../../shared/types';
import { updateGumTitle, useArrivals, WatchEditError, type ArrivalFeed } from '../components/media/gum/gumBackend';
import { GUM_JUST_ADDED_KEY } from '../components/media/gum/gumLayout';
import { buildGumTitles } from '../components/media/gum/gumModel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const episode = (id: string, n: number): MediaItem => ({
  id,
  title: id,
  path: `D:/show/${id}.mkv`,
  fileName: `${id}.mkv`,
  addedAt: 1,
  kind: 'video',
  category: 'tv',
  seriesKey: 'show',
  seriesTitle: 'Show',
  season: 1,
  episode: n,
} as MediaItem);

function untracked() {
  const [title] = buildGumTitles([], [episode('e1', 1), episode('e2', 2)]);
  return title;
}

function stub(overrides: Record<string, unknown> = {}) {
  const api = {
    watchAdd: vi.fn(async () => ({ ok: true, created: true, title: { id: 'manual:show' } })),
    watchUpdate: vi.fn(async () => ({ ok: true, title: {} })),
    prepareSubtitles: vi.fn(async () => ({ queued: 2 })),
    ...overrides,
  };
  (window as unknown as { api: typeof api }).api = api;
  return api;
}

describe('updateGumTitle', () => {
  it('tracks an untracked title from its first file, then applies the rest of the edit', async () => {
    const api = stub();
    await updateGumTitle(untracked(), { status: 'plan', score: 8 });
    expect(api.watchAdd).toHaveBeenCalledWith({ fromMediaItemId: 'e1', status: 'plan' });
    expect(api.watchUpdate).toHaveBeenCalledWith('manual:show', { score: 8 });
    expect(api.prepareSubtitles).not.toHaveBeenCalled();
  });

  it('prepares the next episodes\u2019 subtitles when a show is set to Watching', async () => {
    const api = stub();
    await updateGumTitle(untracked(), { status: 'watching' });
    expect(api.watchUpdate).not.toHaveBeenCalled();
    expect(api.prepareSubtitles).toHaveBeenCalledWith({ seriesKey: 'show', reason: 'watching' });
  });

  it('patches a tracked title directly and prepares subtitles on Watching', async () => {
    const api = stub();
    const title = { ...untracked(), watchId: 'mal:7', tracked: true };
    await updateGumTitle(title, { status: 'watching' });
    expect(api.watchAdd).not.toHaveBeenCalled();
    expect(api.watchUpdate).toHaveBeenCalledWith('mal:7', { status: 'watching' });
    expect(api.prepareSubtitles).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refused edit with the catalogue key main sent', async () => {
    stub({ watchUpdate: vi.fn(async () => ({ ok: false, error: 'gone', errorKey: 'watchLibrary.error.notFound' })) });
    const title = { ...untracked(), watchId: 'mal:7', tracked: true };
    await expect(updateGumTitle(title, { score: 3 })).rejects.toMatchObject({ errorKey: 'watchLibrary.error.notFound' });
    await expect(updateGumTitle(title, { score: 3 })).rejects.toBeInstanceOf(WatchEditError);
  });
});

describe('useArrivals', () => {
  let host: HTMLDivElement;
  let root: Root;
  let emit: ((event: MediaIngestedEvent) => void) | null = null;
  let feed: ArrivalFeed | null = null;

  function Probe() {
    feed = useArrivals();
    return null;
  }

  beforeEach(() => {
    localStorage.clear();
    (window as unknown as { api: Record<string, unknown> }).api = {
      onMediaIngested: (cb: (event: MediaIngestedEvent) => void) => {
        emit = cb;
        return () => { emit = null; };
      },
    };
    host = document.createElement('div');
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    emit = null;
    feed = null;
  });

  it('records an announced arrival, persists it, and raises it for the toast', async () => {
    await act(async () => root.render(createElement(Probe)));
    const event: MediaIngestedEvent = {
      source: 'qbittorrent',
      at: Date.now(),
      itemIds: ['a', 'b'],
      items: [],
      summary: { title: 'Frieren', count: 2, episode: 5, episodeEnd: 6 },
    };
    await act(async () => emit?.(event));
    expect(feed?.latest).toBe(event);
    expect(feed?.arrivals[0]).toMatchObject({ title: 'Frieren', itemIds: ['a', 'b'], episode: 5, episodeEnd: 6 });
    expect(JSON.parse(localStorage.getItem(GUM_JUST_ADDED_KEY) ?? '[]')).toHaveLength(1);
    await act(async () => feed?.dismiss());
    expect(feed?.latest).toBeNull();
  });

  it('ignores an empty announcement', async () => {
    await act(async () => root.render(createElement(Probe)));
    await act(async () => emit?.({ source: 'watch-folder', at: Date.now(), itemIds: [], items: [], summary: { title: '', count: 0 } }));
    expect(feed?.arrivals).toEqual([]);
    expect(feed?.latest).toBeNull();
  });
});
