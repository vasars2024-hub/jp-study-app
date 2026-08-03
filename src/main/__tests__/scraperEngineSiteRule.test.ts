// @vitest-environment node
//
// The engine's site-rule path, end to end against a real local server.
//
// Deliberately not stubbing HTTP: the whole point of a site rule is that it
// runs against markup a server actually sent, parsed by the same linkedom the
// app ships. A mocked transport would prove none of that.

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
  app: { getPath: () => process.cwd(), getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));

// The catalogue is stubbed only so a mis-routed job fails loudly instead of
// quietly reaching the network: if a site rule ever fails to take priority,
// these tests report it rather than hanging on a real AniList call.
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

const { audioLabel, buildRuleRows, idSlugFromUrl, jobResult, resetScrapeJobs, startScrape } =
  await import('../scraper/engine');

const EPISODES = `<!doctype html>
<html><head><title>Frieren episodes — Test Fixture Site</title></head><body>
  <nav><a href="/">home</a><a href="/about">about</a></nav>
  <table class="eps"><tbody>
    <tr class="ep"><th class="no">1</th><td class="title">The Journey's End</td><td><a href="/watch/1">play</a></td></tr>
    <tr class="ep"><th class="no">2</th><td class="title">It Didn't Have to Be Magic</td><td><a href="/watch/2">play</a></td></tr>
    <tr class="ep"><th class="no">3</th><td class="title">Killing Magic</td><td><a href="/watch/3">play</a></td></tr>
  </tbody></table>
</body></html>`;

const EMPTY_PAGE = '<!doctype html><html><head><title>Nothing</title></head><body><p>no episodes</p></body></html>';

