// The scraper's HTTP layer.
//
// Written against node:http/https rather than fetch() for one reason: the HTTP
// Inspector shows a per-phase timing breakdown, and DNS / TCP / TLS timings
// simply are not observable through fetch. The socket events below are the only
// place those numbers exist.
//
// Everything else in this folder that needs a request goes through
// `scraperRequest` too, so caps, redaction, the user agent and the log line all
// happen once rather than per feature.
//
// Two layers, deliberately separated:
//
//   performRequest — one attempt. Opens the socket (directly or through a
//                    proxy), follows redirects, decodes the body, produces the
//                    timings. Knows nothing about settings.
//   scraperRequest — the policy layer. Inside a job's runtime scope it consults
//                    the cache, waits for a concurrency slot, takes the profile's
//                    random pause, and retries on a transient failure, rotating
//                    the proxy as it goes. Outside a scope it is a thin pass
//                    through, which is what the Inspector and the source probes
//                    want: those are the user acting directly.
//
// The redirect recursion goes through performRequest rather than scraperRequest
// so a hop does not need a second concurrency slot — with Concurrent Requests
// set to 1, that would be a deadlock rather than a slowdown.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';
import type { ScraperHttpProbeRequest, ScraperHttpProbeResult } from '../../shared/scraperIpc';
import {
  cacheKeyFor,
  cacheKindFor,
  isCacheableRequest,
  readScraperCache,
  writeScraperCache,
} from './httpCache';
import { scraperLog } from './logBus';
import {
  isRetryableError,
  isRetryableStatus,
  mergeHeaders,
  policyHeaders,
  proxyForAttempt,
  randomDelayMs,
  type ScraperNetworkPolicy,
} from './networkPolicy';
import { publicOnlyLookup, resolvesToPrivateAddress } from './privateAddress';
import { isCrawlAllowed } from './robots';
import { currentScraperRuntime, runtimeForUrl, type ScraperRuntime } from './runtime';
import { requestHost } from './safetyPolicy';
import { cookieHeaderFor, mergeCookieHeaders, rememberSetCookie, userAgentForRequest } from './session';

/** Bodies beyond this are truncated; the UI says so rather than silently lying. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
/**
 * The most a caller may ask for by naming `maxBytes` explicitly.
 *
 * `MAX_BODY_BYTES` stays the default for every caller that says nothing, because
 * it is a defence against a hostile remote page. A first-party local API is a
 * different case: qBittorrent's `torrents/files` for the Kitsunekko archive is
 * **5,375,038 bytes / 28,748 entries**, measured 2026-08-24, so the 4 MiB clamp
 * cut the body mid-object and `JSON.parse` reported it as malformed. Only an
 * explicit larger request is honoured, and never past this ceiling.
 */
export const MAX_BODY_BYTES_CEILING = 32 * 1024 * 1024;
/** Matches the upper bound `validateScraperSettings` clamps the setting to. */
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export const SCRAPER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Header names whose value must never be rendered. */
const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
]);

export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const key = rawKey.toLowerCase();
    const joined = Array.isArray(value) ? value.join(', ') : String(value);
    out[key] = SECRET_HEADERS.has(key) ? '‹redacted›' : joined;
  }
  return out;
}

/** Labels Japanese sites actually send, folded onto one WHATWG name each. */
const CHARSET_ALIASES: Readonly<Record<string, string>> = {
  'shift-jis': 'shift_jis',
  sjis: 'shift_jis',
  'x-sjis': 'shift_jis',
  'windows-31j': 'shift_jis',
  cp932: 'shift_jis',
  ms_kanji: 'shift_jis',
  csshiftjis: 'shift_jis',
  eucjp: 'euc-jp',
  'x-euc-jp': 'euc-jp',
  cseucpkdfmtjapanese: 'euc-jp',
  csiso2022jp: 'iso-2022-jp',
  utf8: 'utf-8',
  'unicode-1-1-utf-8': 'utf-8',
};

function normaliseCharset(label: string): string {
  const key = label.trim().toLowerCase();
  return CHARSET_ALIASES[key] ?? key;
}

const CHARSET_PARAM = /charset\s*=\s*["']?\s*([\w.:-]+)/i;

/** `text/html; charset=Shift_JIS` → `shift_jis` (aliases folded); no charset → `utf-8`. */
export function charsetOf(contentType: string | undefined): string {
  const match = CHARSET_PARAM.exec(contentType ?? '');
  return normaliseCharset(match?.[1] ?? 'utf-8');
}

/** The encoding a byte-order mark announces, or null. */
function bomCharset(buffer: Uint8Array): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return 'utf-8';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf-16le';
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf-16be';
  return null;
}

