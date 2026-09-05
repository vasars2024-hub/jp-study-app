// @vitest-environment jsdom
/**
 * Rubric category 8 on the Torrent Manager — "0 matching releases" was a lie.
 *
 * `sources.entries` ships as `[]` (`shared/scraperSourceSettings.ts`), so a new
 * profile has no torrent index at all. `ipcScraperPort` handed that empty list
 * straight to main, `searchTorrents` logged a warning nobody reads and returned
 * `[]`, and this row rendered "0 matching releases" — the same sentence a query
 * that genuinely matched nothing produces, and only that one is worth retyping.
 *
 * Measured live 2026-09-05 on the user's own `balanced` profile before the fix:
 * `st.sources.entries` length 0, and ten consecutive `scraperSearchTorrents`
 * calls returned 0 rows in ~1 second each — no request ever left the process.
 *
 * The two negative controls are the point of the file. One index enabled must
 * restore the count (or the guard is just "always complain"), and an index that
 * exists but is switched OFF must produce the *other* sentence — the port
 * narrows by kind and by `indexerIds`, main narrows again by `enabled`, and a
 * page mirroring only the port's half would call that case a real zero.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TorrentManagerPage from '../components/scraper/pages/TorrentManagerPage';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import { ScraperPortProvider } from '../components/scraper/data/scraperPort';
import { SCRAPER_SETTINGS_STORAGE_KEY } from '../scraperSettingsStore';
import { createDefaultScraperSettingsDocument } from '../../shared/scraperSettings';
import type { ScraperController } from '../components/scraper/types';
import type { ScraperPort } from '../components/scraper/data/scraperPort';
import type { ScraperSourceEntry } from '../../shared/scraperSourceSettings';
import type { TorrentRow } from '../../shared/scraperResults';

let host: HTMLDivElement;
let root: Root | null = null;
let searchCalls = 0;

/** One torrent index, in whichever state a case needs. */
const index = (enabled: boolean): ScraperSourceEntry => ({
  id: 'nyaa',
  label: 'nyaa',
  host: 'nyaa.si',
  kind: 'torrent',
  enabled,
  priority: 1,
  fallbackIds: [],
  verifiedSiteId: '',
  requiresAuth: false,
  supportsSubtitles: true,
  health: 'unknown',
  lastCheckedAt: null,
  notes: '',
});

/**
 * The page reads one method off the controller and a handful off the port. Full
 * fixtures would pin this file to every unrelated addition to either interface,
 * so both casts are deliberate.
 */
const controller = () => ({ openDrawer: vi.fn() }) as unknown as ScraperController;

/**
 * One row the guard must never let through: if the page asks with no reachable
 * index, the count reads "1 matching release" and the surface claims a search
 * that never touched an index. Whole shape, not a stub — the result table reads
 * `subtitleLanguages` and would throw on a partial row.
 */
const ROW: TorrentRow = {
  id: 'r1',
  infoHash: '0'.repeat(40),
  name: 'fixture release',
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
  magnet: 'magnet:?xt=urn:btih:' + '0'.repeat(40),
};

const port = () =>
  ({
    searchTorrents: async () => {
      searchCalls += 1;
      return [ROW];
    },
    qbitTransfers: async () => [],
    getAcquisitionSnapshot: async () => null,
  }) as unknown as ScraperPort;

function seed(entries: ScraperSourceEntry[]): void {
  const doc = createDefaultScraperSettingsDocument('2026-09-05T00:00:00.000Z');
  const profile = doc.profiles.find((p) => p.id === doc.activeProfileId);
  if (!profile) throw new Error('default document has no active profile');
  profile.settings.sources.entries = entries;
  localStorage.setItem(SCRAPER_SETTINGS_STORAGE_KEY, JSON.stringify(doc));
}

/**
 * Mount and let the port's promises settle. Without the second `act` the count
 * is read one render early — the search resolves after the first commit, so
 * even a working control would report the pre-request `0 matching releases`.
 */
async function render(): Promise<HTMLElement> {
  await act(async () => {
    root = createRoot(host);
    root.render(
      createElement(
        ScraperProvider,
        { value: controller() },
        createElement(
          ScraperPortProvider,
          { value: port() },
          createElement(TorrentManagerPage, null),
        ),
      ),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

/**
 * The search row, which is where the count or the reason lands. Reached through
 * the query input rather than by class: `.scr-torrent-filters` is used TWICE on
 * this page and the acquisition card's copy comes first in source order.
 */
const filters = (el: HTMLElement) =>
  el.querySelector('input[type="search"]')?.closest('.scr-torrent-filters')?.textContent ?? '';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  searchCalls = 0;
  localStorage.clear();
  // The mirror's VirtualList observes its host and jsdom ships no
  // ResizeObserver. `(): void => undefined` rather than `{}` because
  // `no-empty-function` is an ERROR in this config.
  const noop = (): void => undefined;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  localStorage.clear();
});

describe('Torrent Manager — an empty result names its cause', () => {
  it('says no index is configured rather than "0 matching releases"', async () => {
    seed([]);
    const text = filters(await render());
    expect(text).toContain('No torrent index in this profile');
    expect(text).not.toContain('matching release');
  });

  it('does not ask for a search it knows cannot reach an index', async () => {
    seed([]);
    await render();
    expect(searchCalls).toBe(0);
  });

  it('says the indexes are turned off when some exist but none is enabled', async () => {
    seed([index(false)]);
    const text = filters(await render());
    expect(text).toContain('turned off');
    expect(text).not.toContain('No torrent index in this profile');
    expect(searchCalls).toBe(0);
  });

  it('CONTROL — one enabled index restores the count and the request', async () => {
    seed([index(true)]);
    const text = filters(await render());
    expect(text).toContain('1 matching release');
    expect(text).not.toContain('No torrent index in this profile');
    expect(text).not.toContain('turned off');
    expect(searchCalls).toBe(1);
  });
});
