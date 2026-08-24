// @vitest-environment node
/**
 * The translation model must be BOUNDED and RELEASABLE. Both halves are defect D1.
 *
 * Measured on the live app, 2026-08-24 (`src/.coordination/liquid-workplace/L7_PERF_DICTIONARY.md`):
 * `createContext()` with no size asks node-llama-cpp for Qwen3-1.7B's full 32,768-token context,
 * and loading it took main's private bytes 3,447.7 -> 9,618.8 MB in 15 s. Nothing ever released it
 * — this module kept only the `LlamaChatSession`, so the model and context objects that own the
 * weights and the KV cache had no reachable reference to dispose. The process settled at 7,222 MB
 * and stayed there, which is exactly the 7,074 +/- 10 MB plateau four separate boots recorded.
 *
 * `localAgent.ts` already had both guards; this pins them here. The model is mocked, so this test
 * asserts the lifecycle contract and never loads a real GGUF.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-translate-lifecycle-'));

const createContextCalls: Array<Record<string, unknown> | undefined> = [];
const getLlamaCalls: number[] = [];
const loadModelCalls: string[] = [];
const disposed: string[] = [];
/** Boxed so the hoisted `vi.mock` factory reads the live value rather than capturing `false`. */
const createContextFails = { value: false };

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

vi.mock('node-llama-cpp', () => {
  const context = {
    getSequence: () => ({
      clearHistory: () => Promise.resolve(),
      dispose: () => {
        disposed.push('sequence');
      },
    }),
    dispose: () => {
      disposed.push('context');
    },
  };
  const model = {
    createContext: (options?: Record<string, unknown>) => {
      createContextCalls.push(options);
      if (createContextFails.value) return Promise.reject(new Error('out of VRAM'));
      return Promise.resolve(context);
    },
    dispose: () => {
      disposed.push('model');
    },
  };
  return {
    // `getLlama()` does NOT cache — `getLlamaForOptions` builds a new `Llama` every call and
    // `loadBindingModule` re-`require`s the addon with the cache entry deleted first — so the fake
    // hands back a distinct instance per call, exactly like the real one.
    getLlama: () => {
      getLlamaCalls.push(1);
      return Promise.resolve({
        loadModel: (options: { modelPath: string }) => {
          loadModelCalls.push(options.modelPath);
          return Promise.resolve(model);
        },
        dispose: () => {
          disposed.push('llama');
        },
      });
    },
    LlamaChatSession: class {
      // The session itself owns no native memory, so the fake ignores its options entirely.
      resetChatHistory(): void {
        /* no history in this fake */
      }
    },
  };
});

const translate = await import('../translate');
const llamaBackend = await import('../llamaBackend');
const modelPool = await import('../llamaModelPool');
const contextPool = await import('../llamaContextPool');

beforeEach(async () => {
  // The backend is process-lifetime by design, so a test that counts `getLlama()` calls has to
  // start from a process that has none. Only the tests reset it; the product never does. The same
  // goes for both pools, which deliberately hold the weights and the KV cache past the last
  // release — a context left warm here would fire its grace timer inside the NEXT test and push a
  // disposal into an array that test is asserting on.
  await translate.unloadTranslationModel();
  await contextPool.disposeAllLlamaContexts();
  await modelPool.disposeAllLlamaModels();
  await llamaBackend.disposeSharedLlama();
  createContextCalls.length = 0;
  getLlamaCalls.length = 0;
  loadModelCalls.length = 0;
  disposed.length = 0;
  fs.mkdirSync(path.join(tmpRoot, 'models'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'models', 'Qwen3-1.7B.gguf'), 'not a real model');
});

afterEach(async () => {
  await translate.unloadTranslationModel();
  await contextPool.disposeAllLlamaContexts();
  await modelPool.disposeAllLlamaModels();
});

