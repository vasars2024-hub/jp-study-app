// Main's side of the local-model utility process.
//
// One long-lived child for the whole app, forked on the first acquire and reaped when it says its
// pools have gone empty. `llamaHostWorker.ts` carries why it exists at all; this file is only the
// wire, the session handles and the exit negotiation.
//
// Nothing native crosses this boundary. Consumers used to hold a `LlamaContext`, a
// `LlamaContextSequence` and a `LlamaModel`; they now hold a `LlamaSessionHandle` — a string id and
// four methods. That is the whole reason the residue can be reclaimed: main cannot be holding what
// main cannot name.

import { utilityProcess } from 'electron';
import path from 'node:path';
import type {
  LlamaContextPoolRow,
  LlamaHostRequest,
  LlamaHostResponse,
  LlamaModelPoolRow,
  LlamaSessionId,
} from '../shared/llamaHostProtocol';
import { isLlamaHostFarewell, llamaAbortedError } from '../shared/llamaHostProtocol';
import { acquireLlamaContext, llamaContextPoolStats } from './llamaContextPool';
import { llamaModelPoolStats } from './llamaModelPool';

/**
 * Vite names the output after the entry file, so `llamaHostWorker.ts` builds to
 * `<.vite/build>/llamaHostWorker.js` beside `main.js` — the same resolution `apkgReadHost.ts` and
 * `dictionary/importJobs.ts` use for theirs.
 */
export function llamaHostWorkerPath(): string {
  return path.join(__dirname, 'llamaHostWorker.js');
}

/** What a consumer holds instead of a context, a sequence and a model. */
export interface LlamaSessionHandle {
  readonly modelPath: string;
  readonly contextSize: number;
  /** True when this session was built over a KV cache that was still resident. */
  readonly warm: boolean;
  /**
   * Resolves only with a generation that ran to completion.
   *
   * Rejects with the generation's own error, `name` preserved so `AbortError` stays recognisable —
   * and rejects with an `AbortError` when `signal` fired mid-generation, which the library itself
   * does NOT do under `stopOnAbortSignal` (it resolves with the partial response). `llamaAbortedError`
   * carries the reasoning. Partial output is still delivered through `onTextChunk` as it arrives;
   * it is only refused as a return value.
   */
  prompt(text: string, opts: { maxTokens: number; signal?: AbortSignal; onTextChunk?: (chunk: string) => void }): Promise<string>;
  /** The real tokenizer's count. Rejects if the weights cannot answer; callers estimate instead. */
  countTokens(text: string): Promise<number>;
  resetHistory(): Promise<void>;
  release(): Promise<void>;
  /**
   * True once the host process that held this session has exited or been
   * replaced. Every method then rejects with `LlamaSessionLostError`; the
   * consumer drops its cached handle and acquires a fresh one.
   */
  isLost?(): boolean;
}

/**
 * The host process that held a session is gone, so the session is too. Typed
 * so a consumer can drop its cached handle instead of retrying a dead id —
 * a replacement child does not know it (or, worse, reuses it for another).
 */
export class LlamaSessionLostError extends Error {
  constructor() {
    super('The local model process restarted; the session has to be acquired again.');
    this.name = 'LlamaSessionLostError';
  }
}

export function isLlamaSessionLost(err: unknown): boolean {
  return err instanceof Error && err.name === 'LlamaSessionLostError';
}

/**
 * Deadlines for host RPCs that must answer promptly. A host that is alive but
 * no longer answering (a native stall) would otherwise leave every caller —
 * and the translation queue behind it — pending forever. On expiry the call
 * rejects with a `TimeoutError` and the host is replaced.
 */
export const LLAMA_HOST_RPC_TIMEOUT_MS = 30_000;
/** Acquire loads weights, which is slow on a cold disk; still bounded. */
export const LLAMA_HOST_ACQUIRE_TIMEOUT_MS = 240_000;
/**
 * After a prompt is aborted, how long the host gets to acknowledge before it
 * is treated as hung. Generation stops within a token of an abort.
 */
export const LLAMA_HOST_ABORT_GRACE_MS = 15_000;

interface Pending {
  resolve(value: LlamaHostResponse): void;
  reject(err: Error): void;
  onChunk?: (chunk: string) => void;
}

type Child = ReturnType<typeof utilityProcess.fork>;

