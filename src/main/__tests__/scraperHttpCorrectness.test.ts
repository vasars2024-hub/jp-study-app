// @vitest-environment node
//
// HTTP correctness (audit P3), cancellation (P4, HTTP half) and the
// private-address guard (P8), against a real local server where the claim is
// about the wire: what the server saw, and when.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  validateScraperSettings,
  type ScraperSettings,
} from '../../shared/scraperSettings';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { isScraperAbortError, probeHttp, retryAfterMs, scraperRequest } = await import('../scraper/http');
const { cacheKeyFor, resetScraperHttpCache } = await import('../scraper/httpCache');
const { runWithScraperRuntime, scraperRuntimeFor } = await import('../scraper/runtime');
const { parseRobotsTxt, resetRobotsCache, robotsRulesFor } = await import('../scraper/robots');
const { isPrivateAddress, resolvesToPrivateAddress } = await import('../scraper/privateAddress');

interface Seen {
  url: string;
  method: string;
  at: number;
  cookie: string;
  authorization: string;
  host: string;
}

let server: http.Server;
let base = '';
let port = 0;
let seen: Seen[] = [];
let flakyCount = 0;
let robotsBody = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    seen.push({
      url: url.pathname,
      method: req.method ?? '',
      at: Date.now(),
      cookie: req.headers.cookie ?? '',
      authorization: req.headers.authorization ?? '',
      host: req.headers.host ?? '',
    });
    switch (url.pathname) {
      case '/robots.txt':
        res.writeHead(robotsBody ? 200 : 404, { 'content-type': 'text/plain' });
        res.end(robotsBody);
        return;
      case '/ok':
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('hello');
        return;
      case '/flaky':
        flakyCount += 1;
        if (flakyCount === 1) {
          res.writeHead(503, { 'retry-after': url.searchParams.get('after') ?? '1' });
          res.end('busy');
          return;
        }
        res.writeHead(200);
        res.end('fine');
        return;
      case '/always-503':
        res.writeHead(503);
        res.end('busy');
        return;
      case '/hang':
        return;
      case '/dribble': {
        // One byte every 300 ms: never idle long enough for a socket timeout.
        res.writeHead(200, { 'content-type': 'text/plain' });
        const timer = setInterval(() => res.write('.'), 300);
        res.on('close', () => clearInterval(timer));
        return;
      }
      case '/cross':
        res.writeHead(302, { location: `http://localhost:${port}/echo` });
        res.end();
        return;
      case '/same':
        res.writeHead(302, { location: '/echo' });
        res.end();
        return;
      case '/to-private':
        res.writeHead(302, { location: '/private/page' });
        res.end();
        return;
      case '/echo':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          cookie: req.headers.cookie ?? '',
          authorization: req.headers.authorization ?? '',
        }));
        return;
      default:
        res.writeHead(200);
        res.end('page');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen = [];
  flakyCount = 0;
  robotsBody = '';
  resetRobotsCache();
  resetScraperHttpCache();
});

function settings(patch: (s: ScraperSettings) => void = () => undefined): ScraperSettings {
  const value = resolveScraperSettings(createDefaultScraperSettingsDocument());
  value.network.randomDelayMinMs = 0;
  value.network.randomDelayMaxMs = 0;
  value.network.retryAttempts = 2;
  value.network.retryDelayMs = 0;
  value.cache.htmlEnabled = false;
  value.cache.metadataEnabled = false;
  value.cache.thumbnailsEnabled = false;
  value.safety.crawlDelayMs = 0;
  value.safety.maxRequestsPerMinute = 0;
  value.safety.respectRobotsTxt = false;
  value.safety.allowPrivateNetwork = true;
  patch(value);
  return value;
}

function underProfile<T>(value: ScraperSettings, fn: () => Promise<T>): Promise<T> {
  return runWithScraperRuntime(scraperRuntimeFor(value, 'test-job'), fn);
}

