// @vitest-environment node
/**
 * Audit r2 #17 — downloads could not be cancelled and "Download all" held the
 * window. The queue's state machine, with a fake downloader that behaves like
 * yt-dlp does when its process is killed.
 */
import { describe, expect, it, vi } from 'vitest';
import { YtDownloadQueue, type YtQueueRunResult } from '../ytDownloadQueue';

function deferredRunner() {
  const pending = new Map<string, { resolve: (r: YtQueueRunResult) => void; signal: AbortSignal }>();
  const started: string[] = [];
  const run = vi.fn((videoId: string, signal: AbortSignal) => {
    started.push(videoId);
    return new Promise<YtQueueRunResult>((resolve) => {
      pending.set(videoId, { resolve, signal });
      signal.addEventListener('abort', () => resolve({ ok: false, error: 'cancelled', aborted: true }));
    });
  });
  return { run, pending, started };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the YouTube download queue', () => {
  it('downloads one at a time and resolves the caller when all settle', async () => {
    const { run, pending, started } = deferredRunner();
    const q = new YtDownloadQueue({ run, cleanup: vi.fn() });
    const done = q.enqueue(['a', 'b']);
    await flush();
    expect(started).toEqual(['a']);
    pending.get('a')!.resolve({ ok: true, mediaItemId: 'm-a' });
    await flush();
    expect(started).toEqual(['a', 'b']);
    pending.get('b')!.resolve({ ok: false, error: 'boom' });
    await expect(done).resolves.toEqual([
      { videoId: 'a', ok: true, mediaItemId: 'm-a' },
      { videoId: 'b', ok: false, error: 'boom' },
    ]);
  });

  it('cancel kills the running download and removes its partial files; queued ones never start', async () => {
    const { run, pending, started } = deferredRunner();
    const cleanup = vi.fn();
    const q = new YtDownloadQueue({ run, cleanup });
    const done = q.enqueue(['a', 'b', 'c']);
    await flush();
    q.cancel();
    await flush();
    expect(pending.get('a')!.signal.aborted).toBe(true);
    expect(started).toEqual(['a']);
    expect(cleanup).toHaveBeenCalledWith('a');
    const results = await done;
    expect(results.map((r) => [r.videoId, r.ok, r.error])).toEqual([
      ['a', false, 'cancelled'],
      ['b', false, 'cancelled'],
      ['c', false, 'cancelled'],
    ]);
  });

  it('pause keeps the partial file; resume starts it again; one cancel does not stop the others', async () => {
    const { run, pending, started } = deferredRunner();
    const cleanup = vi.fn();
    const changes: string[][] = [];
    const q = new YtDownloadQueue({
      run,
      cleanup,
      onChange: (entries) => changes.push(entries.map((e) => `${e.videoId}:${e.state}`)),
    });
    const done = q.enqueue(['a', 'b']);
    await flush();
    q.pause('a');
    await flush();
    expect(cleanup).not.toHaveBeenCalled();
    expect(q.snapshot().find((e) => e.videoId === 'a')?.state).toBe('paused');
    // The next one runs while the first is paused.
    expect(started).toEqual(['a', 'b']);
    q.cancel(['b']);
    await flush();
    q.resume('a');
    await flush();
    expect(started).toEqual(['a', 'b', 'a']);
    pending.get('a')!.resolve({ ok: true, mediaItemId: 'm' });
    const results = await done;
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(changes.length).toBeGreaterThan(3);
  });
});