let base = '';
let host = '';
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/episodes') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(EPISODES);
      return;
    }
    if (url.pathname === '/empty') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(EMPTY_PAGE);
      return;
    }
    if (url.pathname === '/gone') {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<html><body>not found</body></html>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>ok</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  host = `127.0.0.1:${port}`;
  base = `http://${host}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  resetScrapeJobs();
});

function rule(over: Partial<ScraperSiteRule> = {}): ScraperSiteRule {
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
    ...over,
  };
}

function settingsWith(rules: ScraperSiteRule[], patch?: (s: ScraperSettings) => void): ScraperSettings {
  const settings = resolveScraperSettings(createDefaultScraperSettingsDocument());
  settings.extraction.siteRules = rules;
  patch?.(settings);
  return settings;
}

async function runJob(settings: ScraperSettings, target: string): Promise<{
  jobId: string;
  events: ScrapeJobEvent[];
}> {
  const events: ScrapeJobEvent[] = [];
  const jobId = startScrape(
    { request: { targetUrl: target, profileId: 'default' }, settings },
    (_id, event) => events.push(event),
  );
  await vi.waitFor(
    () => {
      const settled = events.some(
        (e) => e.kind === 'done'
          || e.kind === 'error'
          || (e.kind === 'stage' && e.stage === 'cancelled'),
      );
      if (!settled) throw new Error('not finished');
    },
    { timeout: 10_000, interval: 10 },
  );
  return { jobId, events };
}

describe('site-rule scraping', () => {
  it('scrapes a page the catalogue knows nothing about', async () => {
    const { events } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    const done = events.find((e) => e.kind === 'done');
    expect(done).toBeTruthy();
    if (done?.kind !== 'done') return;
    expect(done.summary.found).toBe(3);
    expect(done.summary.provider).toBe('Site rule · 127.0.0.1');
  });

  it('emits one row per episode, in order', async () => {
    const { events } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    const rows = events.filter((e) => e.kind === 'row');
    expect(rows).toHaveLength(3);
    expect(rows.map((e) => (e.kind === 'row' ? e.row.number : 0))).toEqual([1, 2, 3]);
    expect(rows.map((e) => (e.kind === 'row' ? e.row.titleEn : ''))).toEqual([
      "The Journey's End",
      "It Didn't Have to Be Magic",
      'Killing Magic',
    ]);
  });

  it('resolves episode links against the target URL', async () => {
    const { jobId } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    const result = jobResult(jobId);
    expect(result?.episodes[0]?.url).toBe(`${base}/watch/1`);
  });

  it('records the rule as the row source', async () => {
    const { jobId } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    const row = jobResult(jobId)?.episodes[0];
    expect(row?.sourceId).toBe('site-rule:fixture');
    expect(row?.sourceLabel).toBe('127.0.0.1');
  });

  it('builds an id-safe series id', async () => {
    const { jobId } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    const seriesId = jobResult(jobId)?.seriesId ?? '';
    expect(seriesId).toBe('site-fixture-episodes');
    expect(seriesId).toMatch(/^[a-z0-9-]+$/);
  });

  it('walks the normal stages', async () => {
    const { events } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    const stages = events.filter((e) => e.kind === 'stage').map((e) => (e.kind === 'stage' ? e.stage : ''));
    expect(stages).toEqual(['searching', 'fetching', 'parsing', 'validating', 'done']);
  });

  it('takes the page title as the series title', async () => {
    const { jobId } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    expect(jobResult(jobId)?.metadata.titleEn).toContain('Frieren episodes');
  });

  it('leaves catalogue-only metadata empty rather than inventing it', async () => {
    const { jobId } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    const metadata = jobResult(jobId)?.metadata;
    expect(metadata?.titleJa).toBe('');
    expect(metadata?.synopsis).toBe('');
    expect(metadata?.genres).toEqual([]);
    expect(metadata?.aniListId).toBeNull();
    expect(jobResult(jobId)?.episodes[0]?.airDate).toBe('');
  });

  it('carries no torrents or images', async () => {
    const { jobId } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    expect(jobResult(jobId)?.torrents).toEqual([]);
    expect(jobResult(jobId)?.images).toEqual([]);
  });

  it('ignores a disabled rule and falls back to the catalogue', async () => {
    const { events } = await runJob(settingsWith([rule({ enabled: false })]), `${base}/episodes`);
    const error = events.find((e) => e.kind === 'error');
    expect(error?.kind === 'error' && error.message).toContain('catalogue was consulted');
  });

  it('ignores a rule for a different host', async () => {
    const { events } = await runJob(
      settingsWith([rule({ host: 'somewhere-else.test' })]),
      `${base}/episodes`,
    );
    const error = events.find((e) => e.kind === 'error');
    expect(error?.kind === 'error' && error.message).toContain('catalogue was consulted');
  });

  it('fails clearly when the rule matches nothing', async () => {
    const { events } = await runJob(settingsWith([rule()]), `${base}/empty`);
    const error = events.find((e) => e.kind === 'error');
    expect(error?.kind === 'error' && error.message).toContain('matched nothing');
  });

  it('fails clearly when the page is missing', async () => {
    const { events } = await runJob(settingsWith([rule()]), `${base}/gone`);
    const error = events.find((e) => e.kind === 'error');
    expect(error?.kind === 'error' && error.message).toContain('404');
  });

  it('fails clearly when the selector is not valid CSS', async () => {
    const { events } = await runJob(
      settingsWith([rule({ episodeSelector: 'tr[' })]),
      `${base}/episodes`,
    );
    expect(events.some((e) => e.kind === 'error')).toBe(true);
  });

  it('reports progress across the extracted rows', async () => {
    const { events } = await runJob(settingsWith([rule()]), `${base}/episodes`);
    const progress = events.filter((e) => e.kind === 'progress');
    expect(progress.length).toBeGreaterThan(0);
    const last = progress[progress.length - 1];
    expect(last?.kind === 'progress' && last.done).toBe(3);
    expect(last?.kind === 'progress' && last.total).toBe(3);
  });
});

describe('buildRuleRows', () => {
  const settings = () => resolveScraperSettings(createDefaultScraperSettingsDocument());

  it('falls back to the document position when a row has no number', () => {
    const rows = buildRuleRows(
      {
        rows: [
          { index: 1, number: null, title: 'A', link: 'https://x/1', rawLink: '/1' },
          { index: 2, number: null, title: 'B', link: 'https://x/2', rawLink: '/2' },
        ],
        checks: [],
        ok: true,
        error: '',
      },
      rule(),
      settings(),
      'series-1',
    );
    expect(rows.map((row) => row.number)).toEqual([1, 2]);
    expect(rows.map((row) => row.id)).toEqual(['series-1-e1', 'series-1-e2']);
  });

  it('sorts naturally when the profile asks it to', () => {
    const withSort = settings();
    withSort.episodeProcessing.naturalSort = true;
    const rows = buildRuleRows(
      {
        rows: [
          { index: 1, number: 3, title: 'C', link: '', rawLink: '' },
          { index: 2, number: 1, title: 'A', link: '', rawLink: '' },
        ],
        checks: [],
        ok: true,
        error: '',
      },
      rule(),
      withSort,
      'series-1',
    );
    expect(rows.map((row) => row.number)).toEqual([1, 3]);
  });
});

// Regression: the series id used the search-query slug, so a real Wikipedia URL
// produced `site-rule-…-List of Frieren: Beyond Journey's End episodes` —
// spaces, a colon and an apostrophe inside something used as an id and in
// export filenames.
describe('idSlugFromUrl', () => {
  it('strips spaces and punctuation from a wordy path', () => {
    expect(idSlugFromUrl("https://en.wikipedia.org/wiki/List_of_Frieren:_Beyond_Journey%27s_End_episodes"))
      .toBe('list-of-frieren-beyond-journey-s-end-episodes');
  });

  it('lowercases and dash-joins', () => {
    expect(idSlugFromUrl('https://example.com/anime/One-Piece')).toBe('one-piece');
  });

  it('falls back to the host when no segment is wordy', () => {
    expect(idSlugFromUrl('https://example.com/')).toBe('example-com');
  });

  it('falls back to a constant for an unparseable URL', () => {
    expect(idSlugFromUrl('%%%')).toBe('page');
  });

  it('never leaves a leading or trailing dash', () => {
    const slug = idSlugFromUrl('https://example.com/--weird--');
    expect(slug.startsWith('-')).toBe(false);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('bounds the length', () => {
    const long = `https://example.com/${'a-'.repeat(200)}end`;
    expect(idSlugFromUrl(long).length).toBeLessThanOrEqual(64);
  });
});

// Regression: the audio column compared the preference against 'dub', which no
// setting can equal, so every row read 'sub' regardless of the profile.
describe('audioLabel', () => {
  it.each([
    ['subbed', 'sub'],
    ['dubbed', 'dub'],
    ['raw', 'raw'],
    ['none', ''],
  ] as const)('maps %s to %s', (preference, expected) => {
    expect(audioLabel(preference)).toBe(expected);
  });
});
