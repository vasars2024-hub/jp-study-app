// @vitest-environment jsdom
/**
 * The lyrics pane draws what `useLiveLyrics` decides: the SUNG line is lit (nothing in
 * a break, where the anchor line holds the view), the sung line lights word by word
 * when the sheet has word times, a bilingual sheet's translation sits under its line
 * (and goes to the card when mined), and the timing nudge buttons step ±100 ms.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';

const TRACK: MediaItem = { id: 'song-k', title: 'Song', path: 'C:/music/song.mp3', fileName: 'Song.mp3', addedAt: 0 };

const h = vi.hoisted(() => ({
  player: {
    state: {
      queue: [] as unknown[],
      current: null as unknown,
      playing: true,
      time: 10.5,
      duration: 60,
      volume: 1,
      shuffle: false,
      repeat: 'off',
      upNext: [] as string[],
      queueArranged: false,
    },
    seek: (() => undefined) as (s: number) => void,
  },
  live: {
    sungIndex: 0,
    activeIndex: 0,
    wordIndex: 1,
    offsetMs: 0,
  },
  nudge: [] as number[],
  resets: 0,
  mined: [] as unknown[][],
}));

vi.mock('../playerBus', () => ({
  getState: () => h.player.state,
  subscribe: () => () => undefined,
  setQueue: () => undefined,
  playItem: async () => null,
  queueTrackNext: () => undefined,
  queueTrackLast: () => undefined,
  toggle: () => undefined,
  next: () => undefined,
  prev: () => undefined,
  seek: (s: number) => h.player.seek(s),
  setVolume: () => undefined,
  toggleShuffle: () => undefined,
  cycleRepeat: () => undefined,
  getLeaderAudioElement: () => null,
}));

// Line 0 is word-timed; line 1 is the English translation of line 0 (same tag); line 2 follows a break.
const CUES = [
  { start: 10, end: 12, text: '雨が降る' },
  { start: 10, end: 12, text: 'Rain falls' },
  { start: 40, end: 44, text: '晴れた朝' },
];
const WORDS = [
  [{ text: '雨が', start: 10, end: 11 }, { text: '降る', start: 11, end: 12 }],
  null,
  null,
];

vi.mock('../liveLyrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../liveLyrics')>()),
  useLiveLyrics: () => ({
    lyrics: { kind: 'synced', cues: CUES, words: WORDS, source: 'file' },
    activeIndex: h.live.activeIndex,
    sungIndex: h.live.sungIndex,
    wordIndex: h.live.wordIndex,
    companions: [-1, 0, -1],
    offsetMs: h.live.offsetMs,
    nudgeOffset: (ms: number) => h.nudge.push(ms),
    resetOffset: () => {
      h.resets += 1;
    },
    reload: () => undefined,
    loadFromFile: () => undefined,
  }),
}));

vi.mock('../components/music/useMusicMining', () => ({
  useMusicMining: () => ({
    outcome: { kind: 'idle' },
    mine: async (...args: unknown[]) => {
      h.mined.push(args);
    },
    reset: () => undefined,
  }),
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
let prefs: typeof import('../musicStudyPrefs');
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => undefined;
  installApiStub();
  h.player.state.current = TRACK;
  Music = await import('../components/music/MusicContent');
  prefs = await import('../musicStudyPrefs');
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  h.live = { sungIndex: 0, activeIndex: 0, wordIndex: 1, offsetMs: 0 };
  h.player.state.time = 11.5;
  h.nudge.length = 0;
  h.resets = 0;
  h.mined.length = 0;
  // Plain lines: word spans. (Known-word colouring is on by default; its path is tested below.)
  prefs.patchMusicStudyPrefs({ knownHighlight: false, readingAid: false });
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
  await act(async () => {
    await Promise.resolve();
  });
}

const lines = () => Array.from(host.querySelectorAll<HTMLElement>('.music-line'));

describe('lyrics pane karaoke', () => {
  it('lights the sung line word by word', async () => {
    await mount();
    const active = host.querySelector('.music-line.active')!;
    expect(active.getAttribute('data-lyric-line')).toBe('0');
    const words = Array.from(active.querySelectorAll('.music-word'));
    expect(words.map((w) => w.textContent)).toEqual(['雨が', '降る']);
    expect(words[0].classList.contains('is-sung')).toBe(true);
    expect(words[1].classList.contains('is-singing')).toBe(true);
    // The text still reads as the whole line (lookups, e2e and copy see one string).
    expect(active.querySelector('.music-line-text')?.textContent).toBe('雨が降る');
  });

  it('keeps a coloured line tokenised and shows the word timing over it (sweep without the Highlight API)', async () => {
    prefs.patchMusicStudyPrefs({ knownHighlight: true });
    h.live.wordIndex = 0;
    await mount();
    const active = host.querySelector('.music-line.active')!;
    expect(active.querySelector('.music-word')).toBeNull();
    // jsdom has no CSS.highlights: 2 of 4 characters sung.
    const bar = active.querySelector<HTMLElement>('.music-line-sweep > span');
    expect(bar?.style.width).toBe('50%');
  });

  it('lights nothing in a break, and marks the anchor line instead', async () => {
    h.live = { sungIndex: -1, activeIndex: 0, wordIndex: -1, offsetMs: 0 };
    h.player.state.time = 20;
    await mount();
    expect(host.querySelector('.music-line.active')).toBeNull();
    expect(host.querySelector('.music-line.anchor')?.getAttribute('data-lyric-line')).toBe('0');
  });

  it('draws a translation under its own line, not as a line, and mines it as the card translation', async () => {
    await mount();
    expect(lines().map((l) => l.getAttribute('data-lyric-line'))).toEqual(['0', '2']);
    expect(lines()[0].querySelector('.music-line-translation')?.textContent).toBe('Rain falls');
    await act(async () => lines()[0].querySelector<HTMLButtonElement>('.music-line-mine')!.click());
    expect(h.mined[0]?.[0]).toMatchObject({ index: 0, text: '雨が降る' });
    expect(h.mined[0]?.[3]).toBe('Rain falls');
  });

  it('steps the timing ±100 ms and resets it from the readout', async () => {
    h.live.offsetMs = 300;
    await mount();
    const group = host.querySelector('.music-lyrics-offset')!;
    expect(group.querySelector('.music-lyrics-offset-value')?.textContent).toBe('+0.3 s');
    await act(async () => group.querySelector<HTMLButtonElement>('.music-lyrics-offset-earlier')!.click());
    await act(async () => group.querySelector<HTMLButtonElement>('.music-lyrics-offset-later')!.click());
    expect(h.nudge).toEqual([-100, 100]);
    await act(async () => group.querySelector<HTMLButtonElement>('.music-lyrics-offset-value')!.click());
    expect(h.resets).toBe(1);
  });
});
