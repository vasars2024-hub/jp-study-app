// @vitest-environment node
/**
 * `runLocalQwenPrompt`'s side of the JSON grammar, the batch translator's grammar, and the
 * local model's cache identity (W1-A).
 *
 * The host is faked at its interface (`acquireLlamaSession`), so what is checked is exactly what
 * `translate.ts` asks of it: a structured caller's `jsonGrammar` reaches the generation, a chat
 * (`raw`) reply is never constrained, and the book translator's batch prompt asks for its array.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
// vitest hoists the vi.mock calls below above this import.
import * as translate from '../translate';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-local-grammar-'));
const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-local-grammar-home-'));

const seen = vi.hoisted(() => ({ opts: [] as Record<string, unknown>[], reply: '{"ok":true}' }));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
  net: { isOnline: () => true },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, default: { ...actual, homedir: () => homeRoot }, homedir: () => homeRoot };
});

vi.mock('../llamaHost', () => ({
  isLlamaSessionLost: () => false,
  acquireLlamaSession: async (modelPath: string, contextSize: number) => ({
    modelPath,
    contextSize,
    warm: false,
    prompt: async (_text: string, opts: Record<string, unknown>) => {
      seen.opts.push(opts);
      return seen.reply;
    },
    countTokens: async (text: string) => Math.ceil(text.length / 2),
    resetHistory: async () => undefined,
    release: async () => undefined,
  }),
}));


const modelsDir = path.join(tmpRoot, 'models');

beforeEach(async () => {
  await translate.unloadTranslationModel();
  seen.opts.length = 0;
  seen.reply = '{"ok":true}';
  fs.rmSync(modelsDir, { recursive: true, force: true });
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.writeFileSync(path.join(modelsDir, 'Qwen3-1.7B.gguf'), 'not a real model');
});

afterAll(async () => {
  await translate.unloadTranslationModel();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(homeRoot, { recursive: true, force: true });
});

describe('runLocalQwenPrompt jsonGrammar', () => {
  it('forwards the grammar a structured caller asks for', async () => {
    const text = await translate.runLocalQwenPrompt('Give JSON', { jsonGrammar: { kind: 'json' } });
    expect(text).toBe('{"ok":true}');
    expect(seen.opts[0].grammar).toEqual({ kind: 'json' });
  });

  it('asks for none by default, and never for a raw chat reply', async () => {
    await translate.runLocalQwenPrompt('Give JSON');
    await translate.runLocalQwenPrompt('Chat', { raw: true, jsonGrammar: { kind: 'json' } });
    expect(seen.opts[0]).not.toHaveProperty('grammar');
    expect(seen.opts[1]).not.toHaveProperty('grammar');
  });
});

describe('the batch translator', () => {
  it('constrains its reply to the id/text array, and still reads a fenced one', async () => {
    seen.reply = 'Sure:\n```json\n[{"id":"a","text":"The cat slept."}]\n```';
    const results = await translate.runTranslationBatch([{ id: 'a', text: `猫が寝た${Math.random()}`, source: 'ja', target: 'en' }]);
    expect(results).toEqual([{ id: 'a', text: 'The cat slept.' }]);
    expect(seen.opts[0].grammar).toMatchObject({ kind: 'json-schema', schema: { type: 'array' } });
  });
});

describe('localModelCacheKey', () => {
  it('names the resolved file and its size, and changes with the model', () => {
    const small = translate.localModelCacheKey();
    expect(small).toBe(`local:qwen3-1.7b.gguf:${'not a real model'.length}`);
    // Another quantisation saved under the same name is another model.
    fs.writeFileSync(path.join(modelsDir, 'Qwen3-1.7B.gguf'), 'a different quantisation');
    expect(translate.localModelCacheKey()).not.toBe(small);
    fs.writeFileSync(path.join(modelsDir, 'Qwen3-8B.gguf'), 'big');
    expect(translate.localModelCacheKey('Qwen3-8B.gguf')).toBe('local:qwen3-8b.gguf:3');
    fs.rmSync(modelsDir, { recursive: true, force: true });
    expect(translate.localModelCacheKey()).toBe('local:none');
  });
});
