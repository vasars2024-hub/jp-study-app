// The dictionary import job state machine, exercised without Electron.
//
// `DictionaryImportJobs` takes its worker as a dependency precisely so these
// cases — busy refusal, cancellation, a worker that dies silently, recovery of a
// terminal snapshot after the renderer went away — are testable at all. They are
// the four ways this bridge can lie to a user, so they are the four tests.

import { describe, expect, it } from 'vitest';
import { DictionaryImportJobs, type ImportWorkerHandle } from '../dictionary/importJobs';
import type {
  DictionaryImportJobSnapshot,
  DictionaryImportWorkerIn,
  DictionaryImportWorkerOut,
} from '../../shared/dictionaryImportJob';

class FakeWorker implements ImportWorkerHandle {
  sent: DictionaryImportWorkerIn[] = [];

  killed = false;

  private messageListeners: ((message: DictionaryImportWorkerOut) => void)[] = [];

  private exitListeners: ((code: number) => void)[] = [];

  postMessage(message: DictionaryImportWorkerIn): void {
    this.sent.push(message);
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }

  on(event: 'message' | 'exit', listener: (payload: never) => void): void {
    if (event === 'message') this.messageListeners.push(listener as (m: DictionaryImportWorkerOut) => void);
    else this.exitListeners.push(listener as (code: number) => void);
  }

  emit(message: DictionaryImportWorkerOut): void {
    this.messageListeners.forEach((listener) => listener(message));
  }

  exit(code = 0): void {
    this.exitListeners.forEach((listener) => listener(code));
  }
}

function harness() {
  const workers: FakeWorker[] = [];
  const snapshots: DictionaryImportJobSnapshot[] = [];
  let counter = 0;
  const jobs = new DictionaryImportJobs({
    spawn: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    dbDir: () => '/tmp/dict',
    legacyRoot: () => '/tmp/yomitan',
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    newJobId: () => `job-${(counter += 1)}`,
  });
  return { jobs, workers, snapshots };
}

