// The Scraper's scheduled-task runner.
//
// Scheduler configuration lives in the renderer (it is part of the per-profile
// settings document), but the runner has to live here: a scrape must fire on
// time whether or not the Scraper window is open, and only main can outlive a
// closed window. The renderer therefore *syncs* its configuration down on every
// change, and main owns everything after that — the clock, the firing decision,
// and the per-entry run record.
//
// The decision itself is `planSchedulerTick` in shared/scraperCron.ts, which is
// pure. This module is the part that cannot be pure: timers, job starts and the
// state file.

import { powerMonitor } from 'electron';
import {
  planSchedulerTick,
  type SchedulerTickDecision,
} from '../../shared/scraperCron';
import type { ScraperSchedulerState, ScraperSchedulerSyncInput } from '../../shared/scraperIpc';
import { isRunningStage, type ScrapeJobEvent } from '../../shared/scraperResults';
import { activeJobCount, startScrape, type JobEmitter } from './engine';
import { scraperLog } from './logBus';
import { notifyScraper } from './notifications';
import { readScraperJson, writeScraperJson } from './store';

const STATE_FILE = 'scheduler-state.json';
/**
 * The last configuration the renderer synced, beside the run record.
 *
 * Without it the runner had nothing to run after a restart until the Scheduled
 * Tasks page happened to be opened — the timer ticked, found no config and
 * returned, so "scrape every night" silently meant "every night I open that
 * page". The app also pushes on start and on every settings save; this file is
 * what covers the gap before that push lands, and a start with no window.
 */
const CONFIG_FILE = 'scheduler-config.json';

/** How often the runner re-evaluates. One minute is cron's own resolution. */
const TICK_MS = 60_000;

/**
 * A short first tick so a schedule that came due while the app was closed is
 * picked up shortly after boot instead of up to a minute later.
 */
const FIRST_TICK_MS = 5_000;

interface EntryRecord {
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastJobId: string | null;
  /**
   * The cron `nextRunAt` was derived from. Kept so an edited expression can be
   * detected and the stale next-run time discarded — otherwise the screen goes
   * on showing a time the new cron would never produce.
   */
  cron: string;
}

type StateFile = Record<string, EntryRecord>;

interface Runtime {
  config: ScraperSchedulerSyncInput | null;
  records: StateFile;
  /** Job ids the scheduler itself started and has not seen finish. */
  running: Set<string>;
  heldBy: SchedulerTickDecision['heldBy'];
  timer: NodeJS.Timeout | null;
  emit: JobEmitter | null;
  onState: ((state: ScraperSchedulerState) => void) | null;
  loaded: boolean;
}

const runtime: Runtime = {
  config: null,
  records: {},
  running: new Set(),
  heldBy: 'disabled',
  timer: null,
  emit: null,
  onState: null,
  loaded: false,
};

function record(id: string): EntryRecord {
  const existing = runtime.records[id];
  if (existing) return existing;
  const fresh: EntryRecord = { lastRunAt: null, nextRunAt: null, lastJobId: null, cron: '' };
  runtime.records[id] = fresh;
  return fresh;
}

export function schedulerState(): ScraperSchedulerState {
  const entries = runtime.config?.scheduler.entries ?? [];
  return {
    heldBy: runtime.heldBy,
    runningJobIds: [...runtime.running],
    entries: entries.map((entry) => {
      const stored = runtime.records[entry.id];
      return {
        id: entry.id,
        lastRunAt: stored?.lastRunAt ?? null,
        nextRunAt: stored?.nextRunAt ?? null,
        lastJobId: stored?.lastJobId ?? null,
      };
    }),
  };
}

function publish(): void {
  runtime.onState?.(schedulerState());
}

// Writes are chained rather than fired in parallel: the store writes through a
// temp file named per-process, so two overlapping saves would race on the same
// path. A tick and a "Run now" landing together is entirely normal.
let persistChain: Promise<void> = Promise.resolve();

function persist(): Promise<void> {
  persistChain = persistChain
    .then(() => writeScraperJson(STATE_FILE, { ...runtime.records }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      scraperLog('warn', 'scheduler', `Could not save scheduler state: ${message}`);
    });
  return persistChain;
}

/** Resolves once every queued save has landed. Used at shutdown and in tests. */
export function whenSchedulerPersisted(): Promise<void> {
  return Promise.all([persistChain, configChain]).then(() => undefined);
}