describe('Retry-After and backoff', () => {
  it('reads delta-seconds and HTTP-dates, capped at a minute', () => {
    expect(retryAfterMs('2')).toBe(2_000);
    expect(retryAfterMs('3600')).toBe(60_000);
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(retryAfterMs('Thu, 01 Jan 2026 00:00:05 GMT', now)).toBe(5_000);
    expect(retryAfterMs('Wed, 31 Dec 2025 00:00:00 GMT', now)).toBe(0);
    expect(retryAfterMs('soon')).toBeNull();
    expect(retryAfterMs(undefined)).toBeNull();
  });

  it('waits out a 503 Retry-After before the retry', async () => {
    const response = await underProfile(settings(), () => scraperRequest(`${base}/flaky?after=1`));
    expect(response.status).toBe(200);
    const hits = seen.filter((s) => s.url === '/flaky');
    expect(hits).toHaveLength(2);
    expect(hits[1].at - hits[0].at).toBeGreaterThanOrEqual(900);
  });

  it('never retries a POST', async () => {
    const response = await underProfile(
      settings(),
      () => scraperRequest(`${base}/always-503`, { method: 'POST', body: 'x=1' }),
    );
    expect(response.status).toBe(503);
    expect(seen.filter((s) => s.url === '/always-503')).toHaveLength(1);
  });

  it('releases the concurrency slot while a retry sleeps', async () => {
    const value = settings((s) => { s.network.concurrentRequests = 1; });
    await underProfile(value, async () => {
      const slow = scraperRequest(`${base}/flaky?after=2`);
      // Let the first attempt land and its sleep begin.
      await vi.waitFor(() => {
        if (!seen.some((s) => s.url === '/flaky')) throw new Error('not yet');
      }, { timeout: 2_000, interval: 10 });
      const started = Date.now();
      const other = await scraperRequest(`${base}/ok`);
      expect(other.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(1_000);
      expect((await slow).status).toBe(200);
    });
  });
});

describe('redirects', () => {
  it('drops cookie and authorization on a cross-origin hop', async () => {
    const response = await scraperRequest(`${base}/cross`, {
      headers: { cookie: 'sid=secret', authorization: 'Bearer secret' },
    });
    expect(JSON.parse(response.body)).toEqual({ cookie: '', authorization: '' });
    expect(seen.at(-1)?.host).toMatch(/^localhost:/);
  });

  it('keeps them on a same-origin hop', async () => {
    const response = await scraperRequest(`${base}/same`, {
      headers: { cookie: 'sid=secret', authorization: 'Bearer secret' },
    });
    expect(JSON.parse(response.body)).toEqual({ cookie: 'sid=secret', authorization: 'Bearer secret' });
  });

  it('asks robots.txt again for a crawl redirect hop', async () => {
    robotsBody = 'User-agent: *\nDisallow: /private\n';
    await expect(underProfile(
      settings((s) => { s.safety.respectRobotsTxt = true; }),
      () => scraperRequest(`${base}/to-private`, { crawl: true }),
    )).rejects.toThrow(/robots\.txt disallows/i);
    expect(seen.map((s) => s.url)).not.toContain('/private/page');
  });
});

describe('deadline and cancellation', () => {
  it('ends an attempt at the total deadline even while bytes keep arriving', async () => {
    const started = Date.now();
    await expect(scraperRequest(`${base}/dribble`, { timeoutMs: 1_000 })).rejects.toThrow(/timed out/i);
    expect(Date.now() - started).toBeLessThan(2_500);
  });

  it('aborts an in-flight request with a recognisable error', async () => {
    const controller = new AbortController();
    const pending = scraperRequest(`${base}/hang`, { signal: controller.signal, timeoutMs: 20_000 });
    await vi.waitFor(() => {
      if (!seen.some((s) => s.url === '/hang')) throw new Error('not yet');
    }, { timeout: 2_000, interval: 10 });
    const started = Date.now();
    controller.abort();
    const error = await pending.then(() => null, (e: unknown) => e);
    expect(isScraperAbortError(error)).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('aborts a retry sleep, and inherits the job scope signal', async () => {
    const controller = new AbortController();
    const runtime = Object.assign(scraperRuntimeFor(settings(), 'job'), { signal: controller.signal });
    const pending = runWithScraperRuntime(runtime, () => scraperRequest(`${base}/flaky?after=30`));
    await vi.waitFor(() => {
      if (!seen.some((s) => s.url === '/flaky')) throw new Error('not yet');
    }, { timeout: 2_000, interval: 10 });
    controller.abort();
    const error = await pending.then(() => null, (e: unknown) => e);
    expect(isScraperAbortError(error)).toBe(true);
    expect(seen.filter((s) => s.url === '/flaky')).toHaveLength(1);
  });
});

describe('cache key', () => {
  it('separates sessions by their credentials, without storing them', () => {
    const anonymous = cacheKeyFor('GET', 'https://a.test/x', undefined);
    const alice = cacheKeyFor('GET', 'https://a.test/x', undefined, 'sid=alice');
    const bob = cacheKeyFor('GET', 'https://a.test/x', undefined, 'sid=bob');
    expect(anonymous).toBe('GET https://a.test/x');
    expect(new Set([anonymous, alice, bob]).size).toBe(3);
    expect(alice).not.toContain('alice');
  });
});

describe('robots.txt', () => {
  it('matches a group by product token, not by substring', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
    expect(parseRobotsTxt('User-agent: Safari\nDisallow: /\n', chrome).rules).toEqual([]);
    expect(parseRobotsTxt('User-agent: MyBot\nDisallow: /a\n', 'MyBot/2.0').group).toBe('MyBot');
    expect(parseRobotsTxt('User-agent: Bot\nDisallow: /a\n', 'MyBot/2.0').rules).toEqual([]);
  });

  it('fetches a host\'s rules again after a day', async () => {
    let fetches = 0;
    const fetchText = async () => {
      fetches += 1;
      return 'User-agent: *\nDisallow: /x\n';
    };
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000_000);
      await robotsRulesFor('https://a.test/1', 'UA', fetchText);
      now.mockReturnValue(1_000_000 + 60 * 60 * 1_000);
      await robotsRulesFor('https://a.test/2', 'UA', fetchText);
      expect(fetches).toBe(1);
      now.mockReturnValue(1_000_000 + 25 * 60 * 60 * 1_000);
      await robotsRulesFor('https://a.test/3', 'UA', fetchText);
      expect(fetches).toBe(2);
    } finally {
      now.mockRestore();
    }
  });
});

