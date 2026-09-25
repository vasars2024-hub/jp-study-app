// @vitest-environment jsdom
/**
 * V3: the Torrent Manager's indexer results stay readable in a narrow window.
 *
 * At the default Scraper window the nine-column grid left the release NAME ~49px wide, so
 * every title read "[ASW] Ts…" with no way to see the rest. Below TORRENT_CARD_BREAKPOINT the
 * table switches to card rows (`.is-cards`, name on its own line), every truncated name carries
 * its full text as a tooltip, and the "· N files" line is a translated plural rather than
 * English glued on in JSX.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TORRENT_CARD_BREAKPOINT, TorrentTable } from '../components/scraper/result/ResultPanels';
import type { TorrentRow } from '../../shared/scraperResults';

const LONG = '[ASW] Tsuki ga Michibiku Isekai Douchuu S2 - 01-25 [1080p HEVC x265 10Bit][AAC] (Batch)';

function row(id: string, patch: Partial<TorrentRow> = {}): TorrentRow {
  return {
    id,
    infoHash: id.padEnd(40, '0'),
    name: LONG,
    releaseGroup: 'ASW',
    resolution: '1080p',
    seeders: 120,
    leechers: 4,
    availability: 1,
    tracker: 'nyaa',
    sizeBytes: 5_000_000_000,
    ageDays: 3,
    fileCount: 25,
    subtitleLanguages: ['en'],
    isBatch: true,
    magnet: `magnet:?xt=urn:btih:${id}`,
    ...patch,
  };
}

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no ResizeObserver; VirtualList and useNarrow both construct one.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe = (): undefined => undefined;
    unobserve = (): undefined => undefined;
    disconnect = (): undefined => undefined;
  };
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function mount(width: number, rows: TorrentRow[]): Promise<HTMLElement> {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 600,
    top: 0,
    left: 0,
    right: width,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<TorrentTable torrents={rows} selected={new Set()} onToggle={() => undefined} />);
  });
  return host;
}

describe('torrent results in a narrow window', () => {
  it('becomes card rows below the breakpoint, and stays a table above it', async () => {
    const narrow = await mount(TORRENT_CARD_BREAKPOINT - 40, [row('a')]);
    expect(narrow.querySelector('.scr-table--torrents')?.classList.contains('is-cards')).toBe(true);
    root?.unmount();
    root = null;
    vi.restoreAllMocks();
    const wide = await mount(TORRENT_CARD_BREAKPOINT + 400, [row('a')]);
    expect(wide.querySelector('.scr-table--torrents')?.classList.contains('is-cards')).toBe(false);
  });

  it('every truncated release name carries its full text as a tooltip', async () => {
    const host = await mount(TORRENT_CARD_BREAKPOINT - 40, [row('a')]);
    const name = host.querySelector<HTMLElement>('[data-col="name"] .scr-t-en');
    expect(name?.title).toBe(LONG);
  });

  it('the file count is a plural, not "· 1 files"', async () => {
    const host = await mount(TORRENT_CARD_BREAKPOINT - 40, [row('a', { isBatch: false, fileCount: 1 })]);
    const kind = host.querySelector<HTMLElement>('[data-col="name"] .scr-t-ja')?.textContent ?? '';
    expect(kind).toMatch(/1 file$/);
    expect(kind).not.toMatch(/files/);
  });
});
