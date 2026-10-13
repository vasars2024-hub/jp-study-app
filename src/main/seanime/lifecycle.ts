/**
 * When the media sidecar runs: warm before anyone asks, back by itself after a crash.
 *
 * ## Why this exists
 *
 * The supervisor (`supervisor.ts`) knows how to spawn ONE generation and how to kill it. Who
 * decided *when* used to be the player: `startSeanime()` ran on the first open of a video,
 * so the first video of every session waited for an 80 MB binary to boot, and a sidecar that
 * crashed stayed down — the player said "The media server is offline" with a Start button
 * until the viewer pressed it. The owner's words for that were "loading screens and weird
 * 'server not started' BS".
 *
 * This controller owns the *when*:
 *
 *   1. **Warm** — `warm(delayMs)` asks for a start later (the app calls it a few seconds
 *      after the first paint, and whenever a media surface comes into view). A warm never
 *      competes with boot: it is a timer, and it is dropped if a real `ensure()` came first.
 *   2. **One start at a time** — concurrent `ensure()` calls share one in-flight promise.
 *      Without it two opens racing a stopped sidecar each reserved a port and spawned a
 *      server against the same datadir.
 *   3. **Auto-restart with backoff** — an exit nobody asked for (crash, Task Manager, a hung
 *      server the health check killed) schedules a restart after `RESTART_BACKOFF_MS[n]`.
 *      Only after `MAX_RESTARTS` consecutive failures does the status turn into a stated
 *      failure, which the UI words with a Retry. Retry (`ensure({ manual: true })`) starts
 *      the count over.
 *   4. **Health checks** — while ready, a ping every `HEALTH_INTERVAL_MS`. Two misses in a
 *      row mean the process is alive but not serving (a deadlock, a stuck disk); it is
 *      killed and restarted like a crash.
 *   5. **Stable resets the count** — a generation that stays up `STABLE_MS` clears the
 *      failure count, so a crash next week does not inherit last week's attempts.
 *
 * What it never does: restart after `stop()` (the app is quitting, or the user stopped it),
 * or retry a failure that cannot heal by retrying (`missing-exe`, `disabled`, `spawn-failed`).
 *
 * Kept free of `electron` and `node:*` imports like `keepalive.ts`, so the whole policy is
 * testable with fake timers: the caller supplies the spawn, the kill, the ping and the clock.
 */
import type { SeanimeFailureCode, SeanimeStatus } from '../../shared/seanime';

/** Delay before restart attempt n (0-based); the last entry repeats. */
export const RESTART_BACKOFF_MS: readonly number[] = [250, 1000, 2500, 5000, 10000];
/** Consecutive failed (re)starts before the failure is shown to the user. */
export const MAX_RESTARTS = 5;
/** How often a ready sidecar is pinged. */
export const HEALTH_INTERVAL_MS = 15_000;
/** Consecutive missed pings that count as a hung server. */
export const HEALTH_MISSES_TO_RESTART = 2;
/** A generation up this long clears the failure count. */
export const STABLE_MS = 60_000;

/**
 * Failures a retry on its own cannot fix: never auto-restarted. `spawn-failed` is the OS
 * refusing to run the binary (EACCES, antivirus): five silent retries would only delay the
 * message that says what to do about it. The user's Retry still tries again.
 */
const PERMANENT: ReadonlySet<SeanimeFailureCode> = new Set<SeanimeFailureCode>(['missing-exe', 'disabled', 'spawn-failed']);

export function restartDelayMs(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), RESTART_BACKOFF_MS.length - 1);
  return RESTART_BACKOFF_MS[index] as number;
}

export function isPermanentFailure(status: Pick<SeanimeStatus, 'kind' | 'errorCode'>): boolean {
  if (status.kind === 'disabled') return true;
  return status.kind === 'failed' && status.errorCode != null && PERMANENT.has(status.errorCode);
}

export interface SeanimeLifecycleIo {
  /** Spawn one generation and resolve once it is ready or has failed. */
  spawn(): Promise<SeanimeStatus>;
  /** Kill the running generation, if any. Must not report the exit as unexpected. */
  kill(): void;
  /** Is a generation alive right now (spawned and not exited)? */
  isRunning(): boolean;
  status(): SeanimeStatus;
  /** One health request against the running generation. Resolves false on any failure. */
  ping(): Promise<boolean>;
  /**
   * Say what the controller is doing between generations: `recovering` while a restart is
   * scheduled (the UI keeps its loading frame), `gave-up` once the failure is to be shown.
   */
  report(event: { kind: 'recovering'; attempt: number; delayMs: number; reason: string } | { kind: 'gave-up'; reason: string }): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  log(line: string): void;
}

export interface SeanimeLifecycle {
  /** Start now (or join the start in flight). `manual` is a user's Retry: the count restarts. */
  ensure(options?: { manual?: boolean; reason?: string }): Promise<SeanimeStatus>;
  /** Start after `delayMs` unless something started it first. Never awaits readiness. */
  warm(delayMs: number, reason?: string): void;
  /** The running generation exited without `stop()` asking it to. */
  onUnexpectedExit(reason: string): void;
  /** Stop, and stay stopped until the next `ensure()`/`warm()`. */
  stop(): void;
  /** For tests and diagnostics. */
  snapshot(): { wanted: boolean; attempt: number; restartPending: boolean; warmPending: boolean; inFlight: boolean; healthMisses: number };
}

