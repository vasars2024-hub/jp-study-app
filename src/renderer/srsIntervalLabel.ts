/**
 * The "when will I see this again" hint under a review grade button — one
 * format for every review surface.
 *
 * Flashcards and grammar review showed the same scheduler's preview two ways:
 * Flashcards read "Again in 10 min · In 0.5 d · Next review in 1 d · In 4 d"
 * (three phrasings on four buttons, and a fractional day), grammar read
 * "< 1 day · < 1 day · 1 d · 4 d" (Again and Hard indistinguishable). Both now
 * say "10 min · 12 h · 1 d · 4 d": the largest whole unit that fits.
 */
import type { TVars } from '../shared/i18n/core';
import { LOCAL_SRS_RELEARN_MINUTES } from '../shared/localSrs';

type TFn = (key: string, vars?: TVars) => string;

const MINUTES_PER_DAY = 24 * 60;

/**
 * `days` is the scheduler's interval (fractional for sub-day steps). Both
 * schedulers answer Again with `intervalDays: 0` and put the card back after the
 * fixed relearning step, so 0 reads as that step, not as "now".
 */
export function srsIntervalLabel(days: number, t: TFn): string {
  const safe = Number.isFinite(days) && days > 0 ? days : 0;
  const minutes = safe > 0 ? safe * MINUTES_PER_DAY : LOCAL_SRS_RELEARN_MINUTES;
  if (minutes < 60) return t('flash.srs.minutes', { count: Math.max(1, Math.round(minutes)) });
  if (safe < 1) return t('flash.srs.hours', { count: Math.max(1, Math.round(safe * 24)) });
  if (safe < 60) return t('flash.srs.days', { count: Math.round(safe) });
  return t('flash.srs.months', { count: Math.round(safe / 30) });
}