/**
 * The charset a document declares in its own first 1024 bytes (read as latin1):
 * `<?xml ... encoding="..."?>`, `<meta charset=...>` or
 * `<meta http-equiv="Content-Type" content="...; charset=...">`. A page that
 * claims UTF-16 here cannot be UTF-16 (the declaration was readable as ASCII),
 * so that claim means UTF-8, as the HTML sniffing rules say.
 */
function declaredCharset(buffer: Uint8Array): string | null {
  const head = Buffer.from(buffer.subarray(0, 1024)).toString('latin1');
  const xml = /^\s*<\?xml\b[^>]*?\bencoding\s*=\s*["']\s*([\w.:-]+)/i.exec(head);
  const meta = xml ? null : /<meta\b[^>]*?\bcharset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head);
  const label = (xml ?? meta)?.[1];
  if (!label) return null;
  const charset = normaliseCharset(label);
  return charset.startsWith('utf-16') ? 'utf-8' : charset;
}

/**
 * Response bytes to text. Evidence order: byte-order mark, then the
 * Content-Type charset, then a charset the document declares in its first
 * 1024 bytes, then UTF-8. TextDecoder has full ICU in Node and Electron, so
 * Shift_JIS, EUC-JP and ISO-2022-JP all decode; an unknown label falls back to
 * UTF-8 rather than throwing.
 */
export function decodeBody(buffer: Buffer, contentType: string | undefined): string {
  const headerMatch = CHARSET_PARAM.exec(contentType ?? '');
  const charset = bomCharset(buffer)
    ?? (headerMatch ? normaliseCharset(headerMatch[1]) : null)
    ?? declaredCharset(buffer)
    ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export interface ScraperRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  followRedirects?: boolean;
  maxBytes?: number;
  /** Ties the request's log lines to a job or probe. */
  correlationId?: string;
  /**
   * Returns the unredacted `set-cookie` value on the response.
   *
   * Off by default and deliberately opt-in: the only caller that needs it is
   * the qBittorrent client, which has to carry the session cookie it was just
   * issued. `headers` stays redacted either way, so nothing that renders or
   * logs a response can pick the secret up by accident. Such a response is also
   * never cached — a session cookie is the one thing that must not be replayed.
   */
  exposeSetCookie?: boolean;
  /** `http://…`, `https://…`. Overrides the profile's proxy for this request. */
  proxyUrl?: string;
  /** Off skips certificate validation. Only the profile's setting turns this off. */
  verifySsl?: boolean;
  /**
   * This request is the scraper walking a site's own pages, rather than calling
   * a documented API. Only these consult robots.txt — see robots.ts for why the
   * distinction is drawn here, at the call site, instead of being guessed.
   */
  crawl?: boolean;
  /**
   * Cancels the request: the socket is destroyed and the call rejects with an
   * error whose code is `ERR_ABORTED` (see `isScraperAbortError`). Also ends
   * a retry sleep or a wait for a concurrency slot.
   */
  signal?: AbortSignal;
  /**
   * Refuse loopback / private / link-local / unique-local targets, the first
   * URL and every redirect hop (`ERR_PRIVATE_ADDRESS`). Inside a job scope a
   * crawl defaults to the profile's `safety.allowPrivateNetwork`; elsewhere
   * the default is off, and the Inspector and source probes set it.
   */
  blockPrivateNetwork?: boolean;
}

export interface ScraperResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  truncated: boolean;
  finalUrl: string;
  timingMs: { dns: number; connect: number; tls: number; ttfb: number; total: number };
  /** Only present when `exposeSetCookie` was asked for. Never log this. */
  rawSetCookie?: string;
  /** True when nothing went on the wire. The timings are zero in that case. */
  fromCache?: boolean;
}

class HttpError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

function abortError(): HttpError {
  return new HttpError('Request cancelled.', 'ERR_ABORTED');
}

/** True for the rejection a cancelled `signal` produces. */
export function isScraperAbortError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ERR_ABORTED';
}

/** A sleep that a cancel ends early, by rejecting with the abort error. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Methods a retry may safely repeat (RFC 9110 9.2.2). POST and PATCH never are. */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE']);
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * `Retry-After` as milliseconds, capped: either delta-seconds or an HTTP-date.
 * null when the header is absent or unreadable.
 */
export function retryAfterMs(value: string | undefined, now = Date.now()): number | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Math.min(MAX_RETRY_AFTER_MS, Number(raw) * 1_000);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, at - now));
}

/**
 * Exponential backoff from the profile's base delay (base, 2x, 4x, ...) plus up
 * to 25% jitter, so retries from parallel requests do not arrive in lockstep.
 * Never shorter than the delay the user set.
 */
function backoffMs(baseMs: number, attempt: number): number {
  if (baseMs <= 0) return 0;
  const step = Math.min(MAX_RETRY_AFTER_MS, baseMs * 2 ** Math.min(attempt, 10));
  return Math.round(step + Math.random() * step * 0.25);
}

