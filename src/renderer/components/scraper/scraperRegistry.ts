// Searchable index of everything the Scraper app can do.
//
// Scoring is copied from settings/settingsRegistry.ts on purpose: the two
// searches sit one keystroke apart in the same product, so they should rank
// the same way. Keywords stay literal English (see ScraperRegistryEntry) so a
// feature remains findable by its English name after the i18n sweep.

import { SCRAPER_NAV } from './scraperPages';
import type { ScraperRegistryEntry } from './types';
import type { ScraperPageId } from '../../../shared/scraperShell';
import { sx, type ScraperTextKey } from './strings';

const MAX_RESULTS = 24;

export const SCRAPER_REGISTRY: ScraperRegistryEntry[] = [
  {
    id: 'dashboard-overview',
    titleKey: 'nav.dashboard',
    descKey: 'nav.dashboard.desc',
    keywords: ['overview', 'home', 'summary', 'stats', 'progress'],
    pageId: 'dashboard',
    group: 'Scraper',
  },
  {
    id: 'build-status',
    titleKey: 'build.title',
    descKey: 'build.desc',
    keywords: ['build', 'status', 'shell', 'implemented', 'done', 'progress', 'red', 'yellow', 'green'],
    pageId: 'dashboard',
    group: 'Scraper',
  },
  {
    id: 'start-scrape',
    titleKey: 'nav.newScrape',
    descKey: 'nav.newScrape.desc',
    keywords: ['scrape', 'start', 'url', 'target', 'run', 'episodes', 'fetch'],
    pageId: 'new-scrape',
    group: 'Scraper',
  },
  {
    id: 'discover-catalogue',
    titleKey: 'nav.discover',
    descKey: 'nav.discover.desc',
    keywords: ['discover', 'search', 'myanimelist', 'mal', 'anilist', 'catalogue', 'shortlist', 'jlpt'],
    pageId: 'discover',
    group: 'Scraper',
  },
  {
    id: 'job-history',
    titleKey: 'nav.history',
    descKey: 'nav.history.desc',
    keywords: ['history', 'past', 'jobs', 'previous', 'repeat', 'log'],
    pageId: 'history',
    group: 'Scraper',
  },
  {
    id: 'source-manager',
    titleKey: 'nav.sources',
    descKey: 'nav.sources.desc',
    keywords: ['sources', 'sites', 'order', 'priority', 'fallback', 'providers', 'mirrors', 'streaming'],
    pageId: 'sources',
    group: 'Scraper',
  },
  {
    id: 'torrent-manager',
    titleKey: 'nav.torrents',
    descKey: 'nav.torrents.desc',
    keywords: ['torrent', 'qbittorrent', 'qbit', 'magnet', 'seeders', 'tracker', 'indexer'],
    pageId: 'torrents',
    group: 'Scraper',
  },
  {
    id: 'scraper-profiles',
    titleKey: 'nav.profiles',
    descKey: 'nav.profiles.desc',
    keywords: ['profile', 'preset', 'fast', 'balanced', 'thorough', 'config', 'settings'],
    pageId: 'profiles',
    group: 'Scraper',
  },
  {
    id: 'scheduled-tasks',
    titleKey: 'nav.scheduled',
    descKey: 'nav.scheduled.desc',
    keywords: ['schedule', 'cron', 'recurring', 'automatic', 'watch', 'updates', 'timer'],
    pageId: 'scheduled',
    group: 'Scraper',
  },
  {
    id: 'site-rules',
    titleKey: 'nav.siteRules',
    descKey: 'nav.siteRules.desc',
    keywords: ['rules', 'selector', 'css', 'xpath', 'override', 'site', 'extraction'],
    pageId: 'site-rules',
    group: 'Scraper',
  },
  {
    id: 'plugins',
    titleKey: 'nav.plugins',
    descKey: 'nav.plugins.desc',
    keywords: ['plugin', 'adapter', 'extension', 'provider', 'permissions'],
    pageId: 'plugins',
    group: 'Scraper',
  },
  {
    id: 'results',
    titleKey: 'nav.results',
    descKey: 'nav.results.desc',
    keywords: ['results', 'episodes', 'series', 'table', 'output'],
    pageId: 'results',
    group: 'Data',
  },
  {
    id: 'downloads',
    titleKey: 'nav.downloads',
    descKey: 'nav.downloads.desc',
    keywords: ['download', 'queue', 'progress', 'files', 'transfer'],
    pageId: 'downloads',
    group: 'Data',
  },
  {
    id: 'exports',
    titleKey: 'nav.exports',
    descKey: 'nav.exports.desc',
    keywords: ['export', 'json', 'csv', 'sqlite', 'anki', 'save'],
    pageId: 'exports',
    group: 'Data',
  },
  {
    id: 'selector-tester',
    titleKey: 'nav.selectorTester',
    descKey: 'nav.selectorTester.desc',
    keywords: ['selector', 'css', 'xpath', 'test', 'match', 'dom'],
    pageId: 'selector-tester',
    group: 'Tools',
  },
  {
    id: 'regex-tester',
    titleKey: 'nav.regexTester',
    descKey: 'nav.regexTester.desc',
    keywords: ['regex', 'pattern', 'match', 'capture', 'expression'],
    pageId: 'regex-tester',
    group: 'Tools',
  },
  {
    id: 'http-inspector',
    titleKey: 'nav.httpInspector',
    descKey: 'nav.httpInspector.desc',
    keywords: ['http', 'network', 'request', 'response', 'headers', 'replay', 'inspect'],
    pageId: 'http-inspector',
    group: 'Tools',
  },
  {
    id: 'script-console',
    titleKey: 'nav.scriptConsole',
    descKey: 'nav.scriptConsole.desc',
    keywords: ['script', 'console', 'javascript', 'eval', 'developer'],
    pageId: 'script-console',
    group: 'Tools',
  },
];

/**
 * `resolve` is injected rather than imported so tests can search under a stub
 * translator — and so the eventual swap to t() is a call-site change only.
 */
export function searchScraper(
  query: string,
  resolve: (key: ScraperTextKey) => string = sx,
  opts?: { advanced?: boolean },
): ScraperRegistryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const advanced = opts?.advanced ?? false;
  const words = q.split(/\s+/).filter(Boolean);
  const scored: { entry: ScraperRegistryEntry; score: number; title: string }[] = [];

  for (const entry of SCRAPER_REGISTRY) {
    if (entry.advanced && !advanced) continue;
    const page = SCRAPER_NAV.find((p) => p.id === entry.pageId);
    if (page?.advanced && !advanced) continue;

    const title = resolve(entry.titleKey);
    const desc = entry.descKey ? resolve(entry.descKey) : '';
    const hay = [title, desc, entry.group, entry.pageId, ...entry.keywords]
      .join(' ')
      .toLowerCase();
    const titleLower = title.toLowerCase();

    let score = 0;
    if (titleLower.includes(q)) score += 40;
    if (hay.includes(q)) score += 20;
    for (const w of words) {
      if (titleLower.includes(w)) score += 12;
      else if (hay.includes(w)) score += 6;
    }
    if (score > 0) scored.push({ entry, score, title });
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const seen = new Set<string>();
  const out: ScraperRegistryEntry[] = [];
  for (const { entry } of scored) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export function scraperEntriesForPage(id: ScraperPageId): ScraperRegistryEntry[] {
  return SCRAPER_REGISTRY.filter((e) => e.pageId === id);
}