let child: Child | null = null;
/** Set for the life of the process once a quit has torn the host down; no refork after that. */
let stopped = false;
/** True once a fork attempt failed, so the in-process fallback is used without re-forking per call. */
let forkUnavailable = false;
/** Cleared only by a fork that answered something, so a bundle that is simply absent is not retried. */
let everAnswered = false;
let nextRequestId = 1;
/** Bumped per fork; a session belongs to the generation that created it. */
let generation = 0;
const pending = new Map<number, Pending>();
/** Sessions main believes the current child holds, so a child death can invalidate them. */
const liveSessions = new Set<LlamaSessionId>();

function rebuild(message: string, name?: string): Error {
  const err = new Error(message);
  if (name) err.name = name;
  return err;
}

function rejectAllPending(reason: string): void {
  const waiting = [...pending.values()];
  pending.clear();
  for (const entry of waiting) entry.reject(new Error(reason));
}

function onChildExit(dead: Child): void {
  if (child !== dead) return;
  child = null;
  liveSessions.clear();
  // A child that never said a word is a packaging fault, not a crash: forking it again per request
  // would be a fork storm in front of a bundle that is not there. One attempt, then the fallback.
  if (!everAnswered) forkUnavailable = true;
  rejectAllPending('The local model process exited before it answered.');
}

/**
 * Takes the child up on its idle offer, or ignores it.
 *
 * Ignoring is the correct answer whenever anything is pending: the child polls, so a declined offer
 * costs one repeat, while accepting one with a request on the wire would strand that request. The
 * reference is cleared BEFORE the kill so a caller arriving in the same tick forks a fresh child
 * rather than posting into a corpse.
 */
function acceptIdleOffer(offering: Child): void {
  if (child !== offering || pending.size > 0 || liveSessions.size > 0) return;
  child = null;
  try {
    offering.kill();
  } catch {
    /* Already gone, which is the outcome we wanted. */
  }
}

function ensureChild(): Child | null {
  if (stopped || forkUnavailable) return null;
  if (child) return child;
  let forked: Child;
  try {
    forked = utilityProcess.fork(llamaHostWorkerPath(), [], { serviceName: 'jp-llama-host' });
  } catch {
    forkUnavailable = true;
    return null;
  }
  child = forked;
  generation += 1;
  forked.on('message', (value: unknown) => {
    if (isLlamaHostFarewell(value)) {
      acceptIdleOffer(forked);
      return;
    }
    everAnswered = true;
    const message = value as LlamaHostResponse | undefined;
    if (!message || typeof message.id !== 'number') return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    // A chunk is not a settlement — the `prompt` reply still follows it.
    if (message.kind === 'chunk') {
      waiter.onChunk?.(message.text);
      return;
    }
    pending.delete(message.id);
    if (message.kind === 'error') waiter.reject(rebuild(message.error, message.name));
    else waiter.resolve(message);
  });
  forked.on('exit', () => onChildExit(forked));
  return forked;
}

/**
 * Replaces a host that stopped answering: every pending call is rejected now
 * (not whenever the OS reaps the process), live sessions are invalidated, and
 * the next acquire forks a fresh child.
 */
function replaceHungHost(hung: Child, reason: string): void {
  if (child !== hung) return;
  child = null;
  liveSessions.clear();
  rejectAllPending(reason);
  try {
    hung.kill();
  } catch {
    /* Already gone. */
  }
}

function hostTimeoutError(kind: string, ms: number): Error {
  const err = new Error(`The local model process did not answer ${kind} within ${Math.round(ms / 1000)} s.`);
  err.name = 'TimeoutError';
  return err;
}

