// @vitest-environment jsdom
/**
 * The Review view must not be gated behind the sidecar.
 *
 * Its data is Study OS mining history plus Anki — it reads **nothing** from the media
 * server. The first version of the watch-to-review loop nevertheless rendered it inside
 * `MediaWorkspaceHost`'s `status.kind === 'ready'` branch, so a stopped sidecar hid the
 * user's own mined cards for no reason at all. These tests pin the fix in both directions,
 * because the obvious repair (hoist the pane out of the branch) is one editing slip away
 * from also unmounting the library pane — which would kill the sidecar, since that pane
 * holds the websocket and the no-client watchdog exits shortly after the last client goes.
 *
 * Real client render for the same reason as the other panels here: the host's status
 * arrives through an effect, so SSR would leave every assertion vacuous.
 *
 * Two things this file learned the hard way, worth not re-deriving:
 *
 *   1. **The Suspense fallback reuses `.seanime-host-state`**, the same class as the
 *      sidecar notice. Asserting on that class alone cannot distinguish "the sidecar is
 *      stopped" from "the lazy panel has not resolved yet", so the assertions below are on
 *      the notice's own text and controls.
 *   2. **`MediaWorkspace` and `seanimeBootstrap` are mocked.** Without the bootstrap mock
 *      `conn.baseUrl` is empty and the library pane legitimately never renders, so the
 *      sidecar-up case cannot be tested at all; without the workspace mock the test drags
 *      in the whole adopted vendor bundle.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeanimeStatus } from '../../shared/seanime';

vi.mock('../../media/seanimeBootstrap', () => ({
  bootstrapSeanimeConnection: async () => ({ baseUrl: 'http://127.0.0.1:58554', token: 't' }),
}));

vi.mock('../../media/MediaWorkspace', () => ({
  default: () => createElement('div', { 'data-stub-workspace': 'true' }),
}));

let host: HTMLDivElement | null = null;

function stubApi(status: SeanimeStatus): void {
  vi.stubGlobal('window', globalThis.window);
  (globalThis.window as unknown as { api: Record<string, unknown> }).api = {
    seanimeStatus: async () => status,
    onSeanimeStatus: () => () => undefined,
    seanimeStart: async () => undefined,
    pickMedia: async () => null,
    // Consumed by the Review panel once it mounts.
    ankiStatus: async () => ({ connected: false, decks: [], models: [] }),
    ankiGetIntervals: async () => null,
    ankiGetIntervalsForNotes: async () => null,
  };
}

beforeEach(() => {
  vi.resetModules();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
});

afterEach(() => {
  host?.remove();
  host = null;
});

/** Several act cycles: a React.lazy chain does not settle in one microtask. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

/** Mounts the host, opens it, and switches to the named segment. */
async function openOn(view: 'library' | 'readiness' | 'review'): Promise<HTMLDivElement> {
  // Pre-import so the lazy panels resolve from the module cache rather than a cold load.
  await import('../components/reading/SeanimeWatchLoopPanel');
  const { default: MediaWorkspaceHost } = await import('../../media/MediaWorkspaceHost');
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(MediaWorkspaceHost, {}));
  });
  // Closed, the host is just its launcher button.
  const launcher = host.querySelector<HTMLButtonElement>('.seanime-host-launcher');
  await act(async () => { launcher?.click(); });
  if (view !== 'library') {
    const label = view === 'review' ? 'Review' : 'Readiness';
    const button = [...host.querySelectorAll<HTMLButtonElement>('.seanime-host-views button')]
      .find((element) => element.textContent === label);
    await act(async () => { button?.click(); });
  }
  await flush();
  return host;
}

const STOPPED = { kind: 'stopped', port: 0 } as unknown as SeanimeStatus;
const READY = { kind: 'ready', port: 58554, pid: 123 } as unknown as SeanimeStatus;

/**
 * The sidecar notice, identified by its own text rather than by a shared class — see the
 * Suspense-fallback note in the docblock. `mediaWorkspace.serverState` is
 * "The media server is {status}."
 */
