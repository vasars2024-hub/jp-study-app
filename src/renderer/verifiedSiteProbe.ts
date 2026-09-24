/**
 * A Verified Sites compatibility test: one real request to the site's own base
 * URL through the Scraper's source probe, the same request and the same
 * health vocabulary the Source Manager's "Test" uses. Its answer is what
 * `recordVerifiedSiteTest` turns into reliability, success rate and
 * last-verified — values the editor used to take by hand.
 */

import type { ScraperSourceEntry } from '../shared/scraperSourceSettings';
import type { VerifiedSiteProbe, VerifiedSiteRecord } from '../shared/verifiedSites';

const TEST_TIMEOUT_MS = 15_000;

function sourceKind(site: VerifiedSiteRecord): ScraperSourceEntry['kind'] {
  if (site.category === 'metadata') return 'metadata';
  if (site.category === 'subtitles') return 'subtitles';
  return 'streaming';
}

/** The probe entry for a site; its id keeps the rolling history per site. */
export function verifiedSiteProbeEntry(site: VerifiedSiteRecord): { entry: ScraperSourceEntry; path: string } {
  const url = new URL(site.baseUrl);
  return {
    path: `${url.pathname || '/'}${url.search}`,
    entry: {
      id: `verified-site:${site.id}`,
      label: site.name,
      host: url.host,
      kind: sourceKind(site),
      enabled: true,
      priority: 1,
      fallbackIds: [],
      verifiedSiteId: site.id,
      requiresAuth: false,
      supportsSubtitles: false,
      health: 'unknown',
      lastCheckedAt: null,
      notes: '',
    },
  };
}

export async function probeVerifiedSite(site: VerifiedSiteRecord): Promise<VerifiedSiteProbe> {
  const probe = window.api?.scraperProbeSource;
  if (typeof probe !== 'function') throw new Error('The scraper backend is not available.');
  const { entry, path } = verifiedSiteProbeEntry(site);
  const status = await probe({ entry, timeoutMs: TEST_TIMEOUT_MS, path });
  return {
    health: status.health,
    latencyMs: status.latencyMs,
    history: status.history,
    note: status.note ?? '',
  };
}
