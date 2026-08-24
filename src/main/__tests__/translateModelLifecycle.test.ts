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
const disposed: string[] = [];

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
      return Promise.resolve(context);
    },
    dispose: () => {
      disposed.push('model');
    },
  };
  return {
    getLlama: () => Promise.resolve({ loadModel: () => Promise.resolve(model) }),
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

  it('disposes the context and the model, not just the session', async () => {
    await translate.ensureTranslateReady();
    expect(disposed).toEqual([]);

    await translate.unloadTranslationModel();

    // Both, and the context first: it holds the KV cache and belongs to the model.
    expect(disposed).toEqual(['context', 'model']);
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
      await vi.waitFor(() => expect(disposed).toEqual(['context', 'model']));
      expect(translate.isTranslateReady()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
