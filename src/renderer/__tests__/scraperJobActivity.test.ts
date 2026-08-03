import { describe, expect, it } from 'vitest';
import { countActiveScraperJobs } from '../components/scraper/data/jobActivity';

describe('scraper shell job activity', () => {
  it('counts the dashboard fixture and a user-started scrape independently', () => {
    expect(countActiveScraperJobs(true, false)).toBe(1);
    expect(countActiveScraperJobs(false, true)).toBe(1);
    expect(countActiveScraperJobs(true, true)).toBe(2);
  });

  it('returns idle only when both activity sources are inactive', () => {
    expect(countActiveScraperJobs(false, false)).toBe(0);
  });
});
