// @vitest-environment node
//
// Exercises the runner half of the scheduler — the part `scraperCron.test.ts`
// cannot cover because it is all timers, job starts and a state file. The
// engine is stubbed so no network is touched; what is under test is whether the
// right entries fire, whether their slots free up again, and whether the run
// record survives a restart.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ScrapeJobEvent } from '../../shared/scraperResults';
import type { ScraperSchedulerSyncInput } from '../../shared/scraperIpc';
import type { ScraperScheduleEntry } from '../../shared/scraperOutputSettings';
import type { ScraperNotice } from '../../shared/scraperNotices';

let tempRoot = '';
/** What `powerMonitor.isOnBatteryPower()` answers this test. */
let onBattery = false;

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot, getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
  powerMonitor: { isOnBatteryPower: () => onBattery },
}));

/** Jobs the stubbed engine was asked to start, newest last. */
const started: { jobId: string; targetUrl: string; profileId: string }[] = [];
let engineActiveJobs = 0;
let jobSeq = 0;

vi.mock('../scraper/engine', () => ({
  startScrape: (input: { request: { targetUrl: string; profileId: string } }) => {
    jobSeq += 1;
    const jobId = `job-test-${jobSeq}`;
    started.push({
      jobId,
      targetUrl: input.request.targetUrl,
      profileId: input.request.profileId,
    });
    return jobId;
  },
  activeJobCount: () => engineActiveJobs,
}));

const scheduler = await import('../scraper/scheduler');
const notifications = await import('../scraper/notifications');
const { setScraperStoreRoot, scraperStorePath } = await import('../scraper/store');
const { DEFAULT_SCRAPER_SETTINGS } = await import('../../shared/scraperSettings');
const { DEFAULT_SCRAPER_SCHEDULER_SETTINGS } = await import('../../shared/scraperOutputSettings');

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'scraper-scheduler-'));
  setScraperStoreRoot(path.join(tempRoot, 'scraper'));
});

afterAll(async () => {
  setScraperStoreRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

function at(y: number, m: number, d: number, hh = 0, mm = 0): number {
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

/**
 * main owns every next-run time — an entry's stored `nextRunAt` is deliberately
 * ignored on sync, so the only way to set up a due slot is to sync at a known
 * instant and then tick past it. Hence a fixed clock for the whole file.
 */
const NOW = at(2026, 7, 27, 2, 0);

beforeEach(async () => {
  started.length = 0;
  engineActiveJobs = 0;
  jobSeq = 0;
  onBattery = false;
  scheduler.resetScheduler();
  notifications.resetScraperNotifications();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // With their .bak: a .bak without its primary counts as damage and would be
  // reinstated, carrying the previous test's fired slots back in.
  for (const name of ['scheduler-state.json', 'scheduler-config.json']) {
    await fsp.rm(scraperStorePath(name), { force: true });
    await fsp.rm(scraperStorePath(`${name}.bak`), { force: true });
  }
});

afterEach(async () => {
  scheduler.stopScheduler();
  notifications.resetScraperNotifications();
  await scheduler.whenSchedulerPersisted();
  vi.useRealTimers();
});

function entry(over: Partial<ScraperScheduleEntry> = {}): ScraperScheduleEntry {
  return {
    id: 'nightly',
    label: 'Nightly refresh',
    cron: '0 3 * * *',
    targetUrl: 'https://anilist.co/anime/21/ONE-PIECE',
    profileId: 'balanced',
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    ...over,
  };
}

function sync(entries: ScraperScheduleEntry[], over: Partial<ScraperSchedulerSyncInput['scheduler']> = {}) {
  return scheduler.syncScheduler({
    scheduler: {
      ...DEFAULT_SCRAPER_SCHEDULER_SETTINGS,
      enabled: true,
      entries,
      ...over,
    },
    settings: DEFAULT_SCRAPER_SETTINGS,
  });
}

/** The scheduler only starts jobs once an emitter has been attached. */
function attach(): ScrapeJobEvent[] {
  const seen: ScrapeJobEvent[] = [];
  scheduler.startScheduler(
    (_jobId, event) => seen.push(event),
    () => undefined,
  );
  scheduler.stopScheduler(); // keep the emitter, drop the timer
  return seen;
}

describe('syncScheduler', () => {
  it('computes a real next run for a new entry', async () => {
    attach();
    const state = await sync([entry({ cron: '0 3 * * *', nextRunAt: null })]);
    const nextAt = state.entries.find((item) => item.id === 'nightly')?.nextRunAt ?? '';
    expect(nextAt).toBeTruthy();
    const when = new Date(nextAt);
    expect(when.getHours()).toBe(3);
    expect(when.getMinutes()).toBe(0);
    // Seeding a next run is not a reason to fire one.
    expect(started).toEqual([]);
  });

  it('reports null for a cron that can never fire', async () => {
    attach();
    const state = await sync([entry({ cron: '0 0 30 2 *' })]);
    expect(state.entries[0]?.nextRunAt).toBeNull();
  });

  it('reports null for an invalid cron rather than throwing', async () => {
    attach();
    const state = await sync([entry({ cron: 'every night please' })]);
    expect(state.entries[0]?.nextRunAt).toBeNull();
    expect(started).toEqual([]);
  });

  it('forgets the run record of a deleted entry', async () => {
    attach();
    await sync([entry({ id: 'a' }), entry({ id: 'b' })]);
    scheduler.runScheduleNow('a');
    expect(scheduler.schedulerState().entries.find((e) => e.id === 'a')?.lastRunAt).toBeTruthy();

    await sync([entry({ id: 'b' })]);
    const state = scheduler.schedulerState();
    expect(state.entries.map((e) => e.id)).toEqual(['b']);

    // Recreating the same id must not inherit the old run.
    await sync([entry({ id: 'a' }), entry({ id: 'b' })]);
    expect(scheduler.schedulerState().entries.find((e) => e.id === 'a')?.lastRunAt).toBeNull();
  });

  it('says the scheduler is off when it is disabled', async () => {
    attach();
    const state = await sync([entry()], { enabled: false });
    expect(state.heldBy).toBe('disabled');
  });

  // Editing the expression must not leave a next-run time the new cron could
  // never produce — the screen would show a date that simply never arrives.
  it('recomputes the next run when the cron is edited', async () => {
    attach();
    const before = await sync([entry({ cron: '0 3 * * *' })]);
    expect(before.entries[0]?.nextRunAt).toBe(new Date(at(2026, 7, 27, 3, 0)).toISOString());

    const after = await sync([entry({ cron: '30 5 * * *' })]);
    expect(after.entries[0]?.nextRunAt).toBe(new Date(at(2026, 7, 27, 5, 30)).toISOString());
  });

  it('drops the next run when the cron is edited to something invalid', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })]);
    const after = await sync([entry({ cron: '0 25 * * *' })]);
    expect(after.entries[0]?.nextRunAt).toBeNull();
  });

  it('recovers a next run when a broken cron is corrected', async () => {
    attach();
    await sync([entry({ cron: '0 25 * * *' })]);
    const fixed = await sync([entry({ cron: '0 3 * * *' })]);
    expect(fixed.entries[0]?.nextRunAt).toBe(new Date(at(2026, 7, 27, 3, 0)).toISOString());
  });

  it('keeps the run history when only the cron changes', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })]);
    scheduler.runScheduleNow('nightly');
    const after = await sync([entry({ cron: '30 5 * * *' })]);
    expect(after.entries[0]?.lastJobId).toBe('job-test-1');
  });
});

