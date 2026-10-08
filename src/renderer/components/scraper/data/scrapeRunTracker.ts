// The New Scrape page's run, held outside the page.
//
// The page is remounted on every navigation (`ScraperApp` keys `<main>` by
// page), so a run kept in component state died with it: leaving mid-scrape and
// coming back showed an empty form while the job carried on, and the unmount
// told the status bar the job had stopped. One tracker per port keeps the run,
// its live rows and its log, and stays subscribed to the job while no page is
// watching, so "done" is still heard and the page can pick the run back up.
//
// It also owns the one race the page could not: a cancel clicked while
// `startScrape` is still in flight has no job id to cancel. The click is
// remembered and sent the moment the id arrives.

import type {
  EpisodeRow,
  LogLine,
  ScrapeJobSummary,
  ScrapeRequest,
  ScrapeResult,
  ScrapeStage,
} from '../../../../shared/scraperResults';
import { isRunningStage } from '../../../../shared/scraperResults';
import type { ScraperPort } from './scraperPort';

export interface ScrapeRunState {
  /** `'pending'` between the click and the id `startScrape` resolves to. */
  jobId: string | null;
  stage: ScrapeStage;
  done: number;
  total: number;
  etaSec: number;
  failed: number;
}

export interface ScrapeRunSnapshot {
  run: ScrapeRunState;
  rows: EpisodeRow[];
  logs: LogLine[];
  result: ScrapeResult | null;
  /** Whatever the engine or the IPC layer threw, raw; the page localises it. */
  error: unknown;
}

export const SCRAPE_RUN_PENDING_ID = 'pending';

const IDLE_RUN: ScrapeRunState = { jobId: null, stage: 'done', done: 0, total: 0, etaSec: 0, failed: 0 };

const IDLE_SNAPSHOT: ScrapeRunSnapshot = { run: IDLE_RUN, rows: [], logs: [], result: null, error: null };

/** Bounded, newest first: an unbounded live log is a memory leak dressed up as a feature. */
const LOG_LIMIT = 500;

export interface ScrapeRunTracker {
  getSnapshot(): ScrapeRunSnapshot;
  subscribe(listener: () => void): () => void;
  start(request: ScrapeRequest): Promise<void>;
  cancel(): Promise<void>;
  /** Picks up a job already running in main (after a reload, or one the scheduler started). */
  adopt(job: Pick<ScrapeJobSummary, 'id' | 'stage'>): void;
  isRunning(): boolean;
}

function publishJobStatus(detail: { active: boolean; lastScrape?: string }) {
  window.dispatchEvent(new CustomEvent('scraper:job-status', { detail }));
}

function runningState(run: ScrapeRunState): boolean {
  return run.jobId !== null && isRunningStage(run.stage);
}

function createScrapeRunTracker(port: ScraperPort): ScrapeRunTracker {
  let snapshot: ScrapeRunSnapshot = IDLE_SNAPSHOT;
  const listeners = new Set<() => void>();
  let offJob: (() => void) | null = null;
  let cancelRequested = false;
  /** Bumped on every start, so a slow `startScrape` from an older click is ignored. */
  let generation = 0;

  const set = (next: Partial<ScrapeRunSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  const patchRun = (next: Partial<ScrapeRunState>) => set({ run: { ...snapshot.run, ...next } });

  const follow = (jobId: string) => {
    offJob?.();
    offJob = port.subscribeJob(jobId, (event) => {
      if (snapshot.run.jobId !== jobId) return;
      switch (event.kind) {
        case 'stage':
          patchRun({ stage: event.stage });
          if (!isRunningStage(event.stage)) publishJobStatus({ active: false });
          break;
        case 'progress':
          patchRun({ done: event.done, total: event.total, etaSec: event.etaSec });
          break;
        case 'row':
          if (!snapshot.rows.some((row) => row.id === event.row.id)) set({ rows: [...snapshot.rows, event.row] });
          break;
        case 'log':
          set({ logs: [event.line, ...snapshot.logs].slice(0, LOG_LIMIT) });
          break;
        case 'done':
          patchRun({ stage: 'done', failed: event.summary.failed });
          publishJobStatus({
            active: false,
            lastScrape: `${event.summary.provider} · ${event.summary.found}/${event.summary.found}`,
          });
          void port.getResult(jobId).then(
            (result) => {
              if (snapshot.run.jobId === jobId) set({ result });
            },
            () => undefined,
          );
          break;
        case 'error':
          patchRun({ stage: 'failed' });
          set({ error: event.message });
          publishJobStatus({ active: false });
          break;
      }
    });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isRunning: () => runningState(snapshot.run),

    async start(request) {
      offJob?.();
      offJob = null;
      cancelRequested = false;
      const mine = ++generation;
      set({
        run: { ...IDLE_RUN, stage: 'queued', jobId: SCRAPE_RUN_PENDING_ID },
        rows: [],
        logs: [],
        result: null,
        error: null,
      });
      publishJobStatus({ active: true });

      let jobId: string;
      try {
        jobId = await port.startScrape(request);
      } catch (error) {
        if (mine !== generation) return;
        patchRun({ jobId: null, stage: 'failed' });
        set({ error });
        publishJobStatus({ active: false });
        return;
      }
      if (mine !== generation) {
        // A newer start replaced this one, which only happens after this one was
        // cancelled while pending: the job it produced is still owed its cancel.
        await port.cancelScrape(jobId).catch(() => undefined);
        return;
      }
      patchRun({ jobId });

      if (cancelRequested) {
        // The user already said stop; the id only now exists to say it to.
        cancelRequested = false;
        patchRun({ stage: 'cancelled' });
        publishJobStatus({ active: false });
        await port.cancelScrape(jobId).catch((error: unknown) => set({ error }));
        return;
      }
      follow(jobId);
    },

    async cancel() {
      const { jobId } = snapshot.run;
      if (!jobId || !runningState(snapshot.run)) return;
      if (jobId === SCRAPE_RUN_PENDING_ID) {
        cancelRequested = true;
        patchRun({ stage: 'cancelled' });
        publishJobStatus({ active: false });
        return;
      }
      try {
        await port.cancelScrape(jobId);
      } catch (error) {
        set({ error });
        return;
      }
      if (snapshot.run.jobId === jobId) patchRun({ stage: 'cancelled' });
      publishJobStatus({ active: false });
    },

    adopt(job) {
      if (runningState(snapshot.run) || !isRunningStage(job.stage)) return;
      generation += 1;
      set({ run: { ...IDLE_RUN, jobId: job.id, stage: job.stage }, rows: [], logs: [], result: null, error: null });
      publishJobStatus({ active: true });
      follow(job.id);
    },
  };
}

const TRACKERS = new WeakMap<ScraperPort, ScrapeRunTracker>();

/** The run tracker for this port, created on first use and kept for the port's lifetime. */
export function scrapeRunTrackerFor(port: ScraperPort): ScrapeRunTracker {
  let tracker = TRACKERS.get(port);
  if (!tracker) {
    tracker = createScrapeRunTracker(port);
    TRACKERS.set(port, tracker);
  }
  return tracker;
}
