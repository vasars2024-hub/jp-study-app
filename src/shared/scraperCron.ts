// Cron parsing and next-run arithmetic for the Scraper's Scheduled Tasks.
//
// Deliberately dependency-free and pure: the scheduler in src/main and the
// Scheduled Tasks screen must agree on what "next run" means down to the
// minute, and the only way to guarantee that is one implementation both sides
// call. Everything here takes an explicit `now`, so the tests are not clocks.
//
// Supports the standard five fields (minute hour day-of-month month
// day-of-week) with `*`, `a-b` ranges, `a,b,c` lists, `*/n` and `a-b/n` steps.
// Day-of-week accepts 0-7 with both 0 and 7 meaning Sunday. Non-numeric aliases
// (JAN, MON) and the extension syntaxes (`@daily`, `L`, `#`) are not accepted —
// a schedule that silently does something other than what its text says is
// worse than one that reports itself invalid.

export interface CronField {
  /** Sorted, de-duplicated set of values this field matches. */
  values: number[];
}

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
  /** True when day-of-month is `*` — used for the OR rule below. */
  domUnrestricted: boolean;
  dowUnrestricted: boolean;
}

export type CronParseResult =
  | { ok: true; cron: ParsedCron }
  | { ok: false; error: string };

interface FieldSpec {
  name: string;
  min: number;
  max: number;
}

const FIELDS: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
];

function parseField(raw: string, spec: FieldSpec): CronField | string {
  const values = new Set<number>();
  for (const part of raw.split(',')) {
    const piece = part.trim();
    if (!piece) return `${spec.name}: empty list entry`;

    const [rangeText, stepText, ...rest] = piece.split('/');
    if (rest.length) return `${spec.name}: "${piece}" has more than one step`;

    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText)) return `${spec.name}: step "${stepText}" is not a number`;
      step = Number(stepText);
      if (step < 1) return `${spec.name}: step must be at least 1`;
    }

    let start: number;
    let end: number;
    if (rangeText === '*') {
      start = spec.min;
      end = spec.max;
    } else if (rangeText.includes('-')) {
      const [lo, hi, ...extra] = rangeText.split('-');
      if (extra.length) return `${spec.name}: "${rangeText}" is not a range`;
      if (!/^\d+$/.test(lo) || !/^\d+$/.test(hi)) {
        return `${spec.name}: "${rangeText}" is not a numeric range`;
      }
      start = Number(lo);
      end = Number(hi);
      if (start > end) return `${spec.name}: range "${rangeText}" runs backwards`;
    } else {
      if (!/^\d+$/.test(rangeText)) return `${spec.name}: "${rangeText}" is not a number`;
      start = Number(rangeText);
      // A bare value with a step means "from here to the end of the field",
      // which is how cron reads `5/15`.
      end = stepText === undefined ? start : spec.max;
    }

    if (start < spec.min || end > spec.max) {
      return `${spec.name}: ${start}-${end} is outside ${spec.min}-${spec.max}`;
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }

  if (!values.size) return `${spec.name}: matches nothing`;
  return { values: [...values].sort((a, b) => a - b) };
}

export function parseCron(expression: string): CronParseResult {
  const parts = String(expression ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) {
    return { ok: false, error: `expected 5 fields, got ${parts.length}` };
  }
  const [minuteText = '', hourText = '', domText = '', monthText = '', dowText = ''] = parts;
  const [minuteSpec, hourSpec, domSpec, monthSpec, dowSpec] = FIELDS as [
    FieldSpec, FieldSpec, FieldSpec, FieldSpec, FieldSpec,
  ];

  const minute = parseField(minuteText, minuteSpec);
  if (typeof minute === 'string') return { ok: false, error: minute };
  const hour = parseField(hourText, hourSpec);
  if (typeof hour === 'string') return { ok: false, error: hour };
  const dayOfMonth = parseField(domText, domSpec);
  if (typeof dayOfMonth === 'string') return { ok: false, error: dayOfMonth };
  const month = parseField(monthText, monthSpec);
  if (typeof month === 'string') return { ok: false, error: month };
  const dayOfWeek = parseField(dowText, dowSpec);
  if (typeof dayOfWeek === 'string') return { ok: false, error: dayOfWeek };

  // 7 and 0 are both Sunday; collapse so matching only ever tests 0-6.
  const dowValues = [...new Set(dayOfWeek.values.map((value) => (value === 7 ? 0 : value)))]
    .sort((a, b) => a - b);

  return {
    ok: true,
    cron: {
      minute,
      hour,
      dayOfMonth,
      month,
      dayOfWeek: { values: dowValues },
      domUnrestricted: domText === '*',
      dowUnrestricted: dowText === '*',
    },
  };
}

