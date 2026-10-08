// @vitest-environment node
//
// The Cache settings group.
//
// The end-to-end assertions all count requests the server actually received:
// "served from cache" means the socket was not opened, and nothing short of the
// server's own tally proves that. Lifetime and eviction are asserted against the
// store directly, because the smallest lifetime the panel can express is one
// minute and a test that waited for one would not be worth having.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  type ScraperSettings,
} from '../../shared/scraperSettings';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { scraperRequest } = await import('../scraper/http');
const {
  cacheKeyFor,
  cacheKindFor,
  cachePolicyFrom,
  isCacheEntryFresh,
  isCacheableMethod,
  isCacheableRequest,
  isLiveFeedUrl,
  readScraperCache,
  resetScraperHttpCache,
  scraperCacheStats,
  writeScraperCache,
} = await import('../scraper/httpCache');
const { runWithScraperRuntime, scraperRuntimeFor } = await import('../scraper/runtime');

let base = '';
let server: http.Server;
let hits: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    hits.push(`${req.method} ${url.pathname}${url.search}`);
    switch (url.pathname) {
      case '/api/thing':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ hit: hits.length }));
        return;
      case '/boom':
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('server error');
        return;
      case '/big':
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('x'.repeat(50_000));
        return;
      default:
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body>page ${hits.length}</body></html>`);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
});

beforeEach(() => {
  hits = [];
  resetScraperHttpCache();
});

function settings(patch: (s: ScraperSettings) => void = () => undefined): ScraperSettings {
  const value = resolveScraperSettings(createDefaultScraperSettingsDocument());
  value.network.randomDelayMinMs = 0;
  value.network.randomDelayMaxMs = 0;
  value.network.retryAttempts = 0;
  patch(value);
  return value;
}

function underProfile<T>(value: ScraperSettings, fn: () => Promise<T>): Promise<T> {
  return runWithScraperRuntime(scraperRuntimeFor(value, 'cache-job'), fn);
}

const policy = (patch: (s: ScraperSettings) => void = () => undefined) => {
  const value = settings(patch);
  return cachePolicyFrom(value.cache, value.metadata);
};

// ------------------------------------------------------------ classification ---

describe('cacheKindFor', () => {
  it.each([
    ['https://api.jikan.moe/v4/anime/1', 'metadata'],
    ['https://graphql.anilist.co', 'metadata'],
    ['https://example.test/api/list', 'metadata'],
    ['https://example.test/data.json', 'metadata'],
    ['https://cdn.example.test/poster.jpg', 'thumbnails'],
    ['https://cdn.example.test/art.webp?v=2', 'thumbnails'],
    ['https://example.test/episodes', 'html'],
    ['not a url', 'html'],
  ] as const)('reads %s as %s', (url, kind) => {
    expect(cacheKindFor(url)).toBe(kind);
  });
});

describe('isCacheableMethod', () => {
  it('caches GET anywhere and POST only where the answer is metadata', () => {
    expect(isCacheableMethod('GET', 'html')).toBe(true);
    expect(isCacheableMethod('POST', 'metadata')).toBe(true);
    expect(isCacheableMethod('POST', 'html')).toBe(false);
    expect(isCacheableMethod('DELETE', 'metadata')).toBe(false);
  });
});

describe('isLiveFeedUrl', () => {
  it.each([
    'https://nyaa.si/?page=rss&q=frieren&c=1_0',
    'https://example.test/feed',
    'https://example.test/torrents.xml',
    'https://example.test/atom/',
  ])('treats %s as live', (url) => {
    expect(isLiveFeedUrl(url)).toBe(true);
    expect(isCacheableRequest('GET', url, cacheKindFor(url))).toBe(false);
  });

  it.each([
    'https://api.jikan.moe/v4/anime/1',
    'https://example.test/episodes',
    'https://example.test/rssfeeds-explained',
  ])('treats %s as ordinary', (url) => {
    expect(isLiveFeedUrl(url)).toBe(false);
  });
});

describe('cacheKeyFor', () => {
  it('separates two POSTs that differ only in their body', () => {
    const a = cacheKeyFor('POST', 'https://graphql.anilist.co', '{"search":"frieren"}');
    const b = cacheKeyFor('POST', 'https://graphql.anilist.co', '{"search":"bocchi"}');
    expect(a).not.toBe(b);
  });

  it('separates two GETs that differ only in their query', () => {
    expect(cacheKeyFor('GET', 'https://x.test/?a=1', undefined))
      .not.toBe(cacheKeyFor('GET', 'https://x.test/?a=2', undefined));
  });
});

// ------------------------------------------------------------------ lifetime ---

describe('lifetime', () => {
  it('treats an entry as fresh inside the window and stale outside it', () => {
    const p = policy((s) => {
      s.cache.lifetimeMinutes = 10;
      s.metadata.cacheHours = 0;
    });
    const entry = { storedAt: 1_000, kind: 'html' } as never;
    expect(isCacheEntryFresh(entry, p, 1_000 + 9 * 60_000)).toBe(true);
    expect(isCacheEntryFresh(entry, p, 1_000 + 11 * 60_000)).toBe(false);
  });

  it('lets metadata.cacheHours outlive the shared lifetime', () => {
    const p = policy((s) => {
      s.cache.lifetimeMinutes = 10;
      s.metadata.cacheHours = 4;
    });
    expect(p.lifetimeMs.html).toBe(10 * 60_000);
    expect(p.lifetimeMs.metadata).toBe(4 * 3_600_000);
    const entry = { storedAt: 0, kind: 'metadata' } as never;
    expect(isCacheEntryFresh(entry, p, 3 * 3_600_000)).toBe(true);
  });

  it('falls back to the shared lifetime when metadata.cacheHours is zero', () => {
    expect(policy((s) => {
      s.cache.lifetimeMinutes = 30;
      s.metadata.cacheHours = 0;
    }).lifetimeMs.metadata).toBe(30 * 60_000);
  });

  it('serves a stale entry in offline mode, because there is nothing else', () => {
    const p = policy((s) => {
      s.cache.mode = 'offline';
      s.cache.lifetimeMinutes = 1;
    });
    expect(isCacheEntryFresh({ storedAt: 0, kind: 'html' } as never, p, 9_999_999)).toBe(true);
  });

  it('drops an expired entry on read rather than leaving it to rot', () => {
    const p = policy((s) => {
      s.cache.lifetimeMinutes = 1;
    });
    writeScraperCache('k', {
      status: 200, statusText: 'OK', headers: {}, body: 'hi', bytes: 2, finalUrl: 'https://x.test/',
    }, 'html', p, 0);
    expect(readScraperCache('k', 'html', p, 30_000)?.body).toBe('hi');
    expect(readScraperCache('k', 'html', p, 120_000)).toBeNull();
    expect(scraperCacheStats().entries).toBe(0);
  });
});

// ------------------------------------------------------------------ eviction ---

describe('maxSizeMb', () => {
  it('evicts the least recently used entry to stay inside the budget', () => {
    const p = { ...policy(), maxSizeBytes: 100 };
    const store = (key: string, size: number, at: number) => writeScraperCache(key, {
      status: 200, statusText: 'OK', headers: {}, body: 'x'.repeat(size), bytes: size, finalUrl: `https://x.test/${key}`,
    }, 'html', p, at);

    store('a', 40, 0);
    store('b', 40, 1);
    // Touching 'a' makes 'b' the oldest use.
    expect(readScraperCache('a', 'html', p, 2)).not.toBeNull();
    store('c', 40, 3);

    expect(readScraperCache('a', 'html', p, 4)).not.toBeNull();
    expect(readScraperCache('c', 'html', p, 4)).not.toBeNull();
    expect(readScraperCache('b', 'html', p, 4)).toBeNull();
    expect(scraperCacheStats().evictions).toBe(1);
  });

  it('refuses a single response larger than the whole budget', () => {
    const p = { ...policy(), maxSizeBytes: 10 };
    writeScraperCache('big', {
      status: 200, statusText: 'OK', headers: {}, body: 'x'.repeat(50), bytes: 50, finalUrl: 'https://x.test/',
    }, 'html', p, 0);
    expect(scraperCacheStats().entries).toBe(0);
  });
});

