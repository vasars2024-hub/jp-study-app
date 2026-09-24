/**
 * Keeps main's scheduler configuration current without the Scraper being open.
 *
 * Scheduled scrapes run in main, but their configuration lives in this
 * renderer's settings document. The only push used to be the Scheduled Tasks
 * page's mount, so after a restart main's runner had nothing to run until that
 * page was visited. This pushes at app start and on every settings save (a
 * profile switch is a save), and main persists what it receives so a start with
 * no window still has the last known schedule.
 *
 * Same shape and failure rule as `mediaIngestBridge`: best effort, never throws
 * into the save that triggered it.
 */

import { resolveScraperSettings, type ScraperSettingsDocument } from '../shared/scraperSettings';
import { scraperRunScope } from './scraperRunContext';

export function syncSchedulerConfigToMain(document: ScraperSettingsDocument): void {
  if (typeof window === 'undefined') return;
  const push = window.api?.scraperSyncScheduler;
  if (typeof push !== 'function') return;
  let payload;
  try {
    const { settings, context } = scraperRunScope(resolveScraperSettings(document));
    payload = { scheduler: settings.scheduler, settings, context };
  } catch {
    return;
  }
  void push(payload).catch(() => undefined);
}
