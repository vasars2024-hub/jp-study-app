import { describe, expect, it } from 'vitest';
import {
  isValidCron,
  isWithinQuietHours,
  nextCronRun,
  parseCron,
  planSchedulerTick,
} from '../scraperCron';

/** Local-time constructor so the expectations read the way cron does. */
function at(y: number, m: number, d: number, hh = 0, mm = 0): number {
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe('parseCron', () => {
  it('accepts the five standard fields', () => {
    const parsed = parseCron('30 4 * * *');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.cron.minute.values).toEqual([30]);
    expect(parsed.cron.hour.values).toEqual([4]);
    expect(parsed.cron.domUnrestricted).toBe(true);
    expect(parsed.cron.dowUnrestricted).toBe(true);
  });

  it('expands ranges, lists and steps', () => {
    const parsed = parseCron('0,15,30,45 9-17/4 * * 1-5');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.cron.minute.values).toEqual([0, 15, 30, 45]);
    expect(parsed.cron.hour.values).toEqual([9, 13, 17]);
    expect(parsed.cron.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
  });

  it('reads */n as every n from the field minimum', () => {
    const parsed = parseCron('*/20 * * * *');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.cron.minute.values).toEqual([0, 20, 40]);
  });

  it('reads a bare value with a step as "from here onward"', () => {
    const parsed = parseCron('5/15 * * * *');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.cron.minute.values).toEqual([5, 20, 35, 50]);
  });

  it('collapses day-of-week 7 onto 0', () => {
    const parsed = parseCron('0 0 * * 7');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.cron.dayOfWeek.values).toEqual([0]);
  });

  it.each([
    ['0 0 * *', 'expected 5 fields, got 4'],
    ['0 0 * * * *', 'expected 5 fields, got 6'],
    ['60 0 * * *', 'minute: 60-60 is outside 0-59'],
    ['0 24 * * *', 'hour: 24-24 is outside 0-23'],
    ['0 0 0 * *', 'day of month: 0-0 is outside 1-31'],
    ['0 0 * 13 *', 'month: 13-13 is outside 1-12'],
    ['0 0 * * 8', 'day of week: 8-8 is outside 0-7'],
    ['0 0 * * MON', 'day of week: "MON" is not a number'],
    ['@daily', 'expected 5 fields, got 1'],
    ['0 9-5 * * *', 'hour: range "9-5" runs backwards'],
    ['*/0 * * * *', 'minute: step must be at least 1'],
    ['0 0 * * 1,,2', 'day of week: empty list entry'],
  ])('rejects %s', (expression, error) => {
    const parsed = parseCron(expression);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toBe(error);
    expect(isValidCron(expression)).toBe(false);
  });
});

describe('nextCronRun', () => {
  it('finds the next matching minute later the same day', () => {
    // 2026-07-27 is a Monday.
    expect(nextCronRun('30 4 * * *', at(2026, 7, 27, 1, 0))).toBe(at(2026, 7, 27, 4, 30));
  });

  it('rolls into tomorrow when the slot has passed', () => {
    expect(nextCronRun('30 4 * * *', at(2026, 7, 27, 9, 0))).toBe(at(2026, 7, 28, 4, 30));
  });

  it('never returns the minute it was called in', () => {
    const now = at(2026, 7, 27, 4, 30);
    expect(nextCronRun('30 4 * * *', now)).toBe(at(2026, 7, 28, 4, 30));
  });

  it('honours day-of-week', () => {
    // Friday 20:00, asked for on the Monday before.
    expect(nextCronRun('0 20 * * 5', at(2026, 7, 27, 12, 0))).toBe(at(2026, 7, 31, 20, 0));
  });

  it('honours day-of-month', () => {
    expect(nextCronRun('0 0 1 * *', at(2026, 7, 27, 12, 0))).toBe(at(2026, 8, 1, 0, 0));
  });

  it('ORs the two day fields when both are restricted', () => {
    // 15th of the month OR any Sunday. From Mon Jul 27 the next Sunday is
    // Aug 2, which beats the 15th.
    expect(nextCronRun('0 0 15 * 0', at(2026, 7, 27, 12, 0))).toBe(at(2026, 8, 2, 0, 0));
  });

  it('crosses a year boundary', () => {
    expect(nextCronRun('0 0 1 1 *', at(2026, 7, 27, 12, 0))).toBe(at(2027, 1, 1, 0, 0));
  });

  it('steps every 20 minutes', () => {
    expect(nextCronRun('*/20 * * * *', at(2026, 7, 27, 10, 5))).toBe(at(2026, 7, 27, 10, 20));
    expect(nextCronRun('*/20 * * * *', at(2026, 7, 27, 10, 45))).toBe(at(2026, 7, 27, 11, 0));
  });

  it('returns null for an unreachable date', () => {
    expect(nextCronRun('0 0 30 2 *', at(2026, 7, 27))).toBeNull();
  });

  it('returns null for an invalid expression', () => {
    expect(nextCronRun('not a cron', at(2026, 7, 27))).toBeNull();
  });

  it('lands on Feb 29 only in a leap year', () => {
    // 2028 is the next leap year after 2026.
    expect(nextCronRun('0 0 29 2 *', at(2026, 7, 27))).toBe(at(2028, 2, 29, 0, 0));
  });
});

