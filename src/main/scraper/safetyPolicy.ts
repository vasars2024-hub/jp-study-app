// The Anti-Bot group's `safety.*` half, turned into something requests obey.
//
// Four of the five drawer controls are about *pace*, and pace is a per-host
// property: a run that walks Jikan gently while hammering nyaa.si is not being
// polite, it is being polite to one of them. So every mechanism here is keyed
// on the hostname.
//
//   crawlDelayMs        → a minimum gap between two request *starts* on one host.
//   maxRequestsPerMinute→ a sliding sixty-second window per host.
//   domainRateLimits    → the same window with a per-host number instead.
//   pauseAfterFailures  → a circuit breaker: N consecutive failures on one host
//     + pauseDurationMs   stops asking it for a while, rather than spending the
//                         retry budget on a host that is plainly down.
//
// Why starts and not completions: `network.concurrentRequests` caps how many
// sockets are open, and if crawl delay spaced *completions* the two settings
// would be the same setting. Spacing starts means four concurrent requests to a
// slow host still overlap — they just begin half a second apart — which is what
// both controls read as on the screen.
//
// The reservation is taken synchronously, before any await. Two parallel
// requests to one host must not both read the same "last request was at" and
// both decide they may go now; advancing the cursor first is what makes the
// limit a limit rather than a suggestion.

import type { ScraperSafetySettings } from '../../shared/scraperSettings';

const WINDOW_MS = 60_000;

export interface ScraperSafetyPolicy {
  respectRobotsTxt: boolean;
  /** Crawls may reach loopback / private addresses (the SSRF guard is off). */
  allowPrivateNetwork?: boolean;
  crawlDelayMs: number;
  maxRequestsPerMinute: number;
  domainRateLimits: Record<string, number>;
  pauseAfterFailures: number;
  pauseDurationMs: number;
}

export function safetyPolicyFrom(safety: ScraperSafetySettings): ScraperSafetyPolicy {
  const domainRateLimits: Record<string, number> = {};
  for (const [host, limit] of Object.entries(safety.domainRateLimits)) {
    // Host keys are compared against a parsed hostname, which is lower case.
    domainRateLimits[host.trim().toLowerCase()] = limit;
  }
  return {
    respectRobotsTxt: safety.respectRobotsTxt,
    allowPrivateNetwork: safety.allowPrivateNetwork === true,
    crawlDelayMs: Math.max(0, safety.crawlDelayMs),
    maxRequestsPerMinute: Math.max(0, safety.maxRequestsPerMinute),
    domainRateLimits,
    pauseAfterFailures: Math.max(0, safety.pauseAfterFailures),
    pauseDurationMs: Math.max(0, safety.pauseDurationMs),
  };
}

/**
 * The host a request is throttled and circuit-broken against.
 *
 * Lower-cased, and **`''` for anything that is not a usable URL** — every caller
 * below treats the empty string as "no bucket, let it through", which is the
 * right direction to fail for a rate limiter.
 *
 * Named for the job rather than `hostOf` because `resources/ResourcesContent.tsx`
 * exports a `hostOf` that is deliberately different on both counts: it strips
 * `www.` and returns the original string on a parse failure, because it is for
 * *display*. Sharing a name invited someone to share the implementation, and
 * either substitution is a bug — stripping `www.` merges two rate-limit buckets
 * that are two hosts, and returning the raw string on failure invents a bucket
 * out of a malformed URL.
 */
export function requestHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * The per-minute ceiling for one host.
 *
 * A `domainRateLimits` entry wins over the global number, including when it is
 * *higher*: the field exists to say "this one is different", and silently
 * clamping it to the global would make an override that raises a limit do
 * nothing while an override that lowers one worked.
 *
 * Matching is on the exact hostname and on a leading-dot suffix ('.nyaa.si'
 * covers 'sukebei.nyaa.si'), which is the only wildcard form worth supporting
 * without dragging in a public-suffix list.
 */
