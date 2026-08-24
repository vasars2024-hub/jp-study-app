// The local-model utility process: where llama.cpp actually lives.
//
// ## Why this file exists
//
// Measured on the live app 2026-08-24 (`L7_PERF_DICTIONARY.md`, leg 3, cold boot pid 3668): one
// Dictionary burst took main from 546.4 MB / 1,063 handles to 3,515.4 MB / 4,406, and the idle path
// gave 2,434 MB back on its own — down to **1,081.1 MB / 4,410 with both pools empty**. The 2.4 GB
// that returns is the weights and the KV cache. The **+534.6 MB / +3,349 handles that do not** are
// the native addon and its thread pool, and `llamaBackend.ts` banks the reason they cannot be
// disposed: `getLlama()` deletes the addon from `require.cache` and loads another copy of the
// `.node` per call, so cycling the backend costs ~2,425 handles a cycle whether or not
// `llama.dispose()` runs. Deleting a require-cache entry does not unload a DLL.
//
// A process exit does. That is the entire argument for this file: the residue is only reclaimable
// by putting llama.cpp somewhere that can END, and the pools' own residency policy already tells us
// exactly when that is — when both of them are empty.
//
// ## Why utilityProcess and not worker_threads
//
// A worker thread shares this process's address space and handle table, so the residue would stay
// exactly where it is. Only a real child hands it back to the OS. Same conclusion as
// `dictionary/importWorker.ts` and `anki/apkgReadWorker.ts`, reached from the opposite direction:
// they wanted the main loop free, this wants the address space back.
//
// ## What lives here and what does not
//
// The three pool modules are imported UNCHANGED — `llamaBackend`, `llamaModelPool`,
// `llamaContextPool` — so the churn windows, the grace doubling, the exclusive context checkout and
// the innermost-first teardown are the same code with the same tests, merely running somewhere
// else. What is new is only the session table and the exit negotiation below.
//
// A utility process is Node with a sliver of Electron: `app` and `ipcMain` are absent. Nothing here
// resolves a path or reads a setting — main sends the GGUF path and the context size it already
// resolved, exactly as `apkgReadWorker.ts` receives its file path.

import type { LlamaChatSession } from 'node-llama-cpp';
import { acquireLlamaContext, llamaContextPoolStats, type LlamaContextLease } from './llamaContextPool';
import { llamaModelPoolStats } from './llamaModelPool';
import type { LlamaHostRequest, LlamaHostResponse, LlamaSessionId } from '../shared/llamaHostProtocol';

/**
 * `process.parentPort` is Electron's utility-process channel. Typed locally because this module is
 * also loadable under plain Node, where it is absent — the same reason `apkgReadWorker.ts` does it.
 */
interface ParentPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  start?(): void;
}

function parentPort(): ParentPort | null {
  return (process as unknown as { parentPort?: ParentPort }).parentPort ?? null;
}

interface HostSession {
  lease: LlamaContextLease;
  session: LlamaChatSession;
}

const sessions = new Map<LlamaSessionId, HostSession>();
/** In-flight generations by request id, so `abort` can reach the one controller that matters. */
const inflight = new Map<number, AbortController>();
let nextSessionId = 1;

/**
 * How often the child asks whether it is still needed.
 *
 * Deliberately coarse. The thing being waited on is the model pool's 60 s grace behind the context
 * pool's 60 s grace behind a caller's 300 s idle deadline, so resolution finer than this buys
 * nothing and a timer that fires 4 times a minute in an idle process is already more than the
 * question deserves.
 */
const IDLE_CHECK_MS = 15_000;

function send(port: ParentPort, message: LlamaHostResponse | { kind: 'bye'; reason: 'idle' }): void {
  try {
    port.postMessage(message);
  } catch {
    /* The parent is gone; this process is about to be reaped with it. */
  }
}

function fail(port: ParentPort, id: number, err: unknown): void {
  const error = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : undefined;
  send(port, { id, kind: 'error', error, name });
}

/**
 * True when nothing in this process is holding native memory.
 *
 * Both pools, not just the session table: a released context lingers through its grace window with
 * the weights still resident behind it, and exiting then would throw away exactly the warm reacquire
 * the pools exist to provide. Empty pools are the pools' own statement that they are done.
 */
function idle(): boolean {
  return sessions.size === 0 && inflight.size === 0
    && llamaContextPoolStats().length === 0
    && llamaModelPoolStats().length === 0;
}