export function isValidCron(expression: string): boolean {
  return parseCron(expression).ok;
}

function matchesDate(cron: ParsedCron, date: Date): boolean {
  if (!cron.month.values.includes(date.getMonth() + 1)) return false;

  const domHit = cron.dayOfMonth.values.includes(date.getDate());
  const dowHit = cron.dayOfWeek.values.includes(date.getDay());

  // Vixie cron's rule: when both day fields are restricted the day matches if
  // *either* hits; when only one is restricted, only that one decides.
  if (cron.domUnrestricted && cron.dowUnrestricted) return true;
  if (cron.domUnrestricted) return dowHit;
  if (cron.dowUnrestricted) return domHit;
  return domHit || dowHit;
}

/** How far ahead we are willing to search before calling a cron unreachable. */
const MAX_SEARCH_DAYS = 366 * 4;

/**
 * The first instant strictly after `afterMs` that matches `expression`, in
 * local time, or null when the expression is invalid or never fires (e.g.
 * `0 0 30 2 *` — February 30th).
 */
export function nextCronRun(expression: string, afterMs: number): number | null {
  const parsed = parseCron(expression);
  if (!parsed.ok) return null;
  const cron = parsed.cron;

  // Start at the top of the next minute so a run is never scheduled for the
  // minute we are already inside.
  const cursor = new Date(afterMs);
  cursor.setSeconds(0, 0);
  const startHour = cursor.getHours();
  const startDate = cursor.getDate();
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = new Date(cursor.getTime());
  limit.setDate(limit.getDate() + MAX_SEARCH_DAYS);

  /**
   * DST spring-forward: an advance that lands more than one wall-clock hour
   * later on the same day jumped over hours that do not exist today (02:00 to
   * 03:00 in most zones). A schedule for one of those hours still runs once
   * that day — at the first instant after the gap — rather than silently
   * skipping a day, which is what cron implementations conventionally do.
   */
  const skippedScheduledHour = (beforeHour: number, beforeDate: number): boolean => {
    if (cursor.getDate() !== beforeDate) return false;
    for (let hour = beforeHour + 1; hour < cursor.getHours(); hour += 1) {
      if (cron.hour.values.includes(hour)) return true;
    }
    return false;
  };
  if (matchesDate(cron, cursor) && skippedScheduledHour(startHour, startDate)) return cursor.getTime();

  while (cursor.getTime() <= limit.getTime()) {
    if (!matchesDate(cron, cursor)) {
      // Skip to midnight of the next day rather than stepping 1,440 minutes.
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!cron.hour.values.includes(cursor.getHours())) {
      const beforeHour = cursor.getHours();
      const beforeDate = cursor.getDate();
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      if (skippedScheduledHour(beforeHour, beforeDate)) return cursor.getTime();
      continue;
    }
    if (!cron.minute.values.includes(cursor.getMinutes())) {
      const beforeHour = cursor.getHours();
      const beforeDate = cursor.getDate();
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
      if (skippedScheduledHour(beforeHour, beforeDate)) return cursor.getTime();
      continue;
    }
    return cursor.getTime();
  }
  return null;
}

