// The Network settings group, turned into something requests obey.
//
// Until this module existed, `network.*` was stored, validated, round-tripped
// and read by nobody: every request in this folder used the hard-coded user
// agent in http.ts and whatever timeout its call site happened to pass. This
// resolves one profile's network settings into a policy object, and http.ts
// applies it to every request made inside a job.
//
// Three of the settings are behavioural rather than per-request, so they live
// here as small mechanisms rather than as fields copied onto an options bag:
//
//   concurrentRequests → RequestGate, a counting semaphore held for the life of
//                        one job, so "4 concurrent requests" means four sockets
//                        open at once and not four anything-else.
//   randomDelay*       → a pause taken inside the gate, before each request.
//   retryAttempts      → the loop in http.ts, with proxyRotation advancing one
//                        entry per attempt, which is what the field's own hint
//                        in the settings drawer promises ("Rotates through these
//                        when a request fails").

import type { ScraperNetworkSettings } from '../../shared/scraperSettings';

/**
 * A counting semaphore.
 *
 * Deliberately FIFO: a LIFO queue under sustained load starves the first
 * request that ever waited, which on an episode-list walk is page 1.
 */
export class RequestGate {
  private active = 0;

  private readonly waiting: (() => void)[] = [];

  constructor(readonly limit: number) {}

  /** How many slots are held right now — the thing a test can assert on. */
  get inFlight(): number {
    return this.active;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}

export interface ScraperNetworkPolicy {
  userAgent: string;
  headers: Record<string, string>;
  cookieHeader: string;
  /** `proxyUrl` first, then the rotation list. Empty means a direct connection. */
  proxies: string[];
  retryAttempts: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
  randomDelayMinMs: number;
  randomDelayMaxMs: number;
  followRedirects: boolean;
  verifySsl: boolean;
  gate: RequestGate;
}

export function networkPolicyFrom(network: ScraperNetworkSettings): ScraperNetworkPolicy {
  // A rotation entry equal to the primary proxy would make one attempt in the
  // cycle a no-op rotation, so the list is de-duplicated on the way in.
  const proxies: string[] = [];
  for (const candidate of [network.proxyUrl, ...network.proxyRotation]) {
    const trimmed = candidate.trim();
    if (trimmed && !proxies.includes(trimmed)) proxies.push(trimmed);
  }
  return {
    userAgent: network.userAgent.trim(),
    headers: { ...network.headers },
    cookieHeader: network.cookieHeader.trim(),
    proxies,
    retryAttempts: network.retryAttempts,
    retryDelayMs: network.retryDelayMs,
    requestTimeoutMs: network.requestTimeoutMs,
    randomDelayMinMs: network.randomDelayMinMs,
    randomDelayMaxMs: network.randomDelayMaxMs,
    followRedirects: network.followRedirects,
    verifySsl: network.verifySsl,
    gate: new RequestGate(network.concurrentRequests),
  };
}

/**
 * Header names are lower-cased on the way in.
 *
 * Node sends whatever casing it is given, so `User-Agent` from a settings
 * document and `user-agent` from a call site are two different keys to a plain
 * spread — and the request would carry both.
 */
export function mergeHeaders(
  ...sources: (Record<string, string> | undefined)[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [name, value] of Object.entries(source)) out[name.toLowerCase()] = value;
  }
  return out;
}

/** The headers a policy contributes, before the call site's own are layered on. */
export function policyHeaders(policy: ScraperNetworkPolicy): Record<string, string> {
  const out = mergeHeaders(policy.headers);
  if (policy.userAgent) out['user-agent'] = policy.userAgent;
  if (policy.cookieHeader) out.cookie = policy.cookieHeader;
  return out;
}

/** Which proxy a given attempt uses. Attempt 0 is the first try. */
export function proxyForAttempt(proxies: string[], attempt: number): string {
  if (!proxies.length) return '';
  return proxies[attempt % proxies.length];
}

/**
 * The pause taken before a request.
 *
 * `random` is a parameter so a test can pin it; the settings model already
 * guarantees max >= min, but this does not rely on that.
 */
export function randomDelayMs(policy: ScraperNetworkPolicy, random: () => number = Math.random): number {
  const min = Math.max(0, policy.randomDelayMinMs);
  const max = Math.max(min, policy.randomDelayMaxMs);
  if (max === 0) return 0;
  return Math.round(min + random() * (max - min));
}

/**
 * Whether a response is worth trying again.
 *
 * 408/429 and 5xx are transient by definition. A 4xx that is not one of those
 * is the server saying the request itself is wrong, and repeating it is just
 * load — Jikan's 404 for an unknown title will still be 404 five attempts later.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Codes set by http.ts for failures that repeating cannot fix. */
const FATAL_CODES = new Set(['ERR_URL', 'ERR_PROTOCOL', 'ERR_REDIRECT', 'ERR_PROXY_SCHEME']);

export function isRetryableError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return typeof code !== 'string' || !FATAL_CODES.has(code);
}
