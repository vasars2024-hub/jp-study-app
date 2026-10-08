/**
 * The calendar's line about a day's video study: watch time, lines mined from
 * the player and lines studied there. Pure, so the month grid's indicator, its
 * screen-reader label and the day view's note all say the same sentence.
 */
import type { DayMediaActivity } from '../../stats';
import { LANG_TAGS, type TVars, type UiLang } from '../../../shared/i18n/core';

type Translate = (key: string, vars?: TVars) => string;

/** The day's figures as phrases, in a fixed order; empty when nothing was recorded. */
export function mediaActivityParts(
  activity: DayMediaActivity | undefined,
  t: Translate,
  formatDuration: (seconds: number) => string,
): string[] {
  if (!activity) return [];
  const parts: string[] = [];
  if (activity.watchSeconds >= 1) {
    parts.push(t('studyLoop.stats.calendar.watched', { duration: formatDuration(activity.watchSeconds) }));
  }
  if (activity.mediaMined > 0) parts.push(t('studyLoop.stats.calendar.mined', { count: activity.mediaMined }));
  if (activity.linesStudied > 0) parts.push(t('studyLoop.stats.calendar.lines', { count: activity.linesStudied }));
  return parts;
}

/** Joins phrases the way the interface language lists things. */
function joinParts(parts: string[], lang: UiLang): string {
  try {
    return new Intl.ListFormat(LANG_TAGS[lang], { style: 'narrow', type: 'unit' }).format(parts);
  } catch {
    return parts.join(', ');
  }
}

/** "Video: watched 12m, 3 lines mined" — or null for a day without video study. */
export function mediaActivitySummary(
  activity: DayMediaActivity | undefined,
  t: Translate,
  lang: UiLang,
  formatDuration: (seconds: number) => string,
): string | null {
  const parts = mediaActivityParts(activity, t, formatDuration);
  if (!parts.length) return null;
  return t('studyLoop.stats.calendar.summary', { parts: joinParts(parts, lang) });
}
