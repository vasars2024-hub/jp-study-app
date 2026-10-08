// @vitest-environment node
//
// The Source Manager promises "tried top to bottom" and, per source, "if this
// source fails, try these next". Torrent search used to query every index at
// once, merge by seeders alone and never read `fallbackIds`. The request layer
// is stubbed per host here, so what is under test is only the order and the
// fallback walk.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScraperSourceEntry } from '../../shared/scraperSourceSettings';
import { DEFAULT_SCRAPER_TORRENT_SETTINGS } from '../../shared/scraperSourceSettings';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

/** host → status + feed; a missing host throws like a refused connection. */
const hosts = new Map<string, { status: number; body: string }>();
const asked: string[] = [];

vi.mock('../scraper/http', () => ({
  scraperRequest: async (url: string) => {
    const host = new URL(url).host;
    asked.push(host);
    const answer = hosts.get(host);
    if (!answer) throw new Error(`connect ECONNREFUSED ${host}`);
    return { status: answer.status, body: answer.body, headers: {}, bytes: answer.body.length };
  },
}));

const { searchTorrents } = await import('../scraper/torrents');

function feed(items: { name: string; hash: string; seeders: number }[]): string {
  return `<?xml version="1.0"?><rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel>${items.map((item) => `
    <item><title>${item.name}</title><guid>${item.hash}</guid>
      <nyaa:seeders>${item.seeders}</nyaa:seeders><nyaa:infoHash>${item.hash}</nyaa:infoHash>
      <nyaa:size>1 GiB</nyaa:size></item>`).join('')}</channel></rss>`;
}

function index(id: string, over: Partial<ScraperSourceEntry> = {}): ScraperSourceEntry {
  return {
    id,
    label: id,
    host: `${id}.test`,
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
    ...over,
  };
}

const torrents = { ...DEFAULT_SCRAPER_TORRENT_SETTINGS, minSeeders: 0, dedupeByInfoHash: true, preferBatches: false };

beforeEach(() => {
  hosts.clear();
  asked.length = 0;
});

describe('torrent search follows the Source Manager', () => {
  it('keeps the higher-priority index’s copy of a release both list', async () => {
    hosts.set('first.test', { status: 200, body: feed([{ name: '[A] Show - 01 (1080p)', hash: 'aaaa', seeders: 5 }]) });
    hosts.set('second.test', { status: 200, body: feed([{ name: '[A] Show - 01 (1080p)', hash: 'aaaa', seeders: 5 }]) });
    const rows = await searchTorrents({
      query: { text: 'show' },
      indexers: [index('first'), index('second')],
      torrents,
      timeoutMs: 1_000,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tracker).toBe('first');
  });

  it('orders otherwise-equal releases by index priority', async () => {
    hosts.set('first.test', { status: 200, body: feed([{ name: 'Show - 01 (1080p)', hash: 'bbbb', seeders: 5 }]) });
    hosts.set('second.test', { status: 200, body: feed([{ name: 'Show - 01 (1080p) v2', hash: 'cccc', seeders: 5 }]) });
    const rows = await searchTorrents({
      query: { text: 'show' },
      indexers: [index('second'), index('first')],
      torrents,
      timeoutMs: 1_000,
    });
    expect(rows.map((row) => row.tracker)).toEqual(['second', 'first']);
  });

  it('hands a failed index over to its fallback', async () => {
    hosts.set('backup.test', { status: 200, body: feed([{ name: 'Show - 01', hash: 'dddd', seeders: 9 }]) });
    const rows = await searchTorrents({
      query: { text: 'show' },
      indexers: [index('main', { fallbackIds: ['backup'] })],
      torrents,
      timeoutMs: 1_000,
      pool: [index('main', { fallbackIds: ['backup'] }), index('backup')],
      maxFallbackDepth: 1,
    });
    expect(asked).toEqual(['main.test', 'backup.test']);
    expect(rows.map((row) => row.tracker)).toEqual(['backup']);
  });

  it('treats a non-200 answer as a failure that reaches the fallback', async () => {
    hosts.set('main.test', { status: 503, body: 'down' });
    hosts.set('backup.test', { status: 200, body: feed([{ name: 'Show - 01', hash: 'eeee', seeders: 1 }]) });
    const rows = await searchTorrents({
      query: { text: 'show' },
      indexers: [index('main', { fallbackIds: ['backup'] })],
      torrents,
      timeoutMs: 1_000,
      pool: [index('main', { fallbackIds: ['backup'] }), index('backup')],
      maxFallbackDepth: 1,
    });
    expect(rows).toHaveLength(1);
  });

  it('never asks a fallback when the index answered', async () => {
    hosts.set('main.test', { status: 200, body: feed([{ name: 'Show - 01', hash: 'ffff', seeders: 1 }]) });
    hosts.set('backup.test', { status: 200, body: feed([]) });
    await searchTorrents({
      query: { text: 'show' },
      indexers: [index('main', { fallbackIds: ['backup'] })],
      torrents,
      timeoutMs: 1_000,
      pool: [index('main', { fallbackIds: ['backup'] }), index('backup')],
      maxFallbackDepth: 3,
    });
    expect(asked).toEqual(['main.test']);
  });

  it('respects a fallback depth of zero and never contacts a disabled source', async () => {
    hosts.set('backup.test', { status: 200, body: feed([{ name: 'x', hash: '1111', seeders: 1 }]) });
    const pool = [index('main', { fallbackIds: ['backup'] }), index('backup')];
    await searchTorrents({ query: { text: 's' }, indexers: [pool[0]], torrents, timeoutMs: 1_000, pool, maxFallbackDepth: 0 });
    expect(asked).toEqual(['main.test']);

    asked.length = 0;
    const disabledPool = [index('main', { fallbackIds: ['backup'] }), index('backup', { enabled: false })];
    await searchTorrents({ query: { text: 's' }, indexers: [disabledPool[0]], torrents, timeoutMs: 1_000, pool: disabledPool, maxFallbackDepth: 2 });
    expect(asked).toEqual(['main.test']);
  });

  it('walks a fallback’s own fallbacks up to the depth', async () => {
    hosts.set('third.test', { status: 200, body: feed([{ name: 'x', hash: '2222', seeders: 1 }]) });
    const pool = [
      index('main', { fallbackIds: ['second'] }),
      index('second', { fallbackIds: ['third'] }),
      index('third'),
    ];
    const rows = await searchTorrents({ query: { text: 's' }, indexers: [pool[0]], torrents, timeoutMs: 1_000, pool, maxFallbackDepth: 2 });
    expect(asked).toEqual(['main.test', 'second.test', 'third.test']);
    expect(rows.map((row) => row.tracker)).toEqual(['third']);
  });
});
