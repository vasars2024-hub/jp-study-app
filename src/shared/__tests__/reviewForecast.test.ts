import { describe, expect, it } from 'vitest';
import {
  FORECAST_DAYS,
  dayLabel,
  emptyForecast,
  isDueForecast,
  localBacklog,
  localDueForecast,
  summarizeForecast,
  type DueForecast,
} from '../reviewForecast';

function forecast(due: number[], overdue = 0): DueForecast {
  return {
    ok: true,
    overdue,
    days: due.map((n, i) => ({ offsetDays: i, due: n })),
    generatedAt: 0,
  };
}

describe('emptyForecast', () => {
  it('has one entry per forecast day, all zero', () => {
    const f = emptyForecast();
    expect(f.days).toHaveLength(FORECAST_DAYS);
    expect(f.days.map((d) => d.offsetDays)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(f.days.every((d) => d.due === 0)).toBe(true);
    expect(f.ok).toBe(true);
  });

  it('is not ok when constructed with an error', () => {
    const f = emptyForecast('Anki not running');
    expect(f.ok).toBe(false);
    expect(f.error).toBe('Anki not running');
  });
});

describe('isDueForecast', () => {
  it('accepts a well-formed forecast', () => {
    expect(isDueForecast(forecast([1, 2, 3, 4, 5, 6, 7]))).toBe(true);
    expect(isDueForecast(emptyForecast())).toBe(true);
    expect(isDueForecast(emptyForecast('boom'))).toBe(true);
  });

  it('rejects undefined — the case that rendered a blank panel', () => {
    // The Blanc harness's preload stub resolves undefined, and a main process
    // without the anki:dueForecast handler does too. Before this guard the panel
    // showed neither chart nor error.
    expect(isDueForecast(undefined)).toBe(false);
    expect(isDueForecast(null)).toBe(false);
  });

  it('accepts a forecast with or without newCards', () => {
    // Optional on purpose: a main process predating the field must not blank the
    // panel by failing the guard.
    expect(isDueForecast({ ...forecast([1]), newCards: 151732 })).toBe(true);
    expect(isDueForecast({ ...forecast([1]), newCards: undefined })).toBe(true);
  });

  it('rejects wrong shapes', () => {
    expect(isDueForecast({})).toBe(false);
    expect(isDueForecast({ ok: true, overdue: 0 })).toBe(false);
    expect(isDueForecast({ ok: true, overdue: 0, days: 'nope' })).toBe(false);
    expect(isDueForecast({ ok: 'yes', overdue: 0, days: [] })).toBe(false);
    expect(isDueForecast({ ok: true, overdue: 0, days: [{ offsetDays: 0 }] })).toBe(false);
    expect(isDueForecast({ ok: true, overdue: 0, days: [null] })).toBe(false);
    expect(isDueForecast('a string')).toBe(false);
  });
});

describe('summarizeForecast', () => {
  it('totals and averages the week', () => {
    const s = summarizeForecast(forecast([10, 20, 30, 0, 0, 0, 10]));
    expect(s.total).toBe(70);
    expect(s.dailyAverage).toBe(10);
    expect(s.peakCount).toBe(30);
    expect(s.peakDay).toBe(2);
  });

  it('reports the first day on a tie rather than the last', () => {
    const s = summarizeForecast(forecast([5, 5, 5, 0, 0, 0, 0]));
    expect(s.peakDay).toBe(0);
  });

  it('flags a day that is more than twice the average', () => {
    // average 10, peak 60 on day 3.
    const s = summarizeForecast(forecast([2, 3, 5, 60, 0, 0, 0]));
    expect(s.spikeDay).toBe(3);
  });

  it('does not flag a spike below the floor', () => {
    // Ratio is extreme but the numbers are trivial — 6 cards is not a problem.
    const s = summarizeForecast(forecast([0, 0, 6, 0, 0, 0, 0]));
    expect(s.spikeDay).toBeNull();
  });

  it('does not flag an evenly spread week', () => {
    const s = summarizeForecast(forecast([30, 30, 30, 30, 30, 30, 30]));
    expect(s.spikeDay).toBeNull();
  });

  it('grades an empty week clear', () => {
    const s = summarizeForecast(forecast([0, 0, 0, 0, 0, 0, 0]));
    expect(s.verdict).toBe('clear');
  });

  it('grades by peak day', () => {
    expect(summarizeForecast(forecast([5, 0, 0, 0, 0, 0, 0])).verdict).toBe('light');
    expect(summarizeForecast(forecast([60, 0, 0, 0, 0, 0, 0])).verdict).toBe('steady');
    expect(summarizeForecast(forecast([200, 0, 0, 0, 0, 0, 0])).verdict).toBe('heavy');
  });

  it('lets overdue alone drive the verdict', () => {
    // Nothing due this week, but a large existing backlog is still heavy.
    const s = summarizeForecast(forecast([0, 0, 0, 0, 0, 0, 0], 300));
    expect(s.verdict).toBe('heavy');
    expect(s.overdue).toBe(300);
  });
});

describe('localBacklog', () => {
  it('counts known and unknown', () => {
    const b = localBacklog([{ known: true }, { known: false }, {}]);
    expect(b.total).toBe(3);
    expect(b.known).toBe(1);
    expect(b.unknown).toBe(2);
  });

  it('groups by folder, largest unknown first', () => {
    const b = localBacklog([
      { folder: 'A', known: false },
      { folder: 'B', known: false },
      { folder: 'B', known: false },
      { folder: 'B', known: true },
    ]);
    expect(b.groups.map((g) => g.folder)).toEqual(['B', 'A']);
    expect(b.groups[0]).toEqual({ folder: 'B', total: 3, unknown: 2 });
  });

  it('groups unfiled cards under the empty string', () => {
    const b = localBacklog([{ known: false }, { folder: null, known: false }]);
    expect(b.groups).toHaveLength(1);
    expect(b.groups[0].folder).toBe('');
    expect(b.groups[0].unknown).toBe(2);
  });

  it('handles an empty deck', () => {
    expect(localBacklog([])).toEqual({ total: 0, known: 0, unknown: 0, groups: [] });
  });
});

describe('dayLabel', () => {
  it('names the first two days relatively', () => {
    expect(dayLabel(0)).toBe('Today');
    expect(dayLabel(1)).toBe('Tomorrow');
  });

  it('uses the weekday for later days', () => {
    // A fixed Monday, so the label is deterministic regardless of when tests run.
    const monday = new Date(2026, 6, 20);
    expect(dayLabel(2, monday)).toBe(
      new Date(2026, 6, 22).toLocaleDateString(undefined, { weekday: 'short' }),
    );
  });

  it('rolls over a month boundary', () => {
    const endOfMonth = new Date(2026, 6, 30);
    expect(dayLabel(3, endOfMonth)).toBe(
      new Date(2026, 7, 2).toLocaleDateString(undefined, { weekday: 'short' }),
    );
  });
});

describe('localDueForecast', () => {
  // Midday, so "later today" is unambiguous in the local zone the function uses.
  const NOW = new Date(2026, 7, 29, 12).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const at = (offsetDays: number) => ({ srs: { dueAt: NOW + offsetDays * DAY_MS } });

  it('reads stored due dates rather than deriving them from intervals', () => {
    const result = localDueForecast([at(0.1), at(1), at(1), at(3)], 7, NOW);
    expect(result.days[0].due).toBe(1);
    expect(result.days[1].due).toBe(2);
    expect(result.days[3].due).toBe(1);
    expect(result.total).toBe(4);
    expect(result.days).toHaveLength(7);
  });

  it('counts an unscheduled card as due now, agreeing with the review button', () => {
    const result = localDueForecast([{}, { srs: null }, { srs: { dueAt: 'soon' } }], 7, NOW);
    expect(result.overdue).toBe(3);
    expect(result.days.every((day) => day.due === 0)).toBe(true);
  });

  it('counts a past-due card as overdue, never as day zero', () => {
    const result = localDueForecast([at(-5), at(-0.1)], 7, NOW);
    expect(result.overdue).toBe(2);
    expect(result.days[0].due).toBe(0);
  });

  it('REFUSAL: a card beyond the window is counted apart, never piled onto the last day', () => {
    const result = localDueForecast([at(30), at(90)], 7, NOW);
    expect(result.beyond).toBe(2);
    expect(result.days[6].due).toBe(0);
    expect(result.days.reduce((sum, day) => sum + day.due, 0)).toBe(0);
  });

  it('keeps every card in exactly one column', () => {
    const cards = [at(-1), at(0.2), at(2), at(400), {}];
    const result = localDueForecast(cards, 7, NOW);
    const counted = result.overdue + result.beyond
      + result.days.reduce((sum, day) => sum + day.due, 0);
    expect(counted).toBe(result.total);
    expect(result.total).toBe(cards.length);
  });
});
