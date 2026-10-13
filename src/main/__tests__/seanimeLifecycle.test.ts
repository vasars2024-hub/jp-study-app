// @vitest-environment node
/**
 * The media sidecar's lifecycle policy (`main/seanime/lifecycle.ts`): warm before the first
 * play, one start at a time, auto-restart with backoff after a crash, health checks that
 * restart a hung server, and a stated failure only after a run of failed attempts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeanimeStatus } from '../../shared/seanime';
import {
  createSeanimeLifecycle,
  HEALTH_INTERVAL_MS,
  HEALTH_MISSES_TO_RESTART,
  isPermanentFailure,
  MAX_RESTARTS,
  RESTART_BACKOFF_MS,
  restartDelayMs,
  STABLE_MS,
  type SeanimeLifecycleIo,
} from '../seanime/lifecycle';

function status(kind: SeanimeStatus['kind'], extra: Partial<SeanimeStatus> = {}): SeanimeStatus {
  return { kind, port: 0, pid: null, dataDir: null, version: null, simulatedUser: null, error: null, errorCode: null, logTail: [], ...extra };
}

type Outcome = SeanimeStatus | 'hang';

function harness() {
  let current = status('stopped');
  let running = false;
  const outcomes: Outcome[] = [];
  const pending: Array<(s: SeanimeStatus) => void> = [];
  const reports: Array<{ kind: string; attempt?: number; delayMs?: number }> = [];
  let pingOk = true;
  const io: SeanimeLifecycleIo = {
    spawn: vi.fn(async () => {
      const next = outcomes.shift() ?? status('ready', { port: 4000 });
      if (next === 'hang') {
        return new Promise<SeanimeStatus>((resolve) => pending.push((s) => {
          current = s;
          running = s.kind === 'ready';
          resolve(s);
        }));
      }
      current = next;
      running = next.kind === 'ready';
      return next;
    }),
    kill: vi.fn(() => {
      running = false;
    }),
    isRunning: () => running,
    status: () => current,
    ping: vi.fn(async () => pingOk),
    report: (event) => {
      reports.push(event);
      current = event.kind === 'recovering' ? status('starting', { recovering: true }) : status('failed', { errorCode: 'crashed' });
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    log: () => undefined,
  };
  const life = createSeanimeLifecycle(io);
  return {
    io,
    life,
    reports,
    outcomes,
    pending,
    crash: () => {
      running = false;
      current = status('offline', { errorCode: 'crashed' });
      life.onUnexpectedExit('test crash');
    },
    setPing: (ok: boolean) => {
      pingOk = ok;
    },
    current: () => current,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('backoff table', () => {
  it('grows and then holds at its last step', () => {
    expect(restartDelayMs(0)).toBe(RESTART_BACKOFF_MS[0]);
    expect(restartDelayMs(1)).toBeGreaterThan(restartDelayMs(0));
    expect(restartDelayMs(99)).toBe(RESTART_BACKOFF_MS[RESTART_BACKOFF_MS.length - 1]);
    expect(restartDelayMs(-3)).toBe(RESTART_BACKOFF_MS[0]);
  });

  it('a missing binary or an opt-out is permanent; a crash is not', () => {
    expect(isPermanentFailure(status('failed', { errorCode: 'missing-exe' }))).toBe(true);
    expect(isPermanentFailure(status('disabled'))).toBe(true);
    expect(isPermanentFailure(status('failed', { errorCode: 'crashed' }))).toBe(false);
    expect(isPermanentFailure(status('failed', { errorCode: 'unhealthy' }))).toBe(false);
  });
});

describe('start', () => {
  it('concurrent ensure() calls share ONE spawn', async () => {
    const h = harness();
    h.outcomes.push('hang');
    const a = h.life.ensure();
    const b = h.life.ensure();
    const c = h.life.ensure({ manual: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.io.spawn).toHaveBeenCalledTimes(1);
    h.pending[0]!(status('ready', { port: 4100 }));
    const results = await Promise.all([a, b, c]);
    expect(results.map((r) => r.kind)).toEqual(['ready', 'ready', 'ready']);
    expect(h.io.spawn).toHaveBeenCalledTimes(1);
  });

  it('ensure() on a running sidecar does not spawn again', async () => {
    const h = harness();
    await h.life.ensure();
    await h.life.ensure();
    expect(h.io.spawn).toHaveBeenCalledTimes(1);
  });

  it('a missing binary is answered once and never retried', async () => {
    const h = harness();
    h.outcomes.push(status('failed', { errorCode: 'missing-exe' }));
    const s = await h.life.ensure();
    expect(s).toMatchObject({ kind: 'failed', errorCode: 'missing-exe' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.io.spawn).toHaveBeenCalledTimes(1);
    expect(h.reports).toEqual([]);
  });
});

describe('warm', () => {
  it('starts after the delay, not before', async () => {
    const h = harness();
    h.life.warm(6000);
    await vi.advanceTimersByTimeAsync(5999);
    expect(h.io.spawn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.io.spawn).toHaveBeenCalledTimes(1);
    expect(h.current().kind).toBe('ready');
  });

  it('an ensure() before the warm fires replaces it (one spawn, now)', async () => {
    const h = harness();
    h.life.warm(6000);
    await h.life.ensure();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.io.spawn).toHaveBeenCalledTimes(1);
    expect(h.life.snapshot().warmPending).toBe(false);
  });

  it('a stop cancels a pending warm', async () => {
    const h = harness();
    h.life.warm(1000);
    h.life.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.io.spawn).not.toHaveBeenCalled();
  });

  it('a warm after a permanent failure does nothing', async () => {
    const h = harness();
    h.outcomes.push(status('failed', { errorCode: 'missing-exe' }));
    await h.life.ensure();
    h.life.warm(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.io.spawn).toHaveBeenCalledTimes(1);
  });
});

describe('auto-restart', () => {
  it('a crash is recovered after the first backoff step, reported as recovering', async () => {
    const h = harness();
    await h.life.ensure();
    h.crash();
    expect(h.reports[0]).toMatchObject({ kind: 'recovering', attempt: 1, delayMs: RESTART_BACKOFF_MS[0] });
    expect(h.current()).toMatchObject({ kind: 'starting', recovering: true });
    await vi.advanceTimersByTimeAsync(RESTART_BACKOFF_MS[0]!);
    expect(h.io.spawn).toHaveBeenCalledTimes(2);
    expect(h.current().kind).toBe('ready');
  });

  it('failed restarts back off step by step, then give up with a stated failure', async () => {
    const h = harness();
    await h.life.ensure();
    for (let i = 0; i < MAX_RESTARTS; i++) h.outcomes.push(status('failed', { errorCode: 'unhealthy' }));
    h.crash();
    for (let i = 0; i < MAX_RESTARTS; i++) {
      expect(h.reports[i]).toMatchObject({ kind: 'recovering', attempt: i + 1, delayMs: restartDelayMs(i) });
      await vi.advanceTimersByTimeAsync(restartDelayMs(i));
    }
    expect(h.io.spawn).toHaveBeenCalledTimes(1 + MAX_RESTARTS);
    expect(h.reports.at(-1)).toMatchObject({ kind: 'gave-up' });
    expect(h.current().kind).toBe('failed');
    // Given up means given up: no further spawns on their own.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(h.io.spawn).toHaveBeenCalledTimes(1 + MAX_RESTARTS);
  });

  it('a manual Retry after giving up starts over with a full count', async () => {
    const h = harness();
    await h.life.ensure();
    for (let i = 0; i < MAX_RESTARTS; i++) h.outcomes.push(status('failed', { errorCode: 'unhealthy' }));
    h.crash();
    for (let i = 0; i < MAX_RESTARTS; i++) await vi.advanceTimersByTimeAsync(restartDelayMs(i));
    expect(h.reports.at(-1)).toMatchObject({ kind: 'gave-up' });
    const retried = await h.life.ensure({ manual: true });
    expect(retried.kind).toBe('ready');
    expect(h.life.snapshot().attempt).toBe(0);
  });

  it('an open during a restart countdown starts at once instead of waiting it out', async () => {
    const h = harness();
    await h.life.ensure();
    h.outcomes.push(status('failed', { errorCode: 'unhealthy' }));
    h.crash();
    await vi.advanceTimersByTimeAsync(RESTART_BACKOFF_MS[0]!);
    // Second attempt is now counting down (1000 ms); a play request jumps the queue.
    expect(h.life.snapshot().restartPending).toBe(true);
    const s = await h.life.ensure();
    expect(s.kind).toBe('ready');
    expect(h.life.snapshot().restartPending).toBe(false);
  });

  it('a crash after stop() is not restarted', async () => {
    const h = harness();
    await h.life.ensure();
    h.life.stop();
    h.crash();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.io.spawn).toHaveBeenCalledTimes(1);
    expect(h.reports).toEqual([]);
  });

  it('a crash while a start is in flight is that start\'s failure (one retry, not two)', async () => {
    const h = harness();
    h.outcomes.push('hang');
    const started = h.life.ensure();
    await vi.advanceTimersByTimeAsync(0);
    h.life.onUnexpectedExit('died while starting');
    h.pending[0]!(status('failed', { errorCode: 'crashed' }));
    await started;
    expect(h.reports.filter((r) => r.kind === 'recovering')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(RESTART_BACKOFF_MS[0]!);
    expect(h.io.spawn).toHaveBeenCalledTimes(2);
    expect(h.current().kind).toBe('ready');
  });

  it('a generation that stays up clears the failure count', async () => {
    const h = harness();
    await h.life.ensure();
    h.crash();
    await vi.advanceTimersByTimeAsync(RESTART_BACKOFF_MS[0]!);
    expect(h.life.snapshot().attempt).toBe(1);
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    expect(h.life.snapshot().attempt).toBe(0);
  });
});

describe('health checks', () => {
  it('a healthy server is pinged and left alone', async () => {
    const h = harness();
    await h.life.ensure();
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 3);
    expect(h.io.ping).toHaveBeenCalledTimes(3);
    expect(h.io.kill).not.toHaveBeenCalled();
  });

  it('a hung server (missed pings) is killed and restarted', async () => {
    const h = harness();
    await h.life.ensure();
    h.setPing(false);
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * HEALTH_MISSES_TO_RESTART);
    expect(h.io.kill).toHaveBeenCalledTimes(1);
    expect(h.reports[0]).toMatchObject({ kind: 'recovering', attempt: 1 });
    h.setPing(true);
    await vi.advanceTimersByTimeAsync(RESTART_BACKOFF_MS[0]!);
    expect(h.io.spawn).toHaveBeenCalledTimes(2);
    expect(h.current().kind).toBe('ready');
  });

  it('one missed ping is not enough', async () => {
    const h = harness();
    await h.life.ensure();
    h.setPing(false);
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS);
    h.setPing(true);
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 4);
    expect(h.io.kill).not.toHaveBeenCalled();
  });

  it('stop() ends the health loop', async () => {
    const h = harness();
    await h.life.ensure();
    h.life.stop();
    const calls = vi.mocked(h.io.ping).mock.calls.length;
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 5);
    expect(vi.mocked(h.io.ping).mock.calls.length).toBe(calls);
  });
});
