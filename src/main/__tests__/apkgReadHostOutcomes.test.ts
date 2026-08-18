// @vitest-environment node
/**
 * The fork host's own behaviour, which nothing tested until now.
 *
 * `apkgReadOffMainLoop.test.ts` guards gate 9's *shape* — the worker is built,
 * the ladder is electron-free, the handler no longer parses inline — and it
 * exercises `parseApkgDraftPage`, the in-process function. It never calls
 * `parseApkgDraftPageOffMainLoop`, so the whole message/exit/settle ladder was
 * asserted only by a regex against its own source text.
 *
 * Boss audit 2026-08-18 proved that gap is not theoretical: resolving
 * `totalNotes: page.notes.length` in the host — the workbench telling the user a
 * 100,000-note deck holds 2,000 — left the full suite at its identical known
 * failures. Every case below fails on that mutation or on the one the same audit
 * found live (Finding 1: an absent worker module refusing the deck instead of
 * degrading to a slow read).
 *
 * `utilityProcess` is stubbed rather than really forked because the outcomes
 * that matter are the ones a real fork cannot be made to produce on demand.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApkgReadWorkerOut } from '../../shared/ankiDraft';

type Listener = (...args: unknown[]) => void;

interface FakeChild {
  listeners: Map<string, Listener[]>;
  posted: unknown[];
  killed: number;
  postThrows: Error | null;
  emit(event: string, ...args: unknown[]): void;
}

const registry = vi.hoisted(() => ({
  /** Set per test: `null` means fork throws synchronously, the old dead path. */
  next: null as null | (() => unknown),
  forkArgs: [] as unknown[][],
  children: [] as unknown[],
}));

vi.mock('electron', () => ({
  utilityProcess: {
    fork: (...args: unknown[]) => {
      registry.forkArgs.push(args);
      if (!registry.next) throw new Error('fork refused');
      const child = registry.next();
      registry.children.push(child);
      return child;
    },
  },
}));

/** Every in-process fallback call, so "the deck still opened" is distinguishable from "the worker answered". */
const fallbackCalls = vi.hoisted(() => ({ requests: [] as unknown[], reject: null as Error | null }));

vi.mock('../anki/apkgCollection', () => ({
  parseApkgDraftPage: (request: unknown) => {
    fallbackCalls.requests.push(request);
    if (fallbackCalls.reject) return Promise.reject(fallbackCalls.reject);
    return Promise.resolve({
      page: { notes: [{ marker: 'in-process' }] },
      fingerprint: 'sha1:fallback',
      totalNotes: 7,
      sourceKind: 'apkg',
      label: 'fallback.apkg',
      noteOffset: 0,
      noteLimit: 10,
    });
  },
}));

import { parseApkgDraftPageOffMainLoop, apkgReadWorkerPath } from '../anki/apkgReadHost';

function makeChild(): FakeChild {
  const child: FakeChild = {
    listeners: new Map(),
    posted: [],
    killed: 0,
    postThrows: null,
    emit(event, ...args) {
      for (const fn of child.listeners.get(event) ?? []) fn(...args);
    },
  };
  const self = child as unknown as {
    on: (event: string, fn: Listener) => void;
    postMessage: (value: unknown) => void;
    kill: () => void;
  };
  self.on = (event, fn) => {
    const list = child.listeners.get(event) ?? [];
    list.push(fn);
    child.listeners.set(event, list);
  };
  self.postMessage = (value) => {
    if (child.postThrows) throw child.postThrows;
    child.posted.push(value);
  };
  self.kill = () => {
    child.killed += 1;
  };
  return child;
}

const REQUEST = { filePath: 'C:/decks/big.apkg', noteOffset: 100, noteLimit: 10 };

/** The shape a healthy worker sends back. `totalNotes` deliberately differs from the page length. */
const OK_MESSAGE: ApkgReadWorkerOut = {
  ok: true,
  page: { notes: [{ marker: 'from-worker' }] },
  fingerprint: 'sha1:worker',
  totalNotes: 100_000,
  sourceKind: 'apkg',
  label: 'big.apkg',
  noteOffset: 100,
  noteLimit: 10,
} as unknown as ApkgReadWorkerOut;

