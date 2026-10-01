// @vitest-environment jsdom
/**
 * User playlists through the real Music hook and components: create one from the
 * picker, see its tracks in playlist order, reorder and remove on the row, play it
 * from the top, and have a palette request play it once.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';

const player = vi.hoisted(() => {
  const state = {
    queue: [] as unknown[],
    current: null,
    playing: false,
    time: 0,
    duration: 0,
    volume: 1,
    shuffle: false,
    repeat: 'off',
    upNext: [] as string[],
  };
  return {
    state,
    setQueue: vi.fn(),
    playItem: vi.fn(async () => null),
  };
});

vi.mock('../playerBus', () => ({
  getState: () => player.state,
  subscribe: () => () => undefined,
  setQueue: player.setQueue,
  playItem: player.playItem,
  toggle: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  toggleShuffle: vi.fn(),
  cycleRepeat: vi.fn(),
}));

const song = (id: string, title: string): MediaItem => ({
  id,
  title,
  path: `C:/music/${id}.mp3`,
  fileName: `${title}.mp3`,
  addedAt: 0,
});
const LIBRARY = [song('a', 'Alpha'), song('b', 'Bravo'), song('c', 'Charlie')];

function installApiStub(): void {
  const api: Record<string, unknown> = { listMedia: async () => LIBRARY };
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
let store: typeof import('../musicPlaylists');
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Music = await import('../components/music/MusicContent');
  store = await import('../musicPlaylists');
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  store.reloadPlaylists();
  player.setQueue.mockClear();
  player.playItem.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

function Harness() {
  const state = Music.useMusic();
  return (
    <>
      <Music.MusicPlaylistBar state={state} />
      <Music.MusicSongList state={state} />
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

const select = () => host.querySelector<HTMLSelectElement>('.music-playlists select')!;
const titles = () => Array.from(host.querySelectorAll('.music-song-title')).map((el) => el.textContent);
const button = (label: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.includes(label) || b.getAttribute('aria-label') === label,
  )!;

function typeInto(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('music playlists in the Music window', () => {
  it('creates a playlist from the picker and shows it', async () => {
    await mount();
    expect(titles()).toHaveLength(3);
    await act(async () => button('New playlist').click());
    const input = host.querySelector<HTMLInputElement>('.music-playlists input')!;
    await act(async () => typeInto(input, 'Commute'));
    await act(async () => input.form!.requestSubmit());
    expect(store.listPlaylists().map((p) => p.name)).toEqual(['Commute']);
    expect(select().value).toBe(store.listPlaylists()[0].id);
    // An empty playlist says how to fill it rather than offering a folder import.
    expect(host.textContent).toContain('This playlist is empty');
    expect(titles()).toHaveLength(0);
  });

  it('lists tracks in playlist order, reorders and removes on the row, and plays from the top', async () => {
    const p = store.createPlaylist('Mix', 'x', ['c', 'a']);
    await mount();
    await act(async () => {
      select().value = p.id;
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(titles()).toEqual(['Charlie', 'Alpha']);

    const moveDown = host.querySelectorAll<HTMLButtonElement>('button[aria-label="Move down"]');
    await act(async () => moveDown[0].click());
    expect(titles()).toEqual(['Alpha', 'Charlie']);

    await act(async () => button('Play').click());
    expect(player.setQueue).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'c' })]);
    expect(player.playItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));

    const remove = host.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove from playlist"]');
    await act(async () => remove[0].click());
    expect(titles()).toEqual(['Charlie']);
    expect(store.getPlaylist(p.id)?.trackIds).toEqual(['c']);
  });

  it('moves past missing tracks in one click and disables moves at visible boundaries', async () => {
    const p = store.createPlaylist('Mix', 'x', ['missing-first', 'a', 'missing-middle', 'c', 'missing-last']);
    await mount();
    await act(async () => {
      select().value = p.id;
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(titles()).toEqual(['Alpha', 'Charlie']);
    expect(button('Move up').disabled).toBe(true);
    expect(host.querySelectorAll<HTMLButtonElement>('button[aria-label="Move down"]')[1].disabled).toBe(true);
    await act(async () => button('Move down').click());
    expect(titles()).toEqual(['Charlie', 'Alpha']);
    expect(store.getPlaylist(p.id)?.trackIds).toEqual(['missing-first', 'missing-middle', 'c', 'a', 'missing-last']);

    // The context menu uses the same visible boundaries and destinations.
    const row = host.querySelectorAll<HTMLButtonElement>('.music-song')[1];
    await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    const menuItems = Array.from(document.querySelectorAll<HTMLButtonElement>('.ui-menu__item'));
    expect(menuItems.find((b) => b.textContent?.includes('Move down'))?.disabled).toBe(true);
    await act(async () => menuItems.find((b) => b.textContent?.includes('Move up'))!.click());
    expect(titles()).toEqual(['Alpha', 'Charlie']);
    expect(store.getPlaylist(p.id)?.trackIds).toContain('missing-middle');
  });

  it('adds a song from its menu in the library view', async () => {
    const p = store.createPlaylist('Mix', 'x');
    await mount();
    const row = Array.from(host.querySelectorAll<HTMLButtonElement>('.music-song')).find((b) => b.textContent?.includes('Bravo'))!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    const item = Array.from(document.querySelectorAll<HTMLButtonElement>('.ui-menu__item')).find((b) =>
      b.textContent?.includes('Add to “Mix”'),
    )!;
    await act(async () => item.click());
    expect(store.getPlaylist(p.id)?.trackIds).toEqual(['b']);
  });

  it('deletes only after the in-place confirmation', async () => {
    const p = store.createPlaylist('Mix', 'x', ['a']);
    await mount();
    await act(async () => {
      select().value = p.id;
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => button('Delete').click());
    expect(store.getPlaylist(p.id)).toBeDefined();
    await act(async () => button('Delete “Mix”?').click());
    expect(store.getPlaylist(p.id)).toBeUndefined();
    expect(select().value).toBe('');
  });

  it('a palette request plays the playlist once', async () => {
    const p = store.createPlaylist('Mix', 'x', ['b', 'c']);
    await mount();
    await act(async () => store.requestPlaylistPlay(p.id));
    expect(player.playItem).toHaveBeenCalledTimes(1);
    expect(player.playItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    expect(select().value).toBe(p.id);
  });
});
