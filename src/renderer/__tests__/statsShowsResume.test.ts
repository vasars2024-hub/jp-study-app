// @vitest-environment jsdom
/**
 * Phase 6 slice 8 — the Statistics "By show" list as a way back into the player.
 *
 * The assertions that matter are the refusals. Every one of them, if wrong, produces a
 * button that looks exactly like a working control and silently does nothing:
 * `MediaWorkspaceHost` unmounted means no listener at all, and a non-`file:` key has no
 * `localFilePath`, which is the only way to reopen anything.
 *
 * A real `createRoot` render, not `renderToStaticMarkup`: the resume map is built in an
 * effect, so under SSR every row would render as a plain readout and the whole file would
 * pass vacuously.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_WORKSPACE_OPEN_EVENT } from '../../shared/mediaWorkspace';
import { VIDEO_CORE_RESUME_STORAGE_KEY } from '../../shared/videoCoreStudy';
import { CONTINUE_WATCHING_REWIND_SEC } from '../../shared/seanimeContinueWatching';
import { statsKey } from '../stats';

const EP1 = 'file:c:/anime/frieren/ep1.mkv';
const store = new Map<string, string>();
let host: HTMLDivElement | null = null;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seed(shows: Record<string, { title: string; seconds: number; lastWatched: number }>): void {
  store.set(statsKey(), JSON.stringify({
    days: { [todayKey()]: { seconds: 0, chars: 0, watchSeconds: 1800 } },
    books: {},
    shows,
  }));
}

/** Mounts the marker `mediaWorkspaceHostIsMounted()` looks for. */
function mountHostMarker(): void {
  const marker = document.createElement('div');
  marker.className = 'seanime-host-launcher';
  document.body.append(marker);
}

beforeEach(() => {
  store.clear();
  document.body.innerHTML = '';
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
  Object.defineProperty(window, 'api', {
    value: { listMedia: () => Promise.resolve([]), onAnkiIntervalsChanged: () => () => undefined },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

async function render(): Promise<HTMLDivElement> {
  const { StatsShows, useStats } = await import('../components/stats/StatsContent');
  function Harness() {
    return createElement(StatsShows, { state: useStats() });
  }
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness));
  });
  return host;
}

describe('StatsShows', () => {
  it('renders a readout, not a control, when nothing is listening', async () => {
    seed({ [EP1]: { title: 'Frieren — 1', seconds: 1800, lastWatched: 5000 } });
    // No `.seanime-host-launcher` in the DOM: `MediaWorkspaceHost` returns null while the
    // sidecar is disabled, so the event would reach nobody.
    const el = await render();
    expect(el.querySelectorAll('.stats-book-row')).toHaveLength(1);
    expect(el.querySelector('button')).toBeNull();
  });

  it('resumes at the stored position, minus the run-up', async () => {
    seed({ [EP1]: { title: 'Frieren — 1', seconds: 1800, lastWatched: 5000 } });
    store.set(
      VIDEO_CORE_RESUME_STORAGE_KEY,
      JSON.stringify([{ key: EP1, positionSec: 620, updatedAt: 5000 }]),
    );
    mountHostMarker();
    const el = await render();

    const events: Array<Record<string, unknown>> = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button')?.click();
    });
    window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);

    expect(events).toEqual([
      {
        localFilePath: 'c:/anime/frieren/ep1.mkv',
        startAtSec: 620 - CONTINUE_WATCHING_REWIND_SEC,
      },
    ]);
  });

  it('opens without claiming a position when the file has none', async () => {
    // Watched to the end: `StudyPlayerSlice` clears the resume entry near EOF, so this row
    // exists with no position at all. Inventing one would move a real video somewhere
    // nothing measured.
    seed({ [EP1]: { title: 'Frieren — 1', seconds: 1800, lastWatched: 5000 } });
    mountHostMarker();
    const el = await render();

    const events: Array<Record<string, unknown>> = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button')?.click();
    });
    window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);

    expect(events).toEqual([{ localFilePath: 'c:/anime/frieren/ep1.mkv' }]);
  });

  it('leaves a non-file key as a readout, because nothing can reopen it', async () => {
    // `videoCoreResumeKey` also mints `media:` and `stream:`; neither yields a
    // `localFilePath`, and `MediaWorkspaceOpenRequest` has no other way in.
    seed({ 'media:154587:episode:1': { title: 'Frieren — 1', seconds: 1800, lastWatched: 5000 } });
    mountHostMarker();
    const el = await render();
    expect(el.querySelectorAll('.stats-book-row')).toHaveLength(1);
    expect(el.querySelector('button')).toBeNull();
  });
});