describe('isWithinQuietHours', () => {
  it('is off when either side is blank', () => {
    expect(isWithinQuietHours('', '07:00', at(2026, 7, 27, 3, 0))).toBe(false);
    expect(isWithinQuietHours('23:00', '', at(2026, 7, 27, 3, 0))).toBe(false);
  });

  it('handles a same-day window', () => {
    expect(isWithinQuietHours('09:00', '17:00', at(2026, 7, 27, 12, 0))).toBe(true);
    expect(isWithinQuietHours('09:00', '17:00', at(2026, 7, 27, 8, 59))).toBe(false);
    expect(isWithinQuietHours('09:00', '17:00', at(2026, 7, 27, 17, 0))).toBe(false);
  });

  it('wraps past midnight', () => {
    expect(isWithinQuietHours('23:00', '07:00', at(2026, 7, 27, 23, 30))).toBe(true);
    expect(isWithinQuietHours('23:00', '07:00', at(2026, 7, 27, 3, 0))).toBe(true);
    expect(isWithinQuietHours('23:00', '07:00', at(2026, 7, 27, 12, 0))).toBe(false);
  });

  it('treats an equal start and end as disabled rather than always-on', () => {
    expect(isWithinQuietHours('08:00', '08:00', at(2026, 7, 27, 8, 0))).toBe(false);
  });
});

