// @vitest-environment jsdom
/**
 * Bug 22: no check that the song was still current after `await fetchLyrics`,
 * so skipping during a lookup showed the previous song's lyrics, and each of
 * the four mounted consumers sent its own request.
 *
 * The network is a hand-resolved deferred per call, so every ordering of
 * "skip" and "answer arrives" is driven explicitly.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';
import type { LyricsResult, SongMeta } from '../lyrics';

const fetchCalls: Array<{ meta: SongMeta; resolve: (res: LyricsResult | null) => void; reject: (e: Error) => void }> = [];

vi.mock('../lyrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lyrics')>()),
  fetchLyrics: vi.fn((meta: SongMeta) => new Promise<LyricsResult | null>((resolve, reject) => {
    fetchCalls.push({ meta, resolve, reject });
  })),
}));
vi.mock('../wiredDiscovery', () => ({ markWiredDiscovered: vi.fn() }));

const { useLiveLyrics, resetLyricsLookupsForTests } = await import('../liveLyrics');
const { cachedLyrics, saveLyrics } = await import('../lyrics');
type LiveLyrics = ReturnType<typeof useLiveLyrics>;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function song(id: string, title: string): MediaItem {
  return {
    id,
    title,
    path: `C:/Music/Artist/Album/${title}.mp3`,
    fileName: `${title}.mp3`,
    addedAt: 0,
  } as MediaItem;
}

const A = song('song-a', 'Alpha');
const B = song('song-b', 'Bravo');

interface Mounted {
  latest: () => LiveLyrics;
  render: (current: MediaItem | null, duration: number) => Promise<void>;
}

const roots: Root[] = [];

async function mount(current: MediaItem | null, duration: number): Promise<Mounted> {
  let seen: LiveLyrics | null = null;
  function Probe(props: { current: MediaItem | null; duration: number }) {
    seen = useLiveLyrics(props.current, props.duration, 0);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  roots.push(root);
  const render = async (c: MediaItem | null, d: number): Promise<void> => {
    await act(async () => {
      root.render(createElement(Probe, { current: c, duration: d }));
    });
  };
  await render(current, duration);
  return { latest: () => seen as unknown as LiveLyrics, render };
}

/** Let the hook's awaits (local lyrics, the lookup) run. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function lines(live: LiveLyrics): string[] | string {
  const l = live.lyrics;
  return l.kind === 'plain' ? l.lines : l.kind;
}

beforeEach(() => {
  localStorage.clear();
  fetchCalls.length = 0;
  resetLyricsLookupsForTests();
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
});

describe('live lyrics lookup race (bug 22)', () => {
  it('skipping while the old song\'s lookup is out never shows the old song\'s lyrics', async () => {
    const view = await mount(A, 200);
    await settle();
    expect(fetchCalls).toHaveLength(1);
    expect(lines(view.latest())).toBe('loading');

    await view.render(B, 180);
    await settle();
    expect(fetchCalls).toHaveLength(2);
    // B answers first, then A's slow answer lands.
    await act(async () => fetchCalls[1].resolve({ plain: 'bravo line', source: 'lrclib' }));
    await settle();
    expect(lines(view.latest())).toEqual(['bravo line']);
    await act(async () => fetchCalls[0].resolve({ plain: 'alpha line', source: 'lrclib' }));
    await settle();
    expect(lines(view.latest())).toEqual(['bravo line']);
    // A's answer still lands in A's cache, for the next time A plays.
    expect(cachedLyrics(A.id)?.plain).toBe('alpha line');
  });

  it('the old song\'s answer is dropped even before the new song\'s duration is known', async () => {
    const view = await mount(A, 200);
    await settle();
    await view.render(B, 0);
    expect(lines(view.latest())).toBe('loading');
    await act(async () => fetchCalls[0].resolve({ plain: 'alpha line', source: 'lrclib' }));
    await settle();
    expect(lines(view.latest())).toBe('loading');
    expect(fetchCalls).toHaveLength(1);
  });

  it('a failed lookup for the old song does not mark the new song missing', async () => {
    const view = await mount(A, 200);
    await settle();
    await view.render(B, 180);
    await settle();
    await act(async () => fetchCalls[0].reject(new Error('offline')));
    await settle();
    expect(lines(view.latest())).toBe('loading');
    await act(async () => fetchCalls[1].resolve(null));
    await settle();
    expect(lines(view.latest())).toBe('missing');
  });

  it('clearing the player while a lookup is out leaves nothing on screen', async () => {
    const view = await mount(A, 200);
    await settle();
    await view.render(null, 0);
    await act(async () => fetchCalls[0].resolve({ plain: 'alpha line', source: 'lrclib' }));
    await settle();
    expect(lines(view.latest())).toBe('none');
  });

  it('consumers mounted on the same song share one lookup', async () => {
    const views = [await mount(A, 200), await mount(A, 200), await mount(A, 200), await mount(A, 200)];
    await settle();
    expect(fetchCalls).toHaveLength(1);
    await act(async () => fetchCalls[0].resolve({ plain: 'alpha line', source: 'lrclib' }));
    await settle();
    for (const view of views) expect(lines(view.latest())).toEqual(['alpha line']);
  });

  it('a .lrc picked while a lookup is out wins over the late network answer', async () => {
    const view = await mount(A, 200);
    await settle();
    await act(async () => view.latest().loadFromFile('[00:01.00]picked line'));
    expect(view.latest().lyrics.kind).toBe('synced');
    await act(async () => fetchCalls[0].resolve({ plain: 'alpha line', source: 'lrclib' }));
    await settle();
    expect(view.latest().lyrics.kind).toBe('synced');
    expect(cachedLyrics(A.id)?.source).toBe('file');
  });

  it('"Search again" during a lookup shows only the newest answer', async () => {
    saveLyrics(A.id, { plain: 'cached alpha', source: 'lrclib' });
    const view = await mount(A, 200);
    await settle();
    expect(lines(view.latest())).toEqual(['cached alpha']);
    expect(fetchCalls).toHaveLength(0);
    await act(async () => view.latest().reload());
    await settle();
    expect(fetchCalls).toHaveLength(1);
    await act(async () => fetchCalls[0].resolve({ plain: 'fresh alpha', source: 'lrclib' }));
    await settle();
    expect(lines(view.latest())).toEqual(['fresh alpha']);
  });
});
