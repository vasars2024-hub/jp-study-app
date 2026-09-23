/**
 * Keeps main's copy of the active qBittorrent profile current.
 *
 * Scraper settings live in this renderer's localStorage, and every other
 * qBittorrent call passes the profile in with the request. The media ingest's
 * completion poller runs in main on its own timer, so it has no request to
 * read the profile from: this pushes it at start-up and whenever the settings
 * are saved, and main persists it so polling works before any window opens.
 *
 * Only the connection block crosses — no secret is in it; the credential stays
 * in the vault behind its ref.
 */

import { resolveScraperSettings, type ScraperSettingsDocument } from '../shared/scraperSettings';

export function syncQbitConfigToMain(document: ScraperSettingsDocument): void {
  if (typeof window === 'undefined') return;
  const push = window.api?.mediaIngestSyncQbit;
  if (typeof push !== 'function') return;
  let config;
  try {
    config = resolveScraperSettings(document).qbittorrent;
  } catch {
    return;
  }
  // Sent on every save, unchanged or not: main ignores an identical profile
  // unless its poller had stopped (refused login, no credential), in which case
  // a save is exactly the moment to try again.
  void push(config).catch(() => undefined);
}
