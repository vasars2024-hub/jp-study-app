import { describe, expect, it, vi } from 'vitest';

import { loadAfterCacheClear } from '../bootLoad';

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
