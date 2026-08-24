import type { Llama } from 'node-llama-cpp';

/**
 * One `Llama` backend for the whole main process, held for the process lifetime.
 *
 * `getLlama()` does not cache: `getLlamaForOptions` builds a new `Llama` per call and
 * `loadBindingModule` (`node-llama-cpp/dist/bindings/getLlama.js`) deliberately deletes the addon
 * from `require.cache` first, so every call loads another copy of the native `.node` with its own
 * thread pool and handles. Deleting a require-cache entry does not unload a DLL.
 *
 * Disposing it was tried first and measured not to work. On the live app
 * (`src/.coordination/liquid-workplace/L7_PERF_DICTIONARY.md`, 2026-08-24) main went
 * 1,052 handles at boot -> 4,378 after one load/unload cycle -> 6,811 after a second, *with*
 * `llama.dispose()` called on every cycle: 4,378 / 6,809 without it. About +2,425 handles per
 * cycle either way. So the product answer is to stop cycling the backend at all — the model and
 * the context, which own the GBs, are still loaded and released per use.
 *
 * Nothing here loads a model. Creating the backend costs the addon and its thread pool once; the
 * 1.2 GB GGUF and its KV cache remain the callers' to load and dispose.
 */
let backendPromise: Promise<Llama> | null = null;

/**
 * The process-wide backend, created on first use. Concurrent callers share one in-flight load, and
 * a failed load is not cached, so a later attempt retries rather than inheriting the rejection.
 */
export async function getSharedLlama(): Promise<Llama> {
  if (!backendPromise) {
    const pending = (async () => {
      const { getLlama } = await import('node-llama-cpp');
      return getLlama();
    })();
    backendPromise = pending;
    pending.catch(() => {
      if (backendPromise === pending) backendPromise = null;
    });
  }
  return backendPromise;
}

/** True once a backend has been created or is loading. Read by tests and the perf probes. */
export function isSharedLlamaLoaded(): boolean {
  return backendPromise !== null;
}

/**
 * Releases the backend. Only shutdown and tests should call this: a normal idle unload disposes
 * the context and the model and deliberately leaves the backend, which is the whole point above.
 */
export async function disposeSharedLlama(): Promise<void> {
  const pending = backendPromise;
  backendPromise = null;
  if (!pending) return;
  try {
    const llama = (await pending) as unknown as { dispose?: () => unknown };
    await llama.dispose?.();
  } catch {
    /* Native teardown is best effort; the process is going away or a test is resetting. */
  }
}
