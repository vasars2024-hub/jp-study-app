// @vitest-environment node
//
// Connection Profiles reach the wire. The panel says "Unassigned hosts use the
// active profile", and before this nothing read the document at all. Two hosts
// on one local server are told apart by name (127.0.0.1 vs localhost), one of
// them assigned its own profile; the request each makes carries that profile's
// headers and nobody else's.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { scraperRequest } = await import('../scraper/http');
const { runWithScraperRuntime, scraperRuntimeFor, runtimeForUrl } = await import('../scraper/runtime');
const { DEFAULT_SCRAPER_SETTINGS } = await import('../../shared/scraperSettings');
const {
  createDefaultConnectionProfilesDocument,
  resolveConnectionScope,
} = await import('../../shared/connectionProfiles');

let server: http.Server;
let port = 0;
const seen: { host: string; profile: string }[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push({ host: String(req.headers.host ?? ''), profile: String(req.headers['x-profile'] ?? '') });
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
});

function settingsWith(profile: string) {
  return {
    ...DEFAULT_SCRAPER_SETTINGS,
    network: {
      ...DEFAULT_SCRAPER_SETTINGS.network,
      headers: { 'x-profile': profile },
      randomDelayMinMs: 0,
      randomDelayMaxMs: 0,
      retryAttempts: 0,
    },
    cache: { ...DEFAULT_SCRAPER_SETTINGS.cache, htmlEnabled: false, metadataEnabled: false },
    safety: { ...DEFAULT_SCRAPER_SETTINGS.safety, crawlDelayMs: 0 },
  };
}

describe('per-host connection profiles in the request layer', () => {
  it('an assigned host uses its own profile; every other host keeps the run’s', async () => {
    const assigned = settingsWith('assigned');
    const runtime = scraperRuntimeFor(settingsWith('active'), 'job-scope', {
      localhost: {
        network: assigned.network,
        safety: assigned.safety,
        cache: assigned.cache,
        session: assigned.session,
      },
    });
    seen.length = 0;
    await runWithScraperRuntime(runtime, async () => {
      await scraperRequest(`http://127.0.0.1:${port}/a`);
      await scraperRequest(`http://localhost:${port}/b`);
    });
    expect(seen.map((s) => s.profile)).toEqual(['active', 'assigned']);
  });

  it('matches hosts without their www. prefix and case-insensitively', () => {
    const runtime = scraperRuntimeFor(settingsWith('active'), 'job', {
      'WWW.Example.org': {
        network: settingsWith('x').network,
        safety: DEFAULT_SCRAPER_SETTINGS.safety,
        cache: DEFAULT_SCRAPER_SETTINGS.cache,
        session: DEFAULT_SCRAPER_SETTINGS.session,
      },
    });
    expect(runtimeForUrl(runtime, 'https://example.org/page')).not.toBe(runtime);
    expect(runtimeForUrl(runtime, 'https://www.example.org/page')).not.toBe(runtime);
    expect(runtimeForUrl(runtime, 'https://other.org/')).toBe(runtime);
  });

  it('resolves the active profile over the scraper settings and each assignment separately', () => {
    const document = {
      ...createDefaultConnectionProfilesDocument('2026-09-24T00:00:00.000Z'),
      activeProfileId: 'conservative',
      siteAssignments: { 'nyaa.si': 'fast' },
    };
    const scope = resolveConnectionScope(document, DEFAULT_SCRAPER_SETTINGS);
    expect(scope.settings.network.concurrentRequests).toBe(1);
    expect(scope.settings.safety.respectRobotsTxt).toBe(true);
    expect(scope.hosts['nyaa.si'].network.concurrentRequests).toBe(8);
    // The balanced default changes nothing, so an untouched document is a no-op.
    const untouched = resolveConnectionScope(createDefaultConnectionProfilesDocument(), DEFAULT_SCRAPER_SETTINGS);
    expect(untouched.settings).toEqual(DEFAULT_SCRAPER_SETTINGS);
    expect(untouched.hosts).toEqual({});
  });
});
