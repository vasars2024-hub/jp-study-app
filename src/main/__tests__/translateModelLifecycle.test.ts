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
    getSequence: () => ({}),
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
        loadModel: () => Promise.resolve(model),
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

beforeEach(() => {
  createContextCalls.length = 0;
  getLlamaCalls.length = 0;
  disposed.length = 0;
  fs.mkdirSync(path.join(tmpRoot, 'models'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'models', 'Qwen3-1.7B.gguf'), 'not a real model');
});

afterEach(async () => {
  await translate.unloadTranslationModel();
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

  it('disposes the context, the model AND the backend, not just the session', async () => {
    await translate.ensureTranslateReady();
    expect(disposed).toEqual([]);

    await translate.unloadTranslationModel();

    // Innermost first: the context holds the KV cache and belongs to the model, and both belong to
    // the `Llama` backend, which owns the freshly-required native addon and its thread pool.
    expect(disposed).toEqual(['context', 'model', 'llama']);
  });

  /**
   * The half of D1 the first fix left behind, and it only shows up over MORE THAN ONE cycle.
   * `getLlama()` builds a new backend each call and `loadBindingModule` re-`require`s the `.node`
   * with its cache entry deleted, so an undisposed backend is a whole native addon retained per
   * load. Measured live before this: boot 551.4 MB / 1,051 handles -> after one load+unload cycle
   * 1,082.4 MB / 4,378 handles -> a second load 3,634.9 MB / 6,809 handles. Handles never fell.
   */
  it('disposes one backend per load, so cycles do not stack them', async () => {
    await translate.ensureTranslateReady();
    await translate.unloadTranslationModel();
    await translate.ensureTranslateReady();
    await translate.unloadTranslationModel();

    expect(getLlamaCalls).toHaveLength(2);
    expect(disposed.filter((d) => d === 'llama')).toHaveLength(2);
  });

  /**
   * A load that fails after `getLlama()` but before the session exists still created a backend.
   * If that one is unreachable, the retention this fix closes comes straight back on the error
   * path — which is the shape the whole of D1 had.
   */
  it('releases the backend when the load fails after it was created', async () => {
    createContextFails.value = true;
    try {
      const result = await translate.ensureTranslateReady();
      expect(result.ok).toBe(false);
    } finally {
      createContextFails.value = false;
    }

    expect(getLlamaCalls).toHaveLength(1);
    expect(disposed).toContain('llama');
  });

  it('reloads after an unload rather than handing back a disposed runtime', async () => {
    await translate.ensureTranslateReady();
    await translate.unloadTranslationModel();
    await expect(translate.ensureTranslateReady()).resolves.toEqual({ ok: true });

    expect(createContextCalls).toHaveLength(2);
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
      await vi.waitFor(() => expect(disposed).toEqual(['context', 'model', 'llama']));
      expect(translate.isTranslateReady()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
