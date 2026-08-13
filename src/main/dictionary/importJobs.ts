// The main-process half of the dictionary import bridge: one job at a time,
// observable from the renderer, cancellable, and recoverable after a reload.
//
// The invariants this module exists to hold:
//
//   * **One job at a time.** Two concurrent imports would contend for the same
//     SQLite write lock and one would sit on `busy_timeout` until it failed.
//     A second `start` while one is running is refused, loudly, with the running
//     job's snapshot attached so the caller can just show that instead.
//   * **Progress never implies success.** The snapshot keeps `status` and
//     `terminal` separate, so a renderer that reconnects mid-import sees
//     `running` and cannot render a committed count that does not exist yet.
//   * **A terminal snapshot survives the renderer.** It is kept after the worker
//     exits until the next job starts, so a window reloaded at the wrong moment
//     recovers the outcome rather than showing an import that vanished.
//   * **A dead worker is a failure, not a silence.** If the process exits
//     without sending a terminal message, that is reported as `failed`.

import path from 'node:path';
import type {
  DictionaryImportJobSnapshot,
  DictionaryImportRequest,
  DictionaryImportWorkerIn,
  DictionaryImportWorkerOut,
} from '../../shared/dictionaryImportJob';

/** The slice of Electron's `UtilityProcess` this module uses. */
export interface ImportWorkerHandle {
  postMessage(message: DictionaryImportWorkerIn): void;
  kill(): boolean;
  on(event: 'message', listener: (message: DictionaryImportWorkerOut) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
}

export interface DictionaryImportJobDeps {
  /** Spawns the worker. Injected so the state machine is testable without Electron. */
  spawn: () => ImportWorkerHandle;
  /** `userData/dictionary` — resolved by the caller, because the worker has no `app`. */
  dbDir: () => string;
  /** `userData/yomitan` — the legacy stores' root. */
  legacyRoot: () => string;
  /** Called for every snapshot change, running or terminal. */
  onSnapshot?: (snapshot: DictionaryImportJobSnapshot) => void;
  /** Ids only need to be unique within a session. */
  newJobId?: () => string;
}

export type DictionaryImportStartResult =
  | { ok: true; snapshot: DictionaryImportJobSnapshot }
  | { ok: false; error: 'busy' | 'unsupported'; snapshot?: DictionaryImportJobSnapshot };

interface ActiveJob {
  snapshot: DictionaryImportJobSnapshot;
  worker: ImportWorkerHandle;
  cancelling: boolean;
}

export class DictionaryImportJobs {
  private active: ActiveJob | null = null;

  /** Kept after the worker exits so a reloaded renderer can still read it. */
  private last: DictionaryImportJobSnapshot | null = null;

  private sequence = 0;

  constructor(private readonly deps: DictionaryImportJobDeps) {}

  /** The running job if there is one, otherwise the most recent outcome. */
  current(): DictionaryImportJobSnapshot | null {
    return this.active?.snapshot ?? this.last;
  }

  running(): boolean {
    return this.active !== null;
  }

  start(request: DictionaryImportRequest): DictionaryImportStartResult {
    if (this.active) return { ok: false, error: 'busy', snapshot: this.active.snapshot };

    const jobId = this.deps.newJobId?.() ?? `dict-import-${Date.now()}-${(this.sequence += 1)}`;
    const snapshot: DictionaryImportJobSnapshot = { jobId, kind: request.kind, status: 'running' };

    let worker: ImportWorkerHandle;
    try {
      worker = this.deps.spawn();
    } catch (error) {
      // A worker that cannot be spawned at all — a missing build entry, most
      // likely — is a failed job, not a thrown IPC call.
      const terminal = this.settle(snapshot, {
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: true, snapshot: terminal };
    }

    this.active = { snapshot, worker, cancelling: false };
    this.last = null;

    worker.on('message', (message) => this.receive(jobId, message));
    worker.on('exit', () => {
      if (this.active?.snapshot.jobId !== jobId) return;
      // The worker went away without a terminal message. Report the cancellation
      // if that is what we asked for, and a failure otherwise — never silence.
      const cancelling = this.active.cancelling;
      this.settle(
        this.active.snapshot,
        cancelling
          ? { state: 'cancelled', counts: {} }
          : { state: 'failed', error: 'The dictionary import process stopped before it finished.' },
      );
    });

    worker.postMessage({
      type: 'start',
      jobId,
      request,
      dbDir: this.deps.dbDir(),
      legacyRoot: this.deps.legacyRoot(),
    });
    this.deps.onSnapshot?.(snapshot);
    return { ok: true, snapshot };
  }

  /**
   * Asks the running job to stop. Cooperative: the importers check between rows
   * and roll their transaction back, so the database keeps whatever it had before.
   */
  cancel(jobId?: string): { ok: boolean; snapshot: DictionaryImportJobSnapshot | null } {
    if (!this.active) return { ok: false, snapshot: this.last };
    if (jobId && jobId !== this.active.snapshot.jobId) return { ok: false, snapshot: this.active.snapshot };
    this.active.cancelling = true;
    this.active.worker.postMessage({ type: 'cancel' });
    return { ok: true, snapshot: this.active.snapshot };
  }

  /** Stops any running import. For app shutdown, where nothing will read a result. */
  dispose(): void {
    if (!this.active) return;
    const worker = this.active.worker;
    this.active = null;
    worker.kill();
  }

  private receive(jobId: string, message: DictionaryImportWorkerOut): void {
    const active = this.active;
    if (!active || active.snapshot.jobId !== jobId || !message || typeof message !== 'object') return;

    if (message.type === 'progress') {
      // Progress for a job we are no longer tracking is stale, not a state change.
      if (message.progress?.jobId !== jobId) return;
      active.snapshot = { ...active.snapshot, progress: message.progress };
      this.deps.onSnapshot?.(active.snapshot);
      return;
    }
    if (message.type === 'terminal' && message.jobId === jobId) {
      this.settle(active.snapshot, message.terminal);
      // The worker deliberately does not exit itself — see `importWorker.ts`.
      // Reaping it here is what makes "terminal message wins over exit" ordered
      // rather than a race the parent loses on a fast failure.
      active.worker.kill();
    }
  }

  private settle(
    snapshot: DictionaryImportJobSnapshot,
    terminal: NonNullable<DictionaryImportJobSnapshot['terminal']>,
  ): DictionaryImportJobSnapshot {
    const settled: DictionaryImportJobSnapshot = {
      ...snapshot,
      status: terminal.state,
      terminal,
    };
    this.active = null;
    this.last = settled;
    this.deps.onSnapshot?.(settled);
    return settled;
  }
}

/**
 * Where Vite writes the worker bundle.
 *
 * `__dirname` is `.vite/build` in both a dev run and a packaged app (this build
 * ships unpacked — see `forge.config.ts`'s `asar: false`), which is the same
 * directory the main bundle is loaded from, so one path covers both.
 */
export function dictionaryImportWorkerPath(): string {
  return path.join(__dirname, 'importWorker.js');
}