/** Local `HH:MM` for a timestamp — the format quiet hours are written in. */
function localHhMm(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Quiet hours as the settings screen describes them: a start and end in local
 * `HH:MM`, where an end earlier than the start wraps past midnight. Either side
 * blank disables the window entirely.
 */
export function isWithinQuietHours(start: string, end: string, atMs: number): boolean {
  const valid = /^\d{2}:\d{2}$/;
  if (!valid.test(start) || !valid.test(end) || start === end) return false;
  const now = localHhMm(atMs);
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export interface DueScheduleInput {
  id: string;
  cron: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface SchedulerTickDecision {
  /** Entries to start now, already capped by concurrency. */
  due: string[];
  /**
   * Every enabled entry's nextRunAt after this tick. Entries that fired (or
   * were dropped as stale) have rolled forward; entries that are merely held
   * keep their existing time so a later tick still sees them as due.
   */
  nextRunAt: Record<string, string | null>;
  /** Why nothing ran, when nothing ran. Empty when `due` is non-empty. */
  heldBy: '' | 'disabled' | 'quiet-hours' | 'on-battery' | 'concurrency' | 'nothing-due';
}

export interface SchedulerTickOptions {
  enabled: boolean;
  entries: DueScheduleInput[];
  nowMs: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxConcurrentScheduled: number;
  /** Scheduled jobs already in flight; counts against the concurrency cap. */
  runningScheduled: number;
  skipIfRunning: boolean;
  /** Any job at all is running — only consulted when `skipIfRunning`. */
  anyJobRunning: boolean;
  /** `scheduler.requireExternalPower`. */
  requireExternalPower: boolean;
  /**
   * Whether the machine is on battery right now.
   *
   * Passed in rather than read here: this module is pure and shared, and the
   * only thing that knows is Electron's powerMonitor, which lives in main. A
   * caller that cannot tell passes false, which is the same answer a desktop
   * gives and therefore holds nothing.
   */
  onBattery: boolean;
  /**
   * 'skip' abandons runs missed while the app was closed; 'run-once' fires a
   * single catch-up run. 'run-all' is a legacy persisted alias for 'run-once':
   * the UI names that compatibility behavior explicitly instead of promising
   * a backlog replay this scheduler has never performed.
   */
  missedRunPolicy: 'skip' | 'run-once' | 'run-all';
  /**
   * When this process started evaluating schedules. With it, 'skip' drops only
   * slots that passed before the session began — runs missed while the app was
   * closed, which is what the policy names. A slot that came due during the
   * session and was then *held* (quiet hours, battery, concurrency, a late
   * tick) is never dropped, however long the hold lasted: a hold defers. Without
   * it (older callers) the previous one-minute staleness rule applies.
   */
  sessionStartedMs?: number;
}

/**
 * Pure decision function for one scheduler tick. Main calls this on a timer and
 * acts on the result; the UI calls it to show what would happen. No side
 * effects, no clock reads.
 */
export function planSchedulerTick(options: SchedulerTickOptions): SchedulerTickDecision {
  const nextRunAt: Record<string, string | null> = {};
  const recompute = (entry: DueScheduleInput, fromMs: number) => {
    const at = nextCronRun(entry.cron, fromMs);
    nextRunAt[entry.id] = at === null ? null : new Date(at).toISOString();
  };

  const enabledEntries = options.entries.filter((entry) => entry.enabled);
  for (const entry of enabledEntries) {
    // An entry with no stored nextRunAt (just created, or previously invalid)
    // gets one seeded from now so it participates in later ticks.
    const stored = entry.nextRunAt ? Date.parse(entry.nextRunAt) : NaN;
    if (!Number.isFinite(stored)) recompute(entry, options.nowMs);
    else nextRunAt[entry.id] = new Date(stored).toISOString();
  }

  if (!options.enabled) {
    return { due: [], nextRunAt, heldBy: 'disabled' };
  }

  const overdue = enabledEntries.filter((entry) => {
    const at = entry.nextRunAt ? Date.parse(entry.nextRunAt) : NaN;
    return Number.isFinite(at) && at <= options.nowMs;
  });

  // A slot is consumed — i.e. rolled forward — only when its run actually
  // starts, or when the 'skip' policy deliberately drops it. Rolling a *held*
  // entry forward would make a hold silently equal to a cancellation: a single
  // long-running job could keep a nightly schedule from ever firing, and the
  // screen would never explain why. So a hold defers instead.
  const session = options.sessionStartedMs;
  const stale = options.missedRunPolicy === 'skip'
    ? overdue.filter((entry) => {
      const at = Date.parse(entry.nextRunAt as string);
      // A minute of grace either way: a slot a few seconds before launch, or a
      // tick that lands a little late, is still "on time".
      return typeof session === 'number' && Number.isFinite(session)
        ? at < session - 60_000
        : options.nowMs - at >= 60_000;
    })
    : [];
  for (const entry of stale) recompute(entry, options.nowMs);

  const staleIds = new Set(stale.map((entry) => entry.id));
  const candidates = overdue.filter((entry) => !staleIds.has(entry.id));

  if (!candidates.length) {
    return { due: [], nextRunAt, heldBy: 'nothing-due' };
  }
  if (isWithinQuietHours(options.quietHoursStart, options.quietHoursEnd, options.nowMs)) {
    return { due: [], nextRunAt, heldBy: 'quiet-hours' };
  }
  // Held, not skipped: the entry keeps its overdue `nextRunAt` and fires as soon
  // as the machine is plugged in again. Rolling it forward would mean a laptop
  // that spends every night on battery never runs its nightly scrape at all,
  // and the screen would show an armed schedule that silently never fires.
  if (options.requireExternalPower && options.onBattery) {
    return { due: [], nextRunAt, heldBy: 'on-battery' };
  }
  if (options.skipIfRunning && options.anyJobRunning) {
    return { due: [], nextRunAt, heldBy: 'concurrency' };
  }

  const room = Math.max(0, options.maxConcurrentScheduled - options.runningScheduled);
  if (room <= 0) {
    return { due: [], nextRunAt, heldBy: 'concurrency' };
  }

  const firing = candidates.slice(0, room);
  for (const entry of firing) recompute(entry, options.nowMs);

  return { due: firing.map((entry) => entry.id), nextRunAt, heldBy: '' };
}