async function handle(port: ParentPort, request: LlamaHostRequest): Promise<void> {
  switch (request.kind) {
    case 'acquire': {
      const { LlamaChatSession } = await import('node-llama-cpp');
      const lease = await acquireLlamaContext(request.modelPath, request.contextSize);
      try {
        const id = `s${nextSessionId++}`;
        sessions.set(id, { lease, session: new LlamaChatSession({ contextSequence: lease.sequence }) });
        send(port, { id: request.id, kind: 'acquire', session: id, warm: lease.warm });
      } catch (err) {
        // A session that could not be built must give the context back, or the pool holds a KV
        // cache nothing can ever reach — the retention shape the pool exists to remove.
        await lease.release().catch(() => undefined);
        throw err;
      }
      return;
    }

    case 'prompt': {
      const entry = sessions.get(request.session);
      if (!entry) throw new Error(`llama-host: unknown session ${request.session}`);
      const controller = new AbortController();
      inflight.set(request.id, controller);
      try {
        const text = await entry.session.prompt(request.prompt, {
          maxTokens: request.maxTokens,
          signal: controller.signal,
          stopOnAbortSignal: true,
          onTextChunk: request.stream
            ? (chunk: string) => send(port, { id: request.id, kind: 'chunk', text: chunk })
            : undefined,
        });
        send(port, { id: request.id, kind: 'prompt', text });
      } finally {
        inflight.delete(request.id);
      }
      return;
    }

    case 'abort': {
      // Never answered: the `prompt` it targets settles on its own, either with the partial text
      // `stopOnAbortSignal` returns or with the abort error it throws. Answering here as well would
      // settle the caller's promise twice.
      inflight.get(request.target)?.abort();
      return;
    }

    case 'countTokens': {
      const entry = sessions.get(request.session);
      if (!entry) throw new Error(`llama-host: unknown session ${request.session}`);
      const model = entry.lease.model as unknown as { tokenize?: (text: string) => unknown };
      const tokens = model.tokenize?.(request.text);
      if (!Array.isArray(tokens)) throw new Error('llama-host: tokenizer unavailable');
      send(port, { id: request.id, kind: 'countTokens', tokens: tokens.length });
      return;
    }

    case 'resetHistory': {
      const entry = sessions.get(request.session);
      // Resetting a session that is already gone is what the caller wanted, not an error: both
      // consumers reset in a `finally` that can run after an unload has released the runtime.
      if (entry) {
        const mutable = entry.session as LlamaChatSession & {
          resetChatHistory?: () => void;
          setChatHistory?: (history: []) => void;
        };
        if (typeof mutable.resetChatHistory === 'function') mutable.resetChatHistory();
        else if (typeof mutable.setChatHistory === 'function') mutable.setChatHistory([]);
      }
      send(port, { id: request.id, kind: 'ok' });
      return;
    }

    case 'release': {
      const entry = sessions.get(request.session);
      sessions.delete(request.session);
      // RELEASED, not disposed — the pool keeps the cache warm through its grace window, which is
      // what makes a user returning inside that window pay nothing.
      if (entry) await entry.lease.release();
      send(port, { id: request.id, kind: 'ok' });
      return;
    }

    case 'stats': {
      send(port, {
        id: request.id,
        kind: 'stats',
        models: llamaModelPoolStats(),
        contexts: llamaContextPoolStats(),
      });
      return;
    }

    default: {
      const exhaustive: never = request;
      throw new Error(`llama-host: unknown request ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Offers to exit. It does NOT exit on its own, and that is the race fix rather than caution.
 *
 * A child that exited the moment it went idle could do so while an `acquire` was already on the
 * wire, and that request would never be answered by anyone. So the child only ever *says* it is
 * idle; main kills it when main is sure it has nothing pending, and ignores the offer otherwise.
 * A poll rather than a one-shot, so an ignored offer is simply repeated.
 */
function armIdleOffer(port: ParentPort): void {
  const timer = setInterval(() => {
    if (idle()) send(port, { kind: 'bye', reason: 'idle' });
  }, IDLE_CHECK_MS);
  timer.unref?.();
}

const port = parentPort();
if (port) {
  port.on('message', (event) => {
    const request = event.data as LlamaHostRequest | undefined;
    if (!request || typeof request.id !== 'number' || typeof request.kind !== 'string') return;
    handle(port, request).catch((err) => fail(port, request.id, err));
  });
  port.start?.();
  armIdleOffer(port);
}
