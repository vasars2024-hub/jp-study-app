// @vitest-environment node
//
// The private-address guard, round 2:
//
// - a guarded crawl's robots.txt fetch is under the guard too (it is a request
//   to a host a page named), every hop and the socket's own lookup;
// - a guarded request through a PROXY is checked again once the proxy has
//   answered: a name that resolves privately by then (a DNS rebind between the
//   pre-flight check and the proxy's own lookup) has its response discarded.
//
// DNS is answered by the test (`node:dns` mocked for the guard's lookups); the
// "proxy" and the "site" are local servers.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Static: `vi.mock` below is hoisted above this import, so the guard sees the mocked DNS.
import { __httpTestables, scraperRequest } from '../scraper/http';

const dnsAnswers = vi.hoisted(() => ({ byHost: new Map<string, string[]>(), asked: [] as string[] }));

vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  const answer = (host: string): string => {
    dnsAnswers.asked.push(host);
    const queue = dnsAnswers.byHost.get(host);
    if (!queue?.length) return '127.0.0.1';
    return queue.length > 1 ? queue.shift() as string : queue[0];
  };
  const promisesLookup = async (host: string) => [{ address: answer(host), family: 4 }];
  const lookup = (host: string, _options: unknown, cb: (err: Error | null, list: Array<{ address: string; family: number }>) => void) =>
    cb(null, [{ address: answer(host), family: 4 }]);
  const mocked = { ...actual, lookup, promises: { ...actual.promises, lookup: promisesLookup } };
  return { ...mocked, default: mocked };
});

vi.mock('electron', () => ({ app: { getPath: () => process.env.TEMP ?? '/tmp', getAppMetrics: () => [] } }));


let site: http.Server;
let siteBase = '';
const siteHits: string[] = [];
let proxy: http.Server;
let proxyBase = '';
const proxied: string[] = [];

beforeAll(async () => {
  site = http.createServer((req, res) => {
    siteHits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(req.url === '/robots.txt' ? 'User-agent: *\nDisallow: /private/\n' : 'site page');
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  siteBase = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  // A forward proxy that answers absolute-form requests itself (as if it fetched them).
  proxy = http.createServer((req, res) => {
    proxied.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`proxied ${req.url}`);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  proxyBase = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});

afterAll(async () => {
  site.closeAllConnections();
  proxy.closeAllConnections();
  await new Promise((r) => site.close(r));
  await new Promise((r) => proxy.close(r));
});

beforeEach(() => {
  dnsAnswers.byHost.clear();
  dnsAnswers.asked.length = 0;
  siteHits.length = 0;
  proxied.length = 0;
});

describe('robots.txt under the guard', () => {
  it('a guarded crawl\'s robots.txt fetch is refused for a private host, and never reaches it', async () => {
    await expect(__httpTestables.fetchRobotsText(`${siteBase}/robots.txt`, null as never, true))
      .rejects.toMatchObject({ code: 'ERR_PRIVATE_ADDRESS' });
    expect(siteHits).toEqual([]);
  });

  it('a host that rebinds to a private address between the crawl\'s check and the robots fetch is refused', async () => {
    // The crawl's own pre-flight check saw a public address; by the robots fetch it is local.
    dnsAnswers.byHost.set('rebind.test', ['10.1.2.3']);
    await expect(__httpTestables.fetchRobotsText('http://rebind.test/robots.txt', null as never, true))
      .rejects.toMatchObject({ code: 'ERR_PRIVATE_ADDRESS' });
    expect(dnsAnswers.asked).toContain('rebind.test');
  });

  it('unguarded (the profile allows private addresses), robots.txt is read as before', async () => {
    expect(await __httpTestables.fetchRobotsText(`${siteBase}/robots.txt`, null as never, false)).toContain('Disallow: /private/');
  });
});

describe('a guarded request through a proxy', () => {
  it('is checked again once the proxy answers: a rebind to a private address discards the response', async () => {
    // Pre-flight: public. After the proxied connection answered: private.
    dnsAnswers.byHost.set('rebind.test', ['203.0.113.7', '10.0.0.9']);
    await expect(scraperRequest('http://rebind.test/page', { proxyUrl: proxyBase, blockPrivateNetwork: true }))
      .rejects.toMatchObject({ code: 'ERR_PRIVATE_ADDRESS' });
    // The proxy was asked (that is out of our reach), but nothing it returned was used.
    expect(proxied).toEqual(['http://rebind.test/page']);
  });

  it('a host that stays public comes back as usual', async () => {
    dnsAnswers.byHost.set('public.test', ['203.0.113.8']);
    const response = await scraperRequest('http://public.test/page', { proxyUrl: proxyBase, blockPrivateNetwork: true });
    expect(response).toMatchObject({ status: 200, body: 'proxied http://public.test/page' });
  });

  it('unguarded proxied requests are not re-resolved', async () => {
    const response = await scraperRequest('http://anything.test/x', { proxyUrl: proxyBase });
    expect(response.status).toBe(200);
    expect(dnsAnswers.asked).not.toContain('anything.test');
  });
});