/** Headers that never follow a redirect to another origin. */
const CROSS_ORIGIN_DROPPED = new Set(['cookie', 'authorization', 'proxy-authorization']);

function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port;
}

// ------------------------------------------------------------------ proxies ---

interface ProxyTarget {
  transport: typeof http | typeof https;
  hostname: string;
  port: number;
  /** `proxy-authorization` value when the proxy URL carried credentials. */
  authorization: string;
}

/**
 * A proxy URL, as something a request can be pointed at.
 *
 * SOCKS is rejected rather than ignored. The settings validator accepts a
 * `socks5://` URL, and silently making a direct connection instead would defeat
 * the only reason anyone sets a proxy — the user would believe their traffic was
 * going somewhere it was not.
 */
export function parseProxyTarget(proxyUrl: string): ProxyTarget {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new HttpError(`Not a usable proxy URL: ${proxyUrl}`, 'ERR_PROXY_SCHEME');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(
      `${parsed.protocol.replace(':', '')} proxies are not supported; use an http or https proxy.`,
      'ERR_PROXY_SCHEME',
    );
  }
  const authorization = parsed.username
    ? `Basic ${Buffer.from(
      `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`,
    ).toString('base64')}`
    : '';
  return {
    transport: parsed.protocol === 'https:' ? https : http,
    hostname: parsed.hostname,
    port: Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80),
    authorization,
  };
}

/**
 * A CONNECT tunnel to an https target.
 *
 * An http target does not need one — it is sent to the proxy in absolute form,
 * which is the older and simpler half of the same mechanism.
 */
function openProxyTunnel(
  proxy: ProxyTarget,
  target: URL,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    const authority = `${target.hostname}:${target.port || 443}`;
    const request = proxy.transport.request({
      host: proxy.hostname,
      port: proxy.port,
      method: 'CONNECT',
      path: authority,
      headers: {
        host: authority,
        ...(proxy.authorization ? { 'proxy-authorization': proxy.authorization } : {}),
      },
      timeout: timeoutMs,
      // A tunnel is a socket the caller owns; a pooled agent would try to reuse
      // it for an unrelated request once this response ends.
      agent: false,
    });
    request.once('connect', (response, socket: net.Socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new HttpError(
          `Proxy refused CONNECT ${authority}: ${response.statusCode} ${response.statusMessage ?? ''}`.trim(),
          'ERR_PROXY',
        ));
        return;
      }
      resolve(socket);
    });
    request.once('timeout', () => {
      request.destroy(new HttpError(`Proxy did not answer CONNECT within ${timeoutMs}ms.`, 'ERR_TIMEOUT'));
    });
    request.once('error', reject);
    request.end();
  });
}

// -------------------------------------------------------------- one attempt ---

export interface ResolvedRequestOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
  followRedirects: boolean;
  verifySsl: boolean;
  proxyUrl: string;
  correlationId?: string;
  exposeSetCookie: boolean;
  /**
   * Where a response's `set-cookie` goes when the profile keeps a session.
   *
   * Separate from `exposeSetCookie` on purpose: that flag puts the value on the
   * returned response, where a caller could render or log it. This hands it to
   * the jar and nowhere else, so persisting a session does not widen what a log
   * line can contain.
   */
  captureSetCookie?: (rawSetCookie: string, hopUrl: string) => void;
  /** The session jar's cookie for a redirect hop's own URL ('' for none). */
  jarCookieFor?: (hopUrl: string) => string;
  /**
   * Asked before every connection, the first one and each redirect hop: throws
   * to refuse (robots.txt, the private-address guard). `isRedirect` is false
   * for the URL the caller named.
   */
  beforeHop?: (hop: URL, isRedirect: boolean) => Promise<void>;
  /**
   * Connect a direct request through `publicOnlyLookup`, so the addresses the
   * socket really uses are checked too (DNS rebinding). Set with the guard.
   */
  publicOnlySockets?: boolean;
  signal?: AbortSignal;
  /**
   * Wall-clock deadline for the whole attempt, redirects included. `timeoutMs`
   * alone is an idle-socket timeout, which a server dribbling one byte a
   * second never trips. Set by `performRequest` from `timeoutMs` when absent.
   */
  deadlineAt?: number;
}

/**
 * Call-site options plus the profile's network policy.
 *
 * The precedence rule is the same for every field: what the call site asked for
 * wins, and the policy supplies the default. That keeps a deliberately short
 * per-source timeout short, while letting Request Timeout govern the calls —
 * catalogue lookups, index feeds — that never had an opinion of their own.
 *
 * Headers are the one place the two are merged rather than chosen between: the
 * policy's user agent, cookie and custom headers form the base, and a call
 * site's `content-type` layers on top.
 */
