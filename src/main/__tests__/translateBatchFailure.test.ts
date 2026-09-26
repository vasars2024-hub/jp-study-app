// @vitest-environment node
/**
 * A batch that translated nothing says why.
 *
 * `runTranslationBatch` reports a failed item as an empty string rather than
 * throwing — right for a long run, and the reason the manga reader could only
 * say "Translation failed." Each failed item now carries a reason, and
 * `summarizeTranslateFailure` picks the one that explains the batch.
 *
 * The model is never loaded: userData and the home folder point at an empty
 * temp directory, so `ensureSession` fails with "model not found" exactly as it
 * does on a machine without Qwen, and llamaHost is stubbed to prove nothing
 * native is reached.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyTranslateError,
  summarizeTranslateFailure,
} from '../../shared/translateBatchFailure';
import { LocalModelMissingError } from '../localModelFiles';
import { runTranslationBatch } from '../translate';

const h = vi.hoisted(() => ({ acquired: 0, empty: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => h.empty },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));
vi.mock('../llamaHost', () => ({
  isLlamaSessionLost: () => false,
  acquireLlamaSession: async () => {
    h.acquired += 1;
    throw new Error('llamaHost must not be reached');
  },
}));

const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-batch-empty-'));
h.empty = empty;
vi.spyOn(os, 'homedir').mockReturnValue(empty);

describe('runTranslationBatch without a model', () => {
  it('marks every item model-missing, and the batch summary says so', async () => {
    const results = await runTranslationBatch([
      { id: 'a', text: '猫が寝ている。', source: 'ja', target: 'en' },
      { id: 'b', text: '静かだね。', source: 'ja', target: 'en' },
    ]);
    expect(results.map((r) => r.text)).toEqual(['', '']);
    expect(results.every((r) => r.reason === 'model-missing')).toBe(true);
    expect(summarizeTranslateFailure(results)?.reason).toBe('model-missing');
    expect(h.acquired).toBe(0);
  });
});

describe('classifyTranslateError', () => {
  it('tells a missing model, a timeout and an engine failure apart', () => {
    expect(classifyTranslateError(new Error('Qwen3 model not found')).reason).toBe('model-missing');
    // What ensureSession throws since Settings > AI owns the model install.
    expect(classifyTranslateError(new LocalModelMissingError()).reason).toBe('model-missing');
    expect(classifyTranslateError(new Error('Translation prompt timed out after 90s')).reason).toBe('timeout');
    expect(classifyTranslateError(new Error('vulkan backend failed')).reason).toBe('engine');
  });
});

describe('summarizeTranslateFailure', () => {
  it('is null when anything translated', () => {
    expect(summarizeTranslateFailure([{ id: 'a', text: 'ok' }, { id: 'b', text: '', reason: 'timeout' }])).toBeNull();
  });
  it('picks the most frequent reason, and treats an unexplained empty as rejected output', () => {
    expect(summarizeTranslateFailure([
      { id: 'a', text: '', reason: 'timeout' },
      { id: 'b', text: '', reason: 'timeout' },
      { id: 'c', text: '' },
    ])?.reason).toBe('timeout');
    expect(summarizeTranslateFailure([{ id: 'a', text: '' }])?.reason).toBe('rejected');
  });
});
