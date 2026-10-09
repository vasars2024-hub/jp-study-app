// @vitest-environment jsdom
/**
 * fu1 — lyric lines feed Statistics' "lines studied", the way subtitle lines do in the
 * video overlay: a line the learner replays, mines or looks a word up in counts once per
 * session, through the real stats store.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';

const TRACK: MediaItem = { id: 'song-1', title: 'Song', path: 'C:/music/song.mp3', fileName: 'Song.mp3', addedAt: 0 };

const player = vi.hoisted(() => ({
  state: {
    queue: [] as unknown[],
    current: null as unknown,
    playing: true,
    time: 0.5,
    duration: 6,
    volume: 1,
    shuffle: false,
    repeat: 'off',
    upNext: [] as string[],
    queueArranged: false,
  },
  seek: vi.fn(),
}));

vi.mock('../playerBus', () => ({
  getState: () => player.state,
  subscribe: () => () => undefined,
  setQueue: vi.fn(),
  playItem: vi.fn(async () => null),
  queueTrackNext: vi.fn(),
  queueTrackLast: vi.fn(),
  toggle: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  seek: player.seek,
  setVolume: vi.fn(),
  toggleShuffle: vi.fn(),
  cycleRepeat: vi.fn(),
  getLeaderAudioElement: () => null,
}));

const CUES = [
  { start: 0, end: 2, text: '一行目の歌詞' },
  { start: 2, end: 4, text: '二行目の歌詞' },
  { start: 4, end: 6, text: '三行目の歌詞' },
];
vi.mock('../liveLyrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../liveLyrics')>()),
  useLiveLyrics: () => ({
    lyrics: { kind: 'synced', cues: CUES, source: 'file' },
    activeIndex: 0,
    reload: () => undefined,
    loadFromFile: () => undefined,
  }),
}));

// Mining itself is covered elsewhere; here only the count matters.
const mine = vi.fn(async () => undefined);
vi.mock('../components/music/useMusicMining', () => ({
  useMusicMining: () => ({ outcome: { kind: 'idle' }, mine, reset: () => undefined }),
}));

// Any mouse-up on a line is a word lookup hit.
vi.mock('../wordLookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../wordLookup')>()),
  lookupWordFromMouseUp: () => ({ query: '歌詞', x: 1, y: 1 }),
  isLookupClick: () => true,
  noteLookupPointerDown: () => undefined,
}));

function installApiStub(): void {
  const api: Record<string, unknown> = { listMedia: async () => [TRACK] };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => null;
    },
  });
}

let Music: typeof import('../components/music/MusicContent');
let stats: typeof import('../stats');
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout; the pane centres the live line with scrollTo.
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => undefined;
  installApiStub();
  player.state.current = TRACK;
  Music = await import('../components/music/MusicContent');
  stats = await import('../stats');
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  mine.mockClear();
  player.seek.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

function Harness() {
  const state = Music.useMusic();
  return <Music.MusicLyricsPane state={state} />;
}

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
  await act(async () => { await Promise.resolve(); });
}

const linesStudied = () => stats.getSummary().todayLinesStudied ?? 0;
const mineButtons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.music-line-mine'));
const lineText = (index: number) =>
  host.querySelector<HTMLElement>(`[data-lyric-line="${index}"] .music-line-text`)!;

describe('lyric lines count toward "lines studied"', () => {
  it('counts a mined line once, however many times it is mined', async () => {
    await mount();
    expect(linesStudied()).toBe(0);
    await act(async () => mineButtons()[1].click());
    await act(async () => mineButtons()[1].click());
    expect(mine).toHaveBeenCalledTimes(2);
    expect(linesStudied()).toBe(1);
  });

  it('counts replaying the line being sung, deduplicated with mining it', async () => {
    await mount();
    const replay = host.querySelector<HTMLButtonElement>('.music-cue-replay')!;
    await act(async () => replay.click());
    expect(player.seek).toHaveBeenCalledWith(0);
    expect(linesStudied()).toBe(1);
    await act(async () => replay.click());
    await act(async () => mineButtons()[0].click());
    expect(linesStudied()).toBe(1);
  });

  it('counts a word looked up in a line', async () => {
    await mount();
    const target = lineText(2);
    await act(async () => {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(linesStudied()).toBe(1);
    await act(async () => {
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(linesStudied()).toBe(1);
    // A different line is a different line.
    await act(async () => {
      lineText(0).dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(linesStudied()).toBe(2);
  });

  it('starts a fresh session per mount, like the video overlay', async () => {
    await mount();
    await act(async () => mineButtons()[0].click());
    act(() => root?.unmount());
    root = null;
    host.remove();
    await mount();
    await act(async () => mineButtons()[0].click());
    expect(linesStudied()).toBe(2);
  });
});
