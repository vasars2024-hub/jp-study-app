// @vitest-environment node
/**
 * The KV cache, not the weights. `llamaModelPool.ts` made a repeat user's 1.2 GB reload free, and
 * measuring three cycles afterwards showed what was left: with the weights already resident a cycle
 * still cost **612 handles and +1,298.5 MB** (`L7_PERF_DICTIONARY.md`, 2026-08-24). At 8,192 tokens
 * that cache is now the LARGER half of the bill — 1,298 MB against a 1,223 MB model file — because
 * `translate.ts` disposed its context on every idle unload and rebuilt it on the next lookup.
 *
 * Shrinking the context is not the lever (`sentenceAnalysis.ts:212` and `mining.ts:1408` ask for up
 * to 8,192 output tokens); performing fewer cycles is, exactly as it was for the weights.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadModelCalls: string[] = [];
const createContextCalls: Array<{ modelPath: string; contextSize: number }> = [];
const disposed: string[] = [];
const clearHistoryCalls: number[] = [];
/** Boxed so the hoisted `vi.mock` factory reads the live value rather than capturing it. */
const createContextFails = { value: false };
const clearHistoryFails = { value: false };

vi.mock('node-llama-cpp', () => ({
  getLlama: () =>
    Promise.resolve({
      loadModel: ({ modelPath }: { modelPath: string }) => {
        loadModelCalls.push(modelPath);
        return Promise.resolve({
          modelPath,
          createContext: ({ contextSize }: { contextSize: number }) => {
            createContextCalls.push({ modelPath, contextSize });
            if (createContextFails.value) return Promise.reject(new Error('out of VRAM'));
            let sequences = 0;
            return Promise.resolve({
              contextSize,
              getSequence: () => {
                sequences += 1;
                return {
                  id: sequences,
                  clearHistory: () => {
                    clearHistoryCalls.push(contextSize);
                    return clearHistoryFails.value
                      ? Promise.reject(new Error('sequence is disposed'))
                      : Promise.resolve();
                  },
                  dispose: () => {
                    disposed.push('sequence');
                  },
                };
              },
              dispose: () => {
                disposed.push('context');
                return Promise.resolve();
              },
            });
          },
          dispose: () => {
            disposed.push('model');
          },
        });
      },
      dispose: () => undefined,
    }),
}));

const contextPool = await import('../llamaContextPool');
const modelPool = await import('../llamaModelPool');
const backend = await import('../llamaBackend');

const MODEL_A = process.platform === 'win32' ? 'C:\\models\\Qwen3-1.7B.gguf' : '/models/Qwen3-1.7B.gguf';
const GRACE = contextPool.CONTEXT_RELEASE_GRACE_MS;

async function resetAll(): Promise<void> {
  await contextPool.disposeAllLlamaContexts();
  await modelPool.disposeAllLlamaModels();
  await backend.disposeSharedLlama();
}

beforeEach(async () => {
  await resetAll();
  loadModelCalls.length = 0;
  createContextCalls.length = 0;
  disposed.length = 0;
  clearHistoryCalls.length = 0;
  createContextFails.value = false;
  clearHistoryFails.value = false;
});

afterEach(async () => {
  vi.useRealTimers();
  await resetAll();
});

