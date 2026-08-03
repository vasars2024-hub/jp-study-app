// @vitest-environment node
/**
 * `translateText` must not answer a malformed request with its own input.
 *
 * The bug this pins: the language pair was only compared, never validated, so a
 * caller that named the fields `from`/`to` instead of `source`/`target` produced
 * `undefined === undefined`, took the "same language, nothing to do" branch, and
 * got the source text back through `translate:run` as `{ok: true, text: <input>}`.
 * That is indistinguishable from a real translation, and it cost a session's
 * worth of wrong conclusions about whether the local model worked at all.
 *
 * These run the guard only — it is reached before `ensureSession`, so no GGUF is
 * loaded and `node-llama-cpp` is never touched.
 */
import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

const { translateForBook } = await import('../translate');

describe('translateText language validation', () => {
  it('rejects an unknown target language instead of echoing the source', async () => {
    await expect(translateForBook('猫が窓辺で寝ている。', 'ja', 'not-a-language')).rejects.toThrow(
      /known source and target language/i,
    );
  });

  it('rejects a missing language pair — the from/to mix-up case', async () => {
    await expect(
      translateForBook('猫が窓辺で寝ている。', undefined as unknown as string, undefined as unknown as string),
    ).rejects.toThrow(/known source and target language/i);
  });

  it('still short-circuits a genuine same-language request', async () => {
    // Both codes are real and equal: there is nothing to translate and returning
    // the input is correct here, which is why the guard checks validity rather
    // than removing the short-circuit.
    await expect(translateForBook('a real sentence', 'en', 'en')).resolves.toBe('a real sentence');
  });

  it('returns empty text unchanged without consulting the model', async () => {
    await expect(translateForBook('   ', 'ja', 'en')).resolves.toBe('   ');
  });
});
