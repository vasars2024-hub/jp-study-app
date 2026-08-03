// The Cache settings group, turned into a cache.
//
// `cache.*` was stored and validated and read by nothing: every run re-fetched
// every catalogue page, every episode page and every feed, and "Offline — never
// refetch" was a dropdown that changed a JSON file. This is the store those
// settings drive, consulted by `scraperRequest` before it opens a socket.
//
// Three deliberate limits, so that what the panel says is what happens:
//
//   * It is an in-memory store, dropped on restart. `maxSizeMb` is therefore a
//     memory ceiling, not a disk quota, and the Cache Size Limit control means
//     exactly that. A disk cache would need eviction, corruption handling and a
//     size audit of its own; claiming one here would be the sort of thing
//     featureStatus.ts exists to prevent.
//   * Only 200s that were not truncated at the byte cap are stored. A partial
//     body served back later would look like a complete one.
//   * Only GET, plus POST to an endpoint classified `metadata`. AniList's
//     search is a GraphQL POST and is the single most-repeated call a run
//     makes; caching POSTs in general is not something a scraper may assume.

import { createHash } from 'node:crypto';
import type { ScraperCacheSettings } from '../../shared/scraperSettings';
import type { ScraperMetadataSettings } from '../../shared/scraperOutputSettings';

/** The three switches the panel offers, as a closed set. */
export type ScraperCacheKind = 'html' | 'metadata' | 'thumbnails';

export interface ScraperCachePolicy {
  mode: 'standard' | 'offline';
  enabled: Record<ScraperCacheKind, boolean>;
  /** Per kind, because `metadata.cacheHours` overrides the shared lifetime. */
  lifetimeMs: Record<ScraperCacheKind, number>;
  maxSizeBytes: number;
}

export interface CachedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  finalUrl: string;
  storedAt: number;
  kind: ScraperCacheKind;
}

interface CacheEntry extends CachedResponse {
  key: string;
  /** UTF-16 code units are the honest cost of holding the decoded body. */
  cost: number;
}

const IMAGE_EXTENSIONS = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i;

/**
 * Which switch governs a URL.
 *
 * Classified from the URL alone rather than from the response, so the lookup
 * before a request and the store after it can never disagree about which toggle
 * applied — a mismatch there reads as "Cache Metadata is off but metadata is
 * being served from cache", which is worse than not caching at all.
 */
export function cacheKindFor(url: string): ScraperCacheKind {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'html';
  }
  if (IMAGE_EXTENSIONS.test(parsed.pathname + parsed.search)) return 'thumbnails';
  const host = parsed.hostname.toLowerCase();
  if (
    host.startsWith('api.')
    || host.startsWith('graphql.')
    || /(^|\.)jikan\.moe$/.test(host)
    || /(^|\.)anilist\.co$/.test(host)
    || /\/(?:api|v\d)\//.test(parsed.pathname)
    || parsed.pathname.endsWith('.json')
  ) {
    return 'metadata';
  }
  return 'html';
}

export function cachePolicyFrom(
  cache: ScraperCacheSettings,
  metadata: ScraperMetadataSettings,
): ScraperCachePolicy {
  const shared = Math.max(0, cache.lifetimeMinutes) * 60_000;
  return {
    mode: cache.mode,
    enabled: {
      html: cache.htmlEnabled,
      metadata: cache.metadataEnabled,
      thumbnails: cache.thumbnailsEnabled,
    },
    lifetimeMs: {
      html: shared,
      // The Metadata group has its own, coarser lifetime control. It wins where
      // it is set, because a user who typed "168 h" into Metadata Cache did not
      // mean "unless Cache Lifetime disagrees"; 0 there defers to the shared one.
      metadata: metadata.cacheHours > 0 ? metadata.cacheHours * 3_600_000 : shared,
      thumbnails: shared,
    },
    maxSizeBytes: Math.max(0, cache.maxSizeMb) * 1_024 * 1_024,
  };
}

export function cacheKeyFor(method: string, url: string, body: string | undefined): string {
  const verb = method.toUpperCase();
  if (!body) return `${verb} ${url}`;
  return `${verb} ${url} #${createHash('sha1').update(body).digest('hex').slice(0, 16)}`;
}

export function isCacheableMethod(method: string, kind: ScraperCacheKind): boolean {
  const verb = method.toUpperCase();
  if (verb === 'GET') return true;
  return verb === 'POST' && kind === 'metadata';
}

