/**
 * Run the FSRS optimiser in a Web Worker, with progress and cancel.
 *
 * One worker per run: cancelling terminates it, which is the only way to stop a
 * synchronous fit part-way. Where no worker can be made (a test environment, or
 * a spawn that throws) the fit runs on this thread after a yield, as
 * `csvParseAsync.ts` does — a busy button is better than no optimiser. A worker
 * that crashes is NOT retried inline: the caller shows the error instead.
 *
 * Only types come from `shared/fsrsOptimizer` statically; the optimiser itself
 * is in the worker bundle (or loaded on demand by the fallback), so the panel
 * that calls this does not carry it.
 */
import type { FsrsHoldoutOptions, FsrsHoldoutResult, FsrsLogEntryLike } from '../shared/fsrsOptimizer';

export class FsrsOptimizerCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'FsrsOptimizerCancelled';
  }
}

export interface FsrsOptimizerJob {
  result: Promise<FsrsHoldoutResult>;
  /** Stop the fit; `result` rejects with `FsrsOptimizerCancelled`. No-op once settled. */
  cancel: () => void;
}

type WorkerReply =
  | { id: number; kind: 'progress'; fraction: number }
  | { id: number; kind: 'done'; result: FsrsHoldoutResult }
  | { id: number; kind: 'error'; message: string };

type RunOptions = Omit<FsrsHoldoutOptions, 'onProgress'>;

let nextId = 1;

function spawnWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./workers/fsrsOptimizer.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/** Keep only the fields the optimiser reads: a 50k-row log is cloned to the worker. */
function slim(entries: readonly FsrsLogEntryLike[]): FsrsLogEntryLike[] {
  return entries.map((entry) => ({
    mode: entry.mode,
    at: entry.at,
    ...(entry.source !== undefined ? { source: entry.source } : {}),
    ...(entry.cardId !== undefined ? { cardId: entry.cardId } : {}),
    ...(entry.rating !== undefined ? { rating: entry.rating } : {}),
    ...(entry.isNew ? { isNew: true } : {}),
  }));
}

function runInline(
  entries: FsrsLogEntryLike[],
  options: RunOptions,
  onProgress?: (fraction: number) => void,
): FsrsOptimizerJob {
  let settled = false;
  let rejectOuter: (error: Error) => void = () => undefined;
  const result = new Promise<FsrsHoldoutResult>((resolve, reject) => {
    rejectOuter = reject;
    void (async () => {
      const optimizer = await import('../shared/fsrsOptimizer');
      // Yield so the busy state paints before the synchronous fit starts.
      await new Promise((r) => setTimeout(r, 0));
      if (settled) return;
      return optimizer.optimizeFsrsWithHoldout(entries, { ...options, onProgress });
    })().then(
      (value) => {
        if (settled || !value) return;
        settled = true;
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
  return {
    result,
    cancel: () => {
      if (settled) return;
      settled = true;
      rejectOuter(new FsrsOptimizerCancelled());
    },
  };
}

export function runFsrsOptimizer(
  entries: readonly FsrsLogEntryLike[],
  options: RunOptions = {},
  onProgress?: (fraction: number) => void,
): FsrsOptimizerJob {
  const payload = slim(entries);
  const worker = spawnWorker();
  if (!worker) return runInline(payload, options, onProgress);

  const id = nextId++;
  let settled = false;
  let resolveOuter: (value: FsrsHoldoutResult) => void = () => undefined;
  let rejectOuter: (error: Error) => void = () => undefined;
  const result = new Promise<FsrsHoldoutResult>((resolve, reject) => {
    resolveOuter = resolve;
    rejectOuter = reject;
  });
  const finish = (settle: () => void): void => {
    if (settled) return;
    settled = true;
    worker.terminate();
    settle();
  };

  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    if (!reply || reply.id !== id) return;
    if (reply.kind === 'progress') {
      if (!settled) onProgress?.(reply.fraction);
    } else if (reply.kind === 'done') {
      finish(() => resolveOuter(reply.result));
    } else {
      finish(() => rejectOuter(new Error(reply.message)));
    }
  };
  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault?.();
    finish(() => rejectOuter(new Error(event.message || 'FSRS optimizer worker failed')));
  };
  worker.onmessageerror = () => {
    finish(() => rejectOuter(new Error('FSRS optimizer worker sent an unreadable message')));
  };
  worker.postMessage({ id, entries: payload, options });

  return { result, cancel: () => finish(() => rejectOuter(new FsrsOptimizerCancelled())) };
}