export function resolveRequestOptions(
  options: ScraperRequestOptions,
  policy: ScraperNetworkPolicy | null,
  attempt = 0,
): ResolvedRequestOptions {
  const base = mergeHeaders(
    {
      'user-agent': SCRAPER_USER_AGENT,
      accept: '*/*',
      'accept-language': 'ja,en;q=0.8',
    },
    policy ? policyHeaders(policy) : undefined,
    options.headers,
  );
  const timeout = options.timeoutMs ?? policy?.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const method = (options.method ?? 'GET').toUpperCase();
  // Node sends a written body with no `content-length` as `transfer-encoding:
  // chunked`, and qBittorrent's WebUI parses no form fields at all out of a
  // chunked request: `torrents/add` then sees an empty `urls` and answers 409
  // Conflict. Measured live 2026-08-16 — the same magnet with an explicit
  // length answered 200. Declaring the length is also simply correct for a
  // body we already hold whole in memory.
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD' && !base['content-length']) {
    base['content-length'] = String(Buffer.byteLength(options.body));
  }
  return {
    method,
    headers: base,
    body: options.body,
    timeoutMs: Math.min(MAX_TIMEOUT_MS, Math.max(1_000, timeout)),
    maxBytes: Math.min(MAX_BODY_BYTES_CEILING, Math.max(1_024, options.maxBytes ?? MAX_BODY_BYTES)),
    followRedirects: options.followRedirects ?? policy?.followRedirects ?? true,
    verifySsl: options.verifySsl ?? policy?.verifySsl ?? true,
    proxyUrl: options.proxyUrl ?? (policy ? proxyForAttempt(policy.proxies, attempt) : ''),
    correlationId: options.correlationId,
    exposeSetCookie: options.exposeSetCookie === true,
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

// Connection pools for requests under the private-address guard (see
// `publicOnlySockets`); kept apart from the global agents on purpose.
const guardedHttpAgent = new http.Agent({ keepAlive: true, timeout: 5_000 });
const guardedHttpsAgent = new https.Agent({ keepAlive: true, timeout: 5_000 });

function parseTarget(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(`Not a usable URL: ${url}`, 'ERR_URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(`Unsupported protocol: ${parsed.protocol}`, 'ERR_PROTOCOL');
  }
  return parsed;
}

/**
 * One attempt, with the phase timings the inspector needs.
 *
 * Redirects are followed by recursion rather than by a loop so each hop gets
 * its own timing block; the caller sees the timings of the last hop and the
 * final URL, which is what a browser's network panel shows too.
 */
async function performRequest(
  url: string,
  resolved: ResolvedRequestOptions,
  redirectsLeft = MAX_REDIRECTS,
): Promise<ScraperResponse> {
  if (resolved.deadlineAt === undefined) {
    resolved = { ...resolved, deadlineAt: Date.now() + resolved.timeoutMs };
  }
  const deadlineAt = resolved.deadlineAt ?? Date.now() + resolved.timeoutMs;
  const signal = resolved.signal;
  if (signal?.aborted) throw abortError();
  const parsed = parseTarget(url);
  const proxy = resolved.proxyUrl ? parseProxyTarget(resolved.proxyUrl) : null;
  const secure = parsed.protocol === 'https:';
  if (resolved.beforeHop) await resolved.beforeHop(parsed, redirectsLeft < MAX_REDIRECTS);
  if (signal?.aborted) throw abortError();

  // The tunnel is opened before the timing clock starts: it is a second
  // connection, and charging its cost to this request's TTFB would make the
  // Inspector's breakdown lie about where the time went.
  const tunnel = proxy && secure
    ? await openProxyTunnel(proxy, parsed, resolved.timeoutMs)
    : null;

  const started = Date.now();
  const mark = { dns: 0, connect: 0, tls: 0, ttfb: 0 };

  return new Promise<ScraperResponse>((resolvePromise, rejectPromise) => {
    // One settle for the attempt: the deadline timer and the abort listener are
    // torn down whichever way it ends.
    let settled = false;
    let activeResponse: http.IncomingMessage | null = null;
    let liveRequest: http.ClientRequest | null = null;
    // Only ever called after `deadlineTimer` below is initialised.
    const cleanup = () => {
      settled = true;
      clearTimeout(deadlineTimer);
      signal?.removeEventListener('abort', onAbort);
    };
    const resolve = (value: ScraperResponse | Promise<ScraperResponse>) => {
      if (settled) return;
      cleanup();
      resolvePromise(value);
    };
    const reject = (error: unknown) => {
      if (settled) return;
      cleanup();
      rejectPromise(error);
    };
    const kill = (error: Error) => {
      reject(error);
      activeResponse?.destroy(error);
      liveRequest?.destroy(error);
      tunnel?.destroy();
    };
    function onAbort() {
      kill(abortError());
    }
    const deadlineTimer = setTimeout(() => {
      kill(new HttpError(`Timed out after ${resolved.timeoutMs}ms in total.`, 'ERR_TIMEOUT'));
    }, Math.max(0, deadlineAt - Date.now()));
    signal?.addEventListener('abort', onAbort, { once: true });

    const onResponse = (response: http.IncomingMessage) => {
      activeResponse = response;
      mark.ttfb = Date.now() - started;

      // Before the redirect branch: a login flow commonly sets its cookie on the
      // 302 itself, and a jar that only read final responses would miss it.
      // Stored against this hop's URL, not the one the caller named.
      if (resolved.captureSetCookie) {
        const setCookie = response.headers['set-cookie'];
        const raw = Array.isArray(setCookie) ? setCookie.join(', ') : String(setCookie ?? '');
        if (raw) resolved.captureSetCookie(raw, parsed.toString());
      }

      const location = response.headers.location;
      if (
        resolved.followRedirects
        && location
        && response.statusCode
        && response.statusCode >= 300
        && response.statusCode < 400
      ) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new HttpError('Too many redirects.', 'ERR_REDIRECT'));
          return;
        }
        const nextUrl = new URL(location, parsed);
        const next = nextUrl.toString();
        scraperLog('debug', 'http', `${response.statusCode} → ${next}`, {
          correlationId: resolved.correlationId,
        });
        let hop = resolved;
        if (!sameOrigin(parsed, nextUrl)) {
          // Credentials were meant for the origin the caller named. A redirect
          // to anywhere else (another host, port or scheme) must not carry
          // them; the jar may still supply cookies that belong to the new one.
          const headers = { ...resolved.headers };
          for (const name of Object.keys(headers)) {
            if (CROSS_ORIGIN_DROPPED.has(name.toLowerCase())) delete headers[name];
          }
          const jarCookie = resolved.jarCookieFor?.(next) ?? '';
          if (jarCookie) headers.cookie = jarCookie;
          hop = { ...resolved, headers };
        }
        resolve(performRequest(next, hop, redirectsLeft - 1));
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      let truncated = false;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (truncated) return;
        if (bytes > resolved.maxBytes) {
          truncated = true;
          chunks.push(chunk.subarray(0, chunk.length - (bytes - resolved.maxBytes)));
          // Stop pulling bytes we have already decided to throw away.
          response.destroy();
          return;
        }
        chunks.push(chunk);
      });
      const finish = () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: response.statusCode ?? 0,
          statusText: response.statusMessage ?? '',
          headers: redactHeaders(response.headers),
          ...(resolved.exposeSetCookie
            ? {
              rawSetCookie: Array.isArray(response.headers['set-cookie'])
                ? response.headers['set-cookie'].join('; ')
                : String(response.headers['set-cookie'] ?? ''),
            }
            : {}),
          body: decodeBody(buffer, response.headers['content-type']),
          bytes: buffer.length,
          truncated,
          finalUrl: parsed.toString(),
          timingMs: {
            dns: mark.dns,
            connect: Math.max(0, mark.connect - mark.dns),
            tls: mark.tls ? Math.max(0, mark.tls - mark.connect) : 0,
            ttfb: mark.ttfb,
            total: Date.now() - started,
          },
        });
      };
      response.on('end', finish);
      // A body cut short at the cap ends via `close`, not `end`.
      response.on('close', () => {
        if (truncated) finish();
      });
      response.on('error', (error: Error) => reject(error));
    };

    let request: http.ClientRequest;
    if (tunnel) {
      // `createConnection` on the request options is ignored when paired with
      // `agent: false`: Node creates its own one-shot Agent and opens a fresh,
      // direct connection to `parsed` after we have already established the
      // CONNECT tunnel. Besides wasting the tunnel, that silently bypasses the
      // proxy the profile explicitly selected. Put the connection factory on
      // the Agent itself so the only socket this request can use is the TLS
      // layer over `tunnel`.
      const tunnelAgent = new https.Agent({
        keepAlive: false,
        maxCachedSessions: 0,
        rejectUnauthorized: resolved.verifySsl,
      });
      tunnelAgent.createConnection = (_options, callback) => {
        const secureSocket = tls.connect({
          socket: tunnel,
          servername: parsed.hostname,
          rejectUnauthorized: resolved.verifySsl,
        });
        if (callback) {
          let settled = false;
          const finish = (error: Error | null) => {
            if (settled) return;
            settled = true;
            callback(error, secureSocket);
          };
          secureSocket.once('secureConnect', () => finish(null));
          secureSocket.once('error', finish);
        }
        return secureSocket;
      };
      request = https.request(
        parsed,
        {
          method: resolved.method,
          headers: resolved.headers,
          timeout: resolved.timeoutMs,
          agent: tunnelAgent,
          rejectUnauthorized: resolved.verifySsl,
        },
        onResponse,
      );
      request.once('close', () => tunnelAgent.destroy());
    } else if (proxy) {
      // Absolute-form request URI: the old, plain-http half of proxying. The
      // Host header has to name the origin, not the proxy.
      request = proxy.transport.request(
        {
          host: proxy.hostname,
          port: proxy.port,
          method: resolved.method,
          path: parsed.toString(),
          headers: {
            ...resolved.headers,
            host: parsed.host,
            ...(proxy.authorization ? { 'proxy-authorization': proxy.authorization } : {}),
          },
          timeout: resolved.timeoutMs,
        },
        onResponse,
      );
    } else {
      request = (secure ? https : http).request(
        parsed,
        {
          method: resolved.method,
          headers: resolved.headers,
          timeout: resolved.timeoutMs,
          ...(secure ? { rejectUnauthorized: resolved.verifySsl } : {}),
          // Own pool, so a guarded request never reuses a socket an unguarded
          // one opened to a (re-bound) private address.
          ...(resolved.publicOnlySockets
            ? { lookup: publicOnlyLookup, agent: secure ? guardedHttpsAgent : guardedHttpAgent }
            : {}),
        },
        onResponse,
      );
    }
    liveRequest = request;

    request.on('socket', (socket) => {
      // A keep-alive socket that is already open has no DNS/TCP/TLS cost to
      // measure, and attaching to it anyway accumulates listeners on a socket
      // that outlives this request — which is exactly the leak Node warns
      // about once eleven requests have shared one connection.
      if (!socket.connecting) return;
      socket.once('lookup', () => {
        mark.dns = Date.now() - started;
      });
      socket.once('connect', () => {
        mark.connect = Date.now() - started;
      });
      socket.once('secureConnect', () => {
        mark.tls = Date.now() - started;
      });
    });

    request.on('timeout', () => {
      request.destroy(new HttpError(`Timed out after ${resolved.timeoutMs}ms.`, 'ERR_TIMEOUT'));
    });
    request.on('error', (error: Error) => reject(error));

    if (resolved.body !== undefined && resolved.method !== 'GET' && resolved.method !== 'HEAD') {
      request.write(resolved.body);
    }
    request.end();
  });
}

