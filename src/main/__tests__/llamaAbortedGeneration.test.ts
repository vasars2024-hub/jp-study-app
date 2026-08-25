// @vitest-environment node
/**
 * A generation that was aborted mid-flight must never settle as an answer.
 *
 * Boss audit 2026-08-25 Finding 2. Both prompt paths pass `stopOnAbortSignal: true`, and
 * node-llama-cpp's own typings say what that does: "when a response already started being
 * generated and then the signal is aborted, the generation will stop and **the response will be
 * returned as is instead of throwing an error**". `LlamaSessionHandle.prompt` documented the
 * opposite ("Rejects with the generation's own error"), and every consumer believed the doc —
 * `translate.ts` runs the resolved value through `extractJsonish` and CACHES it, `localAgent.ts`
 * parses it as a plan. So a user cancel or a 90 s timeout landed after the first token became a
 * truncated translation presented as a finished one.
 *
 * The flag is kept: stopping cleanly is what leaves the sequence and its KV cache in the state
 * `llamaContextPool` hands back warm. What changed is that neither path returns the partial value.
 *
 * Two processes, so two guards, so two tests — plus the positive control each needs, because a
 * guard that rejects everything would pass the negative half on its own.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { llamaAbortedError } from '../../shared/llamaHostProtocol';
import type { LlamaHostRequest } from '../../shared/llamaHostProtocol';

/** What the fake `LlamaChatSession` does on its next `prompt`, set per test. */
const script = vi.hoisted(() => ({
  /** Resolved by the test, so an abort can be delivered while the generation is still running. */
  deferred: null as { resolve(text: string): void; promise: Promise<string> } | null,
  /** Signals the sessions were handed, so a test can assert the flag really is passed down. */
  optsSeen: [] as Record<string, unknown>[],
}));

function defer(): { resolve(text: string): void; promise: Promise<string> } {
  let resolve!: (text: string) => void;
  const promise = new Promise<string>((r) => { resolve = r; });
  return { resolve, promise };
}

vi.mock('node-llama-cpp', () => ({
  LlamaChatSession: class {
    prompt(_text: string, opts: Record<string, unknown>): Promise<string> {
      script.optsSeen.push(opts);
      // Exactly what the real library does under `stopOnAbortSignal`: RESOLVE, never reject,
      // whatever the signal did. A mock that rejected would test the library, not the guard.
      return script.deferred ? script.deferred.promise : Promise.resolve('complete');
    }
  },
}));

vi.mock('../llamaContextPool', () => ({
  acquireLlamaContext: (modelPath: string, contextSize: number) => Promise.resolve({
    sequence: {},
    model: { tokenize: (text: string) => new Array(text.length) },
    modelPath,
    contextSize,
    warm: false,
    release: () => Promise.resolve(),
  }),
  llamaContextPoolStats: () => [],
}));
vi.mock('../llamaModelPool', () => ({ llamaModelPoolStats: () => [] }));
vi.mock('electron', () => ({ utilityProcess: { fork: () => { throw new Error('fork refused'); } } }));

const worker = await import('../llamaHostWorker');
const host = await import('../llamaHost');

interface Posted { id?: number; kind: string; text?: string; name?: string; session?: string }

function fakePort(): { posted: Posted[]; postMessage(m: unknown): void; on(): void } {
  const posted: Posted[] = [];
  return { posted, postMessage(m: unknown) { posted.push(m as Posted); }, on() { /* unused */ } };
}

/** Drives the worker's `acquire` and hands back the session id it minted. */
async function acquireInWorker(port: ReturnType<typeof fakePort>): Promise<string> {
  await worker.handle(port, { id: 1, kind: 'acquire', modelPath: 'C:\\m.gguf', contextSize: 4096 });
  const reply = port.posted.find((m) => m.kind === 'acquire');
  if (!reply?.session) throw new Error('the acquire posted no session');
  return reply.session;
}

beforeEach(() => {
  script.deferred = null;
  script.optsSeen.length = 0;
});

describe('llamaAbortedError', () => {
  it('carries the name the consumers key on, not just a message', () => {
    const err = llamaAbortedError();
    // `translate.ts` and `localAgent.ts` both branch on `err.name === 'AbortError'`, and the host
    // protocol carries `name` across the process boundary for exactly this reason.
    expect(err.name).toBe('AbortError');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/aborted/i);
  });
});

describe('the utility-process path', () => {
  it('rejects an aborted generation instead of replying with its partial text', async () => {
    const port = fakePort();
    const session = await acquireInWorker(port);

    script.deferred = defer();
    const request: LlamaHostRequest = { id: 2, kind: 'prompt', session, prompt: 'x', maxTokens: 64, stream: false };
    const running = worker.handle(port, request);
    // The generation has to be in flight before the abort, or the guard under test is not the one
    // that fires — an abort before the first token is the path that always worked.
    await Promise.resolve();
    await worker.handle(port, { id: 3, kind: 'abort', target: 2 });
    script.deferred.resolve('{"partial": tru');

    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    // The other half, and the one that is actually the defect: no answer was posted. With the
    // guard removed this is a `prompt` reply carrying `{"partial": tru`, which `extractJsonish`
    // would hand back as a translation.
    expect(port.posted.filter((m) => m.kind === 'prompt')).toHaveLength(0);
    expect(script.optsSeen[0].stopOnAbortSignal).toBe(true);
  });

  it('still replies normally when nothing aborted it', async () => {
    const port = fakePort();
    const session = await acquireInWorker(port);

    await worker.handle(port, { id: 2, kind: 'prompt', session, prompt: 'x', maxTokens: 64, stream: false });

    expect(port.posted.filter((m) => m.kind === 'prompt')).toEqual([
      { id: 2, kind: 'prompt', text: 'complete' },
    ]);
  });
});

describe('the in-process fallback path', () => {
  it('rejects an aborted generation instead of resolving with its partial text', async () => {
    host.resetLlamaHostForTests();
    const session = await host.acquireLlamaSession('C:\\m.gguf', 4096);
    const controller = new AbortController();

    script.deferred = defer();
    const running = session.prompt('x', { maxTokens: 64, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    script.deferred.resolve('{"partial": tru');

    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(script.optsSeen[0].stopOnAbortSignal).toBe(true);
    await session.release();
  });

  it('still resolves with the generation when nothing aborted it', async () => {
    host.resetLlamaHostForTests();
    const session = await host.acquireLlamaSession('C:\\m.gguf', 4096);

    await expect(session.prompt('x', { maxTokens: 64, signal: new AbortController().signal }))
      .resolves.toBe('complete');
    await session.release();
  });
});