/**
 * A stored config is only trusted in the shape a sync produces: a scheduler
 * with an entry list and a settings object. Anything else is ignored rather
 * than run — a half-read file must not fire scrapes.
 */
function storedConfig(value: unknown): ScraperSchedulerSyncInput | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ScraperSchedulerSyncInput>;
  const scheduler = candidate.scheduler as Partial<ScraperSchedulerSyncInput['scheduler']> | undefined;
  if (!scheduler || typeof scheduler !== 'object' || !Array.isArray(scheduler.entries)) return null;
  if (!candidate.settings || typeof candidate.settings !== 'object') return null;
  const entries = scheduler.entries.filter((entry) =>
    entry && typeof entry === 'object'
    && typeof entry.id === 'string' && entry.id
    && typeof entry.cron === 'string'
    && typeof entry.targetUrl === 'string');
  return {
    ...(candidate as ScraperSchedulerSyncInput),
    scheduler: { ...(scheduler as ScraperSchedulerSyncInput['scheduler']), entries },
  };
}

let configChain: Promise<void> = Promise.resolve();

function persistConfig(config: ScraperSchedulerSyncInput): Promise<void> {
  configChain = configChain
    .then(() => writeScraperJson(CONFIG_FILE, config))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      scraperLog('warn', 'scheduler', `Could not save the schedule configuration: ${message}`);
    });
  return configChain;
}

