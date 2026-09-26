// @vitest-environment node
/**
 * Resilience audit #17 and #3: the translator against a model host that stops
 * answering, and against one that died and was replaced.
 *
 * #17 — `countTokens` used to be awaited BEFORE the timeout/cancel guard was
 * armed, and the host RPC had no deadline of its own, so a host that stayed
 * alive but stopped answering left the translation IPC pending forever and the
 * serial queue behind it with it.
 *
 * #3 — after the host exited, the cached session handle was reused: a new
 * child rejected its id and every request failed until the idle unload.
 *
 * llamaHost is stubbed with hand-driven handles; nothing native is loaded.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  root: '',
  acquired: 0,
  handles: [] as Array<{ lost: boolean; countTokens: () => Promise<number>; prompt: () => Promise<string> }>,
  nextCount: (): Promise<number> => Promise.resolve(10),
  nextPrompt: (): Promise<string> => Promise.resolve('{"ok":true}'),
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.root },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

vi.mock('../llamaHost', () => ({
  isLlamaSessionLost: (err: unknown) => err instanceof Error && err.name === 'LlamaSessionLostError',
  acquireLlamaSession: async (modelPath: string, contextSize: number) => {
    h.acquired += 1;
    const state = { lost: false, countTokens: h.nextCount, prompt: h.nextPrompt };
    h.handles.push(state);
    const lostError = (): Error => Object.assign(new Error('lost'), { name: 'LlamaSessionLostError' });
    return {
      modelPath,
      contextSize,
      warm: false,
      isLost: () => state.lost,
      countTokens: () => (state.lost ? Promise.reject(lostError()) : state.countTokens()),
      prompt: () => (state.lost ? Promise.reject(lostError()) : state.prompt()),
      resetHistory: () => Promise.resolve(),
      release: () => Promise.resolve(),
    };
  },
}));

h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-host-resil-'));
fs.mkdirSync(path.join(h.root, 'models'), { recursive: true });
fs.writeFileSync(path.join(h.root, 'models', 'Qwen3-1.7B.gguf'), 'not a real model');
vi.spyOn(os, 'homedir').mockReturnValue(h.root);

const translate = await import('../translate');

beforeEach(async () => {
  await translate.unloadTranslationModel();
  h.acquired = 0;
  h.handles.length = 0;
  h.nextCount = () => Promise.resolve(10);
  h.nextPrompt = () => Promise.resolve('{"ok":true}');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a host that stops answering', () => {
  it('times the request out even when the tokenizer never answers, and the queue moves on', async () => {
    h.nextCount = () => new Promise<number>(() => undefined);
    vi.useFakeTimers();
    const first = translate.runLocalQwenPrompt('hello', { timeoutMs: 5_000, raw: true });
    const outcome = first.then(() => 'resolved', (err: Error) => err.message);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await outcome).toMatch(/timed out/i);

    // The serial queue is not stuck behind the first request.
    h.handles[0].countTokens = () => Promise.resolve(10);
    const second = translate.runLocalQwenPrompt('again', { timeoutMs: 5_000, raw: true });
    await vi.advanceTimersByTimeAsync(10);
    await expect(second).resolves.toBe('{"ok":true}');
  });

  it('gives a typed timeout key the renderer can translate', () => {
    const err = Object.assign(new Error('The local model process did not answer countTokens within 30 s.'), { name: 'TimeoutError' });
    expect(translate.friendlyErrorKey(err)).toBe('translate.error.timeout');
  });
});

describe('a host that died and was replaced', () => {
  it('drops the dead session and acquires a fresh one on the next request', async () => {
    await expect(translate.runLocalQwenPrompt('one', { raw: true })).resolves.toBe('{"ok":true}');
    expect(h.acquired).toBe(1);

    // The host exits: the handle now reports itself lost.
    h.handles[0].lost = true;
    await expect(translate.runLocalQwenPrompt('two', { raw: true })).resolves.toBe('{"ok":true}');
    expect(h.acquired).toBe(2);
  });

  it('a request that hits the dead session fails typed, and the next one recovers', async () => {
    await translate.ensureTranslateReady();
    const lostError = Object.assign(new Error('lost'), { name: 'LlamaSessionLostError' });
    h.handles[0].prompt = () => Promise.reject(lostError);
    const failed = await translate.runLocalQwenPrompt('x', { raw: true }).catch((err: unknown) => err);
    expect(failed).toBeInstanceOf(Error);
    expect(translate.friendlyErrorKey(lostError)).toBe('translate.error.engineRestarted');
    await expect(translate.runLocalQwenPrompt('y', { raw: true })).resolves.toBe('{"ok":true}');
    expect(h.acquired).toBe(2);
  });
});
