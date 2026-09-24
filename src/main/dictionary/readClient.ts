// The main-process half of the dictionary read worker: one long-lived process,
// many reads, and an honest answer to every one of them.
//
// The invariants this module exists to hold:
//
//   * **A read is a question, not a process.** If the worker dies with reads in
//     flight, those reads are answered in this process rather than rejected: the
//     caller asked for a word, and a crashed helper is not a reason to show it
//     "nothing matched".
//   * **A worker that cannot be used is given up on once, out loud.** A spawn that
//     throws (no build entry; a test under plain Node) or a process that exits
//     twice in quick succession flips this client to in-process for the session,
//     and `onFallback` is told why. It never retries silently in a loop.
//   * **Nothing waits forever.** A read the worker has not answered in
//     `timeoutMs` rejects, and the process that stopped answering is replaced.
//
// Kept free of Electron so the state machine can be driven with a fake process;
// `readIpc.ts` is the wiring.

import type {
  DictionaryReadKind,
  DictionaryReadQueries,
  DictionaryReadReply,
  DictionaryReadRequest,
  DictionaryReadResults,
} from './readProtocol';

/** The slice of Electron's `UtilityProcess` this module uses. */
export interface ReadWorkerHandle {
  postMessage(message: DictionaryReadRequest): void;
  kill(): boolean;
  on(event: 'message', listener: (message: DictionaryReadReply) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
}

export type InProcessRead = <K extends DictionaryReadKind>(
  kind: K,
  query: DictionaryReadQueries[K],
) => Promise<DictionaryReadResults[K]>;

export interface DictionaryReadClientDeps {
  /** Spawns the worker. Injected so the state machine is testable without Electron. */
  spawn: () => ReadWorkerHandle;
  /** `userData/dictionary` — resolved by the caller, because the worker has no `app`. */
  dbDir: () => string;
  /** The same read on this process's own handle: the answer to every failure below. */
  inProcess: InProcessRead;
  /** How long an unanswered read waits before it is rejected. */
  timeoutMs?: number;
  /** Called once, when the worker is given up on for the session. */
  onFallback?: (reason: string) => void;
  now?: () => number;
  /**
   * Retire the worker after this long with nothing in flight (0 = never). The
   * worker maps up to 256 MB of the dictionary file and a runtime sweep saw a
   * ~500 MB Node utility process sitting there for the whole session after one
   * lookup; the next read simply spawns a fresh one.
   */
  idleMs?: number;
}

interface Pending {
  kind: DictionaryReadKind;
  query: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const DEFAULT_READ_TIMEOUT_MS = 60_000;

/** See `DictionaryReadClientDeps.idleMs`. */
export const DEFAULT_READ_IDLE_MS = 5 * 60_000;

/** A worker that exits twice, each within this long of being spawned, is broken. */
export const RESPAWN_STORM_MS = 5_000;

export class DictionaryReadClient {
  private worker: ReadWorkerHandle | null = null;
  private readonly pending = new Map<number, Pending>();
  private sequence = 0;
  private inProcessOnly = false;
  private disposed = false;
  private spawnedAt = 0;
  private earlyExits = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: DictionaryReadClientDeps) {}

  /** False once the client answers on this process for the rest of the session. */
  usingWorker(): boolean {
    return !this.inProcessOnly && !this.disposed;
  }

  read<K extends DictionaryReadKind>(
    kind: K,
    query: DictionaryReadQueries[K],
  ): Promise<DictionaryReadResults[K]> {
    return this.readUntyped(kind, query) as Promise<DictionaryReadResults[K]>;
  }

  /** Stops the worker. For app shutdown, where anything in flight rejects. */
  dispose(): void {
    this.disposed = true;
    for (const entry of this.takePending()) {
      entry.reject(new Error('the dictionary read process was shut down'));
    }
    this.dropWorker();
  }