/**
 * A syndication feed, which is a live list rather than a document.
 *
 * The three switches in the panel are Pages, Metadata and Thumbnails; a torrent
 * index's RSS is none of them, and letting it fall into "Pages" would mean a
 * user re-running a scrape to pick up new releases got yesterday's list for a
 * day. Seeder counts and new releases are exactly the thing that has to be
 * fresh, so a feed is never stored.
 */
export function isLiveFeedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (/\.(?:rss|xml|atom)$/i.test(parsed.pathname)) return true;
  if (/(?:^|\/)(?:rss|feed|atom)(?:\/|$)/i.test(parsed.pathname)) return true;
  return /(?:^|&)page=rss(?:&|$)/i.test(parsed.search.replace(/^\?/, ''));
}

/** The whole admission test: right method, right kind, and not a live feed. */
export function isCacheableRequest(method: string, url: string, kind: ScraperCacheKind): boolean {
  return isCacheableMethod(method, kind) && !isLiveFeedUrl(url);
}

// Insertion order is the eviction order, and a hit re-inserts, so the Map is
// the LRU list — no second structure to keep in step with it.
const store = new Map<string, CacheEntry>();
let heldBytes = 0;

export interface ScraperCacheStats {
  entries: number;
  bytes: number;
  hits: number;
  misses: number;
  stores: number;
  evictions: number;
}

const counters = { hits: 0, misses: 0, stores: 0, evictions: 0 };

export function scraperCacheStats(): ScraperCacheStats {
  return { entries: store.size, bytes: heldBytes, ...counters };
}

/** Test seam — empties the store and the counters. */
export function resetScraperHttpCache(): void {
  store.clear();
  heldBytes = 0;
  counters.hits = 0;
  counters.misses = 0;
  counters.stores = 0;
  counters.evictions = 0;
}

export function isCacheEntryFresh(
  entry: CachedResponse,
  policy: ScraperCachePolicy,
  now: number,
): boolean {
  // Offline mode is "never refetch", so age is not a reason to go to the
  // network — a stale answer is the only answer offline can give.
  if (policy.mode === 'offline') return true;
  const lifetime = policy.lifetimeMs[entry.kind];
  if (lifetime <= 0) return false;
  return now - entry.storedAt < lifetime;
}

/**
 * A usable cached response, or null.
 *
 * A miss in offline mode is not handled here: the caller has to turn it into a
 * clear failure rather than quietly reaching the network, and only the caller
 * knows the URL it was about to request.
 */
export function readScraperCache(
  key: string,
  kind: ScraperCacheKind,
  policy: ScraperCachePolicy,
  now = Date.now(),
): CachedResponse | null {
  if (!policy.enabled[kind]) return null;
  const entry = store.get(key);
  if (!entry) {
    counters.misses += 1;
    return null;
  }
  if (!isCacheEntryFresh(entry, policy, now)) {
    store.delete(key);
    heldBytes -= entry.cost;
    counters.misses += 1;
    return null;
  }
  // Re-insert so the freshest use sits at the end of the eviction order.
  store.delete(key);
  store.set(key, entry);
  counters.hits += 1;
  return entry;
}

export function writeScraperCache(
  key: string,
  response: Omit<CachedResponse, 'storedAt' | 'kind'>,
  kind: ScraperCacheKind,
  policy: ScraperCachePolicy,
  now = Date.now(),
): void {
  if (!policy.enabled[kind]) return;
  if (policy.lifetimeMs[kind] <= 0 && policy.mode !== 'offline') return;
  if (policy.maxSizeBytes <= 0) return;
  const cost = response.body.length;
  // A single response larger than the whole budget would evict everything and
  // then not fit; refusing it keeps the rest of the cache intact.
  if (cost > policy.maxSizeBytes) return;

  const existing = store.get(key);
  if (existing) {
    store.delete(key);
    heldBytes -= existing.cost;
  }
  store.set(key, { ...response, key, kind, storedAt: now, cost });
  heldBytes += cost;
  counters.stores += 1;

  for (const [oldestKey, oldest] of store) {
    if (heldBytes <= policy.maxSizeBytes) break;
    if (oldestKey === key) continue;
    store.delete(oldestKey);
    heldBytes -= oldest.cost;
    counters.evictions += 1;
  }
}
