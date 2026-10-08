// @vitest-environment node
//
// P8: a site rule follows the listing's own "next page" link, bounded by the
// rule's page cap, never off the origin and never round a loop.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DOMParser } from 'linkedom';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  type ScraperSettings,
} from '../../shared/scraperSettings';
import type { ScrapeJobEvent } from '../../shared/scraperResults';
import { DEFAULT_SITE_RULE, type RuleDocument, type ScraperSiteRule } from '../../shared/scraperSiteRules';

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/gum-vitest-userdata`, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('../scraper/catalogue', async () => {
  const actual = await vi.importActual<typeof import('../scraper/catalogue')>('../scraper/catalogue');
  return {
    ...actual,
    searchCatalogue: async () => {
      throw new Error('catalogue was consulted, but a site rule should have handled this');
    },
  };
});

vi.mock('../scraper/torrents', () => ({ searchTorrents: async () => [] }));

const { nextPageUrl, resetScrapeJobs, startScrape } = await import('../scraper/engine');

function page(numbers: number[], next: string): string {
  const rows = numbers
    .map((n) => `<tr class="ep"><th class="no">${n}</th><td class="title">Episode title ${n}</td><td><a href="/watch/${n}">play</a></td></tr>`)
    .join('');
  const link = next ? `<a rel="next" href="${next}">next</a>` : '';
  return `<!doctype html><html><head><title>Paged</title></head><body><table class="eps"><tbody>${rows}</tbody></table>${link}</body></html>`;
}

const PAGES: Record<string, string> = {
  '/p1': page([1, 2], '/p2'),
  '/p2': page([3, 4], '/p3?x=1#top'),
  '/p3': page([5], '/p1'),
  '/away': page([1], 'http://example.invalid/p2'),
  '/broken': page([1], '/gone'),
};

let base = '';
let server: http.Server;
const hits: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    hits.push(url.pathname);
    const body = PAGES[url.pathname];
    if (body) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('<html><body>not found</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  resetScrapeJobs();
  hits.length = 0;
});

function rule(over: Partial<ScraperSiteRule> = {}): ScraperSiteRule {
  return {
    ...DEFAULT_SITE_RULE,
    id: 'paged',
    host: '127.0.0.1',
    sampleUrl: `${base}/p1`,
    episodeSelector: 'table.eps tr.ep',
    titleSelector: '.title',
    linkSelector: 'a',
    numberSelector: 'th.no',
    nextPageSelector: 'a[rel=next]',
    enabled: true,
    ...over,
  };
}

function settingsWith(rules: ScraperSiteRule[]): ScraperSettings {
  const settings = resolveScraperSettings(createDefaultScraperSettingsDocument());
  settings.extraction.siteRules = rules;
  // The fixture server is on 127.0.0.1, which the crawl guard refuses by default.
  (settings.safety as unknown as Record<string, unknown>).allowPrivateNetwork = true;
  return settings;
}

async function numbersFor(r: ScraperSiteRule, target: string): Promise<number[]> {
  const events: ScrapeJobEvent[] = [];
  startScrape({ request: { targetUrl: target, profileId: 'default' }, settings: settingsWith([r]) }, (_id, event) => events.push(event));
  await vi.waitFor(
    () => {
      if (!events.some((e) => e.kind === 'done' || e.kind === 'error')) throw new Error('not finished');
    },
    { timeout: 10_000, interval: 10 },
  );
  const error = events.find((e) => e.kind === 'error');
  if (error) throw new Error(JSON.stringify(error));
  return events.flatMap((e) => (e.kind === 'row' ? [e.row.number] : []));
}

describe('site-rule pagination', () => {
  it('reads only page one by default (maxPages 1)', async () => {
    expect(await numbersFor(rule(), `${base}/p1`)).toEqual([1, 2]);
    // The HTTP cache may serve /p1 itself; what matters is page two was never asked for.
    expect(hits).not.toContain('/p2');
  });

  it('follows the next link up to the page cap', async () => {
    expect(await numbersFor(rule({ maxPages: 2 }), `${base}/p1`)).toEqual([1, 2, 3, 4]);
  });

  it('stops on a URL it has already read, keeping every row once', async () => {
    expect(await numbersFor(rule({ maxPages: 10 }), `${base}/p1`)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never follows a link to another origin', async () => {
    expect(await numbersFor(rule({ maxPages: 5 }), `${base}/away`)).toEqual([1]);
  });

  it('keeps the rows it has when a later page fails', async () => {
    expect(await numbersFor(rule({ maxPages: 5 }), `${base}/broken`)).toEqual([1]);
  });

  it('continues row positions across pages for unnumbered rows', async () => {
    const numbers = await numbersFor(rule({ maxPages: 3, numberSelector: '.missing' }), `${base}/p1`);
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('site rule settings validation', () => {
  it('defaults the new fields and clamps maxPages to 1..50', async () => {
    const { validateScraperSettings } = await import('../../shared/scraperSettings');
    const base = { id: 'a', host: 'x.test', sampleUrl: 'https://x.test/' };
    const out = validateScraperSettings({
      extraction: { siteRules: [base, { ...base, id: 'b', maxPages: 500, nextPageSelector: 'a.next' }, { ...base, id: 'c', maxPages: 0 }] },
    }).value.extraction.siteRules;
    expect(out.map((r) => [r.nextPageSelector, r.maxPages])).toEqual([['', 1], ['a.next', 50], ['', 1]]);
  });
});

describe('nextPageUrl', () => {
  const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html') as unknown as RuleDocument;

  it('resolves relative links and drops the fragment', () => {
    expect(nextPageUrl(doc('<a class="n" href="?page=2#x">n</a>'), 'a.n', 'https://a.test/list', 'https://a.test/list'))
      .toBe('https://a.test/list?page=2');
  });

  it('returns null for an empty selector, no match, an anchor or a script link', () => {
    expect(nextPageUrl(doc('<a class="n" href="/2">n</a>'), '', 'https://a.test/', 'https://a.test/')).toBeNull();
    expect(nextPageUrl(doc('<p></p>'), 'a.n', 'https://a.test/', 'https://a.test/')).toBeNull();
    expect(nextPageUrl(doc('<a class="n" href="#more">n</a>'), 'a.n', 'https://a.test/', 'https://a.test/')).toBeNull();
    expect(nextPageUrl(doc('<a class="n" href="javascript:void(0)">n</a>'), 'a.n', 'https://a.test/', 'https://a.test/')).toBeNull();
  });

  it('returns null for invalid CSS and for another origin', () => {
    expect(nextPageUrl(doc('<a href="/2">n</a>'), 'a[', 'https://a.test/', 'https://a.test/')).toBeNull();
    expect(nextPageUrl(doc('<a class="n" href="https://b.test/2">n</a>'), 'a.n', 'https://a.test/', 'https://a.test/')).toBeNull();
  });
});
