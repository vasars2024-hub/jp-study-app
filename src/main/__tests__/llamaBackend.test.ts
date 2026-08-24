// @vitest-environment node
/**
 * Defect D2, measured on the live app 2026-08-24
 * (`src/.coordination/liquid-workplace/L7_PERF_DICTIONARY.md`): main's handle count went 1,052 at
 * boot -> 4,378 after one model load/unload cycle -> 6,811 after a second, *with* `llama.dispose()`
 * called on every cycle. Without it: 4,378 -> 6,809. Disposing moved 2 handles out of ~2,425 per
 * cycle, so the backend is now created once per process and never cycled.
 *
 * These cases pin the three properties that makes that safe: one instance however many callers,
 * concurrent callers share one in-flight load, and a FAILED load is not cached as the answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getLlamaCalls: number[] = [];
const disposedBackends: number[] = [];
/** Boxed so the hoisted `vi.mock` factory reads the live value rather than capturing `false`. */
const getLlamaFails = { value: false };

vi.mock('node-llama-cpp', () => ({
  // The real `getLlama()` does not cache: `getLlamaForOptions` builds a new `Llama` per call and
  // `loadBindingModule` re-`require`s the addon with its cache entry deleted first. The fake hands
  // back a distinct instance per call for the same reason, so a shared one is a real observation.
  getLlama: () => {
    const id = getLlamaCalls.length + 1;
    getLlamaCalls.push(id);
    if (getLlamaFails.value) return Promise.reject(new Error('no CUDA device'));
    return Promise.resolve({
      id,
      loadModel: () => Promise.resolve({}),
      dispose: () => {
        disposedBackends.push(id);
      },
    });
  },
}));

const backend = await import('../llamaBackend');

beforeEach(async () => {
  await backend.disposeSharedLlama();
  getLlamaCalls.length = 0;
  disposedBackends.length = 0;
  getLlamaFails.value = false;
});

afterEach(async () => {
  await backend.disposeSharedLlama();
});

describe('shared llama backend', () => {
  it('builds one backend however many callers ask for it', async () => {
    const first = await backend.getSharedLlama();
    const second = await backend.getSharedLlama();
    const third = await backend.getSharedLlama();

    expect(getLlamaCalls).toHaveLength(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const [first, second] = await Promise.all([backend.getSharedLlama(), backend.getSharedLlama()]);

    expect(getLlamaCalls).toHaveLength(1);
    expect(second).toBe(first);
  });

  it('reports whether a backend exists, without creating one', async () => {
    expect(backend.isSharedLlamaLoaded()).toBe(false);
    await backend.getSharedLlama();
    expect(backend.isSharedLlamaLoaded()).toBe(true);
    expect(getLlamaCalls).toHaveLength(1);
  });

  /**
   * A cached rejection would make one bad load permanent for the process lifetime — the failure
   * mode `translate.ts` already paid for once with `loadPromise`, which was cleared on failure but
   * not on success and made the idle-unload guard permanently false.
   */
  it('does not cache a failed load, so a later attempt retries', async () => {
    getLlamaFails.value = true;
    await expect(backend.getSharedLlama()).rejects.toThrow('no CUDA device');
    expect(backend.isSharedLlamaLoaded()).toBe(false);

    getLlamaFails.value = false;
    await expect(backend.getSharedLlama()).resolves.toMatchObject({ id: 2 });
    expect(getLlamaCalls).toHaveLength(2);
  });

  it('disposes on shutdown and builds a fresh one if asked again', async () => {
    const first = await backend.getSharedLlama();
    await backend.disposeSharedLlama();

    expect(disposedBackends).toEqual([1]);
    expect(backend.isSharedLlamaLoaded()).toBe(false);

    const second = await backend.getSharedLlama();
    expect(second).not.toBe(first);
    expect(getLlamaCalls).toHaveLength(2);
  });

  it('is a no-op when nothing was ever loaded', async () => {
    await expect(backend.disposeSharedLlama()).resolves.toBeUndefined();
    expect(getLlamaCalls).toHaveLength(0);
  });
});
