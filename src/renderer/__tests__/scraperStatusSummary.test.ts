import { describe, expect, it } from 'vitest';
import type { ScraperScheduleEntry } from '../../shared/scraperOutputSettings';
import { nextScheduledStatus } from '../components/scraper/data/statusSummary';

const schedule = (
  id: string,
  nextRunAt: string | null,
  enabled = true,
): ScraperScheduleEntry => ({
  id,
  label: id,
  cron: '0 * * * *',
  targetUrl: `https://example.test/${id}`,
  profileId: 'balanced',
  enabled,
  lastRunAt: null,
  nextRunAt,
});

describe('scraper shell status summary', () => {
  const now = Date.parse('2026-07-26T12:00:00.000Z');

  it('shows the nearest enabled scheduled run', () => {
    expect(nextScheduledStatus([
      schedule('later', '2026-07-26T17:00:00.000Z'),
      schedule('nearest', '2026-07-26T14:30:00.000Z'),
      schedule('paused', '2026-07-26T12:10:00.000Z', false),
    ], now)).toBe('in 3h');
  });

  it('ignores invalid and unscheduled entries', () => {
    expect(nextScheduledStatus([
      schedule('invalid', 'not-a-date'),
      schedule('missing', null),
    ], now)).toBeNull();
  });

  it('treats an overdue enabled run as immediately due', () => {
    expect(nextScheduledStatus([
      schedule('overdue', '2026-07-26T11:00:00.000Z'),
    ], now)).toBe('in 0m');
  });
});
