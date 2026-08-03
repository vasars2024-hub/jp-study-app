// @vitest-environment jsdom
/**
 * The command palette's continue-watching group — Phase 6 slice 7's second entry point.
 *
 * The rule worth pinning is the one that is invisible when it works: these items are offered
 * **only while `MediaWorkspaceHost` is mounted**. With the sidecar flag off the host renders
 * nothing and registers no listener, so the command would open the palette, match the title,
 * accept the Enter — and do nothing at all. The palette has no async budget to ask
 * `seanimeStatus()`, so it asks the DOM for the element that owns the listener.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MEDIA_WORKSPACE_OPEN_EVENT } from '../../shared/mediaWorkspace';
import { CONTINUE_WATCHING_REWIND_SEC } from '../../shared/seanimeContinueWatching';
import { VIDEO_CORE_RESUME_STORAGE_KEY } from '../../shared/videoCoreStudy';
import {
  mediaWorkspaceHostIsMounted,
  readContinueWatching,
} from '../continueWatchingStore';

let host: HTMLDivElement | null = null;
let hostMarker: HTMLElement | null = null;

/**
 * `CommandPalette` → `keyboardShortcuts` → `playerBus`, which calls `window.api` at module
 * evaluation time. Without a stub in place *before* the dynamic import, that becomes an
 * unhandled rejection that fails the file rather than any assertion in it.
 */
function stubApi(): void {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      // Subscribers hand back an unsubscribe function.
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubApi();
  localStorage.clear();
  localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify([
    { key: 'file:c:/anime/frieren - 01.mkv', positionSec: 742, updatedAt: 5000 },
  ]));
});

afterEach(() => {
  host?.remove();
  host = null;
  hostMarker?.remove();
  hostMarker = null;
});

/** Stands in for `MediaWorkspaceHost`'s closed state — the launcher button it renders. */
function mountHostMarker(): void {
  hostMarker = document.createElement('button');
  hostMarker.className = 'seanime-host-launcher';
  document.body.append(hostMarker);
}

describe('mediaWorkspaceHostIsMounted', () => {
  it('is false with no host in the document', () => {
    expect(mediaWorkspaceHostIsMounted()).toBe(false);
  });

  it('recognises both of the host\u2019s states', () => {
    mountHostMarker();
    expect(mediaWorkspaceHostIsMounted()).toBe(true);
    hostMarker?.remove();

    hostMarker = document.createElement('div');
    hostMarker.className = 'seanime-host';
    document.body.append(hostMarker);
    expect(mediaWorkspaceHostIsMounted()).toBe(true);
  });
});

describe('readContinueWatching', () => {
  it('reads both stores without any IPC', () => {
    const entries = readContinueWatching();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('frieren - 01.mkv');
    expect(entries[0]?.positionSec).toBe(742);
  });

  it('takes the media library as an optional enrichment', () => {
    const entries = readContinueWatching([{
      id: '1',
      title: 'Sousou no Frieren',
      path: 'C:/Anime/Frieren - 01.mkv',
      fileName: 'Frieren - 01.mkv',
      addedAt: 0,
      durationSec: 1420,
    } as never]);
    expect(entries[0]?.title).toBe('Sousou no Frieren');
    expect(entries[0]?.percent).toBeCloseTo(742 / 1420, 5);
  });
});

/**
 * Opens the palette and types `query`. Typing is not optional: with an empty query the
 * palette keeps only the top 40 fuzzy matches out of several hundred commands, sections and
 * widgets, so an un-queried assertion tests the truncation and not the group.
 */
async function openPalette(
  mode: 'search' | 'commands',
  query = 'frieren',
): Promise<HTMLDivElement> {
  const { default: CommandPalette } = await import('../components/CommandPalette');
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(CommandPalette, {}));
  });
  await act(async () => {
    window.dispatchEvent(new CustomEvent('palette:open', { detail: mode }));
  });
  const input = document.querySelector<HTMLInputElement>('.palette-input');
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  await act(async () => {
    if (input && setValue) {
      // React tracks the DOM value, so a plain assignment is swallowed as a no-op.
      setValue.call(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  return host;
}

/** The palette renders one `<li>` per result; find the one whose label matches. */
function itemWithLabel(el: HTMLElement, label: string): HTMLElement | null {
  return [...el.querySelectorAll<HTMLElement>('li')]
    .find((node) => node.textContent?.includes(label)) ?? null;
}

describe('CommandPalette — continue watching', () => {
  it('offers a resume item in search mode while the host is mounted', async () => {
    mountHostMarker();
    const el = await openPalette('search');
    const item = itemWithLabel(el, 'frieren - 01.mkv');
    expect(item).not.toBeNull();
    expect(item?.textContent).toContain('Resume at 12:22');
  });

  it('offers nothing when the media host is not mounted', async () => {
    // The flag-off case: no listener exists, so the command would silently do nothing.
    const el = await openPalette('search');
    expect(itemWithLabel(el, 'frieren - 01.mkv')).toBeNull();
  });

  it('keeps them out of command mode, which is not a search over content', async () => {
    mountHostMarker();
    const el = await openPalette('commands');
    expect(itemWithLabel(el, 'frieren - 01.mkv')).toBeNull();
  });

  it('resumes through the workspace event with the rewound destination', async () => {
    mountHostMarker();
    const el = await openPalette('search');
    const seen: Array<{ localFilePath?: string; startAtSec?: number }> = [];
    const listener = (event: Event): void => {
      seen.push((event as CustomEvent).detail);
    };
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);
    const row = itemWithLabel(el, 'frieren - 01.mkv');
    await act(async () => {
      (row?.querySelector('button') ?? row)?.click();
    });
    // `pick` defers the action to a macrotask so focus lands after the overlay unmounts.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.localFilePath).toBe('c:/anime/frieren - 01.mkv');
    expect(seen[0]?.startAtSec).toBe(742 - CONTINUE_WATCHING_REWIND_SEC);
  });
});
