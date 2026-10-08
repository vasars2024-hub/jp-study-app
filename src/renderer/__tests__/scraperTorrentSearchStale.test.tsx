// @vitest-environment jsdom
/**
 * Torrent Manager search: debounced, and a stale reply cannot overwrite a newer one.
 *
 * Every keystroke used to fire a search, and whichever reply arrived LAST wrote
 * the table. Indexers answer out of order, so a slow reply for an early prefix
 * could replace the results for the full query the user actually typed.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TorrentManagerPage from '../components/scraper/pages/TorrentManagerPage';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import { ScraperPortProvider, type ScraperPort, type TorrentQuery } from '../components/scraper/data/scraperPort';
import { SCRAPER_SETTINGS_STORAGE_KEY } from '../scraperSettingsStore';
import { createDefaultScraperSettingsDocument } from '../../shared/scraperSettings';
import type { ScraperController } from '../components/scraper/types';
import type { TorrentRow } from '../../shared/scraperResults';

const row = (id: string): TorrentRow => ({
  id,
  infoHash: id.padEnd(40, '0'),
  name: `release ${id}`,
  releaseGroup: 'Fixture',
  resolution: '1080p',
  seeders: 9,
  leechers: 1,
  availability: 1,
  tracker: 'nyaa',
  sizeBytes: 1024,
  ageDays: 2,
  fileCount: 1,
  subtitleLanguages: ['ja'],
  isBatch: false,
  magnet: `magnet:?xt=urn:btih:${id}`,
});

interface Pending {
  query: TorrentQuery;
  resolve: (rows: TorrentRow[]) => void;
}

let host: HTMLDivElement;
let root: Root | null = null;
let calls: Pending[] = [];

const port = () =>
  ({
    searchTorrents: (query: TorrentQuery) =>
      new Promise<TorrentRow[]>((resolve) => {
        calls.push({ query, resolve });
      }),
    qbitTransfers: async () => [],
    getAcquisitionSnapshot: async () => null,
  }) as unknown as ScraperPort;

function seedOneIndex(): void {
  const doc = createDefaultScraperSettingsDocument('2026-10-08T00:00:00.000Z');
  const profile = doc.profiles.find((p) => p.id === doc.activeProfileId);
  if (!profile) throw new Error('default document has no active profile');
  profile.settings.sources.entries = [{
    id: 'nyaa',
    label: 'nyaa',
    host: 'nyaa.si',
    kind: 'torrent',
    enabled: true,
    priority: 1,
    fallbackIds: [],
    verifiedSiteId: '',
    requiresAuth: false,
    supportsSubtitles: true,
    health: 'unknown',
    lastCheckedAt: null,
    notes: '',
  }];
  localStorage.setItem(SCRAPER_SETTINGS_STORAGE_KEY, JSON.stringify(doc));
}

async function render(): Promise<void> {
  await act(async () => {
    root = createRoot(host);
    root.render(
      createElement(
        ScraperProvider,
        { value: { openDrawer: vi.fn() } as unknown as ScraperController },
        createElement(ScraperPortProvider, { value: port() }, createElement(TorrentManagerPage, null)),
      ),
    );
  });
}

function type(text: string): void {
  const input = host.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error('no search input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const count = () =>
  host.querySelector('input[type="search"]')?.closest('.scr-torrent-filters')?.textContent ?? '';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
  calls = [];
  localStorage.clear();
  const noop = (): void => undefined;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
  seedOneIndex();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  localStorage.clear();
  vi.useRealTimers();
});

describe('Torrent Manager search — debounce and stale replies', () => {
  it('searches once on open, then waits for typing to pause', async () => {
    await render();
    expect(calls).toHaveLength(1);

    type('f');
    type('fr');
    type('fri');
    expect(calls).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].query.text).toBe('fri');
  });

  it('ignores a reply that arrives after a newer search was sent', async () => {
    await render();
    type('frieren');
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(calls).toHaveLength(2);

    // The newer search answers first with one row...
    await act(async () => {
      calls[1].resolve([row('new')]);
    });
    expect(count()).toContain('1 matching release');

    // ...then the stale first search lands with three. It must not win.
    await act(async () => {
      calls[0].resolve([row('a'), row('b'), row('c')]);
    });
    expect(count()).toContain('1 matching release');
    expect(count()).not.toContain('3 matching');
  });
});
