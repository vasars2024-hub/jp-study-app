import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { awaitStartupRestore, STARTUP_RESTORE_TIMEOUT_MS } from '../startupRestore';

describe('awaitStartupRestore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves "done" when the restore finishes inside the budget', async () => {
    const log = vi.fn();
    const outcome = awaitStartupRestore(Promise.resolve('ok'), { log });
    await expect(outcome).resolves.toBe('done');
    expect(log).not.toHaveBeenCalled();
  });

  it('renders anyway ("timeout") when the restore never settles', async () => {
    const log = vi.fn();
    let settled: string | null = null;
    void awaitStartupRestore(new Promise(() => undefined), { log }).then((o) => {
      settled = o;
    });
    await vi.advanceTimersByTimeAsync(STARTUP_RESTORE_TIMEOUT_MS - 1);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe('timeout');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('lets a late restore finish in the background and only logs it', async () => {
    const log = vi.fn();
    let finish!: () => void;
    const restore = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const outcome = awaitStartupRestore(restore, { log, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(outcome).resolves.toBe('timeout');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining('finished late'));
  });

  it('swallows a late rejection (no unhandled rejection) and logs it', async () => {
    const log = vi.fn();
    let fail!: (e: unknown) => void;
    const restore = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    const outcome = awaitStartupRestore(restore, { log, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(outcome).resolves.toBe('timeout');
    const boom = new Error('idb gone');
    fail(boom);
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining('failed late'), boom);
  });

  it('resolves "failed" on an early rejection and clears the timer', async () => {
    const log = vi.fn();
    const outcome = awaitStartupRestore(Promise.reject(new Error('x')), { log });
    await expect(outcome).resolves.toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
  });
});