describe('runScheduleNow', () => {
  it('starts the entry’s target under its own profile', async () => {
    attach();
    await sync([entry({ targetUrl: 'https://anilist.co/anime/154587', profileId: 'thorough' })]);
    const jobId = scheduler.runScheduleNow('nightly');

    expect(jobId).toBe('job-test-1');
    expect(started).toEqual([
      { jobId: 'job-test-1', targetUrl: 'https://anilist.co/anime/154587', profileId: 'thorough' },
    ]);
  });

  it('records the run against the entry', async () => {
    attach();
    await sync([entry()]);
    scheduler.runScheduleNow('nightly');

    const record = scheduler.schedulerState().entries[0];
    expect(record?.lastJobId).toBe('job-test-1');
    expect(record?.lastRunAt).toBeTruthy();
    expect(scheduler.schedulerState().runningJobIds).toEqual(['job-test-1']);
  });

  it('raises the enabled schedule-start notice with the schedule label and job id', async () => {
    const notices: ScraperNotice[] = [];
    notifications.setScraperNoticeSink((notice) => notices.push(notice));
    attach();
    await scheduler.syncScheduler({
      scheduler: {
        ...DEFAULT_SCRAPER_SCHEDULER_SETTINGS,
        enabled: true,
        entries: [entry()],
      },
      settings: {
        ...DEFAULT_SCRAPER_SETTINGS,
        notifications: {
          ...DEFAULT_SCRAPER_SETTINGS.notifications,
          channel: 'toast',
          onScheduleRun: true,
        },
      },
    });

    scheduler.runScheduleNow('nightly');

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      kind: 'schedule-run',
      body: 'Nightly refresh',
      correlationId: 'job-test-1',
    });
  });

  it('runs a paused entry when asked explicitly', async () => {
    attach();
    await sync([entry({ enabled: false })]);
    expect(scheduler.runScheduleNow('nightly')).toBe('job-test-1');
  });

  it('returns null for an unknown entry', async () => {
    attach();
    await sync([entry()]);
    expect(scheduler.runScheduleNow('does-not-exist')).toBeNull();
    expect(started).toEqual([]);
  });

  it('returns null before an emitter is attached', async () => {
    await sync([entry()]);
    expect(scheduler.runScheduleNow('nightly')).toBeNull();
  });
});

