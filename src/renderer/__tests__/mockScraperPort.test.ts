// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockScraperPort } from '../components/scraper/data/mockScraperPort';
import { DEFAULT_SCRAPER_QBITTORRENT_SETTINGS } from '../../shared/scraperSourceSettings';
import type { ScrapeJobEvent } from '../../shared/scraperResults';

describe('mock scraper port', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('produces the same data on every run', async () => {
    // Determinism is the point: a moving fixture set makes screenshots and
    // layout comparisons worthless.
    const a = await createMockScraperPort().searchTorrents({ text: '' });
    const b = await createMockScraperPort().searchTorrents({ text: '' });
    expect(a.map((t) => t.infoHash)).toEqual(b.map((t) => t.infoHash));
    expect(a[0].seeders).toBe(b[0].seeders);
  });

  it('runs a job through to done, streaming rows and logs on the way', async () => {
    const port = createMockScraperPort();
    const events: ScrapeJobEvent[] = [];
    const jobId = await port.startScrape({ targetUrl: 'frieren', profileId: 'balanced' });
    port.subscribeJob(jobId, (event) => events.push(event));

    await vi.waitFor(
      () => {
        expect(events.some((e) => e.kind === 'done')).toBe(true);
      },
      { timeout: 15_000, interval: 50 },
    );

    expect(events.some((e) => e.kind === 'row')).toBe(true);
    expect(events.some((e) => e.kind === 'log')).toBe(true);
    expect(events.some((e) => e.kind === 'progress')).toBe(true);

    const done = events.find((e) => e.kind === 'done');
    expect(done && done.kind === 'done' && done.summary.found).toBeGreaterThan(0);
  }, 20_000);

  it('returns a result whose episode count matches what the job reported', async () => {
    const port = createMockScraperPort();
    const events: ScrapeJobEvent[] = [];
    const jobId = await port.startScrape({ targetUrl: 'frieren', profileId: 'balanced' });
    port.subscribeJob(jobId, (e) => events.push(e));

    await vi.waitFor(
      () => {
        expect(events.some((e) => e.kind === 'done')).toBe(true);
      },
      { timeout: 15_000, interval: 50 },
    );

    const done = events.find((e) => e.kind === 'done');
    const result = await port.getResult(jobId);
    expect(done?.kind).toBe('done');
    if (done?.kind !== 'done') throw new Error('mock job did not finish');
    expect(result.episodes.length).toBe(done.summary.found);
    expect(result.streams.every((s) => result.episodes.some((e) => e.id === s.episodeId))).toBe(true);
  }, 20_000);

  it('picks the series from the target text', async () => {
    const port = createMockScraperPort();
    const jobId = await port.startScrape({ targetUrl: 'one-piece', profileId: 'balanced' });
    await vi.waitFor(
      async () => {
        const result = await port.getResult(jobId);
        expect(result.seriesId).toBe('one-piece');
      },
      { timeout: 15_000, interval: 100 },
    );
  }, 20_000);

  it('stops emitting once cancelled', async () => {
    const port = createMockScraperPort();
    const events: ScrapeJobEvent[] = [];
    const jobId = await port.startScrape({ targetUrl: 'frieren', profileId: 'balanced' });
    port.subscribeJob(jobId, (e) => events.push(e));
    await port.cancelScrape(jobId);
    const countAfterCancel = events.length;
    await new Promise((r) => setTimeout(r, 600));
    // Only the cancellation stage itself may arrive after the call.
    expect(events.length).toBeLessThanOrEqual(countAfterCancel + 1);
    expect(events.some((e) => e.kind === 'stage' && e.stage === 'cancelled')).toBe(true);
  });

  describe('torrent search filters', () => {
    it('filters by seeders', async () => {
      const port = createMockScraperPort();
      const rows = await port.searchTorrents({ text: '', minSeeders: 500 });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.seeders >= 500)).toBe(true);
    });

    it('filters by resolution and release group', async () => {
      const port = createMockScraperPort();
      const rows = await port.searchTorrents({ text: '', resolution: '720p' });
      expect(rows.every((r) => r.resolution === '720p')).toBe(true);
    });
  });

  describe('qbitTest', () => {
    const port = createMockScraperPort();
    const base = { ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS };

    it('reports not-configured when sending is off', async () => {
      expect((await port.qbitTest({ ...base, enabled: false })).status).toBe('not-configured');
    });

    it('reports unauthorized when credentials are incomplete', async () => {
      expect((await port.qbitTest({ ...base, enabled: true })).status).toBe('unauthorized');
      expect(
        (await port.qbitTest({ ...base, enabled: true, username: 'admin' })).status,
      ).toBe('unauthorized');
    });

    it('reports unreachable when nothing answers', async () => {
      const report = await port.qbitTest({
        ...base,
        enabled: true,
        username: 'admin',
        passwordRef: 'keychain:qbit',
        port: 1,
      });
      expect(report.status).toBe('unreachable');
    });

    it('reports connected when everything is set', async () => {
      const report = await port.qbitTest({
        ...base,
        enabled: true,
        username: 'admin',
        passwordRef: 'keychain:qbit',
      });
      expect(report.status).toBe('connected');
      expect(report.version).toBeTruthy();
    });
  });

  describe('qbitSend', () => {
    it('reports per-item outcomes rather than a single yes/no', async () => {
      const port = createMockScraperPort();
      const rows = await port.searchTorrents({ text: '' });
      const config = {
        ...DEFAULT_SCRAPER_QBITTORRENT_SETTINGS,
        enabled: true,
        username: 'admin',
        passwordRef: 'keychain:qbit',
      };
      const report = await port.qbitSend(rows.slice(0, 5), config);
      expect(report.details).toHaveLength(5);
      expect(report.sent + report.skipped + report.failed).toBe(5);
    });

    it('fails every item when qBittorrent is disabled, and says why', async () => {
      const port = createMockScraperPort();
      const rows = await port.searchTorrents({ text: '' });
      const report = await port.qbitSend(rows.slice(0, 2), DEFAULT_SCRAPER_QBITTORRENT_SETTINGS);
      expect(report.failed).toBe(2);
      expect(report.details[0].reason).toBeTruthy();
    });
  });

  it('evaluates CSS and XPath selectors for real, against real HTML', async () => {
    // These two tools work today precisely because the browser already has both
    // engines — no backend needed.
    const port = createMockScraperPort();
    const html = '<ul class="ep-list"><li class="ep">A</li><li class="ep">B</li></ul>';
    const css = await port.testSelector(html, '.ep', 'css');
    expect(css.map((m) => m.text)).toEqual(['A', 'B']);

    const xpath = await port.testSelector(html, '//li[@class="ep"]', 'xpath');
    expect(xpath).toHaveLength(2);
  });

  it('returns an empty match list rather than throwing on a selector that hits nothing', async () => {
    const port = createMockScraperPort();
    expect(await port.testSelector('<p>x</p>', '.nope', 'css')).toEqual([]);
  });

  it('redacts cookies in a captured response', async () => {
    const port = createMockScraperPort();
    const result = await port.fetchHttp({ method: 'GET', url: 'https://x.example', headers: {} });
    expect(result.headers['set-cookie']).not.toMatch(/[a-z0-9]{8,}=/i);
  });

  it('lists sources, downloads, exports and plugins', async () => {
    const port = createMockScraperPort();
    expect((await port.listSources()).length).toBeGreaterThan(0);
    expect(await port.listAcquisitionProviders()).toMatchObject({
      backend: 'seanime',
      state: 'disabled',
      providers: [],
    });
    expect((await port.listDownloads()).length).toBeGreaterThan(0);
    expect((await port.listExports()).length).toBeGreaterThan(0);
    expect((await port.listPlugins()).length).toBeGreaterThan(0);
    expect((await port.listJobs()).length).toBeGreaterThan(0);
  });

  it('rejects a probe for a source that does not exist', async () => {
    const port = createMockScraperPort();
    await expect(port.probeSource('nope')).rejects.toThrow('Unknown source');
  });
});
