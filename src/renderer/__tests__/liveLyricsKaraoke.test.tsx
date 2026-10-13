// @vitest-environment jsdom
/**
 * The karaoke highlight in `useLiveLyrics`: the lit (sung) line ends at the line's own
 * end, so an instrumental break lights nothing while `activeIndex` stays on the line
 * just sung as the scroll anchor; enhanced-LRC word times reach the consumer; and the
 * per-song timing nudge (±100 ms, saved per song) moves the sheet itself.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';

vi.mock('../wiredDiscovery', () => ({ markWiredDiscovered: vi.fn() }));
vi.mock('../lyrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lyrics')>()),
  fetchLyrics: vi.fn(async () => null),
}));

let useLiveLyrics: typeof import('../liveLyrics').useLiveLyrics;
let resetLyricsLookupsForTests: typeof import('../liveLyrics').resetLyricsLookupsForTests;
let saveLyrics: typeof import('../lyrics').saveLyrics;
let loadLyricsOffset: typeof import('../lyricsOffset').loadLyricsOffset;
let saveLyricsOffset: typeof import('../lyricsOffset').saveLyricsOffset;
type LiveLyrics = import('../liveLyrics').LiveLyrics;

beforeAll(async () => {
  ({ useLiveLyrics, resetLyricsLookupsForTests } = await import('../liveLyrics'));
  ({ saveLyrics } = await import('../lyrics'));
  ({ loadLyricsOffset, saveLyricsOffset } = await import('../lyricsOffset'));
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SONG: MediaItem = { id: 'karaoke-1', title: 'Song', path: 'C:/m/Song.mp3', fileName: 'Song.mp3', addedAt: 0 };
const OTHER: MediaItem = { id: 'karaoke-2', title: 'Other', path: 'C:/m/Other.mp3', fileName: 'Other.mp3', addedAt: 0 };

const SHEET = [
  '[00:10.00]<00:10.00>雨が<00:11.00>降る<00:12.00>',
  '[00:14.00]',
  '[00:40.00]晴れた朝',
].join('\n');

let root: Root | null = null;
let seen: LiveLyrics | null = null;

function Probe(props: { current: MediaItem | null; time: number }) {
  seen = useLiveLyrics(props.current, 60, props.time);
  return null;
}

async function render(current: MediaItem | null, time: number): Promise<LiveLyrics> {
  await act(async () => {
    root!.render(createElement(Probe, { current, time }));
  });
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  return seen as unknown as LiveLyrics;
}

beforeEach(() => {
  localStorage.clear();
  resetLyricsLookupsForTests();
  (window as unknown as { api: unknown }).api = { musicLocalLyrics: async () => null };
  saveLyrics(SONG.id, { lrc: SHEET, source: 'file' });
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  seen = null;
});

describe('useLiveLyrics karaoke', () => {
  it('lights the line while it is sung and nothing through the break, keeping the anchor', async () => {
    let live = await render(SONG, 11.5);
    expect(live.lyrics.kind).toBe('synced');
    expect(live.sungIndex).toBe(0);
    expect(live.activeIndex).toBe(0);

    live = await render(SONG, 20);
    // The old rule kept line 0 lit here, 6 s into a 26 s instrumental break.
    expect(live.sungIndex).toBe(-1);
    expect(live.activeIndex).toBe(0);

    live = await render(SONG, 41);
    expect(live.sungIndex).toBe(1);
    expect(live.activeIndex).toBe(1);
  });

  it('hands enhanced-LRC word times through, with the word being sung', async () => {
    let live = await render(SONG, 10.4);
    if (live.lyrics.kind !== 'synced') throw new Error('not synced');
    expect(live.lyrics.words?.[0]?.map((w) => w.text)).toEqual(['雨が', '降る']);
    expect(live.wordIndex).toBe(0);
    live = await render(SONG, 11.2);
    expect(live.wordIndex).toBe(1);
  });

  it('nudges this song by 100 ms per press, saved per song, and shifts the sheet itself', async () => {
    let live = await render(SONG, 9.95);
    expect(live.sungIndex).toBe(-1);
    await act(async () => live.nudgeOffset(-100));
    live = await render(SONG, 9.95);
    expect(live.offsetMs).toBe(-100);
    expect(loadLyricsOffset(SONG.id)).toBe(-100);
    if (live.lyrics.kind !== 'synced') throw new Error('not synced');
    expect(live.lyrics.cues[0].start).toBeCloseTo(9.9);
    expect(live.lyrics.words?.[0]?.[0].start).toBeCloseTo(9.9);
    expect(live.sungIndex).toBe(0);
    // One press is one step, however large a delta a caller passes.
    await act(async () => live.nudgeOffset(5000));
    live = await render(SONG, 9.95);
    expect(live.offsetMs).toBe(0);
    // Another song keeps its own (zero) nudge.
    expect(loadLyricsOffset(OTHER.id)).toBe(0);
  });

  it('reads a saved nudge back when the song plays again, and reset clears it', async () => {
    saveLyricsOffset(SONG.id, 300);
    let live = await render(SONG, 10.2);
    expect(live.offsetMs).toBe(300);
    expect(live.sungIndex).toBe(-1);
    await act(async () => live.resetOffset());
    live = await render(SONG, 10.2);
    expect(live.offsetMs).toBe(0);
    expect(live.sungIndex).toBe(0);
  });
});
