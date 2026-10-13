/**
 * Library imports as a job: progress, cancel and resume.
 *
 * The importers used to run as one synchronous loop inside the IPC handler —
 * a folder of 800 volumes held the main process (every window) until the last
 * archive was unzipped, said nothing while it did, could not be stopped, and a
 * crash half-way left extracted folders no row pointed at. Komga and Kavita
 * scan in the background with a visible task; this is that, sized for Gum.
 *
 * - One job at a time. A second request while one runs is APPENDED to it
 *   (de-duplicated), so two importers never race on library.json.
 * - Between files the loop yields to the event loop, so windows stay live.
 * - Imported items are committed in small batches, not per file (library.json
 *   is rewritten whole on each commit) and not only at the end (a crash keeps
 *   what was done).
 * - The queue is persisted. Before a file is imported its id is recorded as
 *   in-flight; a commit clears it. At the next start `recoverLibraryImport`
 *   removes in-flight folders that never got a row (the app's own partial
 *   copies — the user's source files are only ever read) and offers the rest
 *   of the queue for Resume.
 * - Cancel stops after the current file, commits what was done, and keeps the
 *   unprocessed paths so Resume can pick them up.
 *
 * Electron-free: the per-file import, commit and persistence are injected.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import type { LibraryItem } from '../shared/types';
import type { LibraryImportFailureCode, LibraryImportProgress } from '../shared/libraryManage';

export type { LibraryImportFailureCode, LibraryImportProgress };

export type LibraryImportOutcome =
  | { status: 'imported'; item: LibraryItem }
  | { status: 'duplicate'; existingId: string }
  | { status: 'skipped' }
  | { status: 'failed'; errorCode: LibraryImportFailureCode };

/** What is persisted between runs. */
export interface LibraryImportQueueFile {
  remaining: string[];
  /** Ids whose folder may exist on disk without a library row yet. */
  inflight: string[];
  startedAt: number;
}

export interface LibraryImportJobDeps {
  /** Import one file under the id given (the job records the id first). */
  importOne(filePath: string, id: string, pending: readonly LibraryItem[]): Promise<LibraryImportOutcome>;
  /** Add items to library.json in one write (newest first). */
  commit(items: LibraryItem[]): void;
  /** Persist the queue; null clears it. */
  saveQueue(queue: LibraryImportQueueFile | null): void;
  emit(progress: LibraryImportProgress): void;
  now(): number;
  /** Yield between files (default `setImmediate`). */
  yieldToLoop?: () => Promise<void>;
  /** Commit after this many imports (default 8) … */
  commitEvery?: number;
  /** … or this many ms since the last commit (default 1500). */
  commitAfterMs?: number;
}

const MAX_FAILURES_LISTED = 20;

function pathKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

interface ActiveJob {
  progress: LibraryImportProgress;
  queue: string[];
  queued: Set<string>;
  /** Ids whose folder may be on disk without a committed row. */
  inflight: string[];
  cancelled: boolean;
  startedAt: number;
  promise: Promise<LibraryImportProgress>;
}

export class LibraryImportRunner {
  private active: ActiveJob | null = null;
  private last: LibraryImportProgress | null = null;

  constructor(private readonly deps: LibraryImportJobDeps) {}

  /** The running job's progress, else the last finished one's, else null. */
  status(): LibraryImportProgress | null {
    return this.active ? { ...this.active.progress } : this.last;
  }

  isRunning(): boolean {
    return this.active !== null;
  }

  /**
   * Import `paths`. Joins the running job when there is one; the promise
   * settles when the job that imports these paths ends.
   */
  start(paths: readonly string[]): Promise<LibraryImportProgress> {
    const clean = paths.filter((p) => typeof p === 'string' && p.trim());
    if (this.active) {
      const job = this.active;
      for (const p of clean) {
        const key = pathKey(p);
        if (job.queued.has(key)) continue;
        job.queued.add(key);
        job.queue.push(p);
        job.progress.total += 1;
        job.progress.remaining += 1;
      }
      this.persist(job);
      this.emit(job);
      return job.promise;
    }
    const queued = new Set<string>();
    const queue: string[] = [];
    for (const p of clean) {
      const key = pathKey(p);
      if (queued.has(key)) continue;
      queued.add(key);
      queue.push(p);
    }
    const progress: LibraryImportProgress = {
      jobId: crypto.randomUUID(),
      state: 'running',
      total: queue.length,
      done: 0,
      imported: 0,
      duplicates: 0,
      failed: 0,
      remaining: queue.length,
      failures: [],
      addedIds: [],
    };
    const job: ActiveJob = {
      progress,
      queue,
      queued,
      inflight: [],
      cancelled: false,
      startedAt: this.deps.now(),
      promise: Promise.resolve(progress),
    };
    this.active = job;
    job.promise = this.run(job);
    return job.promise;
  }

