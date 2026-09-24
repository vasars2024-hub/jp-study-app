/**
 * VNDB access for the Visual Novel platform: one rate limiter, one response
 * cache, and the image cache that lets VNDB art render at all.
 *
 * Why the image cache exists. VNDB serves covers and screenshots from
 * `t.vndb.org`, and the packaged Content-Security-Policy's `img-src` names only
 * a handful of provider hosts (`shared/contentSecurityPolicy.ts`). A live probe
 * measured every VNDB `<img>` at `naturalWidth 0, blocked=csp`. Widening the CSP
 * to another host is the thing that policy exists to prevent, so this follows
 * `main/jiten.ts`'s `cacheDeckCover` instead: main downloads the image once,
 * stores it under the library root, and the renderer paints it over `media://`
 * — which is registered with `bypassCSP` and already serves every local cover.
 * The copy also survives offline.
 *
 * Two guards keep this from becoming a general downloader a compromised
 * renderer could drive:
 *   1. only `https://t.vndb.org` / `https://s.vndb.org` URLs are accepted, and
 *   2. the caller (visualNovels.ts) only asks for URLs VNDB itself returned
 *      AFTER the adult-image filter, so the filter cannot be bypassed by
 *      handing main an arbitrary screenshot URL.
 *
 * Rate limits. VNDB's API allows 200 requests per 5 minutes per IP. The limiter
 * below keeps well under that (120 / 5 min) and the response cache means a
 * second identical query costs nothing. Images are static files but get their
 * own, gentler limiter and a concurrency cap for politeness.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const VNDB_API_BASE = 'https://api.vndb.org/kana';
export const VNDB_ART_HOSTS: ReadonlySet<string> = new Set(['t.vndb.org', 's.vndb.org']);
export const VNDB_ART_DIRECTORY = 'vn-art';
export const MAX_VNDB_ART_BYTES = 6 * 1024 * 1024;
const USER_AGENT = 'JapaneseStudyOS/1.0 (+visual novel library)';

const ART_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// ---- rate limiter ---------------------------------------------------------

export interface RateLimiter {
  /** Resolves when a request may start; rejects if the wait would exceed `maxWaitMs`. */
  acquire(): Promise<void>;
  /** Requests started inside the current window (for tests and diagnostics). */
  inWindow(): number;
}