describe('private-address guard', () => {
  it('classifies addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.5', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111', '::ffff:1.1.1.1']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('resolves names before deciding', async () => {
    expect(await resolvesToPrivateAddress('localhost')).toBe(true);
    expect(await resolvesToPrivateAddress('127.0.0.1')).toBe(true);
    expect(await resolvesToPrivateAddress('[::1]')).toBe(true);
  });

  it('refuses the Inspector by default, without touching the server', async () => {
    const result = await probeHttp({ method: 'GET', url: `${base}/ok`, headers: {} });
    expect(result.status).toBe(0);
    expect(result.statusText).toMatch(/private/i);
    expect(seen).toEqual([]);
  });

  it('refuses a crawl in a job whose profile does not allow private networks', async () => {
    const error = await underProfile(
      settings((s) => {
        s.safety.allowPrivateNetwork = false;
        s.safety.respectRobotsTxt = true;
      }),
      () => scraperRequest(`${base}/page`, { crawl: true }),
    ).then(() => null, (e: unknown) => e);
    expect((error as { code?: string }).code).toBe('ERR_PRIVATE_ADDRESS');
    // Not even robots.txt was asked for.
    expect(seen).toEqual([]);
  });

  it('lets API calls and allowed profiles through', async () => {
    const value = settings((s) => { s.safety.allowPrivateNetwork = false; });
    expect((await underProfile(value, () => scraperRequest(`${base}/ok`))).status).toBe(200);
    expect((await underProfile(settings(), () => scraperRequest(`${base}/ok`, { crawl: true }))).status).toBe(200);
  });

  it('keeps a torrent index entry\'s typed scheme and port through validation', () => {
    const defaults = resolveScraperSettings(createDefaultScraperSettingsDocument());
    const entry = (id: string, host: string, kind: string) => ({
      id, label: id, host, kind, enabled: true, priority: 1, fallbackIds: [],
    });
    const validated = validateScraperSettings({
      ...defaults,
      sources: {
        ...defaults.sources,
        entries: [
          entry('lan', 'http://192.168.1.5:9117/', 'torrent'),
          entry('bare', 'www.nyaa.si', 'torrent'),
          entry('site', 'https://example.com:8443', 'streaming'),
        ],
        order: ['lan', 'bare', 'site'],
      },
    });
    const hosts = Object.fromEntries(validated.value.sources.entries.map((e) => [e.id, e.host]));
    expect(hosts).toEqual({ lan: 'http://192.168.1.5:9117', bare: 'nyaa.si', site: 'example.com' });
  });

  it('is a validated setting that defaults off', () => {
    const defaults = resolveScraperSettings(createDefaultScraperSettingsDocument());
    expect(defaults.safety.allowPrivateNetwork).toBe(false);
    const validated = validateScraperSettings({ ...defaults, safety: { ...defaults.safety, allowPrivateNetwork: true } });
    expect(validated.value.safety.allowPrivateNetwork).toBe(true);
  });
});
