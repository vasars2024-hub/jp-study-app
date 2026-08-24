// @vitest-environment node
/**
 * A prompt and its completion must FIT the context, or the answer is about text the model can no
 * longer see.
 *
 * node-llama-cpp does not reject an over-long request: `LlamaChat` performs a CONTEXT SHIFT,
 * discarding the oldest part of the chat history to make room. Every prompt in `translate.ts` is
 * single-turn, so the oldest part is the instruction and the source text — the model answers
 * fluently about nothing, and nothing throws or marks the result.
 *
 * This was reachable by construction, not only in theory: `sentenceAnalysis.ts:212` and
 * `mining.ts:1408` both ask for up to `Math.min(8192, ...)` OUTPUT tokens against
 * `TRANSLATE_CONTEXT_SIZE` = 8,192, which leaves zero room for the prompt that asked for them.
 *
 * The model is mocked; this asserts the budget contract and never loads a real GGUF. The fake
 * tokenizer is 1 token per character so the arithmetic in each case is readable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-translate-budget-'));

/** Every `maxTokens` the session was actually asked for, in order. */
const promptCalls: Array<{ prompt: string; maxTokens: number | undefined }> = [];
/** Boxed so the hoisted `vi.mock` factory reads the live value rather than capturing it. */
const tokenizerThrows = { value: false };

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

vi.mock('node-llama-cpp', () => {
  const context = {
    getSequence: () => ({ clearHistory: () => Promise.resolve(), dispose: () => undefined }),
    dispose: () => undefined,
  };
  const model = {
    createContext: () => Promise.resolve(context),
    dispose: () => undefined,
    // One token per character. Not how a BPE tokenizer works, and deliberately so: the product
    // reads `.length` off whatever the tokenizer returns, and a fake with a plausible ratio would
    // make every expectation below a guess.
    tokenize: (text: string) => {
      if (tokenizerThrows.value) throw new Error('tokenizer unavailable');
      return Array.from({ length: text.length }, (_, i) => i);
    },
  };
  return {
    getLlama: () =>
      Promise.resolve({
        loadModel: () => Promise.resolve(model),
        dispose: () => undefined,
      }),
    LlamaChatSession: class {
      prompt(prompt: string, options?: { maxTokens?: number }): Promise<string> {
        promptCalls.push({ prompt, maxTokens: options?.maxTokens });
        return Promise.resolve('ok');
      }
      resetChatHistory(): void {
        /* no history in this fake */
      }
    },
  };
});

const translate = await import('../translate');
const modelPool = await import('../llamaModelPool');
const contextPool = await import('../llamaContextPool');

/** `TRANSLATE_CONTEXT_SIZE` and `CHAT_TEMPLATE_RESERVE_TOKENS`, mirrored so the sums are visible. */
const CONTEXT = 8_192;
const RESERVE = 192;

beforeEach(async () => {
  await translate.unloadTranslationModel();
  await contextPool.disposeAllLlamaContexts();
  await modelPool.disposeAllLlamaModels();
  promptCalls.length = 0;
  tokenizerThrows.value = false;
  fs.mkdirSync(path.join(tmpRoot, 'models'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'models', 'Qwen3-1.7B.gguf'), 'not a real model');
});

afterEach(async () => {
  await translate.unloadTranslationModel();
  await contextPool.disposeAllLlamaContexts();
  await modelPool.disposeAllLlamaModels();
});

describe('the local prompt budget keeps prompt + completion inside the context', () => {
  it('clamps a request that could not fit, using the real tokenizer count', async () => {
    const prompt = 'x'.repeat(2_000);
    await translate.runLocalQwenPrompt(prompt, { maxTokens: 8_192 });

    expect(promptCalls).toHaveLength(1);
    // 8,192 − 2,000 prompt − 192 reserve. The caller asked for 8,192, which cannot coexist with a
    // 2,000-token prompt in an 8,192-token context by any arrangement.
    expect(promptCalls[0].maxTokens).toBe(CONTEXT - 2_000 - RESERVE);
    expect(promptCalls[0].maxTokens).toBe(6_000);
  });

  it('does not inflate a request that already fits', async () => {
    await translate.runLocalQwenPrompt('x'.repeat(100), { maxTokens: 512 });

    // The budget is a ceiling, not a target: 8,192 − 100 − 192 = 7,900 tokens of room, and the
    // caller still gets the 512 it asked for.
    expect(promptCalls[0].maxTokens).toBe(512);
  });

  it('refuses a prompt with no usable room instead of silently shifting it out of context', async () => {
    const prompt = 'x'.repeat(CONTEXT - RESERVE - 10);
    await expect(translate.runLocalQwenPrompt(prompt, { maxTokens: 2_048 })).rejects.toThrow(
      /too long for the offline translator/i,
    );
    // The distinguishing assertion. A context shift is invisible precisely because the call goes
    // through and returns text, so "it threw" is only half the contract — nothing was generated.
    expect(promptCalls).toHaveLength(0);
  });

  it('names the numbers the user needs, not a generic failure', async () => {
    const prompt = 'x'.repeat(9_000);
    await expect(translate.runLocalQwenPrompt(prompt, { maxTokens: 256 })).rejects.toThrow(
      `This text is too long for the offline translator: it needs about 9000 of the ${CONTEXT} tokens it can hold at once. Try a shorter selection.`,
    );
  });

  it('falls back to a character estimate when the tokenizer is unavailable', async () => {
    tokenizerThrows.value = true;
    await translate.runLocalQwenPrompt('x'.repeat(1_500), { maxTokens: 8_192 });

    // ceil(1500 / 1.5) = 1,000. The estimate over-counts Latin text on purpose — a completion that
    // comes back short is a visible outcome, a prompt shifted out of context is not.
    expect(promptCalls[0].maxTokens).toBe(CONTEXT - 1_000 - RESERVE);
  });

  it('applies the same ceiling to the batch translation path, not only to the generic one', async () => {
    // A full `BATCH_SIZE` chunk of long literary lines. The batch path's own ceiling is
    // `Math.min(4096, items.length * 256)` = 2,048 here, computed from the item COUNT and
    // therefore blind to how long the prompt it accompanies actually is.
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      text: '猫'.repeat(800),
      source: 'ja',
      target: 'en',
    }));
    await translate.runTranslationBatch(items);

    expect(promptCalls.length).toBeGreaterThan(0);
    const batch = promptCalls[0];
    // Derived from the prompt this build actually produced rather than hard-coded, so a change to
    // the prompt text cannot turn this into a test of the prompt builder.
    expect(batch.maxTokens).toBe(CONTEXT - batch.prompt.length - RESERVE);
    // And the clamp genuinely bit: the batch path asked for 2,048 and could not have it.
    expect(Number(batch.maxTokens)).toBeLessThan(2_048);
  });
});
