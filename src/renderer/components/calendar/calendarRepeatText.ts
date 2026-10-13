/**
 * Words for a repeat and a reminder: the event editor's choices and the .ics import
 * preview read them from here, so the two always describe a rule the same way — including
 * the one place the calendar's own rule differs from iCalendar's (a monthly event on the
 * 29th–31st: Gum takes the month's last day, an imported one skips that month).
 */
import {
  nthOfDateKey,
  parseDateKey,
  REMINDER_LABEL_KEYS,
  reminderLeadMinutes,
  weeklyWeekdays,
  type CalendarEvent,
} from '../../calendar';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** 2026-01-04 is a Sunday: day `n` of that week names weekday `n`. */
export function weekdayName(day: number, locale: string, style: 'long' | 'short' | 'narrow' = 'short'): string {
  return new Date(2026, 0, 4 + day).toLocaleDateString(locale, { weekday: style });
}

/** How a monthly or yearly series picks its day. */
export type RepeatPattern = 'day' | 'skip' | 'nth' | 'last';

/** The pattern an event's fields describe. */
export function repeatPatternOf(ev: Pick<CalendarEvent, 'recurrenceNth' | 'recurrenceMonthEnd'>): RepeatPattern {
  if (ev.recurrenceNth === -1) return 'last';
  if (ev.recurrenceNth) return 'nth';
  return ev.recurrenceMonthEnd === 'skip' ? 'skip' : 'day';
}

/** The fields a pattern stands for on `date` (the Nth weekday is `date`'s own). */
export function repeatPatternFields(pattern: RepeatPattern, date: string): Pick<CalendarEvent, 'recurrenceNth' | 'recurrenceMonthEnd'> {
  if (pattern === 'last') return { recurrenceNth: -1 };
  if (pattern === 'nth') return { recurrenceNth: nthOfDateKey(date).nth };
  if (pattern === 'skip') return { recurrenceMonthEnd: 'skip' };
  return {};
}

/** Whether `date` is a day some months (monthly) or years (yearly) do not have. */
function dayIsMissingSometimes(date: string, yearly: boolean): boolean {
  const d = parseDateKey(date);
  return yearly ? d.getMonth() === 1 && d.getDate() === 29 : d.getDate() > 28;
}

/** The patterns that mean something on `date`, each with its label. */
export function repeatPatternOptions(
  date: string,
  recurrence: 'monthly' | 'yearly',
  t: Translate,
  locale: string,
): Array<{ value: RepeatPattern; label: string }> {
  const yearly = recurrence === 'yearly';
  const options: RepeatPattern[] = ['day'];
  if (dayIsMissingSometimes(date, yearly)) options.push('skip');
  const { last } = nthOfDateKey(date);
  options.push('nth');
  if (last) options.push('last');
  return options.map((value) => ({ value, label: patternLabel(date, yearly, value, t, locale) }));
}

function patternLabel(date: string, yearly: boolean, pattern: RepeatPattern, t: Translate, locale: string): string {
  const d = parseDateKey(date);
  if (pattern === 'nth' || pattern === 'last') {
    const ordinal = t(`planner.repeat.ordinal.${pattern === 'last' ? 'last' : nthOfDateKey(date).nth}`);
    const weekday = weekdayName(d.getDay(), locale, 'long');
    return yearly
      ? t('planner.repeat.yearNth', { ordinal, weekday, month: d.toLocaleDateString(locale, { month: 'long' }) })
      : t('planner.repeat.nthWeekday', { ordinal, weekday });
  }
  const lacking = dayIsMissingSometimes(date, yearly);
  if (yearly) {
    const label = d.toLocaleDateString(locale, { month: 'long', day: 'numeric' });
    if (!lacking) return t('planner.repeat.yearDay', { date: label });
    return t(pattern === 'skip' ? 'planner.repeat.yearDaySkip' : 'planner.repeat.yearDayClamp', { date: label });
  }
  if (!lacking) return t('planner.repeat.monthDay', { day: d.getDate() });
  return t(pattern === 'skip' ? 'planner.repeat.monthDaySkip' : 'planner.repeat.monthDayClamp', { day: d.getDate() });
}

/** One line for a repeat: "Weekly · Tue, Thu", "The second Tuesday of the month", "Every November 26". */
export function describeRepeat(
  ev: Pick<CalendarEvent, 'date' | 'recurrence' | 'recurrenceInterval' | 'recurrenceWeekdays' | 'recurrenceNth' | 'recurrenceMonthEnd'>,
  t: Translate,
  locale: string,
): string {
  const every = ev.recurrenceInterval && ev.recurrenceInterval > 1 ? ev.recurrenceInterval : 0;
  if (ev.recurrence === 'weekly') {
    const days = weeklyWeekdays(ev).map((d) => weekdayName(d, locale)).join(', ');
    return [t('calendar.modal.repeat.weekly'), days, every ? `${t('planner.repeat.everyWeeks')}: ${every}` : '']
      .filter(Boolean).join(' · ');
  }
  if (ev.recurrence === 'monthly' || ev.recurrence === 'yearly') {
    const label = patternLabel(ev.date, ev.recurrence === 'yearly', repeatPatternOf(ev), t, locale);
    const key = ev.recurrence === 'yearly' ? 'planner.repeat.everyYears' : 'planner.repeat.everyMonths';
    return every ? `${label} · ${t(key)}: ${every}` : label;
  }
  return t(`calendar.modal.repeat.${ev.recurrence}`);
}

/** A reminder's words; an exact imported one ("10 minutes before") from its own minutes. */
export function reminderLabel(ev: Pick<CalendarEvent, 'reminder' | 'reminderMinutes'>, t: Translate): string {
  if (ev.reminder !== 'custom') return t(REMINDER_LABEL_KEYS[ev.reminder] ?? REMINDER_LABEL_KEYS.none);
  const minutes = reminderLeadMinutes(ev);
  if (minutes === null) return t(REMINDER_LABEL_KEYS.none);
  if (minutes > 0 && minutes % 1440 === 0) return t('planner.reminder.daysBefore', { count: minutes / 1440 });
  if (minutes > 0 && minutes % 60 === 0) return t('planner.reminder.hoursBefore', { count: minutes / 60 });
  return t('planner.reminder.minutesBefore', { count: minutes });
}
