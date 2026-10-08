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

import {
  resolveScraperSettings,
  type ScraperSettings,
  type ScraperSettingsDocument,
} from '../shared/scraperSettings';
import { scraperRunScope } from './scraperRunContext';

/**
 * The settings each schedule entry's own profile resolves to (P6). The entry
 * editor offers a profile picker; without this, main only ever received the
 * active profile and every entry ran under it whatever the picker said.
 */
export function entryProfileSettings(
  document: ScraperSettingsDocument,
  entries: readonly { profileId: string }[],
): Record<string, ScraperSettings> {
  const out: Record<string, ScraperSettings> = {};
  for (const { profileId } of entries) {
    if (!profileId || out[profileId]) continue;
    if (!document.profiles.some((profile) => profile.id === profileId)) continue;
    out[profileId] = scraperRunScope(
      resolveScraperSettings({ ...document, activeProfileId: profileId }),
    ).settings;
  }
  return out;
}

export function syncSchedulerConfigToMain(document: ScraperSettingsDocument): void {
  if (typeof window === 'undefined') return;
  const push = window.api?.scraperSyncScheduler;
  if (typeof push !== 'function') return;
  let payload;
  try {
    const { settings, context } = scraperRunScope(resolveScraperSettings(document));
    payload = {
      scheduler: settings.scheduler,
      settings,
      context,
      profileSettings: entryProfileSettings(document, settings.scheduler.entries),
    };
  } catch {
    return;
  }
  void push(payload).catch(() => undefined);
}
