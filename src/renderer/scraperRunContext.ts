/**
 * Everything a scrape should honour beyond the scraper profile itself.
 *
 * Three renderer-side documents change what a run does, and main keeps none of
 * them: the scraper profile (settings), Connection Profiles (per-host network,
 * pacing, cache and session — MASTER_PLAN §2) and the Video Server Profiles
 * preference order (§5). Before this existed only the first reached main, so the
 * Connection Profiles panel and the server order edited documents nothing read.
 *
 * Built fresh on every call so a change in either panel applies to the very
 * next request, the same rule `ipcScraperPort` follows for the source list.
 */

import { resolveConnectionScope } from '../shared/connectionProfiles';
import type { ScraperRunContext } from '../shared/scraperIpc';
import type { ScraperSettings } from '../shared/scraperSettings';
import { getVideoServerPreferenceOrder } from '../shared/videoServerProfiles';
import { loadConnectionProfilesDocument } from './connectionProfilesStore';
import { loadVideoServerProfilesDocument } from './videoServerProfilesStore';

/**
 * The preferred server order as the keys a streaming provider can match on:
 * each profile's id, name and provider label, lowercase, in preference order.
 */
export function streamProviderOrder(): string[] {
  try {
    const document = loadVideoServerProfilesDocument();
    const byId = new Map(document.profiles.map((profile) => [profile.id, profile]));
    const keys: string[] = [];
    for (const id of getVideoServerPreferenceOrder(document)) {
      const profile = byId.get(id);
      if (!profile || profile.status === 'inactive' || profile.status === 'deprecated') continue;
      for (const key of [profile.id, profile.name, profile.provider]) {
        const norm = key.trim().toLowerCase();
        if (norm && !keys.includes(norm)) keys.push(norm);
      }
    }
    return keys;
  } catch {
    return [];
  }
}

export interface ScraperRunScope {
  settings: ScraperSettings;
  context: ScraperRunContext;
}

/** The settings a run uses and the context that rides along with them. */
export function scraperRunScope(base: ScraperSettings): ScraperRunScope {
  let settings = base;
  let hosts: ScraperRunContext['hosts'] = {};
  try {
    const scope = resolveConnectionScope(loadConnectionProfilesDocument(), base);
    settings = scope.settings;
    hosts = scope.hosts;
  } catch {
    // An unreadable connection document must not stop a scrape; the scraper
    // profile alone is what ran before §2 had a consumer.
  }
  return { settings, context: { hosts, streamProviderOrder: streamProviderOrder() } };
}