describe('the .apkg read host answers for each way a worker can end', () => {
  let child: FakeChild;

  beforeEach(() => {
    child = makeChild();
    registry.next = () => child;
    registry.forkArgs = [];
    registry.children = [];
    fallbackCalls.requests = [];
    fallbackCalls.reject = null;
  });

  it('forks the worker beside the bundle and hands it the request unchanged', async () => {
    const promise = parseApkgDraftPageOffMainLoop(REQUEST);
    child.emit('message', OK_MESSAGE);
    await promise;

    // A worker that inherits the network or a debug port is a worker parsing a
    // user's file with more reach than the parse needs, so the options are read
    // as part of the same call rather than sampled out of it.
    expect(registry.forkArgs).toEqual([
      [apkgReadWorkerPath(), [], { serviceName: 'jp-apkg-read', stdio: 'ignore' }],
    ]);
    expect(child.posted).toEqual([REQUEST]);
  });

  it('resolves with the whole-collection total the worker reported, not the page it returned', async () => {
    const promise = parseApkgDraftPageOffMainLoop(REQUEST);
    child.emit('message', OK_MESSAGE);
    const parsed = await promise;

    // The audit's mutation was `totalNotes: page.notes.length`. One note in the
    // page, 100,000 in the deck: nothing else in the suite could tell them apart.
    expect(parsed.totalNotes).toBe(100_000);
    expect(parsed.page.notes).toHaveLength(1);
    expect(parsed.noteOffset).toBe(100);
    expect(parsed.fingerprint).toBe('sha1:worker');
    expect(parsed.label).toBe('big.apkg');
    // The worker answered, so the main loop must not have parsed anything.
    expect(fallbackCalls.requests).toEqual([]);
    expect(child.killed).toBe(1);
  });

  it("passes a parse failure through as the parse's own message, and does not retry it in-process", async () => {
    const promise = parseApkgDraftPageOffMainLoop(REQUEST);
    child.emit('message', { ok: false, error: 'That file is not an Anki deck (no collection database inside).' });

    await expect(promise).rejects.toThrow(/not an Anki deck/);
    // A corrupt package is corrupt in either process. Re-parsing it on the main
    // loop would stall for the length of a read that is already known to fail.
    expect(fallbackCalls.requests).toEqual([]);
  });

  it('names a response it cannot read rather than resolving with an empty deck', async () => {
    const promise = parseApkgDraftPageOffMainLoop(REQUEST);
    child.emit('message', { totalNotes: 4 });

    await expect(promise).rejects.toThrow('apkg-read-bad-response');
  });

  it('degrades to the in-process parse when the child exits without answering', async () => {
    // Finding 1, 2026-08-18: `utilityProcess.fork()` does NOT throw on a missing
    // worker module — it returns a child that exits with code 1. Before the fix
    // this rejected with `apkg-read-worker-exit:1`, which `DeckWorkbench.tsx`
    // renders verbatim, so a packaging fault refused the deck instead of
    // degrading to the slow read the module documents.
    const promise = parseApkgDraftPageOffMainLoop(REQUEST);
    child.emit('exit', 1);
    const parsed = await promise;

    expect(fallbackCalls.requests).toEqual([REQUEST]);
    expect(parsed.totalNotes).toBe(7);
    expect(parsed.fingerprint).toBe('sha1:fallback');
  });

  it('reports the fallback\u2019s own failure when the deck is unreadable in both processes', async () => {
    fallbackCalls.reject = new Error('That file is not an Anki deck (no collection database inside).');
    const promise = parseApkgDraftPageOffMainLoop(REQUEST);
    child.emit('exit', 1);

    // Not `apkg-read-worker-exit:1`: the user gets the sentence about their file.
    await expect(promise).rejects.toThrow(/not an Anki deck/);
  });

  it('degrades when the child is already dead and refuses the handoff', async () => {
    child.postThrows = new Error('process has exited');
    const promise = parseApkgDraftPageOffMainLoop(REQUEST);

    await expect(promise).resolves.toMatchObject({ fingerprint: 'sha1:fallback' });
    expect(fallbackCalls.requests).toEqual([REQUEST]);
  });

  it('ignores the reap that follows a successful read', async () => {
    const promise = parseApkgDraftPageOffMainLoop(REQUEST);
    child.emit('message', OK_MESSAGE);
    const parsed = await promise;
    // Killing the child fires `exit`. Falling back here would parse the same
    // deck a second time, on the main loop, after it had already been answered.
    child.emit('exit', 0);
    await Promise.resolve();

    expect(parsed.fingerprint).toBe('sha1:worker');
    expect(fallbackCalls.requests).toEqual([]);
  });

  it('still parses in-process when the fork itself throws', async () => {
    registry.next = null;
    const parsed = await parseApkgDraftPageOffMainLoop(REQUEST);

    expect(parsed.fingerprint).toBe('sha1:fallback');
    expect(fallbackCalls.requests).toEqual([REQUEST]);
  });
});

