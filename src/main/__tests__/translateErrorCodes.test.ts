// @vitest-environment node
/**
 * Every failed `translate:run` carries a catalog key (W1-A).
 *
 * Main used to send `errorKey` only for the errors it recognised, and the renderer then put
 * `res.error` — English, and sometimes a library's own text — in front of a Japanese, Chinese or
 * Russian interface. Now each failure is either a named key or the generic "Translation failed.",
 * and `error` stays English for the log only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userData: '',
  home: '',
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(channel, fn) },
  net: { isOnline: () => true },
}));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  // Downloads is one of the model roots; keep the developer's real one out of the test.
  return { ...actual, default: { ...actual, homedir: () => h.home }, homedir: () => h.home };
});
vi.mock('../llamaHost', () => ({
  isLlamaSessionLost: () => false,
  acquireLlamaSession: async () => {
    throw new Error('the offline model must not be reached');
  },
}));

import { friendlyErrorKey, registerTranslateIpc, translateErrorKey } from '../translate';

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xlate-error-codes-'));
h.home = fs.mkdtempSync(path.join(os.tmpdir(), 'xlate-error-codes-home-'));

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
  fs.rmSync(h.home, { recursive: true, force: true });
});

const sender = { id: 7, send: () => undefined };

async function run(req: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!h.handlers.size) registerTranslateIpc();
  const handler = h.handlers.get('translate:run')!;
  return await handler({ sender }, { id: 1, ...req }) as Record<string, unknown>;
}

describe('translate error keys', () => {
  it('names this module\'s own failures', () => {
    expect(friendlyErrorKey(new Error('This text is too long for the offline translator: it needs about 9000 of the 8192 tokens'))).toBe('xlate2.error.tooLong');
    expect(friendlyErrorKey(new Error('The translation model returned no usable output for this text.'))).toBe('xlate2.error.noOutput');
    expect(friendlyErrorKey(new Error('Translation needs a known source and target language; got source="x"'))).toBe('xlate2.error.badLanguage');
    expect(friendlyErrorKey(new Error('Translation prompt timed out after 60s'))).toBe('translate.error.timeout');
  });

  it('gives anything else the generic key rather than none', () => {
    expect(friendlyErrorKey(new Error('EACCES: permission denied, open C:\\x'))).toBeUndefined();
    expect(translateErrorKey(new Error('EACCES: permission denied, open C:\\x'))).toBe('translate.error.failed');
    expect(translateErrorKey('weird')).toBe('translate.error.failed');
  });

  it('a failed translate:run always carries a key', async () => {
    // No model on this profile: the offline engine's own, named failure.
    const missing = await run({ text: '猫が寝た。', source: 'ja', target: 'en' });
    expect(missing).toMatchObject({ ok: false, errorKey: 'translate.error.modelMissing' });
    // A request with no usable language pair.
    const bad = await run({ text: '猫が寝た。', source: 'xx-nope', target: 'en' });
    expect(bad).toMatchObject({ ok: false, errorKey: 'xlate2.error.badLanguage' });
    expect(typeof bad.error).toBe('string');
  });
});