describe('planSchedulerTick', () => {
  const now = at(2026, 7, 27, 10, 0);

  const base = {
    enabled: true,
    nowMs: now,
    quietHoursStart: '',
    quietHoursEnd: '',
    maxConcurrentScheduled: 2,
    runningScheduled: 0,
    skipIfRunning: false,
    anyJobRunning: false,
    missedRunPolicy: 'run-once' as const,
    requireExternalPower: false,
    onBattery: false,
  };

  const entry = (over: Partial<{
    id: string;
    cron: string;
    enabled: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
  }> = {}) => ({
    id: 'a',
    cron: '0 * * * *',
    enabled: true,
    lastRunAt: null,
    nextRunAt: iso(at(2026, 7, 27, 9, 0)),
    ...over,
  });

  it('fires an entry whose slot has passed', () => {
    const plan = planSchedulerTick({ ...base, entries: [entry()] });
    expect(plan.due).toEqual(['a']);
    expect(plan.heldBy).toBe('');
  });

  it('rolls the fired entry forward past now', () => {
    const plan = planSchedulerTick({ ...base, entries: [entry()] });
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 11, 0)));
  });

  it('leaves a future entry alone', () => {
    const future = iso(at(2026, 7, 27, 23, 0));
    const plan = planSchedulerTick({ ...base, entries: [entry({ nextRunAt: future })] });
    expect(plan.due).toEqual([]);
    expect(plan.heldBy).toBe('nothing-due');
    expect(plan.nextRunAt.a).toBe(future);
  });

  it('seeds a nextRunAt for an entry that has none', () => {
    const plan = planSchedulerTick({ ...base, entries: [entry({ nextRunAt: null })] });
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 11, 0)));
    expect(plan.due).toEqual([]);
  });

  it('seeds over an unparseable nextRunAt instead of firing forever', () => {
    const plan = planSchedulerTick({ ...base, entries: [entry({ nextRunAt: 'yesterday' })] });
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 11, 0)));
    expect(plan.due).toEqual([]);
  });

  it('reports null for an entry whose cron can never fire', () => {
    const plan = planSchedulerTick({
      ...base,
      entries: [entry({ cron: '0 0 30 2 *', nextRunAt: null })],
    });
    expect(plan.nextRunAt.a).toBeNull();
  });

  it('ignores disabled entries entirely', () => {
    const plan = planSchedulerTick({ ...base, entries: [entry({ enabled: false })] });
    expect(plan.due).toEqual([]);
    expect(plan.nextRunAt).toEqual({});
  });

  it('holds everything when the scheduler is off', () => {
    const plan = planSchedulerTick({ ...base, enabled: false, entries: [entry()] });
    expect(plan.due).toEqual([]);
    expect(plan.heldBy).toBe('disabled');
  });

  // A hold defers; it does not consume the slot. Rolling a held entry forward
  // would turn one long-running job into "this schedule never fires again".
  it('holds during quiet hours without consuming the slot', () => {
    const plan = planSchedulerTick({
      ...base,
      entries: [entry()],
      quietHoursStart: '09:00',
      quietHoursEnd: '17:00',
    });
    expect(plan.due).toEqual([]);
    expect(plan.heldBy).toBe('quiet-hours');
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 9, 0)));
  });

  it('fires the deferred run once quiet hours end', () => {
    const held = planSchedulerTick({
      ...base,
      entries: [entry()],
      quietHoursStart: '09:00',
      quietHoursEnd: '17:00',
    });
    const later = planSchedulerTick({
      ...base,
      nowMs: at(2026, 7, 27, 17, 5),
      entries: [entry({ nextRunAt: held.nextRunAt.a })],
      quietHoursStart: '09:00',
      quietHoursEnd: '17:00',
    });
    expect(later.due).toEqual(['a']);
  });

  it('holds on battery when the schedule requires external power', () => {
    const plan = planSchedulerTick({
      ...base,
      entries: [entry()],
      requireExternalPower: true,
      onBattery: true,
    });
    expect(plan.due).toEqual([]);
    expect(plan.heldBy).toBe('on-battery');
    // Deferred, not consumed: a laptop that is unplugged every night must still
    // run its nightly scrape the moment it is plugged in.
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 9, 0)));
  });

  it('fires the deferred run once the machine is plugged in', () => {
    const held = planSchedulerTick({
      ...base,
      entries: [entry()],
      requireExternalPower: true,
      onBattery: true,
    });
    const later = planSchedulerTick({
      ...base,
      entries: [entry({ nextRunAt: held.nextRunAt.a })],
      requireExternalPower: true,
      onBattery: false,
    });
    expect(later.due).toEqual(['a']);
  });

  it('ignores battery state when the schedule does not require external power', () => {
    const plan = planSchedulerTick({ ...base, entries: [entry()], onBattery: true });
    expect(plan.due).toEqual(['a']);
  });

  // Quiet hours are checked first, so the reason the screen shows is the one the
  // user set deliberately rather than the one the hardware happened to also hit.
  it('reports quiet hours ahead of battery when both hold', () => {
    const plan = planSchedulerTick({
      ...base,
      entries: [entry()],
      quietHoursStart: '09:00',
      quietHoursEnd: '17:00',
      requireExternalPower: true,
      onBattery: true,
    });
    expect(plan.heldBy).toBe('quiet-hours');
  });

  it('holds when skipIfRunning and a job is in flight', () => {
    const plan = planSchedulerTick({
      ...base,
      entries: [entry()],
      skipIfRunning: true,
      anyJobRunning: true,
    });
    expect(plan.due).toEqual([]);
    expect(plan.heldBy).toBe('concurrency');
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 9, 0)));
  });

  it('caps the batch at the remaining concurrency', () => {
    const plan = planSchedulerTick({
      ...base,
      maxConcurrentScheduled: 2,
      runningScheduled: 1,
      entries: [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })],
    });
    expect(plan.due).toEqual(['a']);
    // Only the entry that fired moves; the other two stay due for a later tick.
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 11, 0)));
    expect(plan.nextRunAt.b).toBe(iso(at(2026, 7, 27, 9, 0)));
    expect(plan.nextRunAt.c).toBe(iso(at(2026, 7, 27, 9, 0)));
  });

  it('holds when concurrency is already saturated', () => {
    const plan = planSchedulerTick({
      ...base,
      maxConcurrentScheduled: 1,
      runningScheduled: 1,
      entries: [entry()],
    });
    expect(plan.due).toEqual([]);
    expect(plan.heldBy).toBe('concurrency');
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 9, 0)));
  });

  it('drops a stale slot under the skip policy', () => {
    const plan = planSchedulerTick({
      ...base,
      missedRunPolicy: 'skip',
      entries: [entry({ nextRunAt: iso(at(2026, 7, 27, 9, 0)) })],
    });
    expect(plan.due).toEqual([]);
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 11, 0)));
  });

  it('still fires a fresh slot under the skip policy', () => {
    const plan = planSchedulerTick({
      ...base,
      missedRunPolicy: 'skip',
      entries: [entry({ nextRunAt: iso(now - 30_000) })],
    });
    expect(plan.due).toEqual(['a']);
  });

  it('coalesces a long outage into a single catch-up run', () => {
    const plan = planSchedulerTick({
      ...base,
      missedRunPolicy: 'run-all',
      entries: [entry({ nextRunAt: iso(at(2026, 7, 20, 9, 0)) })],
    });
    expect(plan.due).toEqual(['a']);
    expect(plan.nextRunAt.a).toBe(iso(at(2026, 7, 27, 11, 0)));
  });
});