// ------------------------------------------------------------ policy layer ---

/**
 * Layers the job's session onto one attempt's resolved options.
 *
 * Mutating is deliberate: `resolved` is built fresh per attempt, and the
 * alternative is threading two more parameters through `resolveRequestOptions`,
 * whose signature is the thing every other test in this folder pins.
 *
 * Precedence, in both cases: whatever the call site asked for wins, then the
 * profile's own setting, then the session. The session only ever fills a gap.
 */
function applySession(
  resolved: ResolvedRequestOptions,
  runtime: ScraperRuntime,
  url: string,
  callerHeaders: Record<string, string> | undefined,
): void {
  const asked = new Set(Object.keys(callerHeaders ?? {}).map((name) => name.toLowerCase()));

  if (!asked.has('user-agent')) {
    const agent = userAgentForRequest(runtime.session, runtime.network.userAgent);
    if (agent) resolved.headers['user-agent'] = agent;
  }

  const jarCookie = cookieHeaderFor(runtime.session, url);
  if (jarCookie) {
    const merged = mergeCookieHeaders(resolved.headers.cookie ?? '', jarCookie);
    if (merged) resolved.headers.cookie = merged;
  }

  if (runtime.session.persistCookies) {
    // Per hop: a cookie set by a redirect's target belongs to that target.
    resolved.captureSetCookie = (raw, hopUrl) => rememberSetCookie(runtime.session, hopUrl || url, raw);
  }
  resolved.jarCookieFor = (hopUrl) => cookieHeaderFor(runtime.session, hopUrl);
}

