// @vitest-environment jsdom
/**
 * Watch (Gum) round-2 journeys, rendered or run where they can be:
 *
 * - J4: an untracked show the files say you are watching shows "Watching (from your files)"
 *   in its status picker, the status the library counts it under, instead of "Not tracked".
 * - J11: the status picker saves on Enter or when focus leaves, not on every arrow key
 *   (arrowing past "Completed" on the way to "On hold" used to mark the show completed).
 * - J11: short files get their real length ("16 s left", "20 s"), not "1 min left" or the
 *   catalogue's "24 min per episode".
 * - J11: one video dropped on the window plays; a folder or a batch never starts playing.
 * - K12: the Watch grid moves between posters with the arrow / Home / End / Page keys.
 * - J11: a restart returns to the title page that was open.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';
import type { WatchTitleView } from '../../shared/watchLibrary';
import { GumStatusSelect } from '../components/media/gum/GumTitlePage';
import { formatPerEpisode, formatRuntime, formatTimeLeft } from '../components/media/gum/GumCards';
import { buildGumTitles, type GumTitle } from '../components/media/gum/gumModel';
import { findRouteTitle, loadGumRoute, saveGumRoute } from '../components/media/gum/gumRoute';
import { gridKeyTarget } from '../components/virtualGridNav';
import { executeImport } from '../fileImportExecute';

const T = (key: string, vars?: Record<string, string | number>): string =>
  vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

function item(id: string, patch: Partial<MediaItem> = {}): MediaItem {
  return { id, title: id, path: `D:/media/${id}.mkv`, fileName: `${id}.mkv`, addedAt: 1, kind: 'video', ...patch } as MediaItem;
}

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('short files keep their real length (J11)', () => {
  it('counts seconds under a minute, minutes above it', () => {
    expect(formatTimeLeft(T, 20, 4)).toBe('gum.card.secondsLeft(s=16)');
    expect(formatTimeLeft(T, 1440, 300)).toBe('gum.card.minutesLeft(m=19)');
    expect(formatRuntime(T, 20 / 60)).toBe('gum.runtime.s(s=20)');
    expect(formatPerEpisode(T, 20 / 60)).toBe('gum.runtime.s(s=20)');
    expect(formatPerEpisode(T, 24)).toBe('gum.meta.perEpisode(m=24)');
  });

  it("the files' own length beats the catalogue's typical episode", () => {
    const [title] = buildGumTitles([], [
      item('clip-01', { seriesKey: 'clip', seriesTitle: 'Clip', category: 'anime', episode: 1, durationSec: 20, runtimeMin: 24 }),
    ]);
    expect(title?.runtimeMin).toBeCloseTo(20 / 60);
  });
});

describe('the status picker (J4, J11)', () => {
  function untracked(): GumTitle {
    const [title] = buildGumTitles([] as WatchTitleView[], [
      item('show-01', { seriesKey: 'show', seriesTitle: 'Show', category: 'anime', episode: 1, durationSec: 1440, positionSec: 300 }),
      item('show-02', { seriesKey: 'show', seriesTitle: 'Show', category: 'anime', episode: 2, durationSec: 1440 }),
    ]);
    if (!title) throw new Error('no title');
    return title;
  }

  async function mount(title: GumTitle, onCommit: (status: string) => void): Promise<HTMLSelectElement> {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<GumStatusSelect title={title} busy={false} onCommit={onCommit} />);
    });
    return host.querySelector('select') as HTMLSelectElement;
  }

  it('an untracked show you are watching says so, not "Not tracked"', async () => {
    const title = untracked();
    expect(title.tracked).toBe(false);
    expect(title.status).toBe('watching');
    const select = await mount(title, vi.fn());
    expect(select.options[0]?.textContent).toMatch(/derivedStatus|from your files/);
    expect(select.options[0]?.textContent).not.toBe('Not tracked');
  });

  it('arrow keys only draft; Enter or leaving saves once', async () => {
    const onCommit = vi.fn();
    const select = await mount(untracked(), onCommit);
    select.focus();
    await act(async () => {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      select.value = 'completed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () => {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('completed');
    await act(async () => {
      select.blur();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('a dropped video plays (J11)', () => {
  function stubApi(items: MediaItem[]): void {
    Object.defineProperty(window, 'api', {
      configurable: true,
      writable: true,
      value: {
        addMediaPaths: vi.fn(async () => items),
        fileDropFolderFiles: vi.fn(async () => items.map((i) => i.path)),
      },
    });
  }

  it('one video file: opens the player on it', async () => {
    const video = item('ep1');
    stubApi([video]);
    const onPlayMedia = vi.fn();
    await executeImport({ path: video.path, name: video.fileName, isDirectory: false }, 'media', { onPlayMedia });
    expect(onPlayMedia).toHaveBeenCalledWith(video);
  });

  it('a folder never starts playing', async () => {
    stubApi([item('ep1')]);
    const onPlayMedia = vi.fn();
    await executeImport({ path: 'D:/media/show', name: 'show', isDirectory: true }, 'media', { onPlayMedia });
    expect(onPlayMedia).not.toHaveBeenCalled();
  });
});

describe('the Watch grid keys (K12)', () => {
  // 10 posters, 4 columns: rows [0..3] [4..7] [8,9].
  it('moves by cell and row, stays put at the edges, and pages by a screen', () => {
    expect(gridKeyTarget('ArrowRight', false, 3, 10, 4, 2)).toBe(4);
    expect(gridKeyTarget('ArrowDown', false, 5, 10, 4, 2)).toBe(9);
    expect(gridKeyTarget('ArrowDown', false, 7, 10, 4, 2)).toBe(7);
    expect(gridKeyTarget('ArrowUp', false, 1, 10, 4, 2)).toBe(1);
    expect(gridKeyTarget('Home', false, 6, 10, 4, 2)).toBe(4);
    expect(gridKeyTarget('End', false, 8, 10, 4, 2)).toBe(9);
    expect(gridKeyTarget('End', true, 0, 10, 4, 2)).toBe(9);
    expect(gridKeyTarget('PageDown', false, 0, 10, 4, 2)).toBe(8);
    expect(gridKeyTarget('Enter', false, 0, 10, 4, 2)).toBeNull();
  });
});

describe('restart returns to the title page (J11)', () => {
  it('keeps the route and finds the title again, even after it got a new id', () => {
    saveGumRoute({ tab: 'title', titleId: 'local:show', itemId: 'show-01' });
    const route = loadGumRoute();
    expect(route).toEqual({ tab: 'title', titleId: 'local:show', itemId: 'show-01' });
    const tracked = { id: 'mal:1', items: [item('show-01')] } as unknown as GumTitle;
    expect(route && findRouteTitle(route, [tracked])).toBe(tracked);
  });
});