export function createSeanimeLifecycle(io: SeanimeLifecycleIo): SeanimeLifecycle {
  /** Someone wants the sidecar up. Cleared only by `stop()`. */
  let wanted = false;
  let inFlight: Promise<SeanimeStatus> | null = null;
  /** Consecutive failed starts / crashes since the last stable generation or manual retry. */
  let attempt = 0;
  let restartTimer: unknown = null;
  let warmTimer: unknown = null;
  let healthTimer: unknown = null;
  let stableTimer: unknown = null;
  let healthMisses = 0;
  /** Bumped by `stop()` and every new generation, so stale callbacks drop themselves. */
  let generation = 0;

  const clear = (handle: unknown): null => {
    if (handle !== null) io.clearTimer(handle);
    return null;
  };

  function stopTimers(): void {
    restartTimer = clear(restartTimer);
    warmTimer = clear(warmTimer);
    healthTimer = clear(healthTimer);
    stableTimer = clear(stableTimer);
  }

  function scheduleHealth(gen: number): void {
    healthTimer = clear(healthTimer);
    healthTimer = io.setTimer(() => {
      healthTimer = null;
      if (gen !== generation || !wanted) return;
      void io.ping().then((ok) => {
        if (gen !== generation || !wanted) return;
        if (ok) {
          healthMisses = 0;
          scheduleHealth(gen);
          return;
        }
        healthMisses += 1;
        if (healthMisses < HEALTH_MISSES_TO_RESTART) {
          scheduleHealth(gen);
          return;
        }
        io.log(`lifecycle: ${healthMisses} health checks missed — restarting the media server`);
        healthMisses = 0;
        io.kill();
        scheduleRestart('the media server stopped answering');
      });
    }, HEALTH_INTERVAL_MS);
  }

  function onReady(gen: number): void {
    healthMisses = 0;
    scheduleHealth(gen);
    stableTimer = clear(stableTimer);
    stableTimer = io.setTimer(() => {
      stableTimer = null;
      if (gen === generation) attempt = 0;
    }, STABLE_MS);
  }

  function scheduleRestart(reason: string): void {
    if (!wanted || restartTimer !== null) return;
    healthTimer = clear(healthTimer);
    stableTimer = clear(stableTimer);
    if (attempt >= MAX_RESTARTS) {
      io.log(`lifecycle: giving up after ${attempt} attempts — ${reason}`);
      io.report({ kind: 'gave-up', reason });
      return;
    }
    const delayMs = restartDelayMs(attempt);
    attempt += 1;
    io.log(`lifecycle: restart ${attempt}/${MAX_RESTARTS} in ${delayMs} ms — ${reason}`);
    io.report({ kind: 'recovering', attempt, delayMs, reason });
    restartTimer = io.setTimer(() => {
      restartTimer = null;
      if (!wanted) return;
      void startGeneration();
    }, delayMs);
  }

  function startGeneration(): Promise<SeanimeStatus> {
    if (inFlight) return inFlight;
    if (io.isRunning()) return Promise.resolve(io.status());
    const gen = ++generation;
    const run = io
      .spawn()
      .catch((err: unknown): SeanimeStatus => ({
        ...io.status(),
        kind: 'failed',
        error: `could not start the sidecar: ${String(err)}`,
        errorCode: 'spawn-failed',
      }))
      .then((status) => {
        if (gen !== generation) return status;
        if (status.kind === 'ready') {
          onReady(gen);
        } else if (wanted && !isPermanentFailure(status)) {
          scheduleRestart(status.error ?? status.errorCode ?? status.kind);
        }
        return io.status();
      });
    const tracked: Promise<SeanimeStatus> = run.finally(() => {
      if (inFlight === tracked) inFlight = null;
    });
    inFlight = tracked;
    return tracked;
  }

  return {
    ensure(options = {}): Promise<SeanimeStatus> {
      wanted = true;
      warmTimer = clear(warmTimer);
      if (options.manual) {
        attempt = 0;
        restartTimer = clear(restartTimer);
      } else if (restartTimer !== null && !inFlight) {
        // A restart is already counting down: an open should not wait out the backoff.
        restartTimer = clear(restartTimer);
      }
      return startGeneration();
    },
    warm(delayMs, reason = 'warm'): void {
      if (warmTimer !== null || inFlight || io.isRunning()) return;
      if (isPermanentFailure(io.status())) return;
      warmTimer = io.setTimer(() => {
        warmTimer = null;
        if (inFlight || io.isRunning() || restartTimer !== null) return;
        io.log(`lifecycle: warming the media server (${reason})`);
        wanted = true;
        void startGeneration();
      }, Math.max(0, delayMs));
    },
    onUnexpectedExit(reason): void {
      // A crash during a start is that start's failure: its own `.then` schedules the retry.
      if (inFlight) return;
      generation += 1;
      healthTimer = clear(healthTimer);
      stableTimer = clear(stableTimer);
      if (!wanted) return;
      scheduleRestart(reason);
    },
    stop(): void {
      wanted = false;
      generation += 1;
      attempt = 0;
      healthMisses = 0;
      stopTimers();
      io.kill();
    },
    snapshot: () => ({
      wanted,
      attempt,
      restartPending: restartTimer !== null,
      warmPending: warmTimer !== null,
      inFlight: inFlight !== null,
      healthMisses,
    }),
  };
}