/** Refuses a private/local address with an `ERR_PRIVATE_ADDRESS` HttpError. */
async function assertPublicHop(hop: URL): Promise<void> {
  if (await resolvesToPrivateAddress(hop.hostname)) {
    throw new HttpError(
      `Refusing to fetch ${hop.hostname}: it is a private or local network address. `
        + 'Turn on "Allow private network" in the profile\'s Safety settings to reach it.',
      'ERR_PRIVATE_ADDRESS',
    );
  }
}

/**
 * Fetches a host's robots.txt.
 *
 * Straight to `performRequest`: it must not queue behind the job's own pacing
 * (that would charge every first crawl a full crawl-delay before it has asked
 * anything), and it certainly must not consult robots.txt about robots.txt.
 * Anything but a 200 reads as "no rules", which is the fail-open the module
 * documents.
 */
async function fetchRobotsText(robotsUrl: string, policy: ScraperNetworkPolicy): Promise<string | null> {
  const resolved = resolveRequestOptions({ timeoutMs: 10_000, maxBytes: 512 * 1024 }, policy);
  const response = await performRequest(robotsUrl, resolved);
  return response.status === 200 ? response.body : null;
}

/**
 * One request, under whatever profile the surrounding job is running.
 *
 * Outside a runtime scope this is `performRequest` with the old defaults, so
 * the Inspector, the source probes and the qBittorrent client behave exactly as
 * they did before the Network and Cache groups had a consumer.
 */
