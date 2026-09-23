/**
 * The plumbing every metadata provider client shares: a rate limiter, a JSON
 * request over Electron's `net`, and the on-disk answer cache.
 *
 * Lifted out of `mediaProviderClients.ts` when TVmaze and TMDB joined Jikan and
 * AniList, so each provider module states only what is specific to it — its
 * URLs, its response shape and its limits — and none of them grows a second,
 * subtly different copy of the retry or cache rules.
 *
 * Main-process only. `src/shared` stays free of I/O by contract.
 */

import { app, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Token-bucket-ish limiter honouring both a per-second and a per-minute budget.
 * Jikan enforces 3/s and 60/min; exceeding either returns 429, so both windows
 * have to be respected rather than just the tighter one.
 */
export class RateLimiter {
  private recent: number[] = [];

  constructor(
    private readonly perSecond: number,
    private readonly perMinute: number,
  ) {}

  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.recent = this.recent.filter((at) => now - at < 60_000);
      const inLastSecond = this.recent.filter((at) => now - at < 1_000).length;
      if (inLastSecond < this.perSecond && this.recent.length < this.perMinute) {
        this.recent.push(now);
        return;
      }
      // Wait for whichever window frees a slot first.
      const oldestInSecond = this.recent.filter((at) => now - at < 1_000)[0] ?? now;
      const waitSecond = inLastSecond >= this.perSecond ? 1_000 - (now - oldestInSecond) : 0;
      const waitMinute = this.recent.length >= this.perMinute
        ? 60_000 - (now - (this.recent[0] ?? now))
        : 0;
      await delay(Math.max(50, waitSecond, waitMinute));
    }
  }
}

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export const USER_AGENT = 'jp-study-app (personal media library)';
export const REQUEST_TIMEOUT_MS = 15_000;

export interface RequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

/**
 * Fetch through Electron's `net` module rather than global `fetch`.
 *
 * `net` uses Chromium's stack, so it inherits the app's proxy configuration and
 * system certificate store — which a user behind a corporate proxy needs, and
 * Node's fetch does not do.
 */
export function httpRequest(url: string, options: RequestOptions = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = net.request({ url, method: options.method ?? 'GET' });
    req.setHeader('User-Agent', USER_AGENT);
    req.setHeader('Accept', 'application/json');
    for (const [key, value] of Object.entries(options.headers ?? {})) req.setHeader(key, value);

    const timer = setTimeout(() => {
      finish(() => {
        try {
          req.abort();
        } catch {
          /* already finished */
        }
        reject(new Error('The metadata provider took too long to respond.'));
      });
    }, REQUEST_TIMEOUT_MS);

    req.on('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        // Bounded so a hostile or broken response cannot exhaust memory.
        if (chunks.reduce((n, c) => n + c.length, 0) < 8_000_000) chunks.push(chunk);
      });
      response.on('end', () => {
        finish(() => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        }));
      });
      response.on('error', (error: Error) => finish(() => reject(error)));
    });
    req.on('error', (error) => finish(() => reject(error)));

    if (options.body !== undefined) req.write(options.body, 'utf-8');
    req.end();
  });
}

/**
 * A JSON answer together with the status that produced it.
 *
 * `status: 0` means no HTTP answer at all (transport failure, timeout, or a
 * 429/5xx that survived the retry). Callers that need to tell "the provider said
 * no such thing" (a 404, which TVmaze's `singlesearch` uses for an empty result)
 * from "the provider never answered" read the status; everyone else uses
 * {@link requestJson}.
 */
export interface JsonAnswer<T> {
  status: number;
  data: T | null;
}

/** GET/POST JSON with one retry on 429 or 5xx, honouring Retry-After crudely. */
export async function requestJsonStatus<T>(
  url: string,
  limiter: RateLimiter,
  options: RequestOptions = {},
): Promise<JsonAnswer<T>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await limiter.take();
    let response: { status: number; body: string };
    try {
      response = await httpRequest(url, options);
    } catch {
      if (attempt === 1) return { status: 0, data: null };
      await delay(1_000);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 1) return { status: 0, data: null };
      await delay(2_000);
      continue;
    }
    if (response.status < 200 || response.status >= 300) return { status: response.status, data: null };
    try {
      return { status: response.status, data: JSON.parse(response.body) as T };
    } catch {
      // A 200 that is not JSON is a broken answer, not an empty one.
      return { status: 0, data: null };
    }
  }
  return { status: 0, data: null };
}

/** `requestJsonStatus` for callers that only need "an answer or not". */
export async function requestJson<T>(
  url: string,
  limiter: RateLimiter,
  options: RequestOptions = {},
): Promise<T | null> {
  return (await requestJsonStatus<T>(url, limiter, options)).data;
}

// ---------------------------------------------------------------------------
// Disk cache
// ---------------------------------------------------------------------------

/** Provider answers change rarely; a month keeps a sweep offline-fast. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Discovery feeds ("airing now", "top rated") are a view over a moving list
 * rather than a fact about one work, so they get their own short window. Long
 * enough that clicking between feed tabs is instant, short enough that a new
 * season shows up the same day.
 */
export const FEED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'metadata-cache');
}

function cacheFile(key: string): string {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(cacheDir(), `${hash}.json`);
}

export function readCache<T>(key: string, ttlMs: number = CACHE_TTL_MS): T | null {
  try {
    const file = cacheFile(key);
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheFile(key), JSON.stringify(value), 'utf-8');
  } catch {
    /* an uncacheable answer is still a usable answer */
  }
}

/** Clears cached provider answers, so a refresh really re-asks. */
export function clearMetadataCache(): void {
  try {
    fs.rmSync(cacheDir(), { recursive: true, force: true });
  } catch {
    /* nothing to clear */
  }
}

// ---------------------------------------------------------------------------
// Value coercion shared by every response mapper
// ---------------------------------------------------------------------------

/** Trimmed non-empty string, or undefined. */
export const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

/** Finite number, or undefined. */
export const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Plain text from a provider's light HTML (TVmaze and AniList summaries). */
export function plainTextFromHtml(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const plain = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return plain || undefined;
}

/** `YYYY` out of an ISO-ish date string, or undefined. */
export function yearOf(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  return year >= 1870 && year <= 2200 ? year : undefined;
}