/**
 * Boss audit 2026-08-18, Finding 3: a child that hangs rather than exits left the
 * promise unsettled forever — the workbench permanently busy, with no control to
 * get out of it. Two answers, deliberately different in kind.
 */
describe('a read that never ends', () => {
  let child: FakeChild;

  beforeEach(() => {
    child = makeChild();
    registry.next = () => child;
    registry.forkArgs = [];
    registry.children = [];
    fallbackCalls.requests = [];
    fallbackCalls.reject = null;
  });

  it('parses in-process when the child never acknowledges the request', async () => {
    vi.useFakeTimers();
    try {
      const promise = parseApkgDraftPageOffMainLoop(REQUEST, { startupTimeoutMs: 5_000 });
      // Neither `message` nor `exit`: the one ending the exit handler cannot see.
      await vi.advanceTimersByTimeAsync(5_000);
      const parsed = await promise;

      expect(fallbackCalls.requests).toEqual([REQUEST]);
      expect(parsed.fingerprint).toBe('sha1:fallback');
      // The silent child is killed rather than left holding a file handle.
      expect(child.killed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a deck parse for far longer than the startup budget once the worker acks', async () => {
    vi.useFakeTimers();
    try {
      const promise = parseApkgDraftPageOffMainLoop(REQUEST, { startupTimeoutMs: 5_000 });
      // The ack is not an answer. This is the negative control for the case
      // above: without it a 100,000-note deck — measured at 6.2 s — would be
      // abandoned mid-parse and re-read on the main loop, which is the exact
      // freeze the utility process exists to prevent.
      child.emit('message', { phase: 'accepted' });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fallbackCalls.requests).toEqual([]);

      child.emit('message', OK_MESSAGE);
      const parsed = await promise;
      expect(parsed.totalNotes).toBe(100_000);
      expect(fallbackCalls.requests).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops on a cancel, and does not move the work to the main loop instead', async () => {
    const controller = new AbortController();
    const promise = parseApkgDraftPageOffMainLoop(REQUEST, { signal: controller.signal });
    child.emit('message', { phase: 'accepted' });
    controller.abort();

    await expect(promise).rejects.toThrow('apkg-read-cancelled');
    // The whole point of the cancel: the user asked for the read to END, not to
    // move somewhere it holds the UI thread for the same six seconds.
    expect(fallbackCalls.requests).toEqual([]);
    expect(child.killed).toBe(1);
  });

  it('forks nothing at all for a read that was cancelled before it started', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(parseApkgDraftPageOffMainLoop(REQUEST, { signal: controller.signal })).rejects.toThrow(
      'apkg-read-cancelled',
    );
    expect(registry.forkArgs).toEqual([]);
    expect(fallbackCalls.requests).toEqual([]);
  });

  it('refuses the result of an in-process fallback the user cancelled while it ran', async () => {
    const controller = new AbortController();
    registry.next = null; // fork throws: straight onto the uninterruptible path
    const promise = parseApkgDraftPageOffMainLoop(REQUEST, { signal: controller.signal });
    // The parse cannot be stopped — it owns this loop — but its result can be
    // refused, so no draft, session or remembered source comes out of a read the
    // user abandoned.
    controller.abort();

    await expect(promise).rejects.toThrow('apkg-read-cancelled');
    expect(fallbackCalls.requests).toEqual([REQUEST]);
  });

  it('leaves a cancel after the answer alone', async () => {
    const controller = new AbortController();
    const promise = parseApkgDraftPageOffMainLoop(REQUEST, { signal: controller.signal });
    child.emit('message', OK_MESSAGE);
    const parsed = await promise;
    // A button pressed a moment too late must not retract a deck already open.
    controller.abort();
    await Promise.resolve();

    expect(parsed.totalNotes).toBe(100_000);
    expect(child.killed).toBe(1);
  });
});
