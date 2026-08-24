// @vitest-environment node
/**
 * The weights, not the addon. `llamaBackend.ts` already shares the native binding; this pool shares
 * the 1.2 GB `LlamaModel` itself, because `translate.ts` and `localAgent.ts` resolve their GGUF
 * from the same two roots over overlapping name lists and therefore usually pick the SAME file.
 * Before this, each held its own copy — `translate.ts`'s `TRANSLATE_CONTEXT_SIZE` comment records
 * main settling at 7,222 MB "after the local agent's own copy idle-unloaded".
 *
 * The second reason is measured: with the backend already shared, a second load/unload cycle still
 * cost +1,212 handles / +103.2 MB (`L7_PERF_DICTIONARY.md`, 2026-08-24). Native teardown residue
 * cannot be reclaimed from JavaScript, so the pool's job is to make FEWER cycles happen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadModelCalls: string[] = [];
const disposedModels: string[] = [];
const getLlamaCalls: number[] = [];
/** Boxed so the hoisted `vi.mock` factory reads the live value rather than capturing it. */
const loadFails = { value: false };
/** Resolved by the test when it wants to control when an in-flight load finishes. */
const gate: { release: (() => void) | null } = { release: null };

vi.mock('node-llama-cpp', () => ({
  getLlama: () => {
    getLlamaCalls.push(1);
    return Promise.resolve({
      loadModel: async ({ modelPath }: { modelPath: string }) => {
        loadModelCalls.push(modelPath);
        if (gate.release) {
          await new Promise<void>((resolve) => {
            gate.release = resolve;
          });
        }
        if (loadFails.value) throw new Error('bad magic in GGUF');
        return {
          modelPath,
          dispose: () => {
            disposedModels.push(modelPath);
          },
        };
      },
      dispose: () => undefined,
    });
  },
}));

const pool = await import('../llamaModelPool');
const backend = await import('../llamaBackend');

const MODEL_A = process.platform === 'win32' ? 'C:\\models\\Qwen3-1.7B.gguf' : '/models/Qwen3-1.7B.gguf';
const MODEL_B = process.platform === 'win32' ? 'C:\\models\\Qwen3-8B.gguf' : '/models/Qwen3-8B.gguf';

beforeEach(async () => {
  await pool.disposeAllLlamaModels();
  await backend.disposeSharedLlama();
  loadModelCalls.length = 0;
  disposedModels.length = 0;
  getLlamaCalls.length = 0;
  loadFails.value = false;
  gate.release = null;
});

afterEach(async () => {
  await pool.disposeAllLlamaModels();
  await backend.disposeSharedLlama();
});

