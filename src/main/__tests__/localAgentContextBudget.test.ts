// @vitest-environment node
/**
 * The local agent's plan must FIT the context the user chose.
 *
 * `maxTokens` was the literal 1,500 and knew nothing about `contextSize`, which
 * `shared/localAgentSettings.ts:153` bounds at a low end of **2,048** and which is exposed in
 * Settings. A plan prompt is the whole system prompt plus profile, permitted operations, memories
 * in scope, application state and the objective — thousands of tokens routinely. At 2,048 there is
 * no arrangement in which prompt + 1,500 fits.
 *
 * node-llama-cpp does not reject that; it CONTEXT SHIFTS, dropping the oldest part of the
 * conversation. Every plan here is single-turn (`resetSessionHistory` runs in `finally`), so the
 * oldest part is the system prompt and the objective: the agent plans confidently against text it
 * can no longer see, and nothing throws or marks the result.
 *
 * The model is mocked; no GGUF is loaded. The fake tokenizer is one token per character so every
 * expectation below is arithmetic rather than a guess.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-agent-budget-'));

const registry = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  /** Every `maxTokens` the session was asked for, with the prompt it accompanied. */
  promptCalls: [] as { prompt: string; maxTokens: number | undefined }[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: Handler) => registry.handlers.set(channel, handler),
    on: () => undefined,
    removeHandler: () => undefined,
  },
}));

vi.mock('node-llama-cpp', () => {
  const context = {
    getSequence: () => ({ clearHistory: () => Promise.resolve(), dispose: () => undefined }),
    dispose: () => undefined,
  };
  const model = {
    createContext: () => Promise.resolve(context),
    dispose: () => undefined,
    tokenize: (text: string) => Array.from({ length: text.length }, (_, i) => i),
  };
  return {
    getLlama: () => Promise.resolve({ loadModel: () => Promise.resolve(model), dispose: () => undefined }),
    LlamaChatSession: class {
      prompt(prompt: string, options?: { maxTokens?: number }): Promise<string> {
        registry.promptCalls.push({ prompt, maxTokens: options?.maxTokens });
        // Not a plan. `plan()` surfaces the parse failure, which is fine — this test is about what
        // was ASKED for, and the ask happens before any parsing.
        return Promise.resolve('{}');
      }
      resetChatHistory(): void {
        /* no history in this fake */
      }
    },
  };
});

const localAgent = await import('../localAgent');
const modelPool = await import('../llamaModelPool');
const contextPool = await import('../llamaContextPool');

/** `CHAT_TEMPLATE_RESERVE_TOKENS`, mirrored so the sums below are visible. */
const RESERVE = 192;

async function planWith(
  contextSize: number,
  objective: string,
  extra?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const handler = registry.handlers.get('localAgent:plan');
  if (!handler) throw new Error('localAgent:plan was never registered');
  return (await handler(null, {
    objective,
    settings: { enabled: true, backend: 'local-gguf', contextSize, modelFileName: 'Qwen3-1.7B.gguf' },
    ...extra,
  })) as { ok: boolean; error?: string };
}

beforeEach(() => {
  registry.promptCalls.length = 0;
  fs.mkdirSync(path.join(tmpRoot, 'models'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'models', 'Qwen3-1.7B.gguf'), 'not a real model');
  localAgent.registerLocalAgentIpc();
});

afterEach(async () => {
  localAgent.stopLocalAgentRuntime();
  // The context pool holds a warm cache past the last release by design, so a test that leaves one
  // behind would hand the next test a reused sequence and a stale entry in the stats.
  await contextPool.disposeAllLlamaContexts();
  await modelPool.disposeAllLlamaModels();
});

describe("the local agent's plan budget respects the configured context size", () => {
  it('asks for a completion that fits, instead of a fixed 1,500', async () => {
    await planWith(2_048, 'Find three N3 sentences about trains.');

    expect(registry.promptCalls).toHaveLength(1);
    const call = registry.promptCalls[0];
    // The whole point: at 2,048 the prompt alone is most of the context, so 1,500 was impossible.
    expect(call.maxTokens).toBe(2_048 - call.prompt.length - RESERVE);
    expect(Number(call.maxTokens)).toBeLessThan(1_500);
  });

  it('still asks for the full budget when the context has room for it', async () => {
    await planWith(8_192, 'Find three N3 sentences about trains.');

    // 8,192 minus a prompt of a couple of thousand leaves far more than 1,500, and the ceiling is
    // a ceiling rather than a target.
    expect(registry.promptCalls[0].maxTokens).toBe(1_500);
  });

  /**
   * The objective is NOT the way to overflow this, and finding that out is the point of the
   * assertion below: `plan()` already rejects a long objective with "The request is too long."
   * before a model is touched. What had no guard was everything the USER never typed — the system
   * prompt, the permitted operations, the memories in scope and the application state, which is
   * attached whenever privacy mode is off and is unbounded.
   */
  it('refuses, naming the setting, when the attached context leaves no usable room', async () => {
    const result = await planWith(2_048, 'Find three N3 sentences about trains.', {
      settings: {
        enabled: true,
        backend: 'local-gguf',
        contextSize: 2_048,
        modelFileName: 'Qwen3-1.7B.gguf',
        privacyMode: false,
      },
      applicationState: { openDeck: 'x'.repeat(2_048) },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not fit the local agent's context/i);
    expect(result.error).toMatch(/Raise the context size in Settings/i);
    // The distinguishing assertion: a context shift is invisible precisely because the call goes
    // through and returns text, so "it failed" is only half the contract — nothing was generated.
    expect(registry.promptCalls).toHaveLength(0);
  });

  /** The pre-existing guard, pinned so the case above cannot be mistaken for covering it. */
  it('leaves the objective-length refusal that already existed alone', async () => {
    const result = await planWith(8_192, 'x'.repeat(20_000));

    expect(result.ok).toBe(false);
    expect(result.error).toBe('The request is too long.');
    expect(registry.promptCalls).toHaveLength(0);
  });
});