function post(
  request: LlamaHostRequest,
  onChunk?: (chunk: string) => void,
  deadlineMs?: number,
): Promise<LlamaHostResponse> {
  const active = ensureChild();
  if (!active) return Promise.reject(new Error('llama-host: no worker process'));
  return new Promise<LlamaHostResponse>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (): void => {
      if (timer) clearTimeout(timer);
    };
    pending.set(request.id, {
      resolve: (value) => { done(); resolve(value); },
      reject: (err) => { done(); reject(err); },
      onChunk,
    });
    if (deadlineMs && deadlineMs > 0) {
      timer = setTimeout(() => {
        if (!pending.delete(request.id)) return;
        reject(hostTimeoutError(request.kind, deadlineMs));
        replaceHungHost(active, 'The local model process stopped answering and was restarted.');
      }, deadlineMs);
      timer.unref?.();
    }
    try {
      active.postMessage(request);
    } catch (err) {
      pending.delete(request.id);
      done();
      // A child that died between `ensureChild` and here is the same "no worker" condition, not a
      // caller error: drop it so the next call forks a live one.
      if (child === active) child = null;
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function remoteSession(id: LlamaSessionId, modelPath: string, contextSize: number, warm: boolean): LlamaSessionHandle {
  let released = false;
  const owner = generation;
  const owningChild = child;
  // The child this session lives in exited or was replaced: its id means
  // nothing to the current child, so nothing may be sent under it.
  const lost = (): boolean => owner !== generation || child === null || !liveSessions.has(id);
  const assertAlive = (): void => {
    if (lost()) throw new LlamaSessionLostError();
  };
  return {
    modelPath,
    contextSize,
    warm,
    isLost: lost,
    async prompt(text, opts) {
      assertAlive();
      const requestId = nextRequestId++;
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      const forward = (): void => {
        // Best effort by design: a child that has already exited has already stopped generating.
        void post({ id: nextRequestId++, kind: 'abort', target: requestId }).catch(() => undefined);
        // A generation that does not stop after an abort is a stalled host. Without this the
        // prompt stays pending forever and everything queued behind it with it.
        if (!graceTimer) {
          graceTimer = setTimeout(() => {
            const waiter = pending.get(requestId);
            if (!waiter || !owningChild) return;
            pending.delete(requestId);
            waiter.reject(hostTimeoutError('an abort', LLAMA_HOST_ABORT_GRACE_MS));
            replaceHungHost(owningChild, 'The local model process stopped answering and was restarted.');
          }, LLAMA_HOST_ABORT_GRACE_MS);
          graceTimer.unref?.();
        }
      };
      // `abort` is fire-and-forget on the child's side and is never answered, so it must not be
      // awaited here — see the worker's `case 'abort'`.
      if (opts.signal?.aborted) forward();
      opts.signal?.addEventListener('abort', forward, { once: true });
      try {
        const reply = await post(
          { id: requestId, kind: 'prompt', session: id, prompt: text, maxTokens: opts.maxTokens, stream: Boolean(opts.onTextChunk) },
          opts.onTextChunk,
        );
        return reply.kind === 'prompt' ? reply.text : '';
      } catch (err) {
        // The host died under this prompt: say so in the typed form.
        if (lost() && !(err instanceof Error && err.name === 'TimeoutError')) throw new LlamaSessionLostError();
        throw err;
      } finally {
        if (graceTimer) clearTimeout(graceTimer);
        opts.signal?.removeEventListener('abort', forward);
      }
    },
    async countTokens(text) {
      assertAlive();
      const reply = await post(
        { id: nextRequestId++, kind: 'countTokens', session: id, text },
        undefined,
        LLAMA_HOST_RPC_TIMEOUT_MS,
      );
      if (reply.kind === 'countTokens') return reply.tokens;
      throw new Error('llama-host: tokenizer unavailable');
    },
    async resetHistory() {
      if (released || lost()) return;
      await post({ id: nextRequestId++, kind: 'resetHistory', session: id }, undefined, LLAMA_HOST_RPC_TIMEOUT_MS);
    },
    async release() {
      if (released) return;
      released = true;
      const wasLost = lost();
      liveSessions.delete(id);
      // A child that already exited took the native memory with it, which is exactly what release
      // was asking for; only a live one needs telling.
      if (child && !wasLost) {
        await post({ id: nextRequestId++, kind: 'release', session: id }, undefined, LLAMA_HOST_RPC_TIMEOUT_MS);
      }
    },
  };
}

/**
 * The in-process path, used only when there is no worker to fork.
 *
 * Measured 2026-08-18 on the apkg reader: `utilityProcess.fork()` on an absent module does not
 * throw — it hands back a child that exits with code 1 — so a packaging fault reaches this through
 * the `exit` handler, not the `catch`. Running llama.cpp here costs the residue this whole file
 * exists to reclaim, and that is still strictly better than an app whose local model has silently
 * disappeared. It is the pre-existing behaviour, not a new failure.
 */
async function inProcessSession(modelPath: string, contextSize: number): Promise<LlamaSessionHandle> {
  const { LlamaChatSession } = await import('node-llama-cpp');
  const lease = await acquireLlamaContext(modelPath, contextSize);
  let session: InstanceType<typeof LlamaChatSession>;
  try {
    session = new LlamaChatSession({ contextSequence: lease.sequence });
  } catch (err) {
    await lease.release().catch(() => undefined);
    throw err;
  }
  let released = false;
  const reset = (): void => {
    const mutable = session as typeof session & { resetChatHistory?: () => void; setChatHistory?: (h: []) => void };
    if (typeof mutable.resetChatHistory === 'function') mutable.resetChatHistory();
    else if (typeof mutable.setChatHistory === 'function') mutable.setChatHistory([]);
  };
  return {
    modelPath,
    contextSize,
    warm: lease.warm,
    async prompt(text, opts) {
      const generated = await session.prompt(text, {
        maxTokens: opts.maxTokens,
        signal: opts.signal,
        stopOnAbortSignal: true,
        onTextChunk: opts.onTextChunk,
      });
      // See `llamaAbortedError`. `stopOnAbortSignal` resolves with the partial response rather than
      // throwing, so this is the only place the in-process path can tell a finished generation from
      // an interrupted one — and every caller reads the resolved value as the whole answer.
      if (opts.signal?.aborted) throw llamaAbortedError();
      return generated;
    },
    async countTokens(text) {
      const model = lease.model as unknown as { tokenize?: (text: string) => unknown };
      const tokens = model.tokenize?.(text);
      if (!Array.isArray(tokens)) throw new Error('llama-host: tokenizer unavailable');
      return tokens.length;
    },
    async resetHistory() {
      reset();
    },
    async release() {
      if (released) return;
      released = true;
      await lease.release();
    },
  };
}

/**
 * Borrows a chat session over `modelPath` at `contextSize`.
 *
 * The child owns the pooling, so two consumers asking for the same GGUF still share one copy of the
 * weights and one KV cache per size — `llamaContextPool.ts` is the same module doing the same job,
 * merely in another process.
 */
export async function acquireLlamaSession(modelPath: string, contextSize: number): Promise<LlamaSessionHandle> {
  const active = ensureChild();
  if (!active) return inProcessSession(modelPath, contextSize);
  let reply: LlamaHostResponse;
  try {
    reply = await post({ id: nextRequestId++, kind: 'acquire', modelPath, contextSize }, undefined, LLAMA_HOST_ACQUIRE_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw err;
    // A child that died on startup (a missing bundle exits 1 rather than throwing on fork) must not
    // take the feature with it. A genuine model error — a missing GGUF, out of VRAM — is the
    // product's own message and is rethrown.
    if (child === null && !stopped) return inProcessSession(modelPath, contextSize);
    throw err;
  }
  if (reply.kind !== 'acquire') throw new Error('llama-host: bad acquire reply');
  liveSessions.add(reply.session);
  return remoteSession(reply.session, modelPath, contextSize, reply.warm);
}

/**
 * What the pools are holding, for `/mem` and the perf probes.
 *
 * No child means nothing is resident, which is a real answer rather than a missing one: the process
 * that owned the weights is gone, so both rows are legitimately empty.
 */
export async function llamaHostStats(): Promise<{ models: LlamaModelPoolRow[]; contexts: LlamaContextPoolRow[] }> {
  if (forkUnavailable) return { models: llamaModelPoolStats(), contexts: llamaContextPoolStats() };
  if (!child) return { models: [], contexts: [] };
  try {
    const reply = await post({ id: nextRequestId++, kind: 'stats' }, undefined, LLAMA_HOST_RPC_TIMEOUT_MS);
    if (reply.kind === 'stats') return { models: reply.models, contexts: reply.contexts };
  } catch {
    /* A host that died mid-question is holding nothing, which is what the empty answer says. */
  }
  return { models: [], contexts: [] };
}

/** True while a host process exists. Read by tests and the perf probes. */
export function isLlamaHostRunning(): boolean {
  return child !== null;
}

/**
 * Ends the local-model runtime at quit.
 *
 * Synchronous by signature like every other `stop*` in `main.ts`'s `will-quit`, and unlike the
 * in-process teardown it replaces there is nothing to await: killing the child returns the weights,
 * the KV cache, the native addon and its thread pool in one step, and a native teardown that hangs
 * can no longer hang the quit. Idempotent.
 */
export function stopLlamaHost(): void {
  stopped = true;
  const dead = child;
  child = null;
  liveSessions.clear();
  rejectAllPending('The local model process was shut down.');
  if (!dead) return;
  try {
    dead.kill();
  } catch {
    /* Already gone. */
  }
}

/** Test seam only: lets a suite drive a fresh host after it has driven a shutdown. */
export function resetLlamaHostForTests(): void {
  stopped = false;
  forkUnavailable = false;
  everAnswered = false;
  child = null;
  liveSessions.clear();
  pending.clear();
}