async function load(): Promise<void> {
  if (runtime.loaded) return;
  runtime.loaded = true;
  // A sync that already arrived is newer than anything on disk.
  if (!runtime.config) {
    runtime.config = storedConfig(await readScraperJson<unknown>(CONFIG_FILE, null));
    if (runtime.config) {
      scraperLog(
        'info',
        'scheduler',
        `Loaded ${runtime.config.scheduler.entries.length} schedule(s) saved by the last session.`,
      );
    }
  }
  const stored = await readScraperJson<StateFile>(STATE_FILE, {});
  // Anything that is not the shape we wrote is discarded rather than trusted;
  // a bad nextRunAt would otherwise make an entry fire on every tick.
  for (const [id, value] of Object.entries(stored ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Partial<EntryRecord>;
    runtime.records[id] = {
      lastRunAt: typeof item.lastRunAt === 'string' ? item.lastRunAt : null,
      nextRunAt: typeof item.nextRunAt === 'string' ? item.nextRunAt : null,
      lastJobId: typeof item.lastJobId === 'string' ? item.lastJobId : null,
      cron: typeof item.cron === 'string' ? item.cron : '',
    };
  }
}

/**
 * Starts one entry now, regardless of its cron. Used both by the tick and by
 * the screen's "Run now" button, so a manual run is recorded identically to a
 * scheduled one.
 */
export function runScheduleNow(entryId: string): string | null {
  const config = runtime.config;
  const entry = config?.scheduler.entries.find((item) => item.id === entryId);
  if (!config || !entry) {
    scraperLog('warn', 'scheduler', `No schedule "${entryId}" to run.`);
    return null;
  }
  const emit = runtime.emit;
  if (!emit) return null;

  const jobId = startScrape(
    {
      request: {
        targetUrl: entry.targetUrl,
        profileId: entry.profileId,
        sourceId: '',
      },
      settings: config.settings,
      context: config.context,
    },
    emit,
  );

  const stored = record(entry.id);
  stored.lastRunAt = new Date().toISOString();
  stored.lastJobId = jobId;
  runtime.running.add(jobId);
  scraperLog('info', 'scheduler', `"${entry.label}" started job ${jobId}.`, {
    correlationId: jobId,
  });
  // Fires for "Run now" as well as for the timer. The setting's own label is
  // "Scheduled Run Started", and a manual start of a schedule is still that —
  // suppressing it would make the toggle mean something narrower than it says.
  notifyScraper('schedule-run', config.settings.notifications, {
    subject: entry.label,
    count: 0,
    correlationId: jobId,
  });
  void persist();
  publish();
  return jobId;
}

/**
 * Whether the machine is running on battery.
 *
 * The one signal `scheduler.requireExternalPower` can act on. A platform or a
 * test double that cannot answer is treated as mains power: holding every
 * schedule because the question could not be asked would be the worse failure.
 *
 * There is deliberately no equivalent for `requireUnmeteredNetwork` — Electron
 * exposes no metered-connection signal on any platform, and inferring one from
 * the interface type would be a guess presented as a fact.
 */
function onBatteryPower(): boolean {
  try {
    return powerMonitor.isOnBatteryPower() === true;
  } catch {
    return false;
  }
}

async function tick(nowMs = Date.now()): Promise<void> {
  await load();
  const config = runtime.config;
  if (!config) return;

  const scheduler = config.scheduler;

  // An edited cron invalidates whatever next-run time was derived from the old
  // one. Dropping it here makes the planner reseed from the new expression.
  for (const entry of scheduler.entries) {
    const stored = record(entry.id);
    if (stored.cron === entry.cron) continue;
    stored.cron = entry.cron;
    stored.nextRunAt = null;
  }

  const plan = planSchedulerTick({
    enabled: scheduler.enabled,
    entries: scheduler.entries.map((entry) => ({
      id: entry.id,
      cron: entry.cron,
      enabled: entry.enabled,
      lastRunAt: record(entry.id).lastRunAt,
      nextRunAt: record(entry.id).nextRunAt,
    })),
    nowMs,
    quietHoursStart: scheduler.quietHoursStart,
    quietHoursEnd: scheduler.quietHoursEnd,
    maxConcurrentScheduled: scheduler.maxConcurrentScheduled,
    runningScheduled: runtime.running.size,
    skipIfRunning: scheduler.skipIfRunning,
    anyJobRunning: activeJobCount() > 0,
    missedRunPolicy: scheduler.missedRunPolicy,
    requireExternalPower: scheduler.requireExternalPower,
    onBattery: onBatteryPower(),
  });

  for (const [id, at] of Object.entries(plan.nextRunAt)) record(id).nextRunAt = at;

  const wasHeld = runtime.heldBy;
  runtime.heldBy = plan.heldBy;
  if (plan.heldBy && plan.heldBy !== 'nothing-due' && plan.heldBy !== wasHeld) {
    scraperLog('info', 'scheduler', `Scheduled runs held: ${plan.heldBy}.`);
  }

  for (const id of plan.due) runScheduleNow(id);

  await persist();
  publish();
}

/**
 * Frees a concurrency slot when one of our jobs reaches a terminal stage.
 *
 * Driven by job *events* rather than the engine's finished hook, because that
 * hook only fires on success — a failed or cancelled scheduled run would
 * otherwise hold its slot until the app restarts.
 */
export function noteJobEvent(jobId: string, event: ScrapeJobEvent): void {
  if (!runtime.running.has(jobId)) return;
  const terminal =
    (event.kind === 'stage' && !isRunningStage(event.stage)) ||
    event.kind === 'done' ||
    event.kind === 'error';
  if (!terminal) return;
  runtime.running.delete(jobId);
  publish();
}

/**
 * Accepts a configuration push from the renderer. Returns the state right
 * after, so the screen can render real next-run times on its first paint
 * instead of waiting a tick.
 */
export async function syncScheduler(
  input: ScraperSchedulerSyncInput,
): Promise<ScraperSchedulerState> {
  await load();
  runtime.config = input;
  void persistConfig(input);

  // Forget records for entries that no longer exist, so a deleted-and-recreated
  // schedule does not inherit the old one's run history.
  const live = new Set(input.scheduler.entries.map((entry) => entry.id));
  for (const id of Object.keys(runtime.records)) {
    if (!live.has(id)) delete runtime.records[id];
  }

  // Recompute immediately rather than at the next tick: the cron may have just
  // been edited, and showing its old next-run time for a minute looks broken.
  await tick();
  return schedulerState();
}

export function startScheduler(emit: JobEmitter, onState: (state: ScraperSchedulerState) => void): void {
  runtime.emit = emit;
  runtime.onState = onState;
  if (runtime.timer) return;
  const arm = (delay: number) => {
    runtime.timer = setTimeout(() => {
      void tick().finally(() => arm(TICK_MS));
    }, delay);
  };
  arm(FIRST_TICK_MS);
}

export function stopScheduler(): void {
  if (runtime.timer) clearTimeout(runtime.timer);
  runtime.timer = null;
}

/** Test seam — forgets configuration, records and in-flight jobs. */
export function resetScheduler(): void {
  stopScheduler();
  runtime.config = null;
  runtime.records = {};
  runtime.running = new Set();
  runtime.heldBy = 'disabled';
  runtime.emit = null;
  runtime.onState = null;
  runtime.loaded = false;
}

/** Test seam — runs one tick at a caller-chosen instant. */
export async function tickSchedulerAt(nowMs: number): Promise<void> {
  await tick(nowMs);
}
