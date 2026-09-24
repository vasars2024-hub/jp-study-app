// @vitest-environment node
//
// The main-process side of the dictionary read worker, driven with a fake
// process. Every invariant `readClient.ts` states is exercised here, because the
// failure it guards against — a read that hangs, or a crashed helper answered as
// "no such word" — is invisible in a live app until a reader hits it.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DictionaryReadClient,
  RESPAWN_STORM_MS,
  type ReadWorkerHandle,
} from '../dictionary/readClient';
import type { DictionaryReadReply, DictionaryReadRequest } from '../dictionary/readProtocol';

interface FakeWorker extends ReadWorkerHandle {
  sent: DictionaryReadRequest[];
  killed: boolean;
  reply: (reply: DictionaryReadReply) => void;
  exit: () => void;
}

function fakeWorker(): FakeWorker {
  const onMessage: Array<(message: DictionaryReadReply) => void> = [];
  const onExit: Array<(code: number) => void> = [];
  const worker: FakeWorker = {
    sent: [],
    killed: false,
    postMessage: (message) => {
      worker.sent.push(message);
    },
    kill: () => {
      worker.killed = true;
      return true;
    },
    on: ((event: 'message' | 'exit', listener: (payload: never) => void) => {
      if (event === 'message') onMessage.push(listener as (message: DictionaryReadReply) => void);
      else onExit.push(listener as (code: number) => void);
    }) as FakeWorker['on'],
    reply: (reply) => onMessage.forEach((listener) => listener(reply)),
    exit: () => onExit.forEach((listener) => listener(0)),
  };
  return worker;
}