export function createRateLimiter(options: {
  max: number;
  windowMs: number;
  maxWaitMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxWaitMs = options.maxWaitMs ?? 20_000;
  const started: number[] = [];
  const prune = (): void => {
    const floor = now() - options.windowMs;
    while (started.length && started[0] <= floor) started.shift();
  };
  return {
    async acquire() {
      prune();
      while (started.length >= options.max) {
        const wait = started[0] + options.windowMs - now();
        if (wait > maxWaitMs) {
          throw new Error('VNDB rate limit reached. Try again in a few minutes.');
        }
        await sleep(Math.max(1, wait));
        prune();
      }
      started.push(now());
    },
    inWindow() {
      prune();
      return started.length;
    },
  };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const apiLimiter = createRateLimiter({ max: 120, windowMs: 5 * 60_000 });
const artLimiter = createRateLimiter({ max: 90, windowMs: 60_000 });

// ---- API with response cache ---------------------------------------------

const RESPONSE_TTL_MS = 30 * 60_000;
const RESPONSE_CACHE_LIMIT = 120;
const responseCache = new Map<string, { at: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * POST a query to one VNDB endpoint (`vn`, `release`, …). Identical queries in
 * the TTL are answered from memory, and concurrent identical queries share one
 * request.
 */
export async function vndbQuery(
  endpoint: 'vn' | 'release' | 'character' | 'tag',
  body: Record<string, unknown>,
  deps: { fetch?: FetchLike; limiter?: RateLimiter; now?: () => number } = {},
): Promise<unknown> {
  const now = deps.now ?? Date.now;
  const key = `${endpoint}\u0000${JSON.stringify(body)}`;
  const cached = responseCache.get(key);
  if (cached && now() - cached.at < RESPONSE_TTL_MS) return cached.value;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = (async () => {
    await (deps.limiter ?? apiLimiter).acquire();
    const response = await (deps.fetch ?? fetch)(`${VNDB_API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 429) throw new Error('VNDB is rate limiting requests. Try again in a minute.');
    if (!response.ok) throw new Error(`VNDB request failed (${response.status}).`);
    const value = await response.json() as unknown;
    responseCache.set(key, { at: now(), value });
    while (responseCache.size > RESPONSE_CACHE_LIMIT) {
      const oldest = responseCache.keys().next().value;
      if (oldest === undefined) break;
      responseCache.delete(oldest);
    }
    return value;
  })();
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

/** Test seam: forget cached responses. */
export function clearVndbResponseCache(): void {
  responseCache.clear();
  inFlight.clear();
}

// ---- art cache -------------------------------------------------------------

export function isVndbArtUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && VNDB_ART_HOSTS.has(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Deterministic cache name, so a cached image is found again without an index. */
export function vndbArtFileStem(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 32);
}

/** The `media://` URL for a cached file name. */
export function vndbArtMediaUrl(fileName: string): string {
  return `media://${VNDB_ART_DIRECTORY}/${fileName}`;
}

function findCached(directory: string, stem: string): string | null {
  for (const ext of ['.jpg', '.png', '.webp']) {
    const candidate = path.join(directory, `${stem}${ext}`);
    try {
      if (fs.statSync(candidate).size > 0) return `${stem}${ext}`;
    } catch {
      /* not cached with this extension */
    }
  }
  return null;
}

const ART_CONCURRENCY = 3;
let artActive = 0;
const artQueue: Array<() => void> = [];
const artInFlight = new Map<string, Promise<string>>();

async function withArtSlot<T>(task: () => Promise<T>): Promise<T> {
  if (artActive >= ART_CONCURRENCY) {
    await new Promise<void>((resolve) => artQueue.push(resolve));
  }
  artActive += 1;
  try {
    return await task();
  } finally {
    artActive -= 1;
    artQueue.shift()?.();
  }
}

/**
 * Return a `media://` URL for a VNDB image, downloading it into
 * `<libraryRoot>/vn-art/` the first time. `libraryRoot` is the directory the
 * `media://` protocol serves (main.ts `registerMediaProtocol`).
 */
export async function cacheVndbArt(
  url: string,
  libraryRoot: string,
  deps: { fetch?: FetchLike; limiter?: RateLimiter } = {},
): Promise<string> {
  if (!isVndbArtUrl(url)) throw new Error('Only VNDB image URLs can be cached.');
  const directory = path.join(libraryRoot, VNDB_ART_DIRECTORY);
  const stem = vndbArtFileStem(url);
  const existing = findCached(directory, stem);
  if (existing) return vndbArtMediaUrl(existing);
  const pending = artInFlight.get(stem);
  if (pending) return pending;
  const run = withArtSlot(async () => {
    const again = findCached(directory, stem);
    if (again) return vndbArtMediaUrl(again);
    await (deps.limiter ?? artLimiter).acquire();
    const response = await (deps.fetch ?? fetch)(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`VNDB image request failed (${response.status}).`);
    // A redirect off VNDB's image hosts is not followed into the cache.
    if (response.url && !isVndbArtUrl(response.url)) throw new Error('The image moved off VNDB.');
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = ART_EXT_BY_MIME[contentType];
    if (!ext) throw new Error(`Unsupported image type (${contentType || 'unknown'}).`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_VNDB_ART_BYTES) throw new Error('The image is larger than the safety limit.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_VNDB_ART_BYTES) {
      throw new Error('The image is empty or larger than the safety limit.');
    }
    await fs.promises.mkdir(directory, { recursive: true });
    const fileName = `${stem}${ext}`;
    const temporary = path.join(directory, `${fileName}.tmp`);
    await fs.promises.writeFile(temporary, buffer);
    await fs.promises.rename(temporary, path.join(directory, fileName));
    return vndbArtMediaUrl(fileName);
  });
  artInFlight.set(stem, run);
  try {
    return await run;
  } finally {
    artInFlight.delete(stem);
  }
}
