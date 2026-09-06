// Settings → Scraper.
//
// ---------------------------------------------------------------------------
// 2026-08-05: the scraper-engine half of this page was REMOVED, not rewritten.
//
// It used to render eleven more cards — profiles, network, browser, session,
// cache, safety, authentication, revision history, extraction, episode
// processing and portable import/export — all editing the same
// `ScraperSettingsDocument` that the Scraper app's own Advanced Settings drawer
// and Profiles page edit. Two windows, one document, two different layouts, and
// no indication in either that the other existed. Every value written here was
// immediately visible there and vice versa, which is not a feature: it is two
// interfaces disagreeing about which one is the place to change a setting.
//
// Where each one went:
//   network, cache, extraction, episodes   → the drawer's own groups
//   session, safety                        → the drawer's Anti-Bot group
//   profiles, history, import/export,
//     per-site overrides                   → the Scraper's Profiles page
//   browser                                → nowhere, deliberately. The nine
//     headless-browser controls were deleted from the drawer on 2026-08-02
//     because this project has no browser automation and none planned; this
//     page was the last screen still offering them, so the last screen that
//     could mislead about them is now gone too.
//
// What stays is what is genuinely app-wide rather than scraper-engine: the
// provider, tracking, player and subtitle panels below, each backed by its own
// store, none of which reads `scraperSettings`.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { useT } from '../../../i18n';
import ScraperSettingsEntryCard from './ScraperSettingsEntryCard';
import ConnectionProfilesPanel from './ConnectionProfilesPanel';
import MediaProviderPanel from './MediaProviderPanel';
import MalSyncPanel from './MalSyncPanel';
import MediaTrackingManager from './MediaTrackingManager';
import UnifiedSearchPanel from './UnifiedSearchPanel';
import VerifiedSitesManager from './VerifiedSitesManager';
import VideoServerProfilesManager from './VideoServerProfilesManager';
import SubtitleProviderPanel from './SubtitleProviderPanel';
import ExternalPlayerPanel from './ExternalPlayerPanel';

/**
 * The keyword lists the settings search box matches against, one per card.
 *
 * These are i18n keys rather than literal English because they are the ONLY
 * thing the search field compares a query to — leaving them in English would
 * mean the search box silently stops working the moment the UI language is not
 * English, which is worse than an untranslated label: a label you can still read
 * around, a dead search you cannot.
 *
 * `engine` deliberately keeps the keywords of the eleven removed cards (proxy,
 * retry, headers, robots, …). Someone searching "proxy" here is not wrong about
 * what they want, only about where it lives, and a dead search result teaches
 * them nothing — the hand-off card does.
 */
const SEARCH_TERM_KEYS = {
  engine: 'scraperPage.find.engine',
  connectionProfiles: 'scraperPage.find.connectionProfiles',
  unifiedSearch: 'scraperPage.find.unifiedSearch',
  mediaProviders: 'scraperPage.find.mediaProviders',
  tracking: 'scraperPage.find.tracking',
  malSync: 'scraperPage.find.malSync',
  verifiedSites: 'scraperPage.find.verifiedSites',
  videoServers: 'scraperPage.find.videoServers',
  subtitles: 'scraperPage.find.subtitles',
  externalPlayer: 'scraperPage.find.externalPlayer',
} as const;

export default function ScraperPage() {
  const { t } = useT();
  const [query, setQuery] = useState('');

  const matches = (termsKey: string) => {
    const needle = query.trim().toLowerCase();
    return !needle || t(termsKey).toLowerCase().includes(needle);
  };

  return (
    <>
      <div className="field-row">
        <label htmlFor="scraper-settings-search">{t('scraperPage.search.label')}</label>
        <input
          id="scraper-settings-search"
          type="search"
          value={query}
          placeholder={t('scraperPage.search.placeholder')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {matches(SEARCH_TERM_KEYS.engine) && (
        <ScraperSettingsEntryCard />
      )}

      {matches(SEARCH_TERM_KEYS.connectionProfiles) && <ConnectionProfilesPanel />}
      {matches(SEARCH_TERM_KEYS.unifiedSearch) && <UnifiedSearchPanel />}
      {matches(SEARCH_TERM_KEYS.mediaProviders) && <MediaProviderPanel />}
      {matches(SEARCH_TERM_KEYS.tracking) && <MediaTrackingManager />}
      {matches(SEARCH_TERM_KEYS.malSync) && <MalSyncPanel />}
      {matches(SEARCH_TERM_KEYS.verifiedSites) && <VerifiedSitesManager />}
      {matches(SEARCH_TERM_KEYS.videoServers) && <VideoServerProfilesManager />}
      {matches(SEARCH_TERM_KEYS.subtitles) && <SubtitleProviderPanel />}
      {matches(SEARCH_TERM_KEYS.externalPlayer) && <ExternalPlayerPanel />}
    </>
  );
}