function harness(options: { spawn?: () => ReadWorkerHandle; timeoutMs?: number; now?: () => number; idleMs?: number } = {}) {
  const workers: FakeWorker[] = [];
  const inProcess = vi.fn(async (kind: string, query: unknown) => ({ via: 'in-process', kind, query }));
  const onFallback = vi.fn();
  const client = new DictionaryReadClient({
    spawn: options.spawn ?? (() => {
      const worker = fakeWorker();
      workers.push(worker);
      return worker;
    }),
    dbDir: () => 'C:/profile/dictionary',
    inProcess: inProcess as never,
    onFallback,
    timeoutMs: options.timeoutMs,
    now: options.now,
    idleMs: options.idleMs,
  });
  return { client, workers, inProcess, onFallback };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DictionaryReadClient — idle retirement (audit robust #6)', () => {
  it('retires a quiet worker and spawns a fresh one on the next read, without counting a crash', async () => {
    vi.useFakeTimers();
    const { client, workers, onFallback } = harness({ idleMs: 1000 });
    const first = client.read('frequency', { text: '猫' });
    workers[0].reply({ type: 'readResult', id: 1, ok: true, value: { query: '猫', entries: [] } });
    await first;
    vi.advanceTimersByTime(999);
    expect(workers[0].killed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(workers[0].killed).toBe(true);
    workers[0].exit();

    const second = client.read('frequency', { text: '犬' });
    expect(workers).toHaveLength(2);
    workers[1].reply({ type: 'readResult', id: 2, ok: true, value: { query: '犬', entries: [] } });
    await expect(second).resolves.toMatchObject({ query: '犬' });
    expect(onFallback).not.toHaveBeenCalled();
    expect(client.usingWorker()).toBe(true);
  });

  it('never retires a worker with a read in flight', () => {
    vi.useFakeTimers();
    const { client, workers } = harness({ idleMs: 1000, timeoutMs: 60_000 });
    void client.read('frequency', { text: 'a' });
    void client.read('frequency', { text: 'b' });
    workers[0].reply({ type: 'readResult', id: 1, ok: true, value: { query: 'a', entries: [] } });
    vi.advanceTimersByTime(5000);
    expect(workers[0].killed).toBe(false);
  });
});

describe('DictionaryReadClient', () => {
  it('routes each reply to the read that asked for it, whatever order they return in', async () => {
    const { client, workers, inProcess } = harness();
    const first = client.read('frequency', { text: '猫' });
    const second = client.read('xrefs', { text: '犬' });
    expect(workers).toHaveLength(1);
    expect(workers[0].sent).toEqual([
      { type: 'read', id: 1, dbDir: 'C:/profile/dictionary', kind: 'frequency', query: { text: '猫' } },
      { type: 'read', id: 2, dbDir: 'C:/profile/dictionary', kind: 'xrefs', query: { text: '犬' } },
    ]);

    workers[0].reply({ type: 'readResult', id: 2, ok: true, value: { query: '犬', xrefs: [] } });
    workers[0].reply({ type: 'readResult', id: 1, ok: true, value: { query: '猫', entries: [] } });

    await expect(second).resolves.toEqual({ query: '犬', xrefs: [] });
    await expect(first).resolves.toEqual({ query: '猫', entries: [] });
    expect(inProcess).not.toHaveBeenCalled();
    expect(client.usingWorker()).toBe(true);
  });

  it('rejects only the read whose reply carried an error', async () => {
    const { client, workers } = harness();
    const failing = client.read('lookup', { text: 'x' });
    const fine = client.read('lookup', { text: 'y' });
    workers[0].reply({ type: 'readResult', id: 1, ok: false, error: 'no such table: headwords' });
    workers[0].reply({ type: 'readResult', id: 2, ok: true, value: { query: 'y', detectedLangs: [], entries: [] } });
    await expect(failing).rejects.toThrow('no such table: headwords');
    await expect(fine).resolves.toMatchObject({ query: 'y' });
  });

  it('answers a read in-process when the worker dies under it, and spawns a fresh one next time', async () => {
    let clock = 0;
    const { client, workers, inProcess, onFallback } = harness({ now: () => clock });
    const pending = client.read('etymology', { text: '猫' });
    clock += RESPAWN_STORM_MS + 1;
    workers[0].exit();

    await expect(pending).resolves.toEqual({ via: 'in-process', kind: 'etymology', query: { text: '猫' } });
    expect(inProcess).toHaveBeenCalledTimes(1);
    expect(onFallback).not.toHaveBeenCalled();

    // One death is an accident. The next read gets a new process.
    void client.read('frequency', { text: '犬' });
    expect(workers).toHaveLength(2);
    expect(workers[1].sent).toHaveLength(1);
    expect(client.usingWorker()).toBe(true);
  });

  it('gives the worker up for the session after two early exits, and says so once', async () => {
    let clock = 0;
    const { client, workers, inProcess, onFallback } = harness({ now: () => clock });

    const first = client.read('frequency', { text: 'a' });
    clock += 100;
    workers[0].exit();
    await first;

    const second = client.read('frequency', { text: 'b' });
    expect(workers).toHaveLength(2);
    clock += 100;
    workers[1].exit();
    await second;

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0][0]).toMatch(/twice/);
    expect(client.usingWorker()).toBe(false);

    await expect(client.read('frequency', { text: 'c' })).resolves.toMatchObject({ via: 'in-process' });
    expect(workers).toHaveLength(2);
    expect(inProcess).toHaveBeenCalledTimes(3);
  });

  it('falls back in-process when the process cannot be started, and does not try again', async () => {
    const spawn = vi.fn(() => {
      throw new Error('ENOENT: importWorker.js');
    });
    const { client, inProcess, onFallback } = harness({ spawn });

    await expect(client.read('lookup', { text: '猫' })).resolves.toMatchObject({ via: 'in-process', kind: 'lookup' });
    await expect(client.read('lookup', { text: '犬' })).resolves.toMatchObject({ via: 'in-process' });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(inProcess).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0][0]).toMatch(/could not be started.*ENOENT/);
  });

  it('times an unanswered read out, replaces the process, and answers its siblings here', async () => {
    vi.useFakeTimers();
    const { client, workers, inProcess } = harness({ timeoutMs: 1_000 });
    const stuck = client.read('compounds', { text: '猫' });
    // Keep the rejection observed from the start: a fake-timer advance settles
    // the promise before the `expect` below could attach its own handler.
    const stuckOutcome = stuck.then(() => 'resolved', (error: Error) => error.message);
    vi.advanceTimersByTime(500);
    const sibling = client.read('examples', { text: '犬' });
    vi.advanceTimersByTime(500);

    await expect(stuckOutcome).resolves.toMatch(/did not answer within 1000 ms/);
    await expect(sibling).resolves.toMatchObject({ via: 'in-process', kind: 'examples' });
    expect(workers[0].killed).toBe(true);
    expect(inProcess).toHaveBeenCalledTimes(1);

    // A late reply from the killed process must not land on a new read's id.
    void client.read('lookup', { text: '鳥' });
    expect(workers).toHaveLength(2);
    workers[0].reply({ type: 'readResult', id: 1, ok: true, value: 'stale' });
    expect(workers[1].sent[0]).toMatchObject({ id: 3, kind: 'lookup' });
    expect(client.usingWorker()).toBe(true);
  });

  it('rejects what is in flight on dispose and kills the process', async () => {
    const { client, workers, inProcess } = harness();
    const pending = client.read('lookup', { text: '猫' });
    client.dispose();
    await expect(pending).rejects.toThrow(/shut down/);
    expect(workers[0].killed).toBe(true);
    // After shutdown a read still answers, on this process, rather than
    // spawning a helper the app is in the middle of leaving behind.
    await expect(client.read('lookup', { text: '犬' })).resolves.toMatchObject({ via: 'in-process' });
    expect(workers).toHaveLength(1);
    expect(inProcess).toHaveBeenCalledTimes(1);
  });
});
