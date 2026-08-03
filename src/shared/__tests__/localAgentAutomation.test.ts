import { describe, expect, it } from 'vitest';
import {
  automationDueAt,
  nextAgentAutomationRun,
  normalizeAgentAutomations,
} from '../localAgentAutomation';

describe('local agent automation schedules', () => {
  const daily = {
    id: 'daily-review',
    name: 'Daily review',
    objective: 'Prepare today’s review.',
    frequency: 'daily' as const,
    time: '09:30',
    enabled: true,
    permission: 'read-only' as const,
    createdAt: 1,
  };

  it('normalizes bounded recurring schedules', () => {
    expect(normalizeAgentAutomations([daily, { ...daily, id: 'daily-review' }, { id: 'bad' }])).toEqual([daily]);
  });

  it('computes the next daily and weekly run', () => {
    const from = new Date(2026, 6, 24, 10, 0);
    expect(nextAgentAutomationRun(daily, from)).toEqual(new Date(2026, 6, 25, 9, 30));
    const weekly = { ...daily, frequency: 'weekly' as const, weekday: 1, time: '11:00' };
    expect(nextAgentAutomationRun(weekly, from)).toEqual(new Date(2026, 6, 27, 11, 0));
  });

  it('matches only the configured minute and weekday', () => {
    expect(automationDueAt(daily, new Date(2026, 6, 24, 9, 30))).toBe(true);
    expect(automationDueAt(daily, new Date(2026, 6, 24, 9, 31))).toBe(false);
    expect(automationDueAt({ ...daily, frequency: 'weekly', weekday: 1 }, new Date(2026, 6, 24, 9, 30))).toBe(false);
  });
});