describe('DictionaryImportJobs', () => {
  it('starts a job, forwards the paths the worker cannot resolve itself, and streams progress', () => {
    const { jobs, workers, snapshots } = harness();

    const started = jobs.start({ kind: 'cedict', filePath: '/tmp/cedict.u8' });
    expect(started).toEqual({ ok: true, snapshot: { jobId: 'job-1', kind: 'cedict', status: 'running' } });
    // The worker has no `app`, so both paths must arrive in the start message.
    expect(workers[0].sent[0]).toEqual({
      type: 'start',
      jobId: 'job-1',
      request: { kind: 'cedict', filePath: '/tmp/cedict.u8' },
      dbDir: '/tmp/dict',
      legacyRoot: '/tmp/yomitan',
    });

    workers[0].emit({
      type: 'progress',
      progress: { jobId: 'job-1', kind: 'cedict', lines: 20_000, phase: 'importing' },
    });
    expect(jobs.current()?.progress?.lines).toBe(20_000);
    // Progress must never promote the job out of `running`.
    expect(jobs.current()?.status).toBe('running');
    expect(jobs.current()?.terminal).toBeUndefined();
    expect(snapshots).toHaveLength(2);
  });

  it('refuses a second job while one is running and hands back the running snapshot', () => {
    const { jobs, workers } = harness();
    jobs.start({ kind: 'cedict', filePath: '/a.u8' });

    const second = jobs.start({ kind: 'wiktextract', filePath: '/b.jsonl' });
    expect(second).toEqual({
      ok: false,
      error: 'busy',
      snapshot: { jobId: 'job-1', kind: 'cedict', status: 'running' },
    });
    // Refused means not spawned: two writers would contend for the same lock.
    expect(workers).toHaveLength(1);
  });

  it('keeps the terminal snapshot after the worker exits so a reloaded window recovers it', () => {
    const { jobs, workers } = harness();
    jobs.start({ kind: 'cedict', filePath: '/a.u8' });

    workers[0].emit({
      type: 'terminal',
      jobId: 'job-1',
      kind: 'cedict',
      terminal: { state: 'committed', counts: { entries: 12 } },
    });
    workers[0].exit(0);

    expect(jobs.running()).toBe(false);
    expect(jobs.current()).toEqual({
      jobId: 'job-1',
      kind: 'cedict',
      status: 'committed',
      terminal: { state: 'committed', counts: { entries: 12 } },
    });
    // The exit after a terminal message must not overwrite the outcome.
    expect(jobs.current()?.terminal).toEqual({ state: 'committed', counts: { entries: 12 } });
    // And the outcome is what reaps the worker: the worker does not exit itself,
    // because racing its own exit against the message loses on a fast failure.
    expect(workers[0].killed).toBe(true);
  });

  // Found live on 2026-08-13, not by a unit test: the first worker sent its
  // terminal message and then exited on a zero-delay timer, and the parent saw
  // the exit first. A real ENOENT was reported to the renderer as the generic
  // "stopped before it finished". A failure has to say what actually failed.
  it('keeps the real error when the worker exits right after reporting it', () => {
    const { jobs, workers } = harness();
    jobs.start({ kind: 'cedict', filePath: '/missing.u8' });

    workers[0].emit({
      type: 'terminal',
      jobId: 'job-1',
      kind: 'cedict',
      terminal: { state: 'failed', error: "ENOENT: no such file or directory, open '/missing.u8'" },
    });
    workers[0].exit(1);

    expect(jobs.current()?.terminal).toEqual({
      state: 'failed',
      error: "ENOENT: no such file or directory, open '/missing.u8'",
    });
  });

  it('reports a cancel as cancelled and a silent death as failed', () => {
    const cancelled = harness();
    cancelled.jobs.start({ kind: 'legacy' });
    expect(cancelled.jobs.cancel('job-1').ok).toBe(true);
    expect(cancelled.workers[0].sent[1]).toEqual({ type: 'cancel' });
    cancelled.workers[0].exit(0);
    expect(cancelled.jobs.current()?.status).toBe('cancelled');

    const crashed = harness();
    crashed.jobs.start({ kind: 'legacy' });
    crashed.workers[0].exit(1);
    const snapshot = crashed.jobs.current();
    expect(snapshot?.status).toBe('failed');
    // A user must be able to tell a dead import from a finished one.
    expect(snapshot?.terminal).toEqual({
      state: 'failed',
      error: 'The dictionary import process stopped before it finished.',
    });
  });

  it('turns a worker that cannot be spawned into a failed job rather than a thrown call', () => {
    const jobs = new DictionaryImportJobs({
      spawn: () => {
        throw new Error('ENOENT importWorker.js');
      },
      dbDir: () => '/tmp/dict',
      legacyRoot: () => '/tmp/yomitan',
      newJobId: () => 'job-1',
    });
    const result = jobs.start({ kind: 'cedict', filePath: '/a.u8' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.snapshot.status).toBe('failed');
    expect(result.ok && result.snapshot.terminal).toEqual({
      state: 'failed',
      error: 'ENOENT importWorker.js',
    });
    expect(jobs.running()).toBe(false);
  });

  it('ignores a stale message from a job that is no longer the active one', () => {
    const { jobs, workers } = harness();
    jobs.start({ kind: 'cedict', filePath: '/a.u8' });
    workers[0].emit({
      type: 'terminal',
      jobId: 'job-1',
      kind: 'cedict',
      terminal: { state: 'committed', counts: { entries: 1 } },
    });

    jobs.start({ kind: 'legacy' });
    // The first worker is still alive and still talking; nothing it says now
    // may touch the job that replaced it.
    workers[0].emit({
      type: 'progress',
      progress: { jobId: 'job-1', kind: 'cedict', lines: 99, phase: 'importing' },
    });
    workers[0].exit(0);

    expect(jobs.current()).toEqual({ jobId: 'job-2', kind: 'legacy', status: 'running' });
  });

  it('dispose kills a running worker and stops tracking it', () => {
    const { jobs, workers } = harness();
    jobs.start({ kind: 'legacy' });
    jobs.dispose();
    expect(workers[0].killed).toBe(true);
    expect(jobs.running()).toBe(false);
  });
});
