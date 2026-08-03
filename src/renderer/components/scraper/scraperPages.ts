// Rail contents for the Scraper app, in display order.
//
// labelKey/descKey are keys into strings.ts, not display text — resolve them
// with sx() at render time. Same contract as settings/settingsRegistry.ts, so
// this file survives the eventual swap from sx() to t() untouched.

import type { ScraperNavGroup, ScraperNavPage } from './types';
import type { ScraperPageId } from '../../../shared/scraperShell';

export const SCRAPER_NAV: ScraperNavPage[] = [
  // ---- Scraper ----
  {
    id: 'dashboard',
    labelKey: 'nav.dashboard',
    descKey: 'nav.dashboard.desc',
    icon: 'app',
    group: 'Scraper',
  },
  {
    id: 'new-scrape',
    labelKey: 'nav.newScrape',
    descKey: 'nav.newScrape.desc',
    icon: 'sparkle',
    group: 'Scraper',
  },
  {
    id: 'discover',
    labelKey: 'nav.discover',
    descKey: 'nav.discover.desc',
    icon: 'search',
    group: 'Scraper',
  },
  {
    id: 'history',
    labelKey: 'nav.history',
    descKey: 'nav.history.desc',
    icon: 'calendar',
    group: 'Scraper',
  },
  {
    id: 'sources',
    labelKey: 'nav.sources',
    descKey: 'nav.sources.desc',
    icon: 'globe',
    group: 'Scraper',
  },
  {
    id: 'torrents',
    labelKey: 'nav.torrents',
    descKey: 'nav.torrents.desc',
    icon: 'network',
    group: 'Scraper',
  },
  {
    id: 'profiles',
    labelKey: 'nav.profiles',
    descKey: 'nav.profiles.desc',
    icon: 'shield',
    group: 'Scraper',
  },
  {
    id: 'scheduled',
    labelKey: 'nav.scheduled',
    descKey: 'nav.scheduled.desc',
    icon: 'clipboard',
    group: 'Scraper',
  },
  {
    id: 'site-rules',
    labelKey: 'nav.siteRules',
    descKey: 'nav.siteRules.desc',
    icon: 'file-text',
    group: 'Scraper',
  },
  {
    id: 'plugins',
    labelKey: 'nav.plugins',
    descKey: 'nav.plugins.desc',
    icon: 'widgets',
    group: 'Scraper',
  },

  // ---- Data ----
  {
    id: 'results',
    labelKey: 'nav.results',
    descKey: 'nav.results.desc',
    icon: 'library',
    group: 'Data',
  },
  {
    id: 'downloads',
    labelKey: 'nav.downloads',
    descKey: 'nav.downloads.desc',
    icon: 'download',
    group: 'Data',
  },
  {
    id: 'exports',
    labelKey: 'nav.exports',
    descKey: 'nav.exports.desc',
    icon: 'external',
    group: 'Data',
  },

  // ---- Tools ----
  {
    id: 'selector-tester',
    labelKey: 'nav.selectorTester',
    descKey: 'nav.selectorTester.desc',
    icon: 'scan',
    group: 'Tools',
  },
  {
    id: 'regex-tester',
    labelKey: 'nav.regexTester',
    descKey: 'nav.regexTester.desc',
    icon: 'command',
    group: 'Tools',
  },
  {
    id: 'http-inspector',
    labelKey: 'nav.httpInspector',
    descKey: 'nav.httpInspector.desc',
    icon: 'network',
    group: 'Tools',
  },
  {
    id: 'script-console',
    labelKey: 'nav.scriptConsole',
    descKey: 'nav.scriptConsole.desc',
    icon: 'keyboard',
    group: 'Tools',
  },
];

const GROUP_LABEL_KEY: Record<ScraperNavGroup, 'nav.group.scraper' | 'nav.group.data' | 'nav.group.tools'> = {
  Scraper: 'nav.group.scraper',
  Data: 'nav.group.data',
  Tools: 'nav.group.tools',
};

export function scraperGroupLabelKey(group: ScraperNavGroup) {
  return GROUP_LABEL_KEY[group];
}

export function scraperGroupOrder(): ScraperNavGroup[] {
  const order: ScraperNavGroup[] = [];
  for (const page of SCRAPER_NAV) {
    if (!order.includes(page.group)) order.push(page.group);
  }
  return order;
}

export function scraperPageMeta(id: ScraperPageId): ScraperNavPage | undefined {
  return SCRAPER_NAV.find((p) => p.id === id);
}