describe('translation model lifecycle', () => {
  it('asks for a bounded context instead of the model default', async () => {
    await expect(translate.ensureTranslateReady()).resolves.toEqual({ ok: true });

    expect(createContextCalls).toHaveLength(1);
    const options = createContextCalls[0];
    // The defect is `createContext()` with no argument at all: node-llama-cpp then sizes the KV
    // cache to the model's full trained context.
    expect(options).toBeDefined();
    expect(typeof options?.contextSize).toBe('number');
    expect(options?.contextSize as number).toBeGreaterThan(0);
    expect(options?.contextSize as number).toBeLessThanOrEqual(8_192);
  });

  /**
   * Everything is RELEASED rather than disposed now, the KV cache included: `localAgent.ts` may
   * still be holding the same GGUF, and a user coming back inside the grace window should not
   * rebuild a cache that is still resident. So the unload itself frees NOTHING, and the two graces
   * run in series — innermost first, because a context over freed weights is freed native memory.
   * This drives both timers rather than asserting on the instant after unload; a version that
   * stopped at the unload would pass just as well against a pool that never frees anything.
   */
  it('releases on unload and frees innermost-first as the two graces expire, never the backend', async () => {
    vi.useFakeTimers();
    try {
      await translate.ensureTranslateReady();
      expect(disposed).toEqual([]);

      await translate.unloadTranslationModel();
      expect(disposed).toEqual([]);

      await vi.advanceTimersByTimeAsync(contextPool.CONTEXT_RELEASE_GRACE_MS + 1_000);
      await vi.waitFor(() => expect(disposed).toEqual(['sequence', 'context']));

      await vi.advanceTimersByTimeAsync(modelPool.MODEL_RELEASE_GRACE_MS + 1_000);
      await vi.waitFor(() => expect(disposed).toEqual(['sequence', 'context', 'model']));
      // The backend owns only the addon and its thread pool, is shared with `localAgent.ts`, and
      // stays for the process lifetime.
      expect(disposed).not.toContain('llama');
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The half of D1 the first fix left behind, and it only shows up over MORE THAN ONE cycle.
   * `getLlama()` builds a new backend each call and `loadBindingModule` re-`require`s the `.node`
   * with its cache entry deleted. Measured live: boot 1,051 handles -> 4,378 after one load+unload
   * cycle -> 6,809 after a second, and `llama.dispose()` on every cycle moved that to 4,378 ->
   * 6,811, i.e. nothing. So the backend is created ONCE and the cycles stop.
   */
  it('creates one backend for the process, however many load cycles run', async () => {
    await translate.ensureTranslateReady();
    await translate.unloadTranslationModel();
    await translate.ensureTranslateReady();
    await translate.unloadTranslationModel();

    expect(getLlamaCalls).toHaveLength(1);
    expect(disposed.filter((entry) => entry === 'llama')).toHaveLength(0);
  });

  /**
   * The residue the shared backend did NOT fix, and the reason `llamaModelPool.ts` exists: a second
   * load/unload cycle still cost **+1,212 handles / +103.2 MB** with the backend already shared
   * (`L7_PERF_DICTIONARY.md`, 2026-08-24). That is native teardown residue no JavaScript can
   * reclaim, so the only lever left is to run fewer cycles. Three cycles later the residue was
   * decomposed: with the weights resident a cycle still cost 612 handles and +1,298.5 MB, and that
   * is the KV CACHE — the larger half, 1,298 MB against a 1,223 MB model file. So a lookup landing
   * inside the grace window now rebuilds NEITHER: no `loadModel`, no `createContext`.
   */
  it('rebuilds neither the weights nor the cache when a second cycle starts inside the grace window', async () => {
    vi.useFakeTimers();
    try {
      await translate.ensureTranslateReady();
      await translate.unloadTranslationModel();
      await vi.advanceTimersByTimeAsync(modelPool.MODEL_RELEASE_GRACE_MS / 2);
      await translate.ensureTranslateReady();

      expect(loadModelCalls).toHaveLength(1);
      expect(createContextCalls).toHaveLength(1);
      expect(disposed).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  /** The negative control for the case above: past the window, both really are released. */
  it('does rebuild both once the grace windows have expired', async () => {
    vi.useFakeTimers();
    try {
      await translate.ensureTranslateReady();
      await translate.unloadTranslationModel();
      await vi.advanceTimersByTimeAsync(contextPool.CONTEXT_RELEASE_GRACE_MS + 1_000);
      await vi.advanceTimersByTimeAsync(modelPool.MODEL_RELEASE_GRACE_MS + 1_000);
      await vi.waitFor(() => expect(disposed).toEqual(['sequence', 'context', 'model']));
      await translate.ensureTranslateReady();

      expect(loadModelCalls).toHaveLength(2);
      expect(createContextCalls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A load that fails after `getLlama()` but before the session exists must not leave the module
   * holding a model, and must not tear down a backend the agent path may be using.
   */
  it('releases the model but keeps the shared backend when the load fails', async () => {
    createContextFails.value = true;
    try {
      const result = await translate.ensureTranslateReady();
      expect(result.ok).toBe(false);
    } finally {
      createContextFails.value = false;
    }

    expect(getLlamaCalls).toHaveLength(1);
    // The lease is given back, which is what "nothing of ours is left behind" means now: the pool
    // reports no user, so the weights are on their way out rather than pinned by a phantom count.
    expect(modelPool.llamaModelPoolStats()).toEqual([
      expect.objectContaining({ leases: 0, resident: true, awaitingRelease: true }),
    ]);
    expect(disposed).not.toContain('llama');
    expect(llamaBackend.isSharedLlamaLoaded()).toBe(true);
  });

  it('reloads after an unload rather than handing back a disposed runtime', async () => {
    await translate.ensureTranslateReady();
    await translate.unloadTranslationModel();
    await expect(translate.ensureTranslateReady()).resolves.toEqual({ ok: true });

    // Real timers, so this reacquire is inside the grace window: the cache is reused rather than
    // rebuilt, and the session is built fresh on top of it. What must NOT happen is the module
    // handing back the session it just tore down — `isTranslateReady` is the check for that.
    expect(createContextCalls).toHaveLength(1);
    expect(translate.isTranslateReady()).toBe(true);
  });

  it('reports the model as not ready once it has been unloaded', async () => {
    await translate.ensureTranslateReady();
    expect(translate.isTranslateReady()).toBe(true);

    await translate.unloadTranslationModel();
    expect(translate.isTranslateReady()).toBe(false);
  });

  /**
   * The half of the fix that shipped broken and was caught live rather than here. `loadPromise`
   * was only cleared on failure, so the idle guard's `!loadPromise` was permanently false and the
   * scheduled unload ran, found the guard false, and did nothing: measured on the running app,
   * the model was still resident at 3,290 MB 460 s after a 300 s deadline. An assertion on
   * `unloadTranslationModel` alone cannot see that — only driving the timer can.
   */
  it('actually unloads once the idle deadline passes', async () => {
    vi.useFakeTimers();
    try {
      await translate.ensureTranslateReady();
      expect(disposed).toEqual([]);

      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000);
      // The deadline RELEASES; it disposes nothing, because the agent may be holding the same file
      // and the user may come straight back. What it must do is drop the session, and that is what
      // `isTranslateReady` reports — an unload that silently did nothing is the defect above.
      expect(translate.isTranslateReady()).toBe(false);
      expect(disposed).toEqual([]);

      // The cache follows once its grace expires, then the weights once theirs does.
      await vi.advanceTimersByTimeAsync(contextPool.CONTEXT_RELEASE_GRACE_MS + 1_000);
      await vi.advanceTimersByTimeAsync(modelPool.MODEL_RELEASE_GRACE_MS + 1_000);
      await vi.waitFor(() => expect(disposed).toEqual(['sequence', 'context', 'model']));
    } finally {
      vi.useRealTimers();
    }
  });
});
