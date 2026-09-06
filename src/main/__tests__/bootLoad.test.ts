import { describe, expect, it, vi } from 'vitest';

import { loadAfterCacheClear, loadWindowWithRetry, loadWithRetry } from '../bootLoad';

/*
 * The case this file exists for is the THIRD one — a cache clear that never
 * settles. The other two were already covered by `.finally()` at the call site;
 * the never-settling promise was not, and it stranded a real boot on 2026-09-05
 * with the window showing `url: ""` for the life of the process.
 *
 * The clock is injected rather than faked globally so `waitedMs` can be asserted
 * exactly, and the timeouts are small enough that the timeout case is real time
 * rather than a fake-timer arrangement that would not prove the timer is armed.
 */
describe('loadAfterCacheClear', () => {
  it('loads once the clear resolves, and reports how long it waited', async () => {
    const load = vi.fn();
    let t = 1000;
    const res = await loadAfterCacheClear(
      () => Promise.resolve(undefined),
      load,
      3000,
      () => {
        const at = t;
        t += 7;
        return at;
      },
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(res.reason).toBe('cleared');
    expect(res.waitedMs).toBe(7);
  });

  it('still loads when the clear REJECTS', async () => {
    const load = vi.fn();
    const res = await loadAfterCacheClear(
      () => Promise.reject(new Error('network service gone')),
      load,
      3000,
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(res.reason).toBe('clear-failed');
  });

  it('still loads when the clear THROWS synchronously', async () => {
    const load = vi.fn();
    const res = await loadAfterCacheClear(
      () => {
        throw new Error('session already destroyed');
      },
      load,
      3000,
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(res.reason).toBe('clear-failed');
  });

  /*
   * THE REGRESSION. Before this module the call site was
   *   session.clearCache().finally(() => mainWindow!.loadURL(rendererUrl()))
   * and a promise that never settles never reaches `.finally`. Reproduced here
   * by a promise with no resolve path at all: without the timer, this test hangs
   * until vitest's own timeout and `load` is never called.
   */
  it('loads anyway when the clear NEVER SETTLES', async () => {
    const load = vi.fn();
    const res = await loadAfterCacheClear(
      () =>
        new Promise<never>(() => {
          // deliberately never settles - this IS the failure being reproduced
        }),
      load,
      60,
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(res.reason).toBe('clear-timeout');
  });

  it('does not load a SECOND time when a timed-out clear settles late', async () => {
    const load = vi.fn();
    let settle: (() => void) | undefined;
    const res = await loadAfterCacheClear(
      () =>
        new Promise<void>((r) => {
          settle = r;
        }),
      load,
      40,
    );
    expect(res.reason).toBe('clear-timeout');
    expect(load).toHaveBeenCalledTimes(1);

    settle?.();
    await new Promise((r) => {
      setTimeout(r, 40);
    });
    // The window is already showing the app; loading it again would throw the
    // renderer away mid-restore.
    expect(load).toHaveBeenCalledTimes(1);
  });

  /*
   * The old call site asserted the window was non-null (`mainWindow!`) inside a
   * `finally` with no handler, so quitting during boot threw an unhandled
   * rejection. A `load` that decides to do nothing is a supported outcome, and
   * it must not take the boot promise down with it.
   */
  it('a load that declines to act is not an error', async () => {
    const load = vi.fn(() => {
      /* window is gone; nothing to load into */
    });
    const res = await loadAfterCacheClear(() => Promise.resolve(), load, 3000);
    expect(res.reason).toBe('cleared');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

/*
 * The SECOND half of the same boot defect, and it was still open after the file above closed
 * the first. `loadAfterCacheClear` guarantees `loadURL` is REACHED; nothing guaranteed it
 * SUCCEEDED. Observed live 2026-09-06, twice in a row on two clean `npm start` runs: the
 * network service crashed at load time, `loadURL` rejected into nothing, and `/health`
 * reported `{"title":"jp-study-app","url":""}` for the life of both processes.
 *
 * `sleep` is injected because the real delay is 750 ms and proving a retry should not cost
 * two seconds of suite time — but the DELAYS are asserted, so an implementation that skips
 * the wait and hammers a restarting network service still fails here.
 */
describe('loadWithRetry', () => {
  it('calls load once when it succeeds first time, and never sleeps', async () => {
    const load = vi.fn(() => Promise.resolve());
    const sleep = vi.fn(() => Promise.resolve());
    const r = await loadWithRetry(load, { sleep });
    expect(r).toEqual({ ok: true, attempts: 1, lastError: null });
    expect(load).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a rejecting load and reports the attempt it recovered on', async () => {
    let n = 0;
    const load = vi.fn(() => {
      n += 1;
      return n < 3 ? Promise.reject(new Error('ERR_NETWORK_CHANGED')) : Promise.resolve();
    });
    const slept: number[] = [];
    const r = await loadWithRetry(load, { sleep: async (ms) => { slept.push(ms); }, delayMs: 750 });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
    expect(r.lastError).toBeNull();
    // Two failures -> two waits. A third wait would mean it slept after succeeding.
    expect(slept).toEqual([750, 750]);
  });

  it('gives up after the budget and hands back the LAST error, not the first', async () => {
    let n = 0;
    const load = vi.fn(() => {
      n += 1;
      return Promise.reject(new Error(`fail-${n}`));
    });
    const r = await loadWithRetry(load, { attempts: 3, sleep: async () => { /* the wait is asserted in its own case; do not spend it here */ } });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(3);
    expect(r.lastError).toBe('fail-3');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not sleep after the final failure', async () => {
    const slept: number[] = [];
    await loadWithRetry(() => Promise.reject(new Error('x')), {
      attempts: 3,
      sleep: async (ms) => { slept.push(ms); },
    });
    // 3 attempts, 2 gaps. A trailing sleep only delays the diagnostic the caller must print.
    expect(slept).toHaveLength(2);
  });

  it('reports every failure as it happens, so a silent recovery is still visible', async () => {
    let n = 0;
    const seen: Array<[number, string]> = [];
    await loadWithRetry(
      () => { n += 1; return n < 2 ? Promise.reject(new Error('boom')) : Promise.resolve(); },
      { sleep: async () => { /* the wait is asserted in its own case; do not spend it here */ }, onFailure: (attempt, error) => seen.push([attempt, error]) },
    );
    expect(seen).toEqual([[1, 'boom']]);
  });

  it('treats a synchronous throw the same as a rejection', async () => {
    let n = 0;
    const load = vi.fn(() => {
      n += 1;
      if (n === 1) throw new Error('sync-throw');
      return Promise.resolve();
    });
    const r = await loadWithRetry(load, { sleep: async () => { /* the wait is asserted in its own case; do not spend it here */ } });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
  });

  it('honours attempts: 1 as "do not retry"', async () => {
    const load = vi.fn(() => Promise.reject(new Error('once')));
    const r = await loadWithRetry(load, { attempts: 1, sleep: async () => { /* the wait is asserted in its own case; do not spend it here */ } });
    expect(load).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: false, attempts: 1, lastError: 'once' });
  });
});

/*
 * The boot window was fixed first because it was the one reproduced. Every OTHER
 * window still loaded bare, and the end state is the same and worse to diagnose:
 * a created window at `url: ''` that main reports as healthy and visible, with
 * `/reload` answering `ok: true` on a webContents that never had a URL. Measured
 * on the live instance 2026-09-06, window 2 ("Study OS — Display") was in exactly
 * that state.
 */
describe('loadWindowWithRetry', () => {
  const nap = async (): Promise<void> => { /* asserted in loadWithRetry's own cases */ };

  it('retries a transient failure and loads the window', async () => {
    let n = 0;
    const win = {
      isDestroyed: () => false,
      loadURL: vi.fn(() => {
        n += 1;
        return n < 3 ? Promise.reject(new Error('ERR_FAILED (-2)')) : Promise.resolve();
      }),
    };
    const r = await loadWindowWithRetry(win, 'http://localhost:5173/?popout=anki', 'popout:anki', {
      sleep: nap,
    });
    expect(r).toEqual({ ok: true, attempts: 3, lastError: null });
    expect(win.loadURL).toHaveBeenCalledTimes(3);
    expect(win.loadURL).toHaveBeenLastCalledWith('http://localhost:5173/?popout=anki');
  });

  it('names the window in every diagnostic, so a failure says WHICH one died', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const win = { isDestroyed: () => false, loadURL: () => Promise.reject(new Error('boom')) };
      const r = await loadWindowWithRetry(win, 'x', 'desk-display:display|1920x1080|1', {
        attempts: 2,
        sleep: nap,
      });
      expect(r.ok).toBe(false);
      const lines = error.mock.calls.map((c) => String(c[0]));
      expect(lines).toHaveLength(3); // two attempts, then the summary
      expect(lines.every((l) => l.includes('desk-display:display|1920x1080|1'))).toBe(true);
      expect(lines[2]).toContain('FAILED after 2 attempts: boom');
    } finally {
      error.mockRestore();
    }
  });

  it('says nothing at all when the first attempt works', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const win = { isDestroyed: () => false, loadURL: () => Promise.resolve() };
      expect(await loadWindowWithRetry(win, 'x', 'blanc', { sleep: nap })).toEqual({
        ok: true, attempts: 1, lastError: null,
      });
      expect(error).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      log.mockRestore();
    }
  });

  it('stops retrying a window the user closed, and does not report it as a failure', async () => {
    // A window destroyed mid-retry has nothing left to load into. Retrying would
    // log a diagnostic about a window that is already gone.
    let destroyed = false;
    const loadURL = vi.fn(() => {
      destroyed = true;
      return Promise.reject(new Error('gone'));
    });
    const r = await loadWindowWithRetry(
      { isDestroyed: () => destroyed, loadURL },
      'x',
      'mini-widget',
      { sleep: nap },
    );
    expect(loadURL).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });
});
