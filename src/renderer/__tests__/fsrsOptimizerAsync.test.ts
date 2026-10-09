// @vitest-environment jsdom
/**
 * The worker client: one worker per run, progress relayed, the result
 * delivered, cancel terminating the worker, and a worker error surfaced (not
 * retried on the UI thread). A fake `Worker` stands in for the real one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FsrsOptimizerCancelled, runFsrsOptimizer } from '../fsrsOptimizerAsync';

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: Array<{ id: number; entries: unknown[]; options: unknown }> = [];
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: { id: number; entries: unknown[]; options: unknown }): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.last = null;
});

const entries = [
  { mode: 'review', at: 1, cardId: 'c', rating: 'good' as const, isNew: true, correct: true, id: 'x' },
];

describe('runFsrsOptimizer', () => {
  it('posts a slimmed log, relays progress and resolves with the result', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const seen: number[] = [];
    const job = runFsrsOptimizer(entries, { dayStartHour: 4 }, (f) => seen.push(f));
    const worker = FakeWorker.last!;
    const { id, entries: sent } = worker.posted[0];
    expect(sent).toEqual([{ mode: 'review', at: 1, cardId: 'c', rating: 'good', isNew: true }]);
    worker.reply({ id, kind: 'progress', fraction: 0.5 });
    worker.reply({ id: id + 999, kind: 'progress', fraction: 0.9 }); // someone else's run
    const result = { status: 'ok' };
    worker.reply({ id, kind: 'done', result });
    await expect(job.result).resolves.toBe(result);
    expect(seen).toEqual([0.5]);
    expect(worker.terminated).toBe(true);
  });

  it('cancel terminates the worker and rejects as cancelled', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const job = runFsrsOptimizer(entries);
    const worker = FakeWorker.last!;
    job.cancel();
    await expect(job.result).rejects.toBeInstanceOf(FsrsOptimizerCancelled);
    expect(worker.terminated).toBe(true);
    // A late reply after cancel changes nothing.
    worker.reply({ id: worker.posted[0].id, kind: 'done', result: {} });
  });

  it('surfaces a worker error message and a worker crash', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const failed = runFsrsOptimizer(entries);
    FakeWorker.last!.reply({ id: FakeWorker.last!.posted[0].id, kind: 'error', message: 'bad weights' });
    await expect(failed.result).rejects.toThrow('bad weights');

    const crashed = runFsrsOptimizer(entries);
    FakeWorker.last!.onerror?.({ message: 'boom', preventDefault: () => undefined } as ErrorEvent);
    await expect(crashed.result).rejects.toThrow('boom');
    expect(FakeWorker.last!.terminated).toBe(true);
  });

  it('runs inline where no worker can be made', async () => {
    vi.stubGlobal('Worker', undefined);
    const job = runFsrsOptimizer(entries);
    const result = await job.result;
    expect(result.status).toBe('insufficient-data');
    expect(result.shortOf).toBe('train');
  });
});
