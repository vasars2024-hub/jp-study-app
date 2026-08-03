// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The log bus touches no Electron API, but stats does — both are exercised here
// so the stub lives once.
let metrics: unknown[] | null = [];

vi.mock('electron', () => ({
  app: {
    getAppMetrics: () => {
      if (metrics === null) throw new Error('not ready');
      return metrics;
    },
  },
  ipcMain: { handle: () => undefined },
}));

const {
  onScraperLog,
  recentScraperLogs,
  redactLogText,
  resetScraperLogs,
  scraperLog,
  scraperLogsFor,
} = await import('../scraper/logBus');
const { scraperSystemStats, setActiveJobCounter } = await import('../scraper/stats');

beforeEach(() => {
  resetScraperLogs();
  metrics = [];
  setActiveJobCounter(() => 0);
});

describe('redactLogText', () => {
  it('removes query-string secrets but keeps the parameter name', () => {
    expect(redactLogText('GET https://x.test/a?api_key=abc123&page=2')).toBe(
      'GET https://x.test/a?api_key=‹redacted›&page=2',
    );
  });

  it('removes header credentials', () => {
    expect(redactLogText('Authorization: Bearer eyJhbGciOi.J9')).toBe(
      'Authorization: ‹redacted›',
    );
    expect(redactLogText('cookie=SID=deadbeef')).toBe('cookie=‹redacted›');
  });

  it('removes credentials embedded in a URL authority', () => {
    expect(redactLogText('connecting to http://admin:hunter2@127.0.0.1:8080/api')).toBe(
      'connecting to http://‹redacted›@127.0.0.1:8080/api',
    );
  });

  it('leaves ordinary text alone', () => {
    const plain = 'parsed 24 episodes from list page 2';
    expect(redactLogText(plain)).toBe(plain);
  });
});

describe('scraperLog', () => {
  it('redacts on the way in, so a stored line can never hold a secret', () => {
    const line = scraperLog('info', 'http', 'GET https://x.test/?token=s3cret');
    expect(line.message).not.toContain('s3cret');
    expect(recentScraperLogs()[0].message).not.toContain('s3cret');
  });

  it('pushes to subscribers and stops after unsubscribe', () => {
    const seen: string[] = [];
    const off = onScraperLog((line) => seen.push(line.message));
    scraperLog('info', 'test', 'one');
    off();
    scraperLog('info', 'test', 'two');
    expect(seen).toEqual(['one']);
  });

  it('survives a listener that throws', () => {
    onScraperLog(() => {
      throw new Error('bad listener');
    });
    const seen: string[] = [];
    onScraperLog((line) => seen.push(line.message));
    expect(() => scraperLog('warn', 'test', 'still delivered')).not.toThrow();
    expect(seen).toEqual(['still delivered']);
  });

  it('groups lines by correlation id', () => {
    scraperLog('info', 'job', 'a', { correlationId: 'job-1' });
    scraperLog('info', 'job', 'b', { correlationId: 'job-2' });
    scraperLog('info', 'job', 'c', { correlationId: 'job-1' });
    expect(scraperLogsFor('job-1').map((l) => l.message)).toEqual(['a', 'c']);
  });

  it('bounds the ring so a long session cannot grow without limit', () => {
    for (let i = 0; i < 2_500; i += 1) scraperLog('debug', 'flood', `line ${i}`);
    const all = recentScraperLogs(10_000);
    expect(all.length).toBe(2_000);
    // Oldest lines are the ones dropped.
    expect(all[all.length - 1].message).toBe('line 2499');
    expect(all[0].message).toBe('line 500');
  });

  it('measures offsetMs against the epoch it is given', () => {
    const since = Date.now() - 5_000;
    const line = scraperLog('info', 'job', 'late', { since });
    expect(line.offsetMs).toBeGreaterThanOrEqual(5_000);
    expect(line.offsetMs).toBeLessThan(20_000);
  });
});

describe('scraperSystemStats', () => {
  it('sums resident set and CPU across every app process', () => {
    metrics = [
      { memory: { workingSetSize: 200 * 1024 }, cpu: { percentCPUUsage: 3.2 } },
      { memory: { workingSetSize: 100 * 1024 }, cpu: { percentCPUUsage: 1.4 } },
    ];
    const stats = scraperSystemStats();
    expect(stats.memoryMb).toBe(300);
    expect(stats.cpuPercent).toBe(5);
  });

  it('clamps CPU to 100 when several cores are saturated', () => {
    metrics = [{ memory: { workingSetSize: 1024 }, cpu: { percentCPUUsage: 480 } }];
    expect(scraperSystemStats().cpuPercent).toBe(100);
  });

  it('falls back to the main process RSS before the app is ready', () => {
    metrics = null;
    const stats = scraperSystemStats();
    expect(stats.memoryMb).toBeGreaterThan(0);
  });

  it('reports the engine job count rather than a UI guess', () => {
    setActiveJobCounter(() => 3);
    expect(scraperSystemStats().activeJobs).toBe(3);
  });
});
