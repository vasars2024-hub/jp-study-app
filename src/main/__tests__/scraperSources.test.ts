// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ScraperSourceEntry } from '../../shared/scraperSourceSettings';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

let tempRoot = '';

const { SOURCE_CATALOGUE, catalogueEntries, classifyProbe, listSources, probeSource, resetSourceHealthCache } =
  await import('../scraper/sources');
const { setScraperStoreRoot, readScraperJson } = await import('../scraper/store');
const { flushScraperLogWrites } = await import('../scraper/logBus');

// A local server stands in for a source host: `probeSource` builds its URL from
// the entry's `host`, so the entry points at 127.0.0.1 and the catalogue's own
// probe paths are exercised separately.
let port = 0;
let server: http.Server;
let behaviour: 'ok' | '403' | 'challenge' | '429' | '500' | '404' | 'hang' = 'ok';

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'scraper-sources-'));
  setScraperStoreRoot(path.join(tempRoot, 'scraper'));
  server = http.createServer((_req, res) => {
    switch (behaviour) {
      case '403':
        res.writeHead(403);
        res.end('forbidden: api key required');
        return;
      case 'challenge':
        res.writeHead(403);
        res.end('<title>Just a moment...</title> cloudflare');
        return;
      case '429':
        res.writeHead(429);
        res.end('slow down');
        return;
      case '500':
        res.writeHead(503);
        res.end('upstream down');
        return;
      case '404':
        res.writeHead(404);
        res.end('nope');
        return;
      case 'hang':
        return;
      default:
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"data":[]}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
  setScraperStoreRoot(null);
  /*
   * `maxRetries`, and it is not cosmetic. Measured 2026-09-05: this file failed a
   * FULL `vitest run` with
   *   ENOTEMPTY: directory not empty, rmdir '...\scraper-sources-A8VQwH\scraper\logs'
   * while every one of its 13 assertions passed — the suite reported `3036 passed`
   * and one FAILED FILE, and the same file passed alone and on a second parallel
   * run. `force: true` only swallows ENOENT; the race here is a scraper log write
   * that lands between the recursive walk and the `rmdir`, which is the exact case
   * Node documents `maxRetries`/`retryDelay` for on Windows.
   */
  await flushScraperLogWrites();
  await fsp.rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

beforeEach(() => {
  behaviour = 'ok';
});

afterEach(async () => {
  resetSourceHealthCache();
  /*
   * `fea9e13c` hardened `afterAll` and this hook got neither half, so on 2026-09-06
   * the branch exited 1 again on the SAME directory from the OTHER hook:
   *   ENOTEMPTY: directory not empty, rmdir '...\scraper-sources-FJC5EM\scraper\logs'
   * reported against `probeSource > caps the stored history so it cannot grow
   * forever`, with 14,706 tests passed and 0 test failures. Naming a test is the
   * tell that it is `afterEach` and not `afterAll`.
   *
   * Same two causes `99d56428` closed in the sibling suite, in the same order: a
   * scraper log write can still be in flight when the recursive walk starts, and
   * `force: true` swallows only ENOENT, so a write landing between the walk and the
   * `rmdir` needs the `maxRetries` Node documents for exactly this on Windows.
   */
  await flushScraperLogWrites();
  await fsp.rm(path.join(tempRoot, 'scraper'), {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  });
});

function entry(overrides: Partial<ScraperSourceEntry> = {}): ScraperSourceEntry {
  return {
    id: 'local',
    label: 'Local test source',
    host: `127.0.0.1:${port}`,
    kind: 'metadata',
    enabled: true,
    priority: 1,
    fallbackIds: [],
    verifiedSiteId: '',
    requiresAuth: false,
    supportsSubtitles: false,
    health: 'unknown',
    lastCheckedAt: null,
    notes: '',
    ...overrides,
  };
}

describe('the source catalogue', () => {
  it('lists real hosts this app talks to, with unique ids', () => {
    const ids = SOURCE_CATALOGUE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('jikan');
    expect(ids).toContain('anilist');
    expect(ids).toContain('nyaa');
    for (const source of SOURCE_CATALOGUE) {
      expect(source.host).toMatch(/^[a-z0-9.-]+$/);
      expect(source.probePath.startsWith('/')).toBe(true);
    }
  });

  it('seeds settings entries with densified priorities', () => {
    const entries = catalogueEntries();
    expect(entries.map((e) => e.priority)).toEqual(entries.map((_, i) => i + 1));
    expect(entries.every((e) => e.enabled)).toBe(true);
  });
});

describe('classifyProbe', () => {
  it('separates "refusing me" from "broken" from "not answering"', () => {
    expect(classifyProbe(200, '').health).toBe('ok');
    expect(classifyProbe(301, '').health).toBe('ok');
    // GraphQL answers 400 to a bare GET — the host is demonstrably alive.
    expect(classifyProbe(400, '').health).toBe('ok');
    expect(classifyProbe(401, '').health).toBe('blocked');
    expect(classifyProbe(429, '').health).toBe('blocked');
    expect(classifyProbe(503, '').health).toBe('degraded');
    expect(classifyProbe(404, '').health).toBe('degraded');
    expect(classifyProbe(0, '').health).toBe('offline');
  });

  it('names an anti-bot challenge distinctly from a missing key', () => {
    expect(classifyProbe(403, 'Just a moment... cloudflare').note).toMatch(/anti-bot/i);
    expect(classifyProbe(403, 'missing api key').note).toMatch(/authentication/i);
  });
});

describe('listSources', () => {
  it('falls back to the catalogue when the profile has no sources yet', async () => {
    const list = await listSources([]);
    expect(list.map((s) => s.id)).toEqual(SOURCE_CATALOGUE.map((s) => s.id));
    expect(list[0].health).toBe('unknown');
  });

  it('does not probe — opening the page must not fire six requests', async () => {
    let hits = 0;
    const counting = http.createServer((_req, res) => {
      hits += 1;
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>((resolve) => counting.listen(0, '127.0.0.1', resolve));
    const countingPort = (counting.address() as AddressInfo).port;
    await listSources([entry({ host: `127.0.0.1:${countingPort}` })]);
    expect(hits).toBe(0);
    await new Promise<void>((resolve) => counting.close(() => resolve()));
  });

  it('returns the stored health for entries that have been probed', async () => {
    await probeSource(entry());
    const list = await listSources([entry()]);
    expect(list[0].health).toBe('ok');
    expect(list[0].history).toEqual([1]);
    expect(list[0].latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('probeSource', () => {
  it('reports a healthy source with a real latency', async () => {
    const status = await probeSource(entry());
    expect(status.health).toBe('ok');
    expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    expect(status.latencyMs).toBeLessThan(10_000);
  });

  it('classifies a rate limit as blocked, not offline', async () => {
    behaviour = '429';
    expect((await probeSource(entry())).health).toBe('blocked');
  });

  it('classifies a dead host as offline', async () => {
    const status = await probeSource(entry({ host: '127.0.0.1:1' }));
    expect(status.health).toBe('offline');
  });

  it('gives up on a hung host within the timeout', async () => {
    behaviour = 'hang';
    const started = Date.now();
    const status = await probeSource(entry(), 1_200);
    expect(status.health).toBe('offline');
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it('accumulates a success history that survives a restart', async () => {
    await probeSource(entry());
    behaviour = '500';
    await probeSource(entry());
    behaviour = 'ok';
    const third = await probeSource(entry());
    expect(third.history).toEqual([1, 0, 1]);

    // Reload from disk as a fresh process would.
    resetSourceHealthCache();
    const reloaded = await listSources([entry()]);
    expect(reloaded[0].history).toEqual([1, 0, 1]);
  });

  it('caps the stored history so it cannot grow forever', async () => {
    for (let i = 0; i < 25; i += 1) await probeSource(entry());
    const stored = await readScraperJson<Record<string, { history: number[] }>>(
      'source-health.json',
      {},
    );
    expect(stored.local.history.length).toBe(20);
  });
});