describe('llama model pool', () => {
  it('loads one copy of the weights however many modules ask for the same file', async () => {
    const translate = await pool.acquireLlamaModel(MODEL_A);
    const agent = await pool.acquireLlamaModel(MODEL_A);

    expect(loadModelCalls).toEqual([MODEL_A]);
    expect(agent.model).toBe(translate.model);
    expect(pool.llamaModelPoolStats()).toEqual([
      { modelPath: MODEL_A, leases: 2, resident: true, awaitingRelease: false, graceMs: 60_000 },
    ]);
  });

  /** Two different GGUFs are two models. The pool dedupes files, it does not collapse them. */
  it('keeps distinct files apart', async () => {
    const first = await pool.acquireLlamaModel(MODEL_A);
    const second = await pool.acquireLlamaModel(MODEL_B);

    expect(loadModelCalls).toEqual([MODEL_A, MODEL_B]);
    expect(second.model).not.toBe(first.model);
    expect(pool.llamaModelPoolStats()).toHaveLength(2);
  });

  /**
   * NTFS is case-insensitive, so `models\Qwen3-1.7B.gguf` and `models\qwen3-1.7b.gguf` are one
   * file. Keying on the raw string would load the same weights twice while reporting a hit rate.
   */
  it.runIf(process.platform === 'win32')('treats a case difference on Windows as the same file', async () => {
    await pool.acquireLlamaModel(MODEL_A);
    await pool.acquireLlamaModel(MODEL_A.toLowerCase());

    expect(loadModelCalls).toHaveLength(1);
    expect(pool.llamaModelPoolStats()[0].leases).toBe(2);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    gate.release = () => undefined;
    const both = Promise.all([pool.acquireLlamaModel(MODEL_A), pool.acquireLlamaModel(MODEL_A)]);
    await vi.waitFor(() => expect(loadModelCalls).toHaveLength(1));
    gate.release?.();
    const [first, second] = await both;

    expect(loadModelCalls).toHaveLength(1);
    expect(second.model).toBe(first.model);
  });

  /** One module letting go must not free weights the other is still reading through a context. */
  it('does not dispose while another module still holds a lease', async () => {
    vi.useFakeTimers();
    try {
      const translate = await pool.acquireLlamaModel(MODEL_A);
      const agent = await pool.acquireLlamaModel(MODEL_A);

      await translate.release();
      await vi.advanceTimersByTimeAsync(pool.MODEL_RELEASE_GRACE_MS * 3);
      expect(disposedModels).toEqual([]);
      expect(pool.llamaModelPoolStats()[0]).toMatchObject({ leases: 1, awaitingRelease: false });

      await agent.release();
      await vi.advanceTimersByTimeAsync(pool.MODEL_RELEASE_GRACE_MS + 1_000);
      expect(disposedModels).toEqual([MODEL_A]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-uses the resident weights when a caller returns inside the grace window', async () => {
    vi.useFakeTimers();
    try {
      const first = await pool.acquireLlamaModel(MODEL_A);
      await first.release();
      await vi.advanceTimersByTimeAsync(pool.MODEL_RELEASE_GRACE_MS / 2);

      const second = await pool.acquireLlamaModel(MODEL_A);
      expect(loadModelCalls).toHaveLength(1);
      expect(second.model).toBe(first.model);
      // The reacquire disarms the pending disposal rather than merely outliving it, so the pool
      // stops reporting the model as on its way out the moment someone takes it.
      expect(pool.llamaModelPoolStats()).toEqual([
        { modelPath: MODEL_A, leases: 1, resident: true, awaitingRelease: false, graceMs: 60_000 },
      ]);

      await vi.advanceTimersByTimeAsync(pool.MODEL_RELEASE_GRACE_MS * 3);
      expect(disposedModels).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  /** The negative control: past the window the weights are really gone, not merely unreferenced. */
  it('disposes and reloads once the grace window has expired', async () => {
    vi.useFakeTimers();
    try {
      const first = await pool.acquireLlamaModel(MODEL_A);
      await first.release();
      await vi.advanceTimersByTimeAsync(pool.MODEL_RELEASE_GRACE_MS + 1_000);
      expect(disposedModels).toEqual([MODEL_A]);
      expect(pool.llamaModelPoolStats()).toEqual([]);

      await pool.acquireLlamaModel(MODEL_A);
      expect(loadModelCalls).toEqual([MODEL_A, MODEL_A]);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * `unloadTranslationModel` is best-effort and its `catch` can swallow a second call, and the
   * agent's `loadRuntime` failure path releases a lease `disposeRuntime` may release again. A
   * double release that decremented twice would free weights another module is still using.
   */
  it('ignores a second release of the same lease', async () => {
    vi.useFakeTimers();
    try {
      const translate = await pool.acquireLlamaModel(MODEL_A);
      const agent = await pool.acquireLlamaModel(MODEL_A);

      await translate.release();
      await translate.release();
      await vi.advanceTimersByTimeAsync(pool.MODEL_RELEASE_GRACE_MS + 1_000);

      expect(disposedModels).toEqual([]);
      expect(pool.llamaModelPoolStats()[0].leases).toBe(1);
      await agent.release();
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A cached rejection would make one bad GGUF permanent for the process lifetime — the failure
   * mode `translate.ts` already paid for once with `loadPromise`.
   */
  it('does not cache a failed load, and leaves no phantom user behind', async () => {
    loadFails.value = true;
    await expect(pool.acquireLlamaModel(MODEL_A)).rejects.toThrow('bad magic in GGUF');
    expect(pool.llamaModelPoolStats()).toEqual([]);

    loadFails.value = false;
    const retry = await pool.acquireLlamaModel(MODEL_A);
    expect(loadModelCalls).toHaveLength(2);
    expect(retry.model).toBeDefined();
  });

  /**
   * The plain grace window cannot help the user the 7 GB plateau was actually measured on: both
   * callers idle-unload at 5 minutes, so anyone studying with breaks longer than that reloaded the
   * weights every time and paid ~103 MB and ~1,212 handles of unreclaimable residue per round. The
   * grace therefore backs off per churned reload — a cycle's cost is permanent, residency's is not.
   */
  it('lengthens the grace each time a file is reloaded straight after being disposed', async () => {
    vi.useFakeTimers();
    try {
      const graces: number[] = [];
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const lease = await pool.acquireLlamaModel(MODEL_A);
        graces.push(pool.llamaModelPoolStats()[0].graceMs);
        await lease.release();
        await vi.advanceTimersByTimeAsync(graces[cycle] + 1_000);
      }

      expect(graces).toEqual([60_000, 120_000, 240_000]);
      expect(loadModelCalls).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps the backoff rather than holding the weights forever', async () => {
    vi.useFakeTimers();
    try {
      let last = 0;
      for (let cycle = 0; cycle < 8; cycle += 1) {
        const lease = await pool.acquireLlamaModel(MODEL_A);
        last = pool.llamaModelPoolStats()[0].graceMs;
        await lease.release();
        await vi.advanceTimersByTimeAsync(last + 1_000);
      }

      expect(last).toBe(pool.MODEL_RELEASE_GRACE_MAX_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The negative control for the backoff, and the reason it is safe: a user who genuinely stops
   * gets their memory back on the ordinary window. Without this reset, one busy morning would keep
   * a 1.2 GB model resident for the rest of the session.
   */
  it('resets to the base grace after a real gap, so a finished file is not held', async () => {
    vi.useFakeTimers();
    try {
      const first = await pool.acquireLlamaModel(MODEL_A);
      await first.release();
      await vi.advanceTimersByTimeAsync(pool.MODEL_RELEASE_GRACE_MS + 1_000);

      const churned = await pool.acquireLlamaModel(MODEL_A);
      expect(pool.llamaModelPoolStats()[0].graceMs).toBe(120_000);
      await churned.release();
      await vi.advanceTimersByTimeAsync(120_000 + 1_000);

      // Now stay away longer than the churn window before coming back.
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000);
      await pool.acquireLlamaModel(MODEL_A);
      expect(pool.llamaModelPoolStats()[0].graceMs).toBe(pool.MODEL_RELEASE_GRACE_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops everything on shutdown regardless of who is holding it', async () => {
    await pool.acquireLlamaModel(MODEL_A);
    await pool.acquireLlamaModel(MODEL_B);

    await pool.disposeAllLlamaModels();

    expect(disposedModels.sort()).toEqual([MODEL_A, MODEL_B].sort());
    expect(pool.llamaModelPoolStats()).toEqual([]);
  });
});
