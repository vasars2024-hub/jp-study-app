// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('electron', () => ({
  app: { getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { charsetOf, probeHttp, redactHeaders, scraperRequest } = await import('../scraper/http');
const { recentScraperLogs, resetScraperLogs } = await import('../scraper/logBus');

// A real server, so the timing marks, redirect handling and byte cap are
// exercised against real sockets rather than a mocked transport.
let base = '';
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    switch (url.pathname) {
      case '/ok':
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'set-cookie': 'SID=supersecret; Path=/',
          authorization: 'Bearer leaked-token',
          'x-plain': 'visible',
        });
        res.end('<html><body><h1>hello</h1></body></html>');
        return;
      case '/echo': {
        let body = '';
        req.on('data', (c) => {
          body += c;
        });
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            method: req.method,
            body,
            ua: req.headers['user-agent'],
            contentLength: req.headers['content-length'] ?? null,
            transferEncoding: req.headers['transfer-encoding'] ?? null,
          }));
        });
        return;
      }
      case '/redirect':
        res.writeHead(302, { location: `${base}/ok` });
        res.end();
        return;
      case '/loop':
        res.writeHead(302, { location: `${base}/loop` });
        res.end();
        return;
      case '/big':
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('x'.repeat(100_000));
        return;
      case '/sjis': {
        res.writeHead(200, { 'content-type': 'text/plain; charset=shift_jis' });
        // 「日本」 in Shift_JIS.
        res.end(Buffer.from([0x93, 0xfa, 0x96, 0x7b]));
        return;
      }
      case '/slow':
        // Never answers; the client's timeout has to be what ends this.
        return;
      case '/boom':
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('kaboom');
        return;
      default:
        res.writeHead(404);
        res.end('missing');
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

describe('redactHeaders', () => {
  it('hides credential headers and lower-cases every name', () => {
    const out = redactHeaders({
      'Set-Cookie': ['a=1', 'b=2'],
      Authorization: 'Bearer x',
      'X-Api-Key': 'k',
      'Content-Type': 'text/html',
    });
    expect(out['set-cookie']).toBe('‹redacted›');
    expect(out.authorization).toBe('‹redacted›');
    expect(out['x-api-key']).toBe('‹redacted›');
    expect(out['content-type']).toBe('text/html');
  });
});

describe('charsetOf', () => {
  it('reads the charset parameter, defaulting to utf-8', () => {
    expect(charsetOf('text/html; charset=Shift_JIS')).toBe('shift_jis');
    expect(charsetOf('text/html')).toBe('utf-8');
    expect(charsetOf(undefined)).toBe('utf-8');
  });
});

