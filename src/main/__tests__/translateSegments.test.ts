// @vitest-environment node
/**
 * The interactive translator keeps the sentence alignment it already computes.
 *
 * `translateText` translates a passage one sentence at a time and used to throw the
 * pairing away in its final `join`. `translateTextDetailed` reports the pairs, so the
 * Translate view can show source and translation side by side; and it carries the
 * natural/literal style into the prompt. llamaHost is stubbed; nothing native loads.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  root: '',
  prompts: [] as string[],
  reply: (prompt: string): string => prompt,
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.root },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

vi.mock('../llamaHost', () => ({
  isLlamaSessionLost: () => false,
  acquireLlamaSession: async (modelPath: string, contextSize: number) => ({
    modelPath,
    contextSize,
    warm: false,
    isLost: () => false,
    countTokens: () => Promise.resolve(10),
    prompt: (text: string) => {
      h.prompts.push(text);
      return Promise.resolve(h.reply(text));
    },
    resetHistory: () => Promise.resolve(),
    release: () => Promise.resolve(),
  }),
}));

h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-segments-'));
fs.mkdirSync(path.join(h.root, 'models'), { recursive: true });
fs.writeFileSync(path.join(h.root, 'models', 'Qwen3-1.7B.gguf'), 'not a real model');
vi.spyOn(os, 'homedir').mockReturnValue(h.root);

let translate: typeof import('../translate');

beforeAll(async () => {
  translate = await import('../translate');
});

beforeEach(async () => {
  await translate.unloadTranslationModel();
  h.prompts.length = 0;
  h.reply = (prompt) => (prompt.includes('猫') ? 'I like cats.' : prompt.includes('犬') ? 'I like dogs too.' : '');
});

describe('translateTextDetailed', () => {
  it('reports one pair per sentence, in order, alongside the joined text', async () => {
    const out = await translate.translateTextDetailed('猫が好きです。犬も好きです。', 'ja', 'en');
    expect(out.text).toBe('I like cats. I like dogs too.');
    expect(out.segments).toEqual([
      { source: '猫が好きです。', target: 'I like cats.' },
      { source: '犬も好きです。', target: 'I like dogs too.' },
    ]);
  });

  it('keeps a sentence the model could not translate, with an empty target', async () => {
    const out = await translate.translateTextDetailed('猫が好きです。鳥はどうですか。', 'ja', 'en');
    // The joined text still drops it (no Japanese clause inside English prose)...
    expect(out.text).toBe('I like cats.');
    // ...but the aligned view must still be able to say which sentence it was.
    expect(out.segments).toEqual([
      { source: '猫が好きです。', target: 'I like cats.' },
      { source: '鳥はどうですか。', target: '' },
    ]);
  });

  it('sends the natural prompt unchanged and the literal one only when asked', async () => {
    await translate.translateTextDetailed('猫が好きです。', 'ja', 'en');
    expect(h.prompts.at(-1)).not.toMatch(/literally/);
    await translate.translateTextDetailed('猫が好きです。', 'ja', 'en', undefined, undefined, 'literal');
    expect(h.prompts.at(-1)).toMatch(/as literally as possible/);
  });

  it('the book path still returns plain text', async () => {
    await expect(translate.translateForBook('猫が好きです。', 'ja', 'en')).resolves.toBe('I like cats.');
  });
});
