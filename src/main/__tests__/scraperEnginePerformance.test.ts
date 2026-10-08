// @vitest-environment node
//
// The Performance settings group, as far as this backend can carry it.
//
// Two of the seven fields reach real code: Parallel Jobs, which decides how many
// runs the engine admits, and Batch Size, which decides how often a run reports
// progress. Both are asserted here through the engine's own event stream and a
// real local server, on the site-rule path so no catalogue is involved.
//
// The other five — Parallel Downloads, Memory Budget, CPU Ceiling, Reuse Browser
// Context, Prefetch Next Page — have no consumer in this backend and are not
// tested here, because there is nothing to test. That gap is recorded in
// PHASE_4_SEANIME_SCRAPER_STATE.md rather than papered over.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  type ScraperSettings,
} from '../../shared/scraperSettings';
import type { ScrapeJobEvent } from '../../shared/scraperResults';
import { DEFAULT_SITE_RULE, type ScraperSiteRule } from '../../shared/scraperSiteRules';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('../scraper/catalogue', async () => {
  const actual = await vi.importActual<typeof import('../scraper/catalogue')>(
    '../scraper/catalogue',
  );
  return {
    ...actual,
    searchCatalogue: async () => {
      throw new Error('catalogue was consulted, but a site rule should have handled this');
    },
  };
});

vi.mock('../scraper/torrents', () => ({ searchTorrents: async () => [] }));

const { resetScrapeJobs, startScrape } = await import('../scraper/engine');
const { resetScraperHttpCache } = await import('../scraper/httpCache');

const EPISODES = `<!doctype html>
<html><head><title>Fixture episodes</title></head><body>
  <table class="eps"><tbody>
${Array.from({ length: 8 }, (_, i) => `    <tr class="ep"><th class="no">${i + 1}</th><td class="title">Episode title ${i + 1}</td><td><a href="/watch/${i + 1}">play</a></td></tr>`).join('\n')}
  </tbody></table>
</body></html>`;

let base = '';
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    // Slow enough that two admitted jobs genuinely overlap, and one admitted job
    // genuinely blocks the next.
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(EPISODES);
    }, 120);
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
  resetScrapeJobs();
  resetScraperHttpCache();
});

function rule(): ScraperSiteRule {
  return {
    ...DEFAULT_SITE_RULE,
    id: 'fixture',
    host: '127.0.0.1',
    sampleUrl: `${base}/episodes`,
    episodeSelector: 'table.eps tr.ep',
    titleSelector: '.title',
    linkSelector: 'a',
    numberSelector: 'th.no',
    enabled: true,
  };
}

function settings(patch: (s: ScraperSettings) => void = () => undefined): ScraperSettings {
  const value = resolveScraperSettings(createDefaultScraperSettingsDocument());
  value.extraction.siteRules = [rule()];
  value.network.randomDelayMinMs = 0;
  value.network.randomDelayMaxMs = 0;
  // Each job in these tests must reach the server; a cache hit would remove the
  // very overlap being measured.
  value.cache.htmlEnabled = false;
  // The page server is on 127.0.0.1, which a crawl refuses by default (SSRF guard).
  value.safety.allowPrivateNetwork = true;
  patch(value);
  return value;
}

interface Recorded {
  jobId: string;
  event: ScrapeJobEvent;
}

/** Starts `count` jobs at once and waits for all of them to settle. */
async function runJobs(value: ScraperSettings, count: number): Promise<Recorded[]> {
  const log: Recorded[] = [];
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(startScrape(
      { request: { targetUrl: `${base}/episodes?job=${i}`, profileId: 'default' }, settings: value },
      (jobId, event) => log.push({ jobId, event }),
    ));
  }
  await vi.waitFor(
    () => {
      const settled = new Set(
        log
          .filter((r) => r.event.kind === 'done'
            || r.event.kind === 'error'
            || (r.event.kind === 'stage' && r.event.stage === 'cancelled'))
          .map((r) => r.jobId),
      );
      if (settled.size < ids.length) throw new Error(`${settled.size}/${ids.length} settled`);
    },
    { timeout: 15_000, interval: 10 },
  );
  return log;
}

/** The order in which jobs first left the queue, and in which they finished. */
function order(log: Recorded[]): { started: string[]; finished: string[] } {
  const started: string[] = [];
  const finished: string[] = [];
  for (const { jobId, event } of log) {
    if (event.kind === 'stage' && event.stage === 'searching' && !started.includes(jobId)) {
      started.push(jobId);
    }
    if (event.kind === 'done') finished.push(jobId);
  }
  return { started, finished };
}

/** True when some job started before an earlier job had finished. */
function overlapped(log: Recorded[]): boolean {
  const running = new Set<string>();
  let peak = 0;
  for (const { jobId, event } of log) {
    if (event.kind === 'stage' && event.stage === 'searching') running.add(jobId);
    if (event.kind === 'done' || event.kind === 'error') running.delete(jobId);
    peak = Math.max(peak, running.size);
  }
  return peak > 1;
}

describe('performance.maxParallelJobs', () => {
  it('runs one job at a time when set to 1', async () => {
    const log = await runJobs(settings((s) => {
      s.performance.maxParallelJobs = 1;
    }), 3);
    const { started, finished } = order(log);
    expect(started).toHaveLength(3);
    expect(finished).toHaveLength(3);
    expect(overlapped(log)).toBe(false);
    // Admission is FIFO, so the finish order matches the start order.
    expect(finished).toEqual(started);
  });

  it('lets jobs overlap when the limit allows it', async () => {
    const log = await runJobs(settings((s) => {
      s.performance.maxParallelJobs = 3;
    }), 3);
    expect(order(log).finished).toHaveLength(3);
    expect(overlapped(log)).toBe(true);
  });

  it('holds a job at "queued" until a slot frees, rather than failing it', async () => {
    const log = await runJobs(settings((s) => {
      s.performance.maxParallelJobs = 1;
    }), 2);
    expect(log.some((r) => r.event.kind === 'error')).toBe(false);
    expect(order(log).finished).toHaveLength(2);
  });
});

describe('performance.batchSize', () => {
  it('reports progress once per row at a batch size of 1', async () => {
    const log = await runJobs(settings((s) => {
      s.performance.maxParallelJobs = 1;
      s.performance.batchSize = 1;
    }), 1);
    const rows = log.filter((r) => r.event.kind === 'row');
    const progress = log.filter((r) => r.event.kind === 'progress');
    expect(rows).toHaveLength(8);
    expect(progress).toHaveLength(8);
  });

  it('reports once for the whole set when the batch covers it', async () => {
    const log = await runJobs(settings((s) => {
      s.performance.maxParallelJobs = 1;
      s.performance.batchSize = 50;
    }), 1);
    expect(log.filter((r) => r.event.kind === 'row')).toHaveLength(8);
    expect(log.filter((r) => r.event.kind === 'progress')).toHaveLength(1);
  });

  it('always reports the last row, whatever the batch size', async () => {
    const log = await runJobs(settings((s) => {
      s.performance.maxParallelJobs = 1;
      s.performance.batchSize = 3;
    }), 1);
    const progress = log.filter((r) => r.event.kind === 'progress');
    // 8 rows in batches of 3 report at 3, 6 and 8.
    expect(progress.map((r) => (r.event.kind === 'progress' ? r.event.done : 0))).toEqual([3, 6, 8]);
    const last = progress[progress.length - 1].event;
    expect(last.kind === 'progress' && last.total).toBe(8);
  });
});
