// @vitest-environment node
//
// The Network settings group, against real sockets.
//
// Every assertion here is about a setting changing what a server observes:
// which user agent arrived, how many times the request arrived, how many
// arrived at once, how far apart they arrived, and whether they arrived via the
// proxy. A test that only checked the options object would prove that the code
// copies a number from one place to another, which is what the group already
// did before this work.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import tls from 'node:tls';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
  type ScraperSettings,
} from '../../shared/scraperSettings';

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd(), getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { scraperRequest } = await import('../scraper/http');
const { resetScraperHttpCache } = await import('../scraper/httpCache');
const {
  RequestGate,
  isRetryableError,
  isRetryableStatus,
  mergeHeaders,
  networkPolicyFrom,
  policyHeaders,
  proxyForAttempt,
  randomDelayMs,
} = await import('../scraper/networkPolicy');
const { runWithScraperRuntime, scraperRuntimeFor } = await import('../scraper/runtime');

// ------------------------------------------------------------------ servers ---

interface Seen {
  url: string;
  headers: http.IncomingHttpHeaders;
  at: number;
}

let base = '';
let server: http.Server;
let seen: Seen[] = [];
let inFlight = 0;
let maxInFlight = 0;
/** How many times each path must fail before it starts answering 200. */
let failuresLeft = new Map<string, number>();