export async function scraperRequest(
  url: string,
  options: ScraperRequestOptions = {},
): Promise<ScraperResponse> {
  const scope = currentScraperRuntime();
  const signal = options.signal ?? scope?.signal;
  if (signal && !options.signal) options = { ...options, signal };
  if (!scope) {
    const direct = resolveRequestOptions(options, null);
    if (options.blockPrivateNetwork) {
      direct.beforeHop = (hop) => assertPublicHop(hop);
      direct.publicOnlySockets = true;
    }
    return performRequest(url, direct);
  }
  // A host with its own Connection Profile gets that profile's timeouts,
  // headers, proxy, pacing and cache; every other host keeps the run's.
  const runtime = runtimeForUrl(scope, url);

  const policy = runtime.network;
  const method = (options.method ?? 'GET').toUpperCase();
  const kind = cacheKindFor(url);
  const cacheable = !options.exposeSetCookie && isCacheableRequest(method, url, kind);
  // The effective cookie and authorization, as `applySession` will send them:
  // two sessions must never be served each other's cached pages.
  const effective = resolveRequestOptions(options, policy);
  const credentials = [
    mergeCookieHeaders(effective.headers.cookie ?? '', cookieHeaderFor(runtime.session, url)),
    effective.headers.authorization ?? '',
  ].filter(Boolean).join('\n');
  const key = cacheKeyFor(method, url, options.body, credentials);
  const correlationId = options.correlationId ?? runtime.correlationId;
  // A crawl walks URLs a page supplied, so it is the request the private-address
  // guard exists for; API calls go to hosts the app itself names.
  const guardPrivate = options.blockPrivateNetwork
    ?? (options.crawl === true && runtime.governor.policy.allowPrivateNetwork !== true);
  const checkRobots = options.crawl === true && runtime.governor.policy.respectRobotsTxt;
  const userAgent = effective.headers['user-agent'] ?? '';
  const beforeHop = async (hop: URL, isRedirect: boolean): Promise<void> => {
    if (!isRedirect) return;
    if (guardPrivate) await assertPublicHop(hop);
    // A crawl redirected to another path or host is a new crawl of that URL.
    if (checkRobots) {
      const allowed = await isCrawlAllowed(
        hop.toString(),
        userAgent,
        (robotsUrl) => fetchRobotsText(robotsUrl, policy),
        correlationId,
      );
      if (!allowed) throw new HttpError(`robots.txt disallows ${hop.toString()}.`, 'ERR_ROBOTS');
    }
  };

  if (cacheable) {
    const hit = readScraperCache(key, kind, runtime.cache);
    if (hit) {
      scraperLog('debug', 'http', `${method} ${url} served from cache (${kind}).`, {
        correlationId: options.correlationId ?? runtime.correlationId,
      });
      return {
        status: hit.status,
        statusText: hit.statusText,
        headers: { ...hit.headers },
        body: hit.body,
        bytes: hit.bytes,
        truncated: false,
        finalUrl: hit.finalUrl,
        timingMs: { dns: 0, connect: 0, tls: 0, ttfb: 0, total: 0 },
        fromCache: true,
      };
    }
  }
  if (runtime.cache.mode === 'offline') {
    // "Offline — never refetch" has to mean the socket is not opened. Failing
    // loudly is the only honest outcome: a run that quietly went to the network
    // would make the setting a decoration.
    throw new HttpError(`Offline cache mode: ${url} is not in the cache.`, 'ERR_OFFLINE');
  }

  // Before robots.txt: asking a private host for its robots.txt would already
  // be the request the guard exists to refuse.
  if (guardPrivate) await assertPublicHop(parseTarget(url));

  // Checked before the gate is taken: a request robots.txt forbids should not
  // consume a concurrency slot or a pacing turn on the way to being refused.
  if (checkRobots) {
    const allowed = await isCrawlAllowed(
      url,
      userAgent,
      (robotsUrl) => fetchRobotsText(robotsUrl, policy),
      correlationId,
    );
    if (!allowed) {
      throw new HttpError(`robots.txt disallows ${url}.`, 'ERR_ROBOTS');
    }
  }

  // Only a method that means the same thing twice is retried: a POST that
  // timed out may well have been applied, and sending it again doubles it.
  const idempotent = IDEMPOTENT_METHODS.has(method);
  const pause = randomDelayMs(policy);
  for (let attempt = 0; ; attempt += 1) {
    const resolved = resolveRequestOptions(options, policy, attempt);
    applySession(resolved, runtime, url, options.headers);
    resolved.beforeHop = beforeHop;
    if (guardPrivate) resolved.publicOnlySockets = true;
    const canRetry = idempotent && attempt < policy.retryAttempts;
    let waitMs = 0;
    try {
      // The slot is taken per attempt and released before a retry's sleep, so
      // one host that is backing off does not hold a slot every other host
      // is queued for.
      const response = await policy.gate.run(async () => {
        if (attempt === 0 && pause > 0) await sleep(pause, signal);
        // Per host, per attempt: a retry is another request arriving at the
        // same server, and exempting it would make the limit hold only while
        // nothing was going wrong.
        await runtime.governor.waitForTurn(url);
        return performRequest(url, resolved);
      }, signal);
      if (canRetry && isRetryableStatus(response.status)) {
        if (runtime.governor.noteFailure(url)) {
          scraperLog('warn', 'http', `Pausing requests to ${requestHost(url)} after repeated failures.`, {
            correlationId: resolved.correlationId ?? runtime.correlationId,
          });
        }
        // The server's own `Retry-After` wins on 429/503: it is the one
        // number that is not a guess.
        const asked = response.status === 429 || response.status === 503
          ? retryAfterMs(response.headers['retry-after'])
          : null;
        waitMs = asked ?? backoffMs(policy.retryDelayMs, attempt);
        scraperLog('warn', 'http', `${method} ${url} answered ${response.status}; retrying in ${waitMs}ms.`, {
          correlationId: resolved.correlationId ?? runtime.correlationId,
        });
      } else {
        // A 4xx that is not retryable is still the server answering, not a
        // failure of the host — only transport and transient errors count
        // toward the breaker, which is what "Pause After Failures" describes.
        if (isRetryableStatus(response.status)) runtime.governor.noteFailure(url);
        else runtime.governor.noteSuccess(url);
        if (cacheable && response.status === 200 && !response.truncated) {
          writeScraperCache(
            key,
            {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              body: response.body,
              bytes: response.bytes,
              finalUrl: response.finalUrl,
            },
            kind,
            runtime.cache,
          );
        }
        return response;
      }
    } catch (error) {
      // A cancel is the user's decision, not the host failing.
      if (signal?.aborted || isScraperAbortError(error)) throw abortError();
      if (runtime.governor.noteFailure(url)) {
        scraperLog('warn', 'http', `Pausing requests to ${requestHost(url)} after repeated failures.`, {
          correlationId: resolved.correlationId ?? runtime.correlationId,
        });
      }
      if (!canRetry || !isRetryableError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      waitMs = backoffMs(policy.retryDelayMs, attempt);
      scraperLog('warn', 'http', `${method} ${url} failed (${message}); retrying in ${waitMs}ms.`, {
        correlationId: resolved.correlationId ?? runtime.correlationId,
      });
    }
    if (waitMs > 0) await sleep(waitMs, signal);
  }
}

/** The HTTP Inspector's handler: one request, projected onto the wire type. */
export async function probeHttp(
  input: ScraperHttpProbeRequest,
  // The active profile's `safety.allowPrivateNetwork`; the guard is on unless
  // the caller says the profile allows it.
  guard: { allowPrivateNetwork?: boolean } = {},
): Promise<ScraperHttpProbeResult> {
  const method = (input.method || 'GET').toUpperCase();
  scraperLog('info', 'http', `${method} ${input.url}`, { correlationId: 'inspector' });
  const started = Date.now();
  try {
    const response = await scraperRequest(input.url, {
      method,
      headers: input.headers ?? {},
      body: input.body,
      timeoutMs: input.timeoutMs,
      followRedirects: input.followRedirects,
      correlationId: 'inspector',
      blockPrivateNetwork: guard.allowPrivateNetwork !== true,
    });
    scraperLog(
      'info',
      'http',
      `${response.status} ${response.statusText} · ${response.bytes} B · ${response.timingMs.total}ms`,
      { correlationId: 'inspector' },
    );
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body,
      timingMs: response.timingMs,
      sizeBytes: response.bytes,
      finalUrl: response.finalUrl,
      truncated: response.truncated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scraperLog('error', 'http', `${method} ${input.url} failed: ${message}`, {
      correlationId: 'inspector',
    });
    // A failed request is a result the inspector can render, not an exception
    // to blank the panel with: status 0 is how a browser reports the same thing.
    return {
      status: 0,
      statusText: message,
      headers: {},
      body: '',
      timingMs: { dns: 0, connect: 0, tls: 0, ttfb: 0, total: Date.now() - started },
      sizeBytes: 0,
      finalUrl: input.url,
      truncated: false,
    };
  }
}