  private readUntyped(kind: DictionaryReadKind, query: unknown): Promise<unknown> {
    if (!this.usingWorker()) return this.inProcess(kind, query);
    this.clearIdle();
    const worker = this.ensureWorker();
    if (!worker) return this.inProcess(kind, query);

    const id = (this.sequence += 1);
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.timedOut(id), this.timeoutMs());
      timer.unref?.();
      this.pending.set(id, { kind, query, resolve, reject, timer });
      try {
        worker.postMessage({ type: 'read', id, dbDir: this.deps.dbDir(), kind, query });
      } catch (error) {
        // The channel is gone before `exit` has fired. Same answer as an exit:
        // this read, and everything else in flight, is answered here.
        this.giveUp(`the read process could not be messaged: ${describe(error)}`);
      }
    });
  }

  private inProcess(kind: DictionaryReadKind, query: unknown): Promise<unknown> {
    return this.deps.inProcess(kind as never, query as never);
  }

  private ensureWorker(): ReadWorkerHandle | null {
    if (this.worker) return this.worker;
    let worker: ReadWorkerHandle;
    try {
      worker = this.deps.spawn();
    } catch (error) {
      this.giveUp(`the read process could not be started: ${describe(error)}`);
      return null;
    }
    this.worker = worker;
    this.spawnedAt = this.now();
    worker.on('message', (message) => this.receive(worker, message));
    worker.on('exit', () => this.exited(worker));
    return worker;
  }

  private receive(worker: ReadWorkerHandle, message: DictionaryReadReply): void {
    // A process already replaced or killed may still flush a reply; nothing is
    // waiting on it, and its id could collide with a live read's.
    if (this.worker !== worker) return;
    if (!message || typeof message !== 'object' || message.type !== 'readResult') return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.ok) entry.resolve(message.value);
    else entry.reject(new Error(message.error));
    if (!this.pending.size) this.armIdle();
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private armIdle(): void {
    this.clearIdle();
    const idleMs = this.deps.idleMs ?? DEFAULT_READ_IDLE_MS;
    if (idleMs <= 0 || !this.worker) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      // Only a quiet worker is retired; `dropWorker` detaches it first, so its
      // exit is not counted as a crash.
      if (!this.pending.size) this.dropWorker();
    }, idleMs);
    this.idleTimer.unref?.();
  }

  private exited(worker: ReadWorkerHandle): void {
    if (this.worker !== worker) return;
    this.worker = null;
    const inflight = this.takePending();
    if (this.now() - this.spawnedAt < RESPAWN_STORM_MS) {
      this.earlyExits += 1;
      if (this.earlyExits >= 2) this.giveUp('the read process exited twice in quick succession');
    } else {
      this.earlyExits = 0;
    }
    // Answered here rather than rejected: see the first invariant above. The next
    // read spawns a fresh process unless the line above gave up on it.
    this.refireInProcess(inflight);
  }

  private timedOut(id: number): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    entry.reject(new Error(`the dictionary read process did not answer within ${this.timeoutMs()} ms`));
    // The process that stopped answering is not one to keep sending to. Everything
    // else in flight on it is answered here; the next read spawns a fresh one.
    const others = this.takePending();
    this.dropWorker();
    this.refireInProcess(others);
  }

  private giveUp(reason: string): void {
    const first = !this.inProcessOnly;
    this.inProcessOnly = true;
    if (first) this.deps.onFallback?.(reason);
    const inflight = this.takePending();
    this.dropWorker();
    this.refireInProcess(inflight);
  }

  private dropWorker(): void {
    this.clearIdle();
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    try {
      worker.kill();
    } catch {
      // Already gone; that is the state we wanted.
    }
  }

  private takePending(): Pending[] {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) clearTimeout(entry.timer);
    return entries;
  }

  private refireInProcess(entries: Pending[]): void {
    for (const entry of entries) {
      this.inProcess(entry.kind, entry.query).then(entry.resolve, entry.reject);
    }
  }

  private timeoutMs(): number {
    return this.deps.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
