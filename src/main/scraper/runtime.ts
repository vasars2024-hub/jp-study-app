// The profile a piece of work is running under, made ambient.
//
// Settings groups like Network and Cache have to reach every request a job
// makes, including the ones inside catalogue.ts, torrents.ts and
// seanimeSources.ts that were written long before those settings had a
// consumer. Threading a policy argument through all of them would be a wide,
// mechanical change to modules that have nothing to do with settings — and one
// that a new call site can silently forget.
//
// So the scope is carried by AsyncLocalStorage instead. `runWithScraperRuntime`
// wraps the body of a job; every `scraperRequest` underneath it, however deep,
// sees that job's policy. Two jobs running at once each see their own, which a
// module-level "current settings" variable could not promise.
//
// Outside a scope — the HTTP Inspector, a source probe, the qBittorrent client —
// `currentScraperRuntime()` is null and every module keeps the defaults it had
// before this existed. That is deliberate: those surfaces are the user acting
// directly, not a profile acting on their behalf.

import { AsyncLocalStorage } from 'node:async_hooks';
import type { ScraperSettings } from '../../shared/scraperSettings';
import { cachePolicyFrom, type ScraperCachePolicy } from './httpCache';
import { networkPolicyFrom, type ScraperNetworkPolicy } from './networkPolicy';
import { HostGovernor, safetyPolicyFrom } from './safetyPolicy';
import { sessionStateFrom, type ScraperSessionState } from './session';

export interface ScraperRuntime {
  network: ScraperNetworkPolicy;
  cache: ScraperCachePolicy;
  /** Per-host pacing and the failure breaker — the Anti-Bot group's safety half. */
  governor: HostGovernor;
  /** The identity and cookie jar this job runs under — its session half. */
  session: ScraperSessionState;
  /** Ties this scope's requests to the job that opened it, for the log bus. */
  correlationId: string;
}

const storage = new AsyncLocalStorage<ScraperRuntime>();

export function scraperRuntimeFor(settings: ScraperSettings, correlationId = ''): ScraperRuntime {
  return {
    network: networkPolicyFrom(settings.network),
    cache: cachePolicyFrom(settings.cache, settings.metadata),
    governor: new HostGovernor(safetyPolicyFrom(settings.safety)),
    session: sessionStateFrom(settings.session, settings.network),
    correlationId,
  };
}

export function runWithScraperRuntime<T>(runtime: ScraperRuntime, fn: () => Promise<T>): Promise<T> {
  return storage.run(runtime, fn);
}

export function currentScraperRuntime(): ScraperRuntime | null {
  return storage.getStore() ?? null;
}
