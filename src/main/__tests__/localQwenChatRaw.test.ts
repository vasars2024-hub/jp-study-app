// @vitest-environment node
/**
 * The Agent's local chat reply is the model's WHOLE reply.
 *
 * `runLocalQwenPrompt` was written for callers that want JSON, so it ran every reply through
 * `extractJsonish`: a fenced block, then the outermost `{…}`, then the outermost `[…]`. The Agent's
 * local chat reused it unchanged, so an ordinary answer such as "Here is how to write it:" followed
 * by a code block reached the conversation as the code block alone — and that fragment is what the
 * workspace saved. The router tests never caught it because every one of them mocks
 * `runLocalQwenPrompt` itself; this suite mocks only the native model and runs the real function,
 * and the real router above it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-local-chat-raw-'));
const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-local-chat-home-'));

/** What the fake model says, and which file each generation actually ran on. */
const reply = { value: '' };
const generations: Array<{ modelPath: string }> = [];
let lastLoadedModel = '';

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  // Downloads is one of the model roots; keep the developer's real one out of the test.
  return { ...actual, default: { ...actual, homedir: () => homeRoot }, homedir: () => homeRoot };
});

vi.mock('node-llama-cpp', () => {
  const makeModel = (modelPath: string) => ({
    modelPath,
    createContext: () => Promise.resolve({
      getSequence: () => ({ clearHistory: () => Promise.resolve(), dispose: () => undefined, modelPath }),
      dispose: () => undefined,
    }),
    dispose: () => undefined,
    tokenize: (text: string) => Array.from({ length: Math.ceil(text.length / 4) }, (_, i) => i),
  });
  return {
    getLlama: () => Promise.resolve({
      loadModel: ({ modelPath }: { modelPath: string }) => {
        lastLoadedModel = modelPath;
        return Promise.resolve(makeModel(modelPath));
      },
      dispose: () => undefined,
    }),
    LlamaChatSession: class {
      private readonly modelPath: string;
      constructor(options: { contextSequence: { modelPath?: string } }) {
        this.modelPath = options.contextSequence.modelPath ?? lastLoadedModel;
      }
      prompt(): Promise<string> {
        generations.push({ modelPath: this.modelPath });
        return Promise.resolve(reply.value);
      }
      resetChatHistory(): void {
        /* single-turn fake */
      }
    },
  };
});

const translate = await import('../translate');
const router = await import('../agentProviderRouter');
const modelPool = await import('../llamaModelPool');
const contextPool = await import('../llamaContextPool');

const MIXED_REPLY = [
  'Here is how the particle works in a sentence:',
  '```json',
  '{"particle": "は", "role": "topic"}',
  '```',
  'Notice that は marks what the sentence is about, not the grammatical subject.',
].join('\n');

function localPolicy(model?: string) {
  return {
    target: { kind: 'local' as const, backend: 'local-qwen' as const, ...(model ? { model } : {}) },
    allowCloud: false,
    excludeSensitiveContext: true,
    allowSensitiveContext: false,
    maxInputChars: 10_000,
    maxOutputTokens: 800,
    cache: 'off' as const,
    retryAttempts: 0,
    timeoutMs: 20_000,
    streaming: false,
  };
}

beforeEach(async () => {
  await translate.unloadTranslationModel();
  await contextPool.disposeAllLlamaContexts();
  await modelPool.disposeAllLlamaModels();
  generations.length = 0;
  reply.value = MIXED_REPLY;
  fs.rmSync(path.join(tmpRoot, 'models'), { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpRoot, 'models'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'models', 'Qwen3-1.7B.gguf'), 'not a real model');
});

afterEach(async () => {
  await translate.unloadTranslationModel();
  await contextPool.disposeAllLlamaContexts();
  await modelPool.disposeAllLlamaModels();
});

describe('runLocalQwenPrompt raw mode', () => {
  it('returns the whole mixed prose-and-JSON reply when asked for raw text', async () => {
    const text = await translate.runLocalQwenPrompt('Explain は', { raw: true });
    expect(text).toBe(MIXED_REPLY);
  });

  it('still hands JSON callers the object they asked for', async () => {
    // The default is unchanged: Card Studio and sentence analysis parse this.
    const text = await translate.runLocalQwenPrompt('Explain は as JSON');
    expect(text).toBe('{"particle": "は", "role": "topic"}');
  });

  it('strips a thinking block even in raw mode', async () => {
    reply.value = '<think>the user wants は</think>\nは marks the topic.';
    await expect(translate.runLocalQwenPrompt('Explain は', { raw: true })).resolves.toBe('は marks the topic.');
  });
});

describe('the Agent local chat path', () => {
  it('saves the whole reply, not the fragment the JSON extractor would keep', async () => {
    const result = await router.runAgentProviderPrompt(localPolicy(), 'Explain は');
    expect(result.text).toBe(MIXED_REPLY);
    expect(result.text).toContain('Notice that は marks');
  });

  it('runs on the model the Agent is configured with, not the translation model', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'models', 'Qwen3-8B.gguf'), 'not a real model either');
    await router.runAgentProviderPrompt(localPolicy('Qwen3-8B.gguf'), 'Explain は');
    expect(generations).toHaveLength(1);
    expect(path.basename(generations[0].modelPath)).toBe('Qwen3-8B.gguf');
  });

  it('reports a missing local model as its own typed failure', async () => {
    fs.rmSync(path.join(tmpRoot, 'models'), { recursive: true, force: true });
    await expect(router.runAgentProviderPrompt(localPolicy(), 'Explain は')).rejects.toMatchObject({
      name: 'AiProviderRuntimeError',
      code: 'local-model-missing',
    });
    expect(generations).toHaveLength(0);
  });

  it('does not fall back to another model when the configured one is gone', async () => {
    await expect(
      router.runAgentProviderPrompt(localPolicy('Qwen3-14B.gguf'), 'Explain は'),
    ).rejects.toMatchObject({ code: 'local-model-missing' });
    expect(generations).toHaveLength(0);
  });

  it('finds the model where the Settings installer puts it', async () => {
    fs.rmSync(path.join(tmpRoot, 'models'), { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpRoot, 'models', 'qwen3-1.7b'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'models', 'qwen3-1.7b', 'Qwen3-1.7B-Q8_0.gguf'), 'installed');
    expect(translate.isTranslateAvailable()).toBe(true);
    const result = await router.runAgentProviderPrompt(localPolicy(), 'Explain は');
    expect(result.text).toBe(MIXED_REPLY);
  });
});
