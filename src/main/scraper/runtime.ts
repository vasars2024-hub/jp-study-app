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
import { normalizeScraperSite, type ScraperSettings } from '../../shared/scraperSettings';
import type { ScraperHostConnection } from '../../shared/connectionProfiles';
import { cachePolicyFrom, type ScraperCachePolicy } from './httpCache';
import { configureScraperLogging } from './logBus';
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
  /**
   * Hosts a Connection Profile is assigned to, each with its own request
   * policy. Built once per scope so a host's pacing and failure breaker carry
   * across every request the run makes to it.
   */
  hosts?: Map<string, ScraperRuntime>;
  /**
   * The job's cancel signal. Read from the scope's root (not a host's own
   * runtime) by `scraperRequest` when the call site passed none.
   */
  signal?: AbortSignal;
}

const storage = new AsyncLocalStorage<ScraperRuntime>();

function requestRuntime(
  groups: ScraperHostConnection,
  metadata: ScraperSettings['metadata'],
  correlationId: string,
): ScraperRuntime {
  return {
    network: networkPolicyFrom(groups.network),
    cache: cachePolicyFrom(groups.cache, metadata),
    governor: new HostGovernor(safetyPolicyFrom(groups.safety)),
    session: sessionStateFrom(groups.session, groups.network),
    correlationId,
  };
}

export function scraperRuntimeFor(
  settings: ScraperSettings,
  correlationId = '',
  hosts: Record<string, ScraperHostConnection> = {},
): ScraperRuntime {
  // Logging is the one group that is NOT carried in the returned scope. It has
  // to apply to lines written outside any job too — a source probe, an export,
  // the HTTP Inspector — and logBus is imported by the modules below, so
  // reaching back into the runtime from there would close an import cycle. The
  // trade is stated in full at the top of logBus.ts: the policy is process-wide,
  // so concurrent jobs on differing profiles share whichever built last.
  configureScraperLogging(settings.logging);
  const runtime = requestRuntime(settings, settings.metadata, correlationId);
  const assigned = new Map<string, ScraperRuntime>();
  for (const [site, groups] of Object.entries(hosts ?? {})) {
    const host = normalizeScraperSite(site);
    if (!host || !groups?.network || !groups.safety || !groups.cache || !groups.session) continue;
    assigned.set(host, requestRuntime(groups, settings.metadata, correlationId));
  }
  if (assigned.size) runtime.hosts = assigned;
  return runtime;
}

/**
 * The policy one request runs under: its host's own Connection Profile when
 * one is assigned, the run's otherwise ("unassigned hosts use the active
 * profile").
 */
export function runtimeForUrl(runtime: ScraperRuntime, url: string): ScraperRuntime {
  if (!runtime.hosts?.size) return runtime;
  const host = normalizeScraperSite(url);
  return (host && runtime.hosts.get(host)) || runtime;
}

export function runWithScraperRuntime<T>(runtime: ScraperRuntime, fn: () => Promise<T>): Promise<T> {
  return storage.run(runtime, fn);
}

export function currentScraperRuntime(): ScraperRuntime | null {
  return storage.getStore() ?? null;
}