  /** Stop after the current file. False when no job (or another job) is running. */
  cancel(jobId?: string): boolean {
    if (!this.active || (jobId && this.active.progress.jobId !== jobId)) return false;
    this.active.cancelled = true;
    return true;
  }

  private emit(job: ActiveJob): void {
    try {
      this.deps.emit({ ...job.progress, failures: [...job.progress.failures], addedIds: [...job.progress.addedIds] });
    } catch {
      /* a closed window must not stop an import */
    }
  }

  private persist(job: ActiveJob): void {
    try {
      this.deps.saveQueue({ remaining: [...job.queue], inflight: [...job.inflight], startedAt: job.startedAt });
    } catch {
      /* resume is a convenience; the import itself carries on */
    }
  }

  private async run(job: ActiveJob): Promise<LibraryImportProgress> {
    const yieldToLoop = this.deps.yieldToLoop ?? (() => new Promise<void>((resolve) => setImmediate(resolve)));
    const commitEvery = Math.max(1, this.deps.commitEvery ?? 8);
    const commitAfterMs = Math.max(0, this.deps.commitAfterMs ?? 1500);
    const progress = job.progress;
    let pending: LibraryItem[] = [];
    let lastCommit = this.deps.now();

    const commit = (): void => {
      if (pending.length) {
        // Newest first, the order every importer has always used.
        this.deps.commit([...pending].reverse());
        progress.addedIds.push(...pending.map((item) => item.id));
        pending = [];
      }
      job.inflight = [];
      lastCommit = this.deps.now();
      this.persist(job);
    };

    try {
      this.persist(job);
      this.emit(job);
      while (job.queue.length && !job.cancelled) {
        const filePath = job.queue[0];
        const id = crypto.randomUUID();
        job.inflight.push(id);
        this.persist(job);
        progress.current = path.basename(filePath);
        this.emit(job);

        let outcome: LibraryImportOutcome;
        try {
          outcome = await this.deps.importOne(filePath, id, pending);
        } catch {
          outcome = { status: 'failed', errorCode: 'unreadable' };
        }
        job.queue.shift();
        progress.done += 1;
        progress.remaining = job.queue.length;
        if (outcome.status === 'imported') {
          pending.push(outcome.item);
          progress.imported += 1;
        } else {
          // Nothing of this id stayed on disk (the importer cleans up after itself).
          job.inflight = job.inflight.filter((x) => x !== id);
          if (outcome.status === 'duplicate') progress.duplicates += 1;
          else if (outcome.status === 'failed') {
            progress.failed += 1;
            if (progress.failures.length < MAX_FAILURES_LISTED) {
              progress.failures.push({ name: path.basename(filePath), errorCode: outcome.errorCode });
            }
          }
        }
        if (pending.length >= commitEvery || this.deps.now() - lastCommit >= commitAfterMs) commit();
        await yieldToLoop();
      }
      commit();
    } finally {
      // Even a commit that threw must not leave the runner wedged as "running".
      progress.current = undefined;
      progress.state = job.cancelled && job.queue.length ? 'cancelled' : 'done';
      progress.remaining = job.queue.length;
      if (progress.state === 'done') {
        try {
          this.deps.saveQueue(null);
        } catch {
          /* the next start finds an empty queue and offers nothing */
        }
      }
      this.active = null;
      this.last = { ...progress };
      this.emit(job);
    }
    return { ...progress };
  }
}

/** Validate a persisted queue file. */
export function normalizeImportQueueFile(value: unknown): LibraryImportQueueFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<LibraryImportQueueFile>;
  const remaining = Array.isArray(raw.remaining) ? raw.remaining.filter((p): p is string => typeof p === 'string' && !!p) : [];
  const inflight = Array.isArray(raw.inflight) ? raw.inflight.filter((p): p is string => typeof p === 'string' && !!p) : [];
  const startedAt = typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? raw.startedAt : 0;
  return { remaining, inflight, startedAt };
}
