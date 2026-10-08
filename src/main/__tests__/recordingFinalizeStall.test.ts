/**
 * The finish's stall guard against a fake ffmpeg child and injected timers:
 * silence for the (size-scaled) timeout kills the child and settles at once;
 * a child that keeps reporting progress runs to its own end.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  FINALIZE_STALL_BASE_MS,
  FINALIZE_STALL_MAX_MS,
  FINALIZE_STALL_PER_GB_MS,
  finalizeStallTimeoutMs,
  runFinalizeChild,
  type FinalizeChild,
  type StallTimers,
} from '../recordingFinalize';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn(() => true);
}

/** A manual clock: `advance` fires whatever came due. */
function fakeTimers(): StallTimers & { advance: (ms: number) => void } {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout: (fn, ms) => {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      pending.delete(id as number);
    },
    advance: (ms) => {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
  };
}

describe('finalize stall timeout', () => {
  it('scales with the input size, within bounds', () => {
    expect(finalizeStallTimeoutMs(0)).toBe(FINALIZE_STALL_BASE_MS);
    expect(finalizeStallTimeoutMs(2 * 1024 ** 3)).toBe(FINALIZE_STALL_BASE_MS + 2 * FINALIZE_STALL_PER_GB_MS);
    expect(finalizeStallTimeoutMs(1024 ** 4)).toBe(FINALIZE_STALL_MAX_MS);
    expect(finalizeStallTimeoutMs(Number.NaN)).toBe(FINALIZE_STALL_BASE_MS);
  });

  it('kills a silent child and settles as stalled without waiting for close', async () => {
    const child = new FakeChild();
    const timers = fakeTimers();
    let settled = false;
    const run = runFinalizeChild({ start: () => child as unknown as FinalizeChild, stallMs: 30_000, timers });
    void run.then(() => { settled = true; });
    child.stderr.emit('data', Buffer.from('opening input\n'));
    timers.advance(29_000);
    await Promise.resolve();
    expect(settled).toBe(false);
    timers.advance(1_000);
    const result = await run;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(result.stalled).toBe(true);
    expect(result.code).toBeNull();
    expect(result.stderr).toContain('no progress');
  });

  it('leaves a child that keeps reporting progress alone', async () => {
    const child = new FakeChild();
    const timers = fakeTimers();
    const progress: string[] = [];
    const run = runFinalizeChild({
      start: () => child as unknown as FinalizeChild,
      stallMs: 30_000,
      timers,
      onStdout: (text) => progress.push(text),
    });
    for (let i = 0; i < 10; i++) {
      timers.advance(20_000);
      child.stdout.emit('data', Buffer.from(`out_time_ms=${i}\n`));
    }
    child.emit('close', 0);
    const result = await run;
    expect(child.kill).not.toHaveBeenCalled();
    expect(result).toMatchObject({ code: 0, stalled: false });
    expect(progress).toHaveLength(10);
    // The timer is gone once the child ended.
    timers.advance(60_000);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('a child that cannot start settles with the reason', async () => {
    const result = await runFinalizeChild({
      start: () => { throw new Error('ENOENT'); },
      stallMs: 30_000,
      timers: fakeTimers(),
    });
    expect(result).toMatchObject({ code: null, stalled: false });
    expect(result.stderr).toContain('ENOENT');
  });
});
