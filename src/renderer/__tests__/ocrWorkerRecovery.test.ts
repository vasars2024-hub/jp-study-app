// @vitest-environment node
/**
 * Resilience audit #8: one failed Tesseract start used to be cached forever —
 * the rejected `createWorker` promise stayed in the map, so every later manga
 * or handwriting scan failed instantly until the renderer reloaded. A worker
 * that died mid-call was likewise handed to the next scan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  created: 0,
  terminated: 0,
  failNextStart: false,
  recognize: (): Promise<{ data: { text: string } }> => Promise.resolve({ data: { text: '猫 が いる' } }),
}));

vi.mock('tesseract.js', () => ({
  createWorker: () => {
    h.created += 1;
    if (h.failNextStart) {
      h.failNextStart = false;
      return Promise.reject(new Error('failed to load traineddata'));
    }
    return Promise.resolve({
      recognize: () => h.recognize(),
      terminate: () => {
        h.terminated += 1;
        return Promise.resolve();
      },
    });
  },
}));

const { runOcr, resetOcrWorkersForTests, OCR_RECOGNIZE_TIMEOUT_MS } = await import('../ocr');

beforeEach(() => {
  resetOcrWorkersForTests();
  h.created = 0;
  h.terminated = 0;
  h.failNextStart = false;
  h.recognize = () => Promise.resolve({ data: { text: '猫 が いる' } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a failed OCR start', () => {
  it('is not cached: the next scan creates a new worker and succeeds', async () => {
    h.failNextStart = true;
    await expect(runOcr('data:image/png;base64,', 'jpn_vert')).rejects.toThrow(/traineddata/);
    await expect(runOcr('data:image/png;base64,', 'jpn_vert')).resolves.toBe('猫がいる');
    expect(h.created).toBe(2);
  });

  it('keeps a healthy worker for the next scan', async () => {
    await runOcr('data:image/png;base64,', 'jpn');
    await runOcr('data:image/png;base64,', 'jpn');
    expect(h.created).toBe(1);
  });
});

describe('a worker that dies or hangs mid-call', () => {
  it('is terminated and replaced after it throws', async () => {
    h.recognize = () => Promise.reject(new Error('RuntimeError: memory access out of bounds'));
    await expect(runOcr('data:image/png;base64,', 'jpn')).rejects.toThrow(/out of bounds/);
    h.recognize = () => Promise.resolve({ data: { text: 'ok' } });
    await expect(runOcr('data:image/png;base64,', 'jpn')).resolves.toBe('ok');
    expect(h.created).toBe(2);
    expect(h.terminated).toBe(1);
  });

  it('gives up at the deadline instead of hanging the scan', async () => {
    vi.useFakeTimers();
    h.recognize = () => new Promise(() => undefined);
    const outcome = runOcr('data:image/png;base64,', 'jpn').then(() => 'resolved', (err: Error) => err.name);
    await vi.advanceTimersByTimeAsync(OCR_RECOGNIZE_TIMEOUT_MS + 1);
    expect(await outcome).toBe('TimeoutError');
    expect(h.terminated).toBe(1);
  });
});

describe('what the reader is told', () => {
  it('names a timeout, and never passes the raw engine message through', async () => {
    const { ocrFailureKey } = await import('../ocr');
    expect(ocrFailureKey(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('manga.ocr.timedOut');
    expect(ocrFailureKey(new Error('RuntimeError: memory access out of bounds'))).toBe('manga.ocr.failed');
  });
});