describe('tick', () => {
  // Synced at 02:00 with a 03:00 cron, every entry below is armed for 03:00.
  it('fires an entry whose slot has passed', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })]);
    expect(started).toEqual([]);

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started.map((job) => job.jobId)).toEqual(['job-test-1']);
  });

  it('does not fire before the slot arrives', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })]);

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 2, 59));
    expect(started).toEqual([]);
  });

  it('does not fire the same slot twice', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })]);

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 31));
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 4, 0));
    expect(started).toHaveLength(1);
  });

  it('fires again on the following day’s slot', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })]);

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    await scheduler.tickSchedulerAt(at(2026, 7, 28, 3, 30));
    expect(started).toHaveLength(2);
  });

  it('holds during quiet hours', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })], {
      quietHoursStart: '01:00',
      quietHoursEnd: '06:00',
    });

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toEqual([]);
    expect(scheduler.schedulerState().heldBy).toBe('quiet-hours');
  });

  // `requireExternalPower` reads Electron's powerMonitor, which is the only
  // signal in this group that the machine can actually answer.
  it('holds on battery when the schedule requires external power', async () => {
    attach();
    onBattery = true;
    await sync([entry({ cron: '0 3 * * *' })], { requireExternalPower: true });

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toEqual([]);
    expect(scheduler.schedulerState().heldBy).toBe('on-battery');
  });

  it('fires the held run on the next tick after the machine is plugged in', async () => {
    attach();
    onBattery = true;
    await sync([entry({ cron: '0 3 * * *' })], { requireExternalPower: true });
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toEqual([]);

    onBattery = false;
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 31));
    expect(started).toHaveLength(1);
    expect(scheduler.schedulerState().heldBy).toBe('');
  });

  it('fires on battery when the schedule does not require external power', async () => {
    attach();
    onBattery = true;
    await sync([entry({ cron: '0 3 * * *' })], { requireExternalPower: false });

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toHaveLength(1);
  });

  it('holds while another job is running when skipIfRunning is on', async () => {
    attach();
    engineActiveJobs = 1;
    await sync([entry({ cron: '0 3 * * *' })], { skipIfRunning: true });

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toEqual([]);
    expect(scheduler.schedulerState().heldBy).toBe('concurrency');
  });

  it('caps a batch at maxConcurrentScheduled', async () => {
    attach();
    await sync(
      [
        entry({ id: 'a', cron: '0 3 * * *' }),
        entry({ id: 'b', cron: '0 3 * * *' }),
        entry({ id: 'c', cron: '0 3 * * *' }),
      ],
      { maxConcurrentScheduled: 2, skipIfRunning: false },
    );

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toHaveLength(2);
  });

  it('never fires a disabled entry', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *', enabled: false })]);

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toEqual([]);
  });

  it('never fires while the scheduler is off', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })], { enabled: false });

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toEqual([]);
    expect(scheduler.schedulerState().heldBy).toBe('disabled');
  });
});

describe('concurrency slots', () => {
  it('frees a slot when the job finishes', async () => {
    attach();
    await sync([entry()]);
    const jobId = scheduler.runScheduleNow('nightly') ?? '';
    expect(scheduler.schedulerState().runningJobIds).toEqual([jobId]);

    scheduler.noteJobEvent(jobId, { kind: 'stage', stage: 'done' });
    expect(scheduler.schedulerState().runningJobIds).toEqual([]);
  });

  it('frees a slot when the job fails', async () => {
    attach();
    await sync([entry()]);
    const jobId = scheduler.runScheduleNow('nightly') ?? '';

    scheduler.noteJobEvent(jobId, { kind: 'stage', stage: 'failed' });
    expect(scheduler.schedulerState().runningJobIds).toEqual([]);
  });

  it('frees a slot when the job is cancelled', async () => {
    attach();
    await sync([entry()]);
    const jobId = scheduler.runScheduleNow('nightly') ?? '';

    scheduler.noteJobEvent(jobId, { kind: 'stage', stage: 'cancelled' });
    expect(scheduler.schedulerState().runningJobIds).toEqual([]);
  });

  it('frees a slot on an error event', async () => {
    attach();
    await sync([entry()]);
    const jobId = scheduler.runScheduleNow('nightly') ?? '';

    scheduler.noteJobEvent(jobId, { kind: 'error', message: 'upstream 503' });
    expect(scheduler.schedulerState().runningJobIds).toEqual([]);
  });

  it('keeps the slot for a mid-run stage', async () => {
    attach();
    await sync([entry()]);
    const jobId = scheduler.runScheduleNow('nightly') ?? '';

    scheduler.noteJobEvent(jobId, { kind: 'stage', stage: 'parsing' });
    expect(scheduler.schedulerState().runningJobIds).toEqual([jobId]);
  });

  it('ignores events for jobs it did not start', async () => {
    attach();
    await sync([entry()]);
    const jobId = scheduler.runScheduleNow('nightly') ?? '';

    scheduler.noteJobEvent('job-from-the-ui', { kind: 'stage', stage: 'done' });
    expect(scheduler.schedulerState().runningJobIds).toEqual([jobId]);
  });

  it('blocks a tick once every slot is taken', async () => {
    attach();
    await sync([entry({ id: 'a' }), entry({ id: 'b', cron: '0 3 * * *' })], {
      maxConcurrentScheduled: 1,
      skipIfRunning: false,
    });
    scheduler.runScheduleNow('a');
    started.length = 0;

    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    expect(started).toEqual([]);
    expect(scheduler.schedulerState().heldBy).toBe('concurrency');
  });

  it('lets the held entry through once the slot frees', async () => {
    attach();
    await sync([entry({ id: 'a' }), entry({ id: 'b', cron: '0 3 * * *' })], {
      maxConcurrentScheduled: 1,
      skipIfRunning: false,
    });
    const jobId = scheduler.runScheduleNow('a') ?? '';
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 30));
    started.length = 0;

    scheduler.noteJobEvent(jobId, { kind: 'stage', stage: 'done' });
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 31));
    expect(started).toHaveLength(1);
  });
});

