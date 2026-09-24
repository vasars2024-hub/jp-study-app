// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cacheVndbArt,
  clearVndbResponseCache,
  createRateLimiter,
  isVndbArtUrl,
  vndbArtFileStem,
  vndbQuery,
  type FetchLike,
} from '../immersion/vndbClient';
import { cspDirectiveSources } from '../../shared/contentSecurityPolicy';

let root = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vn-art-'));
  clearVndbResponseCache();
});
afterEach(() => {
  // Only the temporary directory this test created.
  fs.rmSync(root, { recursive: true, force: true });
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function imageFetch(calls: string[], contentType = 'image/jpeg', body: Buffer = JPEG): FetchLike {
  return async (url) => {
    calls.push(url);
    return new Response(body, { status: 200, headers: { 'content-type': contentType } });
  };
}

const unlimited = createRateLimiter({ max: 1000, windowMs: 1000 });

describe('VNDB art is served locally, not through the CSP', () => {
  it('keeps the packaged CSP closed to t.vndb.org — the fix is the cache, not a wider policy', () => {
    const imgSrc = cspDirectiveSources('img-src') ?? [];
    expect(imgSrc.some((source) => source.includes('vndb'))).toBe(false);
    expect(imgSrc).toContain('media:');
  });

  it('downloads a VNDB image once and answers with a media:// URL', async () => {
    const calls: string[] = [];
    const url = 'https://t.vndb.org/cv/40/35040.jpg';
    const first = await cacheVndbArt(url, root, { fetch: imageFetch(calls), limiter: unlimited });
    expect(first).toBe(`media://vn-art/${vndbArtFileStem(url)}.jpg`);
    expect(fs.readFileSync(path.join(root, 'vn-art', `${vndbArtFileStem(url)}.jpg`))).toEqual(JPEG);
    const second = await cacheVndbArt(url, root, { fetch: imageFetch(calls), limiter: unlimited });
    expect(second).toBe(first);
    expect(calls).toEqual([url]);
  });

  it('refuses anything that is not a VNDB image host, and anything that is not an image', async () => {
    const calls: string[] = [];
    await expect(cacheVndbArt('https://example.com/x.jpg', root, { fetch: imageFetch(calls), limiter: unlimited }))
      .rejects.toThrow();
    await expect(cacheVndbArt('http://t.vndb.org/cv/1.jpg', root, { fetch: imageFetch(calls), limiter: unlimited }))
      .rejects.toThrow();
    await expect(cacheVndbArt('https://t.vndb.org/cv/2.jpg', root, {
      fetch: imageFetch(calls, 'text/html', Buffer.from('<html>')),
      limiter: unlimited,
    })).rejects.toThrow(/Unsupported image type/);
    expect(calls).toEqual(['https://t.vndb.org/cv/2.jpg']);
    expect(isVndbArtUrl('https://s.vndb.org/sf/12/34.jpg')).toBe(true);
    expect(isVndbArtUrl('https://t.vndb.org.evil.com/cv/1.jpg')).toBe(false);
  });
});

describe('VNDB API courtesy', () => {
  it('answers a repeated query from cache and shares one request between concurrent callers', async () => {
    let requests = 0;
    const fetch: FetchLike = async () => {
      requests += 1;
      return new Response(JSON.stringify({ results: [{ id: 'v1' }] }), { status: 200 });
    };
    const body = { filters: ['search', '=', 'steins'], fields: 'title' };
    const [a, b] = await Promise.all([
      vndbQuery('vn', body, { fetch, limiter: unlimited }),
      vndbQuery('vn', body, { fetch, limiter: unlimited }),
    ]);
    const c = await vndbQuery('vn', body, { fetch, limiter: unlimited });
    expect(requests).toBe(1);
    expect(a).toEqual(b);
    expect(c).toEqual(a);
  });

  it('waits for the window instead of exceeding the limit, and refuses an unreasonable wait', async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = createRateLimiter({
      max: 2,
      windowMs: 1_000,
      maxWaitMs: 5_000,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(waits).toEqual([1_000]);
    expect(limiter.inWindow()).toBe(1);

    const strict = createRateLimiter({ max: 1, windowMs: 60_000, maxWaitMs: 5_000, now: () => 0, sleep: async () => undefined });
    await strict.acquire();
    await expect(strict.acquire()).rejects.toThrow(/rate limit/i);
  });

  it('reports a 429 as rate limiting', async () => {
    const fetch: FetchLike = async () => new Response('', { status: 429 });
    await expect(vndbQuery('release', { x: 1 }, { fetch, limiter: unlimited })).rejects.toThrow(/rate limiting/);
  });
});
