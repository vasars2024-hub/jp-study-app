import { describe, expect, it } from 'vitest';
import { expandOccurrences, type CalendarEvent } from '../calendar';

function monthlyEvent(date: string, recurrenceEndDate?: string): CalendarEvent {
  return {
    id: 'monthly-study',
    title: 'Vocabulary review',
    date,
    startTime: '10:00',
    color: '#fff',
    category: 'study',
    reminder: '15m',
    recurrence: 'monthly',
    recurrenceEndDate,
    createdAt: 0,
  };
}

describe('monthly calendar occurrences', () => {
  it.each([
    [2026, 31, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']],
    [2026, 30, ['2026-01-30', '2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30']],
    [2026, 29, ['2026-01-29', '2026-02-28', '2026-03-29', '2026-04-29', '2026-05-29']],
    [2028, 31, ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30', '2028-05-31']],
    [2026, 15, ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15']],
  ] as const)('preserves day %i/%i after shorter months', (year, day, expected) => {
    const event = monthlyEvent(`${year}-01-${day}`);
    const occurrences = expandOccurrences([event], new Date(year, 0, 1), new Date(year, 4, 31));
    expect(occurrences.map((o) => o.occurrenceDate)).toEqual(expected);
    expect(event.date).toBe(`${year}-01-${day}`);
  });

  it('keeps the original day across a year boundary', () => {
    const occurrences = expandOccurrences(
      [monthlyEvent('2025-12-31')], new Date(2025, 11, 1), new Date(2026, 2, 31),
    );
    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      '2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31',
    ]);
  });

  it('includes a clamped date at both range boundaries and the recurrence end', () => {
    const event = monthlyEvent('2026-01-31', '2026-02-28');
    const day = new Date(2026, 1, 28);
    expect(expandOccurrences([event], day, day).map((o) => o.occurrenceDate)).toEqual(['2026-02-28']);
    expect(expandOccurrences([event], new Date(2026, 2, 1), new Date(2026, 3, 30))).toEqual([]);
    expect(expandOccurrences([monthlyEvent('2026-03-31')], day, day)).toEqual([]);
  });
});
