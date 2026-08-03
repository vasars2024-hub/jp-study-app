import type { ScraperScheduleEntry } from '../../../../shared/scraperOutputSettings';
import { formatInMinutes } from './charts';

/**
 * Finds the nearest valid enabled schedule and formats its distance from now.
 * Invalid or paused entries never make the shell claim that a run is pending.
 */
export function nextScheduledStatus(
  entries: ScraperScheduleEntry[],
  nowMs = Date.now(),
): string | null {
  const nextAt = entries.reduce<number | null>((nearest, entry) => {
    if (!entry.enabled || !entry.nextRunAt) return nearest;
    const timestamp = Date.parse(entry.nextRunAt);
    if (!Number.isFinite(timestamp)) return nearest;
    return nearest === null || timestamp < nearest ? timestamp : nearest;
  }, null);
  if (nextAt === null) return null;
  return formatInMinutes(Math.max(0, (nextAt - nowMs) / 60_000));
}