describe('persistence', () => {
  it('reloads run records after a restart', async () => {
    attach();
    await sync([entry()]);
    scheduler.runScheduleNow('nightly');
    const before = scheduler.schedulerState().entries[0];
    expect(before?.lastJobId).toBe('job-test-1');
    await scheduler.whenSchedulerPersisted();

    // A restart: everything in memory is gone, only the file survives.
    scheduler.resetScheduler();
    attach();
    const after = await sync([entry()]);
    const record = after.entries.find((item) => item.id === 'nightly');
    expect(record?.lastRunAt).toBe(before?.lastRunAt);
    expect(record?.lastJobId).toBe('job-test-1');
  });

  it('fires after a restart with no sync from the renderer', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })]);
    await scheduler.whenSchedulerPersisted();

    // A restart: memory is gone, nothing re-syncs — no window has opened the
    // Scheduled Tasks page. The run must still happen on time.
    scheduler.resetScheduler();
    attach();
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 0));
    expect(started.map((job) => job.targetUrl)).toEqual([
      'https://anilist.co/anime/21/ONE-PIECE',
    ]);
    expect(scheduler.schedulerState().entries.map((item) => item.id)).toEqual(['nightly']);
  });

  it('runs once on return for a slot missed while the app was closed', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })], { missedRunPolicy: 'run-once' });
    await scheduler.whenSchedulerPersisted();

    // Closed from 02:00 to 06:00, so the 03:00 slot passed with no process.
    scheduler.resetScheduler();
    attach();
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 6, 0));
    expect(started).toHaveLength(1);
    // Once, not once per tick.
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 6, 1));
    expect(started).toHaveLength(1);
  });

  it('skips a missed slot after a restart when told to', async () => {
    attach();
    await sync([entry({ cron: '0 3 * * *' })], { missedRunPolicy: 'skip' });
    await scheduler.whenSchedulerPersisted();

    scheduler.resetScheduler();
    attach();
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 6, 0));
    expect(started).toEqual([]);
  });

  it('does not fire from a config file that is not the shape a sync writes', async () => {
    await fsp.mkdir(path.dirname(scraperStorePath('scheduler-config.json')), { recursive: true });
    await fsp.writeFile(
      scraperStorePath('scheduler-config.json'),
      JSON.stringify({ scheduler: { enabled: true, entries: 'nightly' } }),
      'utf-8',
    );
    attach();
    await scheduler.tickSchedulerAt(at(2026, 7, 27, 3, 0));
    expect(started).toEqual([]);
  });

  it('discards a corrupt state file instead of firing on every tick', async () => {
    await fsp.mkdir(path.dirname(scraperStorePath('scheduler-state.json')), { recursive: true });
    await fsp.writeFile(
      scraperStorePath('scheduler-state.json'),
      JSON.stringify({ nightly: { nextRunAt: 42, lastRunAt: { nope: true }, lastJobId: [] } }),
      'utf-8',
    );

    attach();
    const state = await sync([entry()]);
    const record = state.entries[0];
    expect(record?.lastRunAt).toBeNull();
    expect(record?.lastJobId).toBeNull();
    // A fresh, valid next run was computed in place of the garbage.
    expect(record?.nextRunAt).toBeTruthy();
    expect(started).toEqual([]);
  });
});
