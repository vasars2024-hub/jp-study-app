// The Source Manager's order, turned into the order requests are made in.
//
// The Source Manager says "tried top to bottom" and, per source, "if this
// source fails, try these next". Before this module neither sentence was true:
// torrent indexes were all queried at once and merged by seeders alone,
// `fallbackIds` had no reader, and the metadata order came from a different
// setting entirely. Everything that walks sources now asks here, so the list on
// screen and the order on the wire cannot drift apart again.
//
// Pure: no I/O, so main and the renderer read the same answer.

import type { ScraperSettings } from './scraperSettings';
import type {
  ScraperSourceEntry,
  ScraperSourceKind,
  ScraperSourceSettings,
} from './scraperSourceSettings';

/**
 * Entries in priority order: `order` first (the Source Manager writes it on
 * every reorder), then anything it does not name, by `priority`.
 */
export function sourcesByPriority(sources: ScraperSourceSettings): ScraperSourceEntry[] {
  const rank = new Map(sources.order.map((id, index) => [id, index]));
  return sources.entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const ra = rank.get(a.entry.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.entry.id) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      if (a.entry.priority !== b.entry.priority) return a.entry.priority - b.entry.priority;
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}

/** Enabled sources of one kind, best first. */
export function enabledSourcesOfKind(
  sources: ScraperSourceSettings,
  kind: ScraperSourceKind,
): ScraperSourceEntry[] {
  return sourcesByPriority(sources).filter((entry) => entry.enabled && entry.kind === kind);
}

/**
 * The fallbacks one source names, resolved to entries, walked depth-first up to
 * `maxDepth` hops. A disabled source is never contacted, not even as a
 * fallback; `skip` holds ids already tried, and is extended as the walk goes.
 */
export function fallbackChain(
  entry: ScraperSourceEntry,
  pool: readonly ScraperSourceEntry[],
  maxDepth: number,
  skip: Set<string> = new Set([entry.id]),
): ScraperSourceEntry[] {
  const byId = new Map(pool.map((candidate) => [candidate.id, candidate]));
  const out: ScraperSourceEntry[] = [];
  const walk = (from: ScraperSourceEntry, depth: number) => {
    if (depth >= maxDepth) return;
    for (const id of from.fallbackIds) {
      const next = byId.get(id);
      if (!next || skip.has(id) || !next.enabled || next.kind !== entry.kind) continue;
      skip.add(id);
      out.push(next);
      walk(next, depth + 1);
    }
  };
  walk(entry, 0);
  return out;
}

/**
 * The full sequential walk for a kind: each enabled source in priority order,
 * each followed by its own fallbacks. What a consumer that tries one source at
 * a time (the catalogue) should iterate.
 */
export function sourceWalk(sources: ScraperSourceSettings, kind: ScraperSourceKind): ScraperSourceEntry[] {
  const seen = new Set<string>();
  const out: ScraperSourceEntry[] = [];
  const depth = Math.max(0, sources.maxFallbackDepth);
  for (const entry of enabledSourcesOfKind(sources, kind)) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    out.push(...fallbackChain(entry, sources.entries, depth, seen));
  }
  return out;
}

/** Catalogue providers the engine can actually search, by source id. */
const CATALOGUE_PROVIDERS: Record<string, string> = { jikan: 'jikan', mal: 'jikan', anilist: 'anilist' };

/**
 * The metadata provider order a scrape uses.
 *
 * The Source Manager wins when it lists a searchable catalogue: that is the
 * list the user reorders and the one that says "tried top to bottom". Only a
 * profile whose sources name none falls back to `metadata.providerOrder`.
 */
export function metadataProviderOrder(settings: ScraperSettings): string[] {
  const fromSources: string[] = [];
  for (const entry of sourceWalk(settings.sources, 'metadata')) {
    const provider = CATALOGUE_PROVIDERS[entry.id.toLowerCase()];
    if (provider && !fromSources.includes(provider)) fromSources.push(provider);
  }
  return fromSources.length ? fromSources : [...settings.metadata.providerOrder];
}

/**
 * Sorts streaming providers by the Video Server Profiles preference order.
 *
 * `preferred` holds lowercase profile ids, names and provider labels; a
 * provider matches on its id or name. Unnamed providers keep their incoming
 * order after the named ones, so an empty preference list changes nothing.
 */
export function orderStreamProviders<T extends { id: string; name?: string }>(
  providers: readonly T[],
  preferred: readonly string[] | undefined,
): T[] {
  if (!preferred?.length) return [...providers];
  const rank = new Map<string, number>();
  preferred.forEach((key, index) => {
    const norm = key.trim().toLowerCase();
    if (norm && !rank.has(norm)) rank.set(norm, index);
  });
  const rankOf = (provider: T): number => {
    const byId = rank.get(provider.id.trim().toLowerCase());
    const byName = provider.name ? rank.get(provider.name.trim().toLowerCase()) : undefined;
    const found = [byId, byName].filter((value): value is number => value !== undefined);
    return found.length ? Math.min(...found) : Number.MAX_SAFE_INTEGER;
  };
  return providers
    .map((provider, index) => ({ provider, index, rank: rankOf(provider) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ provider }) => provider);
}
