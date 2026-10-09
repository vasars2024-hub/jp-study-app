// @vitest-environment jsdom
/**
 * fu1 — the arrangeable play queue through the real Music hook, the real player bus and
 * the real playlist store: Play next / Add to queue from a song's menu, reorder by button,
 * by Alt+Arrow and by drag (each announced, focus kept on the moved row), the current
 * track keeping its place through every move, and "Save queue as playlist".
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';

vi.mock('../audioBus', () => ({
  attachAudio: vi.fn(), isLocallyPlaying: vi.fn(), readLocalAnalyser: vi.fn(),
}));
vi.mock('../vizFrames', () => ({
  noteFramesWanted: vi.fn(), receiveRemoteFrame: vi.fn(), setVizTransport: vi.fn(),
}));
vi.mock('../musicListening', () => ({
  createListenTracker: () => ({ sample: vi.fn(), flush: vi.fn() }),
}));
// No lyrics: this suite is about the queue, and the lookup would reach the network stub.
vi.mock('../liveLyrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../liveLyrics')>()),
  useLiveLyrics: () => ({ lyrics: { kind: 'none' }, activeIndex: -1, reload: () => undefined, loadFromFile: () => undefined }),
}));

const song = (id: string, title: string, addedAt: number): MediaItem => ({
  id,
  title,
  path: `C:/music/${id}.mp3`,
  fileName: `${title}.mp3`,
  addedAt,
});
// "Recent" sorts newest first, so this is the library's list order.
const LIBRARY = [
  song('a', 'Alpha', 5),
  song('b', 'Bravo', 4),
  song('c', 'Charlie', 3),
  song('d', 'Delta', 2),
  song('e', 'Echo', 1),
];
const byId = new Map(LIBRARY.map((s) => [s.id, s]));

function installApiStub(): void {
  const api: Record<string, unknown> = {
    listMedia: async () => LIBRARY,
    playerWindowId: async () => 1,
    playerGetSnapshot: async () => null,
    openMedia: async (id: string) => ({ item: byId.get(id), url: `https://music.test/${id}.mp3` }),
  };
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: new Proxy(api, {
      get: (target, prop: string | symbol) => {
        if (prop === 'then') return undefined;
        if (typeof prop === 'string' && prop in target) return target[prop];
        if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
        return async (): Promise<unknown> => null;
      },
    }),
  });
}
installApiStub();
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

let Music: typeof import('../components/music/MusicContent');
let Queue: typeof import('../components/music/MusicQueue');
let bus: typeof import('../playerBus');
let store: typeof import('../musicPlaylists');
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  bus = await import('../playerBus');
  Music = await import('../components/music/MusicContent');
  Queue = await import('../components/music/MusicQueue');
  store = await import('../musicPlaylists');
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  store.reloadPlaylists();
  bus.stop();
  bus.setQueue([]);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  document.querySelectorAll('.ui-menu').forEach((el) => el.remove());
});

function Harness() {
  const state = Music.useMusic();
  return (
    <>
      <Music.MusicPlaylistBar state={state} />
      <Music.MusicSongList state={state} />
      <Queue.MusicQueuePanel state={state} />
    </>
  );
}

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
  await act(async () => { await Promise.resolve(); });
}

async function playId(id: string): Promise<void> {
  await act(async () => { await bus.playItem(byId.get(id)!); });
}

const upNext = () => bus.getState().upNext;
const queueTitles = () =>
  Array.from(host.querySelectorAll('.music-queue-item strong')).map((el) => el.textContent);
const queueRow = (title: string) =>
  Array.from(host.querySelectorAll<HTMLLIElement>('.music-queue-item')).find(
    (li) => li.querySelector('strong')?.textContent === title,
  )!;
const status = () => host.querySelector('.music-queue-note')?.textContent ?? '';
const currentInOrder = () => {
  const order = bus.__getPlayOrderForTests();
  return order.ids[order.cursor];
};

function typeInto(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function openSongMenu(title: string): Promise<HTMLButtonElement[]> {
  const row = Array.from(host.querySelectorAll<HTMLButtonElement>('.music-song')).find((b) =>
    b.textContent?.includes(title),
  )!;
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
  });
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.ui-menu__item'));
}

describe('Play next / Add to queue', () => {
  it('queues from the song menu: Play next goes first, Add to queue after the hand-queued tracks', async () => {
    await mount();
    await playId('a');
    expect(upNext()).toEqual(['b', 'c', 'd', 'e']);

    // The playing track cannot be queued after itself.
    let items = await openSongMenu('Alpha');
    expect(items.find((b) => b.textContent === 'Play next')?.disabled).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    document.querySelectorAll('.ui-menu').forEach((el) => el.remove());

    items = await openSongMenu('Echo');
    await act(async () => items.find((b) => b.textContent === 'Add to queue')!.click());
    expect(upNext()).toEqual(['e', 'b', 'c', 'd']);

    items = await openSongMenu('Delta');
    await act(async () => items.find((b) => b.textContent === 'Add to queue')!.click());
    expect(upNext()).toEqual(['e', 'd', 'b', 'c']);

    items = await openSongMenu('Charlie');
    await act(async () => items.find((b) => b.textContent === 'Play next')!.click());
    expect(upNext()).toEqual(['c', 'e', 'd', 'b']);
    expect(host.querySelector('.music-playlists__note')?.textContent).toBe('“Charlie” plays next.');
    expect(queueTitles()).toEqual(['Alpha', 'Charlie', 'Echo', 'Delta', 'Bravo']);
    expect(bus.getState().current?.id).toBe('a');
    expect(currentInOrder()).toBe('a');

    // Next plays what the queue says.
    await act(async () => { bus.next(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(bus.getState().current?.id).toBe('c');
  });

  it('keeps a hand-arranged queue until the listener resets it to the list order', async () => {
    await mount();
    await playId('a');
    const items = await openSongMenu('Echo');
    await act(async () => items.find((b) => b.textContent === 'Play next')!.click());
    expect(bus.getState().queueArranged).toBe(true);
    const reset = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Reset to list order')!;
    await act(async () => reset.click());
    expect(bus.getState().queueArranged).toBe(false);
    expect(upNext()).toEqual(['b', 'c', 'd', 'e']);
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent === 'Reset to list order')).toBe(false);
  });
});

describe('reordering the queue', () => {
  it('moves with the row buttons, announces the new position and keeps focus on the moved row', async () => {
    await mount();
    await playId('b');
    // Alpha already played (repeat is off), so Up next is what follows Bravo.
    expect(queueTitles()).toEqual(['Bravo', 'Charlie', 'Delta', 'Echo']);
    // The current track has no move buttons; the ends are disabled.
    expect(queueRow('Bravo').querySelector('[data-queue-move]')).toBeNull();
    expect(queueRow('Charlie').querySelector<HTMLButtonElement>('[data-queue-move="up"]')!.disabled).toBe(true);
    expect(queueRow('Echo').querySelector<HTMLButtonElement>('[data-queue-move="down"]')!.disabled).toBe(true);

    const up = host.querySelector<HTMLButtonElement>('button[aria-label="Move “Echo” up"]')!;
    await act(async () => up.click());
    expect(upNext()).toEqual(['c', 'e', 'd']);
    expect(status()).toBe('Moved “Echo” to position 2 of 3.');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move “Echo” up');
    // The history stays before the current track and the cursor stays on it.
    expect(bus.getState().current?.id).toBe('b');
    expect(bus.__getPlayOrderForTests()).toMatchObject({ ids: ['a', 'b', 'c', 'e', 'd'], cursor: 1 });
    expect(bus.getState().queue.map((s) => s.id)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('moves a focused row with Alt+ArrowUp / Alt+ArrowDown', async () => {
    await mount();
    await playId('b');
    const playButton = () => queueRow('Delta').querySelector<HTMLButtonElement>('[data-queue-play]')!;
    playButton().focus();
    await act(async () => {
      playButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    });
    expect(upNext()).toEqual(['d', 'c', 'e']);
    expect(status()).toBe('Moved “Delta” to position 1 of 3.');
    expect(document.activeElement).toBe(playButton());

    // Already first: a further Alt+ArrowUp does nothing.
    await act(async () => {
      playButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    });
    expect(upNext()).toEqual(['d', 'c', 'e']);

    await act(async () => {
      playButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    });
    expect(upNext()).toEqual(['c', 'd', 'e']);
    expect(document.activeElement).toBe(playButton());
    // A plain ArrowDown is not a move.
    await act(async () => {
      playButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(upNext()).toEqual(['c', 'd', 'e']);
    expect(currentInOrder()).toBe('b');
  });

  it('moves by drag and drop', async () => {
    await mount();
    await playId('b');
    const from = queueRow('Echo');
    const to = queueRow('Charlie');
    // The current track is not draggable; upcoming rows are.
    expect(queueRow('Bravo').getAttribute('draggable')).toBe('false');
    expect(from.getAttribute('draggable')).toBe('true');
    await act(async () => from.dispatchEvent(new Event('dragstart', { bubbles: true })));
    await act(async () => to.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })));
    expect(to.classList.contains('is-drop-target')).toBe(true);
    await act(async () => to.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
    expect(upNext()).toEqual(['e', 'c', 'd']);
    expect(status()).toBe('Moved “Echo” to position 1 of 3.');
    expect(host.querySelector('.is-drop-target')).toBeNull();
    expect(bus.getState().current?.id).toBe('b');
    expect(currentInOrder()).toBe('b');
  });
});

describe('the arranged queue under shuffle', () => {
  it('Play next is still next, and a reorder does not reshuffle or move the current track', async () => {
    await mount();
    await playId('c');
    await act(async () => bus.toggleShuffle());
    try {
      const before = upNext();
      expect(before).toHaveLength(4);
      await act(async () => bus.queueTrackNext(byId.get('e')!));
      expect(upNext()[0]).toBe('e');
      expect(upNext().slice(1)).toEqual(before.filter((id) => id !== 'e'));
      await act(async () => bus.moveUpNext(0, 3));
      expect(upNext()[3]).toBe('e');
      expect(currentInOrder()).toBe('c');
      expect(bus.__getPlayOrderForTests().shuffled).toBe(true);
    } finally {
      await act(async () => bus.toggleShuffle());
    }
  });
});

describe('Save queue as playlist', () => {
  it('saves the current track and what follows under the typed name', async () => {
    await mount();
    await playId('b');
    const save = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Save queue as playlist'))!;
    await act(async () => save.click());
    const input = host.querySelector<HTMLInputElement>('.music-queue-name input')!;
    expect(input.getAttribute('aria-label')).toBe('Playlist name');
    await act(async () => typeInto(input, 'Road trip'));
    await act(async () => input.form!.requestSubmit());
    const saved = store.listPlaylists();
    expect(saved.map((p) => p.name)).toEqual(['Road trip']);
    expect(saved[0].trackIds).toEqual(['b', 'c', 'd', 'e']);
    expect(status()).toBe('Saved 4 tracks to “Road trip”.');
  });

  it('takes a numbered default name when none is typed', async () => {
    await mount();
    await playId('d');
    const save = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Save queue as playlist'))!;
    await act(async () => save.click());
    await act(async () => host.querySelector<HTMLInputElement>('.music-queue-name input')!.form!.requestSubmit());
    expect(store.listPlaylists()[0]).toMatchObject({ name: 'Saved queue 1', trackIds: ['d', 'e'] });
  });
});
