// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __artworkTestables, probeDurationSec } from '../mediaArtwork';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('ffmpeg-static', () => ({ default: '/nonexistent/ffmpeg' }));

const { acquire, release, maxConcurrent, activeCount, reset } = __artworkTestables;

describe('artwork concurrency limiter', () => {
  beforeEach(() => reset());

  it('lets the first MAX_CONCURRENT callers straight through', async () => {
    for (let i = 0; i < maxConcurrent; i += 1) await acquire();
    expect(activeCount()).toBe(maxConcurrent);
  });

  it('never exceeds the limit, even when a release and an acquire race', async () => {
    // The bug this guards: `release` used to decrement and *then* wake a waiter.
    // In the gap before the waiter resumed, a fresh `acquire` saw a free slot and
    // took it — so both proceeded and the pool drifted one over the limit. Over a
    // large import that leaks a slot per release, spawning more ffmpeg processes
    // than the limiter exists to allow.
    for (let i = 0; i < maxConcurrent; i += 1) await acquire();

    let waiterResumed = false;
    const waiter = acquire().then(() => { waiterResumed = true; });

    release();                 // hands the permit to the queued waiter
    const intruder = acquire(); // races for the slot that was just freed

    await waiter;
    expect(waiterResumed).toBe(true);
    expect(activeCount()).toBeLessThanOrEqual(maxConcurrent);

    // The intruder must still be queued, not running.
    let intruderResumed = false;
    void intruder.then(() => { intruderResumed = true; });
    await Promise.resolve();
    expect(intruderResumed).toBe(false);

    release();
    await intruder;
    expect(activeCount()).toBeLessThanOrEqual(maxConcurrent);
  });

  it('drains back to zero when every holder releases', async () => {
    for (let i = 0; i < maxConcurrent; i += 1) await acquire();
    for (let i = 0; i < maxConcurrent; i += 1) release();
    expect(activeCount()).toBe(0);
  });

  it('serves waiters in order', async () => {
    for (let i = 0; i < maxConcurrent; i += 1) await acquire();
    const order: number[] = [];
    const a = acquire().then(() => order.push(1));
    const b = acquire().then(() => order.push(2));
    release();
    await a;
    release();
    await b;
    expect(order).toEqual([1, 2]);
  });

  it('releases its permit when the probe bails on a missing file', async () => {
    // The early return happens before `acquire`, so nothing should be held.
    expect(await probeDurationSec('/definitely/not/here.mkv')).toBeNull();
    expect(activeCount()).toBe(0);
  });
});
