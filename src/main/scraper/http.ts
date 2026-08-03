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
import { isCrawlAllowed } from './robots';
import { currentScraperRuntime, type ScraperRuntime } from './runtime';
import { requestHost } from './safetyPolicy';
import { cookieHeaderFor, mergeCookieHeaders, rememberSetCookie, userAgentForRequest } from './session';

/** Bodies beyond this are truncated; the UI says so rather than silently lying. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
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

/** `text/html; charset=shift_jis` → `shift_jis`. */
export function charsetOf(contentType: string | undefined): string {
  const match = /charset=["']?([\w-]+)/i.exec(contentType ?? '');
  return (match?.[1] ?? 'utf-8').toLowerCase();
}

function decodeBody(buffer: Buffer, contentType: string | undefined): string {
  const charset = charsetOf(contentType);
  try {
    // Node knows utf-8/latin1/utf-16le natively; anything else (Shift_JIS,
    // EUC-JP — both common on Japanese sites) goes through TextDecoder, which
    // ships with full ICU in Electron.
    if (['utf-8', 'utf8', 'ascii', 'latin1', 'utf-16le', 'ucs-2'].includes(charset)) {
      return buffer.toString(charset === 'utf8' ? 'utf-8' : (charset as BufferEncoding));
    }
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return buffer.toString('utf-8');
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  captureSetCookie?: (rawSetCookie: string) => void;
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
  return {
    method: (options.method ?? 'GET').toUpperCase(),
    headers: base,
    body: options.body,
    timeoutMs: Math.min(MAX_TIMEOUT_MS, Math.max(1_000, timeout)),
    maxBytes: Math.min(MAX_BODY_BYTES, Math.max(1_024, options.maxBytes ?? MAX_BODY_BYTES)),
    followRedirects: options.followRedirects ?? policy?.followRedirects ?? true,
    verifySsl: options.verifySsl ?? policy?.verifySsl ?? true,
    proxyUrl: options.proxyUrl ?? (policy ? proxyForAttempt(policy.proxies, attempt) : ''),
    correlationId: options.correlationId,
    exposeSetCookie: options.exposeSetCookie === true,
  };
}

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
  const parsed = parseTarget(url);
  const proxy = resolved.proxyUrl ? parseProxyTarget(resolved.proxyUrl) : null;
  const secure = parsed.protocol === 'https:';

  // The tunnel is opened before the timing clock starts: it is a second
  // connection, and charging its cost to this request's TTFB would make the
  // Inspector's breakdown lie about where the time went.
  const tunnel = proxy && secure
    ? await openProxyTunnel(proxy, parsed, resolved.timeoutMs)
    : null;

  const started = Date.now();
  const mark = { dns: 0, connect: 0, tls: 0, ttfb: 0 };

  return new Promise<ScraperResponse>((resolve, reject) => {
    const onResponse = (response: http.IncomingMessage) => {
      mark.ttfb = Date.now() - started;

      // Before the redirect branch: a login flow commonly sets its cookie on the
      // 302 itself, and a jar that only read final responses would miss it.
      if (resolved.captureSetCookie) {
        const setCookie = response.headers['set-cookie'];
        const raw = Array.isArray(setCookie) ? setCookie.join(', ') : String(setCookie ?? '');
        if (raw) resolved.captureSetCookie(raw);
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
        const next = new URL(location, parsed).toString();
        scraperLog('debug', 'http', `${response.statusCode} → ${next}`, {
          correlationId: resolved.correlationId,
        });
        resolve(performRequest(next, resolved, redirectsLeft - 1));
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
      request = https.request(
        parsed,
        {
          method: resolved.method,
          headers: resolved.headers,
          timeout: resolved.timeoutMs,
          agent: false,
          rejectUnauthorized: resolved.verifySsl,
          createConnection: () => tls.connect({
            socket: tunnel,
            servername: parsed.hostname,
            rejectUnauthorized: resolved.verifySsl,
          }),
        },
        onResponse,
      );
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
        },
        onResponse,
      );
    }

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
    resolved.captureSetCookie = (raw) => rememberSetCookie(runtime.session, url, raw);
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
  const runtime = currentScraperRuntime();
  if (!runtime) return performRequest(url, resolveRequestOptions(options, null));

  const policy = runtime.network;
  const method = (options.method ?? 'GET').toUpperCase();
  const kind = cacheKindFor(url);
  const cacheable = !options.exposeSetCookie && isCacheableRequest(method, url, kind);
  const key = cacheKeyFor(method, url, options.body);

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

  // Checked before the gate is taken: a request robots.txt forbids should not
  // consume a concurrency slot or a pacing turn on the way to being refused.
  if (options.crawl && runtime.governor.policy.respectRobotsTxt) {
    const allowed = await isCrawlAllowed(
      url,
      resolveRequestOptions(options, policy).headers['user-agent'] ?? '',
      (robotsUrl) => fetchRobotsText(robotsUrl, policy),
      options.correlationId ?? runtime.correlationId,
    );
    if (!allowed) {
      throw new HttpError(`robots.txt disallows ${url}.`, 'ERR_ROBOTS');
    }
  }

  return policy.gate.run(async () => {
    const pause = randomDelayMs(policy);
    if (pause > 0) await sleep(pause);

    for (let attempt = 0; ; attempt += 1) {
      // Per host, per attempt: a retry is another request arriving at the same
      // server, and exempting it would make the limit hold only while nothing
      // was going wrong.
      await runtime.governor.waitForTurn(url);
      const resolved = resolveRequestOptions(options, policy, attempt);
      applySession(resolved, runtime, url, options.headers);
      const canRetry = attempt < policy.retryAttempts;
      try {
        const response = await performRequest(url, resolved);
        if (canRetry && isRetryableStatus(response.status)) {
          if (runtime.governor.noteFailure(url)) {
            scraperLog('warn', 'http', `Pausing requests to ${requestHost(url)} after repeated failures.`, {
              correlationId: resolved.correlationId ?? runtime.correlationId,
            });
          }
          scraperLog('warn', 'http', `${method} ${url} answered ${response.status}; retrying.`, {
            correlationId: resolved.correlationId ?? runtime.correlationId,
          });
          if (policy.retryDelayMs > 0) await sleep(policy.retryDelayMs);
          continue;
        }
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
      } catch (error) {
        if (runtime.governor.noteFailure(url)) {
          scraperLog('warn', 'http', `Pausing requests to ${requestHost(url)} after repeated failures.`, {
            correlationId: resolved.correlationId ?? runtime.correlationId,
          });
        }
        if (!canRetry || !isRetryableError(error)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        scraperLog('warn', 'http', `${method} ${url} failed (${message}); retrying.`, {
          correlationId: resolved.correlationId ?? runtime.correlationId,
        });
        if (policy.retryDelayMs > 0) await sleep(policy.retryDelayMs);
      }
    }
  });
}

/** The HTTP Inspector's handler: one request, projected onto the wire type. */
export async function probeHttp(
  input: ScraperHttpProbeRequest,
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