function sidecarNotice(el: HTMLElement): Element | null {
  return [...el.querySelectorAll('.seanime-host-state')]
    .find((node) => node.textContent?.includes('media server is')) ?? null;
}

describe('MediaWorkspaceHost — Review is not gated behind the sidecar', () => {
  it('offers all three segments', async () => {
    stubApi(STOPPED);
    const el = await openOn('library');
    const labels = [...el.querySelectorAll('.seanime-host-views button')]
      .map((b) => b.textContent);
    expect(labels).toEqual(['Library', 'Readiness', 'Review']);
  });

  it('still explains a stopped sidecar on the Library view', async () => {
    stubApi(STOPPED);
    const el = await openOn('library');
    expect(sidecarNotice(el)).not.toBeNull();
  });

  it('renders the Review panel with the sidecar STOPPED', async () => {
    // The regression this file exists for: a stopped sidecar used to hide mined cards.
    stubApi(STOPPED);
    const el = await openOn('review');
    expect(el.querySelector('.study-loop')).not.toBeNull();
  });

  it('does not show a sidecar error beside the Review panel', async () => {
    // A sidecar notice is only information when the view actually needs the sidecar;
    // next to Review it is a standing error about nothing.
    stubApi(STOPPED);
    const el = await openOn('review');
    expect(sidecarNotice(el)).toBeNull();
  });

  it('does not mount the adopted workspace while the sidecar is stopped', async () => {
    // Guards the other direction: Review must not drag the adopted bundle in.
    stubApi(STOPPED);
    const el = await openOn('review');
    expect(el.querySelector('[data-stub-workspace]')).toBeNull();
  });

  it('keeps the library pane MOUNTED but hidden when Review shows and the sidecar is up', async () => {
    // Unmounting it would drop the sidecar websocket, and the no-client watchdog exits
    // the process shortly after the last client disconnects.
    stubApi(READY);
    const el = await openOn('review');
    expect(el.querySelector('[data-stub-workspace]')).not.toBeNull();
    const libraryPane = el.querySelector('.seanime-host-pane[data-active="false"]');
    expect(libraryPane?.hasAttribute('hidden')).toBe(true);
    // And Review is on screen at the same time.
    expect(el.querySelector('.study-loop')).not.toBeNull();
  });

  it('shows the library pane and no Review panel on the Library view', async () => {
    stubApi(READY);
    const el = await openOn('library');
    expect(el.querySelector('.seanime-host-pane[data-active="true"]')).not.toBeNull();
    expect(el.querySelector('.study-loop')).toBeNull();
  });
});

describe('MediaWorkspaceHost — a review focus raised from outside opens the host', () => {
  /** Mounts the host and leaves it CLOSED, i.e. showing only its launcher. */
  async function mountClosed(): Promise<HTMLDivElement> {
    await import('../components/reading/SeanimeWatchLoopPanel');
    const { default: MediaWorkspaceHost } = await import('../../media/MediaWorkspaceHost');
    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(MediaWorkspaceHost, {}));
    });
    return host;
  }

  it('opens on Review, focused, from a closed host', async () => {
    // Slice 6 only ever raised this event from a readiness row inside an already-open
    // workspace, so opening was a no-op there. Slice 7's desktop widget raises it from
    // outside: without the open, the segment changes behind a launcher the user is still
    // looking at, which reads as a button that does nothing.
    stubApi(STOPPED);
    const el = await mountClosed();
    expect(el.querySelector('.seanime-host-launcher')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('seanime:study-review-focus', {
        detail: { pathKey: 'c:/media/ep1.mkv', title: 'The Big O' },
      }));
    });
    await flush();

    expect(el.querySelector('.seanime-host-launcher')).toBeNull();
    expect(el.querySelector('.study-loop')).not.toBeNull();
    expect(el.querySelector('.study-loop-focus')?.textContent).toContain('The Big O');
  });

  it('ignores a focus request carrying no join key', async () => {
    stubApi(STOPPED);
    const el = await mountClosed();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('seanime:study-review-focus', {
        detail: { pathKey: '', title: 'The Big O' },
      }));
    });
    await flush();
    expect(el.querySelector('.seanime-host-launcher')).not.toBeNull();
  });
});