// ------------------------------------------------------- against a server ---

describe('a repeated request', () => {
  it('is served from the cache the second time', async () => {
    await underProfile(settings(), async () => {
      const first = await scraperRequest(`${base}/page`);
      const second = await scraperRequest(`${base}/page`);
      expect(first.fromCache).toBeUndefined();
      expect(second.fromCache).toBe(true);
      expect(second.body).toBe(first.body);
      // Nothing went on the wire, so the timings say nothing did.
      expect(second.timingMs.total).toBe(0);
    });
    expect(hits).toEqual(['GET /page']);
  });

  it('goes back to the server when Cache Pages is off', async () => {
    await underProfile(
      settings((s) => {
        s.cache.htmlEnabled = false;
      }),
      async () => {
        await scraperRequest(`${base}/page`);
        await scraperRequest(`${base}/page`);
      },
    );
    expect(hits).toHaveLength(2);
  });

  it('caches metadata separately from pages', async () => {
    await underProfile(
      settings((s) => {
        s.cache.metadataEnabled = false;
      }),
      async () => {
        await scraperRequest(`${base}/api/thing`);
        await scraperRequest(`${base}/api/thing`);
        await scraperRequest(`${base}/page`);
        await scraperRequest(`${base}/page`);
      },
    );
    expect(hits.filter((h) => h.includes('/api/thing'))).toHaveLength(2);
    expect(hits.filter((h) => h.includes('/page'))).toHaveLength(1);
  });

  it('caches a GraphQL POST, keyed on its body', async () => {
    await underProfile(settings(), async () => {
      await scraperRequest(`${base}/api/thing`, { method: 'POST', body: '{"q":"a"}' });
      await scraperRequest(`${base}/api/thing`, { method: 'POST', body: '{"q":"a"}' });
      await scraperRequest(`${base}/api/thing`, { method: 'POST', body: '{"q":"b"}' });
    });
    expect(hits).toHaveLength(2);
  });

  it('never caches a failure', async () => {
    await underProfile(settings(), async () => {
      await scraperRequest(`${base}/boom`);
      await scraperRequest(`${base}/boom`);
    });
    expect(hits).toHaveLength(2);
  });

  it('never caches a body that was cut off at the byte cap', async () => {
    await underProfile(settings(), async () => {
      const first = await scraperRequest(`${base}/big`, { maxBytes: 2_048 });
      expect(first.truncated).toBe(true);
      await scraperRequest(`${base}/big`, { maxBytes: 2_048 });
    });
    expect(hits).toHaveLength(2);
  });

  it('never caches a response carrying a session cookie', async () => {
    await underProfile(settings(), async () => {
      await scraperRequest(`${base}/page`, { exposeSetCookie: true });
      await scraperRequest(`${base}/page`, { exposeSetCookie: true });
    });
    expect(hits).toHaveLength(2);
  });

  it('goes back to the index for a torrent feed, whose whole value is freshness', async () => {
    await underProfile(settings(), async () => {
      await scraperRequest(`${base}/index?page=rss&q=frieren`);
      await scraperRequest(`${base}/index?page=rss&q=frieren`);
    });
    expect(hits).toHaveLength(2);
  });

  it('is not cached at all outside a profile', async () => {
    await scraperRequest(`${base}/page`);
    await scraperRequest(`${base}/page`);
    expect(hits).toHaveLength(2);
  });
});

describe('offline mode', () => {
  it('serves what was cached and never opens a socket', async () => {
    await underProfile(settings(), () => scraperRequest(`${base}/page`));
    expect(hits).toHaveLength(1);

    const offline = await underProfile(
      settings((s) => {
        s.cache.mode = 'offline';
      }),
      () => scraperRequest(`${base}/page`),
    );
    expect(offline.fromCache).toBe(true);
    expect(hits).toHaveLength(1);
  });

  it('fails clearly rather than quietly refetching a miss', async () => {
    await expect(underProfile(
      settings((s) => {
        s.cache.mode = 'offline';
      }),
      () => scraperRequest(`${base}/never-seen`),
    )).rejects.toThrow(/offline cache mode/i);
    expect(hits).toHaveLength(0);
  });

  it('fails a request whose kind has caching turned off', async () => {
    await expect(underProfile(
      settings((s) => {
        s.cache.mode = 'offline';
        s.cache.htmlEnabled = false;
      }),
      () => scraperRequest(`${base}/page`),
    )).rejects.toThrow(/offline cache mode/i);
    expect(hits).toHaveLength(0);
  });
});
