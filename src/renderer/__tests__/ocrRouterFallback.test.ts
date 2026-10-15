// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOcr, resetOcrWorkersForTests } from '../ocr';

const h = vi.hoisted(() => ({ lang: 'ja', recognize: vi.fn(async () => ({ data: { text: '猫 が いる' } })) }));
vi.mock('../studyEnvironment', () => ({ getStudyLang: () => h.lang }));
vi.mock('tesseract.js', () => ({ createWorker: async () => ({ recognize: h.recognize, terminate: async () => undefined }) }));
const originalApi = window.api;
beforeEach(() => { h.lang = 'ja'; h.recognize.mockClear(); resetOcrWorkersForTests(); });
afterEach(() => { window.api = originalApi; });
describe('manual image OCR routing', () => {
  it('asks the shared main reader before starting a Tesseract worker', async () => {
    const read = vi.fn(async () => '恐竜');
    window.api = { mangaOcrRecognizeImage: read } as unknown as Window['api'];
    expect(await runOcr('data:image/png;base64,AA==', 'jpn_vert')).toBe('恐竜');
    expect(read).toHaveBeenCalledOnce(); expect(h.recognize).not.toHaveBeenCalled();
  });
  it('keeps the bundled Japanese reader usable when no main reader is installed', async () => {
    window.api = { mangaOcrRecognizeImage: async () => { throw new Error('no-engine'); } } as unknown as Window['api'];
    expect(await runOcr('data:image/png;base64,AA==', 'jpn')).toBe('猫がいる');
    expect(h.recognize).toHaveBeenCalledOnce();
  });
  it('never feeds Chinese text to the Japanese Tesseract fallback', async () => {
    h.lang = 'zh';
    window.api = { mangaOcrRecognizeImage: async () => { throw new Error('no-engine'); } } as unknown as Window['api'];
    await expect(runOcr('data:image/png;base64,AA==', 'jpn')).rejects.toThrow('no-engine');
    expect(h.recognize).not.toHaveBeenCalled();
  });
});
