// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Static, unlike the modules below: this one touches no Electron API, so it
// needs no `await import` after the mock is registered — and every top-level
// await in this file costs a TS1378 diagnostic under the repo's module target.
import { DEFAULT_SCRAPER_LOGGING_SETTINGS } from '../../shared/scraperOutputSettings';

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
  acceptsLogLine,
  configureScraperLogging,
  flushScraperLogWrites,
  onScraperLog,
  pruneOldLogs,
  recentScraperLogs,
  redactLogText,
  resetScraperLogs,
  scraperLog,
  scraperLogFiles,
  scraperLogsFor,
} = await import('../scraper/logBus');
const { scraperSystemStats, setActiveJobCounter } = await import('../scraper/stats');

/** The shipped defaults with one field changed, so a test names only what it tests. */
function logging(overrides: Partial<typeof DEFAULT_SCRAPER_LOGGING_SETTINGS> = {}) {
  return { ...DEFAULT_SCRAPER_LOGGING_SETTINGS, persistToDisk: false, ...overrides };
}

beforeEach(() => {
  resetScraperLogs();
  metrics = [];
  setActiveJobCounter(() => 0);
  // The shipped default writes to disk. Every test that is not about the disk
  // sink turns it off, so the suite cannot depend on a writable store root.
  configureScraperLogging(logging());
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
    // Explicit level: `debug` is below the shipped default of `info` and is
    // now genuinely dropped, which is what the Log Level setting means. This
    // test is about the ring, so it takes the filter out of the picture.
    configureScraperLogging(logging({ level: 'debug' }));
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

// ---------------------------------------------------------------------------
// The Logging settings group. Until 2026-08-05 nothing in production read any
// of its nine fields; these are the assertions that say it does now.
// ---------------------------------------------------------------------------

describe('logging policy', () => {
  it('drops lines below the configured level', () => {
    configureScraperLogging(logging({ level: 'warn' }));
    scraperLog('error', 'engine', 'kept-error');
    scraperLog('warn', 'engine', 'kept-warn');
    scraperLog('info', 'engine', 'dropped-info');
    scraperLog('debug', 'engine', 'dropped-debug');
    expect(recentScraperLogs().map((l) => l.message)).toEqual(['kept-error', 'kept-warn']);
  });

  it('silent records nothing at all', () => {
    configureScraperLogging(logging({ level: 'silent' }));
    scraperLog('error', 'engine', 'not even this');
    expect(recentScraperLogs()).toHaveLength(0);
  });

  it('an empty channel list means every channel', () => {
    configureScraperLogging(logging({ channels: [] }));
    scraperLog('info', 'engine', 'a');
    scraperLog('info', 'torrents', 'b');
    expect(recentScraperLogs()).toHaveLength(2);
  });

  it('a non-empty channel list is an allow-list', () => {
    configureScraperLogging(logging({ channels: ['torrents'] }));
    scraperLog('info', 'engine', 'dropped');
    scraperLog('info', 'torrents', 'kept');
    expect(recentScraperLogs().map((l) => l.message)).toEqual(['kept']);
  });

  it('the vocabulary names channels the app actually logs on', () => {
    // The old list was ['network','browser','extraction','torrent','qbit',
    // 'scheduler'] with a default of ['network','extraction'] — two channels no
    // call site uses. Wiring the filter against that would have silently
    // discarded every line in the app. This is the guard against a repeat.
    for (const channel of ['engine', 'http', 'catalogue', 'torrents', 'export']) {
      configureScraperLogging(logging({ channels: [channel] as never }));
      expect(acceptsLogLine('info', channel)).toBe(true);
    }
  });

  it('a filtered line is still returned, and still redacted', () => {
    // Callers use the return value; only *recording* is filtered.
    configureScraperLogging(logging({ level: 'error' }));
    const line = scraperLog('debug', 'http', 'GET https://x.test/?token=s3cret');
    expect(line.message).not.toContain('s3cret');
    expect(recentScraperLogs()).toHaveLength(0);
  });

  it('redaction is not switchable off', () => {
    // Both redact* fields default true and are deliberately not consulted:
    // a guarantee that can be disabled by a stray click is not a guarantee.
    configureScraperLogging(logging({ redactCookies: false, redactCredentials: false }));
    const line = scraperLog('info', 'http', 'Authorization: Bearer eyJhbGciOi.J9');
    expect(line.message).toBe('Authorization: ‹redacted›');
  });
});

describe('logging disk sink', () => {
  let root = '';

  beforeEach(async () => {
    const os = await import('node:os');
    const fsp = await import('node:fs/promises');
    // Imported here rather than at module scope: `../scraper/store` pulls in
    // Electron, so it must load after the mock, and a third top-level await
    // would add a third TS1378 to the file's pre-existing two.
    const { setScraperStoreRoot } = await import('../scraper/store');
    root = await fsp.mkdtemp(`${os.tmpdir()}/jp-logbus-`);
    setScraperStoreRoot(root);
  });

  it('writes nothing when persistToDisk is off', async () => {
    configureScraperLogging(logging({ persistToDisk: false }));
    scraperLog('info', 'engine', 'not on disk');
    await flushScraperLogWrites();
    expect(scraperLogFiles()).toEqual([]);
  });

  it('appends a line when persistToDisk is on', async () => {
    const fsp = await import('node:fs/promises');
    const path = await import('node:path');
    configureScraperLogging(logging({ persistToDisk: true }));
    scraperLog('warn', 'engine', 'on disk please');
    await flushScraperLogWrites();
    const files = scraperLogFiles();
    expect(files).toHaveLength(1);
    const body = await fsp.readFile(path.join(root, 'logs', files[0]), 'utf-8');
    expect(body).toContain('WARN [engine] on disk please');
  });

  it('a filtered line never reaches the file either', async () => {
    configureScraperLogging(logging({ persistToDisk: true, level: 'error' }));
    scraperLog('info', 'engine', 'filtered out');
    await flushScraperLogWrites();
    expect(scraperLogFiles()).toEqual([]);
  });

  it('rolls over instead of growing past maxFileSizeMb', async () => {
    // 1 MB is the floor the schema clamps to. Few long lines rather than many
    // short ones: every write is serialised through one chain, so line count is
    // what this test costs in wall-clock, and 1,200 × 1 KB crosses the ceiling
    // as surely as 40,000 × 30 B did.
    configureScraperLogging(logging({ persistToDisk: true, maxFileSizeMb: 1 }));
    const padding = 'x'.repeat(1_024);
    for (let i = 0; i < 1_200; i += 1) scraperLog('info', 'engine', `${i} ${padding}`);
    await flushScraperLogWrites();
    expect(scraperLogFiles().length).toBeGreaterThan(1);
  });

  it('retentionDays deletes files older than the window, and 0 keeps everything', async () => {
    const fsp = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = path.join(root, 'logs');
    await fsp.mkdir(dir, { recursive: true });
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    const fresh = new Date().toISOString().slice(0, 10);
    await fsp.writeFile(path.join(dir, `scraper-${old}.log`), 'old\n');
    await fsp.writeFile(path.join(dir, `scraper-${fresh}.log`), 'fresh\n');

    configureScraperLogging(logging({ persistToDisk: true, retentionDays: 0 }));
    expect(await pruneOldLogs()).toBe(0);
    expect(scraperLogFiles()).toHaveLength(2);

    configureScraperLogging(logging({ persistToDisk: true, retentionDays: 14 }));
    expect(await pruneOldLogs()).toBe(1);
    expect(scraperLogFiles()).toEqual([`scraper-${fresh}.log`]);
  });

  it('expires by the date in the name, not by mtime', async () => {
    // An appended-to file keeps a fresh mtime and would never expire.
    const fsp = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = path.join(root, 'logs');
    await fsp.mkdir(dir, { recursive: true });
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    const target = path.join(dir, `scraper-${old}.log`);
    await fsp.writeFile(target, 'written just now\n');
    configureScraperLogging(logging({ persistToDisk: true, retentionDays: 7 }));
    expect(await pruneOldLogs()).toBe(1);
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