describe('llama context pool', () => {
  it('builds the cache at the size asked for and reports it cold', async () => {
    const lease = await contextPool.acquireLlamaContext(MODEL_A, 8_192);

    expect(createContextCalls).toEqual([{ modelPath: MODEL_A, contextSize: 8_192 }]);
    expect(lease.warm).toBe(false);
    expect(lease.contextSize).toBe(8_192);
    // The weights come from the model pool, so the two modules still share one copy.
    expect(loadModelCalls).toEqual([MODEL_A]);
    expect(contextPool.llamaContextPoolStats()).toEqual([
      { modelPath: MODEL_A, contextSize: 8_192, leased: true, awaitingRelease: false, graceMs: GRACE },
    ]);
  });

  /**
   * The defect this module exists for: `translate.ts`'s idle unload fires at 5 minutes and the
   * user's next lookup lands just past it. Before, that rebuilt 1,298 MB of cache.
   */
  it('hands back the resident cache when a reacquire lands inside the grace window', async () => {
    vi.useFakeTimers();
    const first = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    await first.release();
    await vi.advanceTimersByTimeAsync(GRACE / 2);
    const second = await contextPool.acquireLlamaContext(MODEL_A, 8_192);

    expect(second.warm).toBe(true);
    expect(createContextCalls).toHaveLength(1);
    expect(second.context).toBe(first.context);
    // Reused, not merely resident: the sequence is emptied before it is handed over, so the caller
    // builds its `LlamaChatSession` on a context with no history in it.
    expect(clearHistoryCalls).toEqual([8_192]);
    expect(disposed).toEqual([]);
  });

  /** The negative control for the case above: past the window the cache really is freed. */
  it('rebuilds the cache once the grace window has expired', async () => {
    vi.useFakeTimers();
    const first = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    await first.release();
    await vi.advanceTimersByTimeAsync(GRACE + 1_000);
    await vi.waitFor(() => expect(disposed).toEqual(['sequence', 'context']));

    const second = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    expect(second.warm).toBe(false);
    expect(createContextCalls).toHaveLength(2);
    expect(clearHistoryCalls).toEqual([]);
  });

  /**
   * The weights outlive the cache by their own grace rather than being pinned by it: the context
   * pool holds the model lease only while it holds the context, then gives it back.
   */
  it('gives the weights back to the model pool when the cache is disposed', async () => {
    vi.useFakeTimers();
    const lease = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    await lease.release();

    // While the cache is warm the weights are still leased, so nothing can dispose them underneath.
    expect(modelPool.llamaModelPoolStats()).toEqual([
      expect.objectContaining({ leases: 1, resident: true, awaitingRelease: false }),
    ]);

    await vi.advanceTimersByTimeAsync(GRACE + 1_000);
    await vi.waitFor(() =>
      expect(modelPool.llamaModelPoolStats()).toEqual([
        expect.objectContaining({ leases: 0, resident: true, awaitingRelease: true }),
      ]),
    );
    await vi.advanceTimersByTimeAsync(GRACE + 1_000);
    await vi.waitFor(() => expect(disposed).toEqual(['sequence', 'context', 'model']));
  });

  /**
   * A 2,048-token cache cannot serve an 8,192-token request, so the size is part of the key. The
   * agent's `contextSize` is a user setting and `translate.ts` fixes 8,192, so this is the ordinary
   * case rather than a corner.
   */
  it('keys on the size, not only the file', async () => {
    vi.useFakeTimers();
    const big = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    await big.release();
    const small = await contextPool.acquireLlamaContext(MODEL_A, 2_048);

    expect(small.warm).toBe(false);
    expect(small.contextSize).toBe(2_048);
    expect(createContextCalls).toEqual([
      { modelPath: MODEL_A, contextSize: 8_192 },
      { modelPath: MODEL_A, contextSize: 2_048 },
    ]);
    // One copy of the weights between them, which is the model pool still doing its job.
    expect(loadModelCalls).toEqual([MODEL_A]);
  });

  /**
   * A context has one sequence to give and carries one chat history, so it is checked out
   * exclusively. A concurrent second consumer gets its own, which is what every caller had before
   * this module — the win is across time, not across consumers.
   */
  it('does not hand the same context to two holders at once', async () => {
    const translate = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    const agent = await contextPool.acquireLlamaContext(MODEL_A, 8_192);

    expect(agent.context).not.toBe(translate.context);
    expect(agent.sequence).not.toBe(translate.sequence);
    expect(createContextCalls).toHaveLength(2);
    // Only one of them is pooled; the loser disposes itself outright rather than lingering.
    expect(contextPool.llamaContextPoolStats()).toHaveLength(1);

    await agent.release();
    expect(disposed).toEqual(['sequence', 'context']);
    expect(contextPool.llamaContextPoolStats()).toEqual([
      expect.objectContaining({ leased: true, awaitingRelease: false }),
    ]);
  });

  /**
   * The same asymmetry the model pool uses, for the same reason: a cycle's cost is permanent and
   * cumulative while residency is temporary and bounded, so a size the user keeps returning to
   * stops being rebuilt.
   */
  it('doubles the grace for a cache that is being recycled', async () => {
    vi.useFakeTimers();
    const first = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    await first.release();
    await vi.advanceTimersByTimeAsync(GRACE + 1_000);
    await vi.waitFor(() => expect(disposed).toEqual(['sequence', 'context']));

    const second = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    expect(contextPool.llamaContextPoolStats()).toEqual([
      expect.objectContaining({ graceMs: GRACE * 2 }),
    ]);
    await second.release();
  });

  /**
   * `createContext` is the biggest allocation here and `out of VRAM` on a KV cache is its ordinary
   * failure. The weights it borrowed have to go back, or a phantom lease pins 1.2 GB forever.
   */
  it('gives the weights back when the cache cannot be built', async () => {
    createContextFails.value = true;
    await expect(contextPool.acquireLlamaContext(MODEL_A, 8_192)).rejects.toThrow('out of VRAM');

    expect(contextPool.llamaContextPoolStats()).toEqual([]);
    expect(modelPool.llamaModelPoolStats()).toEqual([
      expect.objectContaining({ leases: 0, resident: true, awaitingRelease: true }),
    ]);
  });

  /**
   * A sequence that will not reset is not safe to hand out — the next caller's prompt would be
   * appended to the previous caller's history. Disposing and rebuilding costs what a cold acquire
   * would have cost anyway, so the failure is absorbed rather than surfaced.
   */
  it('builds a cold cache rather than handing over a sequence it could not clear', async () => {
    vi.useFakeTimers();
    const first = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    await first.release();
    clearHistoryFails.value = true;

    const second = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    expect(second.warm).toBe(false);
    expect(second.context).not.toBe(first.context);
    expect(createContextCalls).toHaveLength(2);
    expect(disposed).toEqual(['sequence', 'context']);
  });

  /**
   * Shutdown evicts a cache whose holder still has a lease. That holder's later `release()` must
   * not free the same native handles twice, nor hand the model pool a decrement it never lent out.
   */
  it('survives a release that arrives after a shutdown evicted the entry', async () => {
    const lease = await contextPool.acquireLlamaContext(MODEL_A, 8_192);
    await contextPool.disposeAllLlamaContexts();
    expect(disposed).toEqual(['sequence', 'context']);

    await lease.release();
    await lease.release();
    expect(disposed).toEqual(['sequence', 'context']);
    expect(modelPool.llamaModelPoolStats()).toEqual([
      expect.objectContaining({ leases: 0, resident: true, awaitingRelease: true }),
    ]);
  });
});