export function rateLimitFor(host: string, policy: ScraperSafetyPolicy): number {
  const exact = policy.domainRateLimits[host];
  if (typeof exact === 'number') return exact;
  for (const [pattern, limit] of Object.entries(policy.domainRateLimits)) {
    if (pattern.startsWith('.') && (host === pattern.slice(1) || host.endsWith(pattern))) {
      return limit;
    }
  }
  return policy.maxRequestsPerMinute;
}

interface HostState {
  /** Earliest instant the next request to this host may start. */
  nextAt: number;
  /** Start times inside the sliding window, oldest first. */
  window: number[];
  consecutiveFailures: number;
  /** Set by the circuit breaker. 0 when the host is not paused. */
  pausedUntil: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The pacing state for one job.
 *
 * One per runtime scope, like `RequestGate`: two jobs running at once each get
 * their own budget, because a shared one would make "60 requests a minute" mean
 * something different depending on what else the user happened to be running.
 */
export class HostGovernor {
  private readonly hosts = new Map<string, HostState>();

  constructor(
    readonly policy: ScraperSafetyPolicy,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  private stateFor(host: string): HostState {
    const existing = this.hosts.get(host);
    if (existing) return existing;
    const fresh: HostState = { nextAt: 0, window: [], consecutiveFailures: 0, pausedUntil: 0 };
    this.hosts.set(host, fresh);
    return fresh;
  }

  /**
   * Claims the next slot for a host and reports how long to wait for it.
   *
   * Exposed separately from `waitForTurn` so a test can assert the arithmetic
   * without a clock: the interesting failures here are off-by-one-window ones,
   * and observing them through real timers is how a suite becomes flaky.
   */
  reserve(url: string): number {
    const host = requestHost(url);
    if (!host) return 0;
    const state = this.stateFor(host);
    const now = this.now();

    let at = Math.max(now, state.nextAt);
    if (state.pausedUntil > at) at = state.pausedUntil;

    const limit = rateLimitFor(host, this.policy);
    if (limit > 0) {
      const drop = (until: number) => {
        while (state.window.length && state.window[0] <= until - WINDOW_MS) state.window.shift();
      };
      drop(at);
      if (state.window.length >= limit) {
        // The oldest start in the window has to fall out of it before another
        // may go in, which is exactly one window after that start.
        at = Math.max(at, state.window[0] + WINDOW_MS);
        drop(at);
      }
      state.window.push(at);
    }

    state.nextAt = at + this.policy.crawlDelayMs;
    return Math.max(0, at - now);
  }

  /** Reserves a slot for `url` and waits for it. */
  async waitForTurn(url: string): Promise<void> {
    const delay = this.reserve(url);
    if (delay > 0) await this.wait(delay);
  }

  /** A host that answered. Clears whatever failure streak it had. */
  noteSuccess(url: string): void {
    const host = requestHost(url);
    if (!host) return;
    this.stateFor(host).consecutiveFailures = 0;
  }

  /**
   * A host that did not answer.
   *
   * The streak is reset when the breaker trips rather than left at the
   * threshold: otherwise every subsequent failure would re-arm a full pause,
   * and one dead host would stall the run for `pauseDurationMs` per attempt.
   */
  noteFailure(url: string): boolean {
    const host = requestHost(url);
    if (!host) return false;
    const state = this.stateFor(host);
    state.consecutiveFailures += 1;
    if (this.policy.pauseAfterFailures <= 0) return false;
    if (state.consecutiveFailures < this.policy.pauseAfterFailures) return false;
    state.consecutiveFailures = 0;
    state.pausedUntil = this.now() + this.policy.pauseDurationMs;
    return true;
  }

  /** Whether a host is inside a breaker pause right now. For logs and tests. */
  isPaused(url: string): boolean {
    const host = requestHost(url);
    if (!host) return false;
    return this.stateFor(host).pausedUntil > this.now();
  }
}