let proxyBase = '';
let proxy: http.Server;
let proxied: string[] = [];
let connects: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    seen.push({ url: url.pathname + url.search, headers: req.headers, at: Date.now() });

    const remaining = failuresLeft.get(url.pathname) ?? 0;
    if (remaining > 0) {
      failuresLeft.set(url.pathname, remaining - 1);
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('try again');
      return;
    }

    switch (url.pathname) {
      case '/slow': {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        setTimeout(() => {
          inFlight -= 1;
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('slow');
        }, 80);
        return;
      }
      case '/never':
        // Answers nothing at all; only a timeout ends this.
        return;
      case '/redirect':
        res.writeHead(302, { location: `${base}/ok` });
        res.end();
        return;
      case '/missing':
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('gone');
        return;
      default:
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // A forward proxy that speaks both halves of the mechanism: absolute-form for
  // plain http, and CONNECT for anything tunnelled.
  proxy = http.createServer((req, res) => {
    proxied.push(req.url ?? '');
    const target = new URL(req.url ?? '', 'http://invalid.test');
    const upstream = http.request(
      { host: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers: req.headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end('proxy upstream failed');
    });
    req.pipe(upstream);
  });
  proxy.on('connect', (req, socket) => {
    connects.push(req.url ?? '');
    // Refused deliberately: completing the tunnel would need a TLS origin with
    // a certificate this test cannot mint. What is being proven is that the
    // request went to the proxy as a CONNECT for the right authority.
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  proxyBase = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
  await new Promise<void>((resolve) => {
    proxy.closeAllConnections?.();
    proxy.close(() => resolve());
  });
});

beforeEach(() => {
  seen = [];
  proxied = [];
  connects = [];
  inFlight = 0;
  maxInFlight = 0;
  failuresLeft = new Map();
  resetScraperHttpCache();
});

afterEach(() => {
  resetScraperHttpCache();
});

/**
 * A settings object with the pacing and caching stood down.
 *
 * The Balanced profile pauses 350–900 ms before every request and caches for a
 * day; leaving either on would make each test here slow and the next one's
 * first request a cache hit. Each test turns back on exactly what it is about.
 */
function settings(patch: (s: ScraperSettings) => void = () => undefined): ScraperSettings {
  const value = resolveScraperSettings(createDefaultScraperSettingsDocument());
  value.network.randomDelayMinMs = 0;
  value.network.randomDelayMaxMs = 0;
  value.network.retryAttempts = 0;
  value.cache.htmlEnabled = false;
  value.cache.metadataEnabled = false;
  value.cache.thumbnailsEnabled = false;
  // The Anti-Bot group paces requests per host too, and its shipped defaults
  // (500 ms between starts, 60 a minute) are more restrictive than anything
  // asserted here — with them on, "three sockets at once" cannot be observed
  // against one host however high Concurrent Requests is set. Neutralised for
  // the same reason randomDelay and the cache are above: this file is about the
  // Network group, and a test that measures two groups at once measures
  // neither. The interaction itself is asserted in scraperAntibot.test.ts.
  value.safety.crawlDelayMs = 0;
  value.safety.maxRequestsPerMinute = 0;
  value.safety.respectRobotsTxt = false;
  patch(value);
  return value;
}

function underProfile<T>(value: ScraperSettings, fn: () => Promise<T>): Promise<T> {
  return runWithScraperRuntime(scraperRuntimeFor(value, 'test-job'), fn);
}

// -------------------------------------------------------------- pure parts ---

describe('mergeHeaders', () => {
  it('lower-cases names so one header cannot be sent twice', () => {
    const merged = mergeHeaders({ 'User-Agent': 'first' }, { 'user-agent': 'second' });
    expect(Object.keys(merged)).toEqual(['user-agent']);
    expect(merged['user-agent']).toBe('second');
  });
});

describe('policyHeaders', () => {
  it('carries the profile user agent, cookie and custom headers', () => {
    const policy = networkPolicyFrom(settings((s) => {
      s.network.userAgent = 'Profile/1.0';
      s.network.cookieHeader = 'SID=abc';
      s.network.headers = { Referer: 'https://example.test/' };
    }).network);
    const headers = policyHeaders(policy);
    expect(headers['user-agent']).toBe('Profile/1.0');
    expect(headers.cookie).toBe('SID=abc');
    expect(headers.referer).toBe('https://example.test/');
  });

  it('leaves the user agent alone when the profile has none', () => {
    const policy = networkPolicyFrom(settings().network);
    expect(policyHeaders(policy)['user-agent']).toBeUndefined();
  });
});

describe('proxyForAttempt', () => {
  it('walks the rotation one entry per attempt, and wraps', () => {
    const policy = networkPolicyFrom(settings((s) => {
      s.network.proxyUrl = 'http://a.test:8080';
      s.network.proxyRotation = ['http://b.test:8080', 'http://c.test:8080'];
    }).network);
    expect(policy.proxies).toEqual([
      'http://a.test:8080',
      'http://b.test:8080',
      'http://c.test:8080',
    ]);
    expect(proxyForAttempt(policy.proxies, 0)).toBe('http://a.test:8080');
    expect(proxyForAttempt(policy.proxies, 2)).toBe('http://c.test:8080');
    expect(proxyForAttempt(policy.proxies, 3)).toBe('http://a.test:8080');
  });

  it('de-duplicates a rotation entry that repeats the primary proxy', () => {
    const policy = networkPolicyFrom(settings((s) => {
      s.network.proxyUrl = 'http://a.test:8080';
      s.network.proxyRotation = ['http://a.test:8080', 'http://b.test:8080'];
    }).network);
    expect(policy.proxies).toEqual(['http://a.test:8080', 'http://b.test:8080']);
  });

  it('is empty for a profile with no proxy, meaning a direct connection', () => {
    expect(proxyForAttempt(networkPolicyFrom(settings().network).proxies, 0)).toBe('');
  });
});

describe('randomDelayMs', () => {
  it('stays inside the configured window', () => {
    const policy = networkPolicyFrom(settings((s) => {
      s.network.randomDelayMinMs = 100;
      s.network.randomDelayMaxMs = 300;
    }).network);
    expect(randomDelayMs(policy, () => 0)).toBe(100);
    expect(randomDelayMs(policy, () => 1)).toBe(300);
    expect(randomDelayMs(policy, () => 0.5)).toBe(200);
  });

  it('is zero when the window is zero', () => {
    expect(randomDelayMs(networkPolicyFrom(settings().network))).toBe(0);
  });
});

describe('retry classification', () => {
  it('retries transient statuses only', () => {
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });

  it('does not retry a request that can never work', () => {
    expect(isRetryableError({ code: 'ERR_URL' })).toBe(false);
    expect(isRetryableError({ code: 'ERR_PROTOCOL' })).toBe(false);
    expect(isRetryableError({ code: 'ERR_PROXY_SCHEME' })).toBe(false);
    expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
  });
});

describe('RequestGate', () => {
  it('never lets more than its limit run at once', async () => {
    const gate = new RequestGate(2);
    let peak = 0;
    let live = 0;
    await Promise.all(Array.from({ length: 6 }, () => gate.run(async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((resolve) => setTimeout(resolve, 10));
      live -= 1;
    })));
    expect(peak).toBe(2);
    expect(gate.inFlight).toBe(0);
  });

  it('releases its slot when the body throws', async () => {
    const gate = new RequestGate(1);
    await expect(gate.run(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(gate.inFlight).toBe(0);
    await expect(gate.run(async () => 'next')).resolves.toBe('next');
  });
});

// -------------------------------------------------------- against a server ---

describe('the profile user agent, headers and cookie reach the server', () => {
  it('sends the configured identity', async () => {
    await underProfile(
      settings((s) => {
        s.network.userAgent = 'StudyOS-Scraper/9.9';
        s.network.headers = { 'x-test-header': 'from-profile' };
        s.network.cookieHeader = 'SID=profile-cookie';
      }),
      () => scraperRequest(`${base}/ok`),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].headers['user-agent']).toBe('StudyOS-Scraper/9.9');
    expect(seen[0].headers['x-test-header']).toBe('from-profile');
    expect(seen[0].headers.cookie).toBe('SID=profile-cookie');
  });

  it('lets a call site override one header without losing the rest', async () => {
    await underProfile(
      settings((s) => {
        s.network.userAgent = 'Profile/1.0';
        s.network.headers = { 'x-test-header': 'from-profile' };
      }),
      () => scraperRequest(`${base}/ok`, { headers: { 'content-type': 'application/json' } }),
    );
    expect(seen[0].headers['user-agent']).toBe('Profile/1.0');
    expect(seen[0].headers['x-test-header']).toBe('from-profile');
    expect(seen[0].headers['content-type']).toBe('application/json');
  });

  it('falls back to the built-in agent outside a profile', async () => {
    await scraperRequest(`${base}/ok`);
    expect(seen[0].headers['user-agent']).toContain('Mozilla/5.0');
  });
});

describe('requestTimeoutMs', () => {
  it('governs a call that expressed no opinion of its own', async () => {
    await expect(underProfile(
      settings((s) => {
        s.network.requestTimeoutMs = 1_000;
      }),
      () => scraperRequest(`${base}/never`),
    )).rejects.toThrow(/timed out after 1000ms/i);
  });

  it('still lets a call site ask for less patience', async () => {
    await expect(underProfile(
      settings((s) => {
        s.network.requestTimeoutMs = 60_000;
      }),
      () => scraperRequest(`${base}/never`, { timeoutMs: 1_000 }),
    )).rejects.toThrow(/timed out after 1000ms/i);
  });
});

describe('followRedirects', () => {
  it('stops at the redirect when the profile says not to follow', async () => {
    const response = await underProfile(
      settings((s) => {
        s.network.followRedirects = false;
      }),
      () => scraperRequest(`${base}/redirect`),
    );
    expect(response.status).toBe(302);
    expect(seen.map((r) => r.url)).toEqual(['/redirect']);
  });

  it('follows it when the profile says to', async () => {
    const response = await underProfile(settings(), () => scraperRequest(`${base}/redirect`));
    expect(response.status).toBe(200);
    expect(seen.map((r) => r.url)).toEqual(['/redirect', '/ok']);
  });
});

describe('retryAttempts', () => {
  it('repeats a transient failure until it succeeds', async () => {
    failuresLeft.set('/flaky', 2);
    const response = await underProfile(
      settings((s) => {
        s.network.retryAttempts = 3;
        s.network.retryDelayMs = 0;
      }),
      () => scraperRequest(`${base}/flaky`),
    );
    expect(response.status).toBe(200);
    expect(seen.filter((r) => r.url === '/flaky')).toHaveLength(3);
  });

  it('gives up after the configured number of attempts', async () => {
    failuresLeft.set('/flaky', 10);
    const response = await underProfile(
      settings((s) => {
        s.network.retryAttempts = 2;
        s.network.retryDelayMs = 0;
      }),
      () => scraperRequest(`${base}/flaky`),
    );
    expect(response.status).toBe(503);
    // One attempt plus two retries — "Retry Attempts" counts retries.
    expect(seen.filter((r) => r.url === '/flaky')).toHaveLength(3);
  });

  it('does not retry at all when set to zero', async () => {
    failuresLeft.set('/flaky', 10);
    const response = await underProfile(settings(), () => scraperRequest(`${base}/flaky`));
    expect(response.status).toBe(503);
    expect(seen.filter((r) => r.url === '/flaky')).toHaveLength(1);
  });

  it('does not repeat a request the server rejected on its merits', async () => {
    const response = await underProfile(
      settings((s) => {
        s.network.retryAttempts = 4;
        s.network.retryDelayMs = 0;
      }),
      () => scraperRequest(`${base}/missing`),
    );
    expect(response.status).toBe(404);
    expect(seen.filter((r) => r.url === '/missing')).toHaveLength(1);
  });

  it('waits the configured delay between attempts', async () => {
    failuresLeft.set('/flaky', 1);
    const started = Date.now();
    await underProfile(
      settings((s) => {
        s.network.retryAttempts = 1;
        s.network.retryDelayMs = 150;
      }),
      () => scraperRequest(`${base}/flaky`),
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });
});

describe('concurrentRequests', () => {
  it('holds the wire to one request at a time when set to 1', async () => {
    await underProfile(
      settings((s) => {
        s.network.concurrentRequests = 1;
      }),
      async () => {
        await Promise.all([
          scraperRequest(`${base}/slow`),
          scraperRequest(`${base}/slow`),
          scraperRequest(`${base}/slow`),
        ]);
      },
    );
    expect(seen.filter((r) => r.url === '/slow')).toHaveLength(3);
    expect(maxInFlight).toBe(1);
  });

  it('opens the configured number of sockets when allowed to', async () => {
    await underProfile(
      settings((s) => {
        s.network.concurrentRequests = 3;
      }),
      async () => {
        await Promise.all(Array.from({ length: 6 }, () => scraperRequest(`${base}/slow`)));
      },
    );
    expect(maxInFlight).toBe(3);
  });

  it('does not deadlock on a redirect, which needs no second slot', async () => {
    const response = await underProfile(
      settings((s) => {
        s.network.concurrentRequests = 1;
      }),
      () => scraperRequest(`${base}/redirect`),
    );
    expect(response.status).toBe(200);
  });
});

describe('randomDelay', () => {
  it('paces requests apart', async () => {
    const started = Date.now();
    await underProfile(
      settings((s) => {
        s.network.concurrentRequests = 1;
        s.network.randomDelayMinMs = 80;
        s.network.randomDelayMaxMs = 80;
      }),
      async () => {
        await scraperRequest(`${base}/ok`);
        await scraperRequest(`${base}/ok`);
        await scraperRequest(`${base}/ok`);
      },
    );
    // Three pauses of 80 ms; the requests themselves are loopback and free.
    expect(Date.now() - started).toBeGreaterThanOrEqual(240);
    expect(seen[1].at - seen[0].at).toBeGreaterThanOrEqual(70);
  });
});

describe('proxyUrl', () => {
  it('sends a plain-http request through the proxy in absolute form', async () => {
    const response = await underProfile(
      settings((s) => {
        s.network.proxyUrl = proxyBase;
      }),
      () => scraperRequest(`${base}/ok`),
    );
    expect(response.status).toBe(200);
    expect(response.body).toBe('ok');
    expect(proxied).toEqual([`${base}/ok`]);
    // The origin still sees its own Host, not the proxy's.
    expect(seen[0].headers.host).toBe(base.replace('http://', ''));
  });

  it('opens a CONNECT tunnel for an https target', async () => {
    await expect(underProfile(
      settings((s) => {
        s.network.proxyUrl = proxyBase;
      }),
      () => scraperRequest('https://example.test/anything'),
    )).rejects.toThrow(/proxy refused connect/i);
    expect(connects).toEqual(['example.test:443']);
  });

  it('carries the https request through a successful CONNECT tunnel without a direct fallback', async () => {
    // The fixture pair is self-signed `CN=fixture` and valid until 2126. That
    // expiry is not decoration: the original pair was minted with a two-day
    // validity on 2026-08-11 and expired on 2026-08-13, at which point node
    // reported "certificate has expired" instead of "self-signed certificate"
    // and the assertion below failed for everyone, permanently, for a reason
    // that had nothing to do with the proxy policy under test. Regenerate with
    //   openssl req -x509 -newkey rsa:2048 -keyout proxy-test-key.pem \
    //     -out proxy-test-cert.pem -days 36500 -nodes -subj "/CN=fixture"
    const key = fs.readFileSync(new URL('./fixtures/proxy-test-key.pem', import.meta.url));
    const cert = fs.readFileSync(new URL('./fixtures/proxy-test-cert.pem', import.meta.url));
    const requests: string[] = [];
    const authorities: string[] = [];
    const tunnelSockets: net.Socket[] = [];

    const origin = tls.createServer({ key, cert }, (socket) => {
      let received = '';
      socket.on('data', (chunk: Buffer) => {
        received += chunk.toString('utf8');
        if (!received.includes('\r\n\r\n')) return;
        requests.push(received.split('\r\n', 1)[0]);
        socket.end(
          'HTTP/1.1 200 OK\r\n'
          + 'Content-Type: text/plain\r\n'
          + 'Content-Length: 13\r\n'
          + 'Connection: close\r\n\r\n'
          + 'through-proxy',
        );
      });
    });
    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
    const originPort = (origin.address() as AddressInfo).port;

    const acceptingProxy = http.createServer();
    acceptingProxy.on('connect', (req, client, head) => {
      authorities.push(req.url ?? '');
      const upstream = net.connect(originPort, '127.0.0.1', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      tunnelSockets.push(client, upstream);
      upstream.on('error', () => client.destroy());
    });
    await new Promise<void>((resolve) => acceptingProxy.listen(0, '127.0.0.1', resolve));
    const acceptingProxyUrl = 'http://127.0.0.1:' + (acceptingProxy.address() as AddressInfo).port;

    try {
      await expect(underProfile(
        settings((s) => {
          s.network.proxyUrl = acceptingProxyUrl;
          // Keep the default verification-on policy for the first request.
        }),
        () => scraperRequest('https://proxy-proof.invalid/rejected'),
      )).rejects.toThrow(/self-signed certificate/i);

      const response = await underProfile(
        settings((s) => {
          s.network.proxyUrl = acceptingProxyUrl;
          // The fixture certificate is deliberately local and self-signed.
          s.network.verifySsl = false;
        }),
        // `.invalid` can never resolve publicly. A passing response therefore
        // proves the request used the accepted tunnel instead of going direct.
        () => scraperRequest('https://proxy-proof.invalid/through'),
      );
      expect(response.status).toBe(200);
      expect(response.body).toBe('through-proxy');
      expect(authorities).toEqual([
        'proxy-proof.invalid:443',
        'proxy-proof.invalid:443',
      ]);
      expect(requests).toEqual(['GET /through HTTP/1.1']);
    } finally {
      for (const socket of tunnelSockets) socket.destroy();
      acceptingProxy.closeAllConnections?.();
      await new Promise<void>((resolve) => acceptingProxy.close(() => resolve()));
      origin.closeAllConnections?.();
      await new Promise<void>((resolve) => origin.close(() => resolve()));
    }
  });

  it('rotates to the next proxy on a retry', async () => {
    failuresLeft.set('/flaky', 1);
    await underProfile(
      settings((s) => {
        // The first entry is a port nothing is listening on, so attempt 0 fails
        // at the transport and attempt 1 has to use the working proxy.
        s.network.proxyUrl = 'http://127.0.0.1:1';
        s.network.proxyRotation = [proxyBase];
        s.network.retryAttempts = 2;
        s.network.retryDelayMs = 0;
      }),
      () => scraperRequest(`${base}/ok`),
    );
    expect(proxied).toEqual([`${base}/ok`]);
  });

  it('refuses a SOCKS proxy rather than silently connecting directly', async () => {
    await expect(underProfile(
      settings((s) => {
        s.network.proxyUrl = 'socks5://127.0.0.1:1080';
      }),
      () => scraperRequest(`${base}/ok`),
    )).rejects.toThrow(/socks5 proxies are not supported/i);
    expect(seen).toHaveLength(0);
  });
});

describe('outside a profile', () => {
  it('makes exactly one direct, unpaced request', async () => {
    failuresLeft.set('/flaky', 1);
    const response = await scraperRequest(`${base}/flaky`);
    expect(response.status).toBe(503);
    expect(seen).toHaveLength(1);
    expect(proxied).toHaveLength(0);
  });
});