describe('scraperRequest', () => {
  it('returns the body, status and real phase timings', async () => {
    const res = await scraperRequest(`${base}/ok`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('<h1>hello</h1>');
    expect(res.bytes).toBeGreaterThan(0);
    expect(res.truncated).toBe(false);
    // Loopback is fast, but the marks must still be ordered and finite.
    expect(res.timingMs.total).toBeGreaterThanOrEqual(res.timingMs.ttfb);
    expect(res.timingMs.dns).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(res.timingMs.connect)).toBe(true);
  });

  it('never hands back a credential header', async () => {
    const res = await scraperRequest(`${base}/ok`);
    expect(res.headers['set-cookie']).toBe('‹redacted›');
    expect(res.headers.authorization).toBe('‹redacted›');
    expect(res.headers['x-plain']).toBe('visible');
    expect(JSON.stringify(res.headers)).not.toContain('supersecret');
    expect(JSON.stringify(res.headers)).not.toContain('leaked-token');
  });

  it('sends the method, body and a browser user agent', async () => {
    const res = await scraperRequest(`${base}/echo`, {
      method: 'POST',
      body: 'name=one-piece',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const parsed = JSON.parse(res.body);
    expect(parsed.method).toBe('POST');
    expect(parsed.body).toBe('name=one-piece');
    expect(parsed.ua).toContain('Mozilla/5.0');
  });

  // qBittorrent's WebUI reads no form field at all out of a chunked request:
  // `torrents/add` saw an empty `urls` and answered 409 Conflict on every real
  // send until the length was declared. Measured live 2026-08-16.
  it('declares a content length rather than sending the body chunked', async () => {
    const res = await scraperRequest(`${base}/echo`, {
      method: 'POST',
      // Multibyte on purpose: a character count would be short here.
      body: 'urls=magnet%3A&name=日本',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const parsed = JSON.parse(res.body);
    expect(parsed.transferEncoding).toBe(null);
    expect(parsed.contentLength).toBe(String(Buffer.byteLength('urls=magnet%3A&name=日本')));
  });

  it('leaves a caller-declared content length alone, and never adds one to a GET', async () => {
    const declared = await scraperRequest(`${base}/echo`, {
      method: 'POST',
      body: 'ab',
      headers: { 'Content-Length': '2' },
    });
    expect(JSON.parse(declared.body).contentLength).toBe('2');
    const read = await scraperRequest(`${base}/echo`);
    expect(JSON.parse(read.body).contentLength).toBe(null);
  });

  it('follows a redirect and reports the final URL', async () => {
    const res = await scraperRequest(`${base}/redirect`);
    expect(res.status).toBe(200);
    expect(res.finalUrl).toBe(`${base}/ok`);
  });

  it('does not follow a redirect when asked not to', async () => {
    const res = await scraperRequest(`${base}/redirect`, { followRedirects: false });
    expect(res.status).toBe(302);
  });

  it('gives up on a redirect loop instead of hanging', async () => {
    await expect(scraperRequest(`${base}/loop`)).rejects.toThrow(/too many redirects/i);
  });

  it('truncates at the byte cap and says so', async () => {
    const res = await scraperRequest(`${base}/big`, { maxBytes: 4_096 });
    expect(res.truncated).toBe(true);
    expect(res.bytes).toBeLessThanOrEqual(4_096);
  });

  it('decodes a non-UTF-8 body using the declared charset', async () => {
    const res = await scraperRequest(`${base}/sjis`);
    expect(res.body).toBe('日本');
  });

  it('times out rather than waiting forever', async () => {
    await expect(scraperRequest(`${base}/slow`, { timeoutMs: 1_000 })).rejects.toThrow(
      /timed out/i,
    );
  });

  it('rejects a protocol it cannot speak', async () => {
    await expect(scraperRequest('ftp://example.test/x')).rejects.toThrow(/unsupported protocol/i);
    await expect(scraperRequest('not a url')).rejects.toThrow(/not a usable url/i);
  });
});

describe('probeHttp', () => {
  // The test server is on 127.0.0.1, which the Inspector refuses by default.
  const LOCAL = { allowPrivateNetwork: true };

  it('projects a successful request onto the inspector shape', async () => {
    const result = await probeHttp({ method: 'get', url: `${base}/ok`, headers: {} }, LOCAL);
    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK');
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.body).toContain('hello');
  });

  it('reports an error status rather than throwing at the panel', async () => {
    const result = await probeHttp({
      method: 'GET',
      url: 'http://127.0.0.1:1/nothing-here',
      headers: {},
    });
    expect(result.status).toBe(0);
    expect(result.statusText).toBeTruthy();
    expect(result.body).toBe('');
  });

  it('keeps a non-2xx response as a result, with its body', async () => {
    const result = await probeHttp({ method: 'GET', url: `${base}/boom`, headers: {} }, LOCAL);
    expect(result.status).toBe(500);
    expect(result.body).toBe('kaboom');
  });

  it('logs the request and response without the query secret', async () => {
    resetScraperLogs();
    await probeHttp({ method: 'GET', url: `${base}/ok?token=hunter2`, headers: {} }, LOCAL);
    const text = recentScraperLogs().map((l) => l.message).join('\n');
    expect(text).toContain('GET');
    expect(text).not.toContain('hunter2');
    expect(text).toContain('200 OK');
  });
});
