// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

import CharacterMetadataPanel from '../components/lexicon/CharacterMetadataPanel';

let root: Root | null = null;
const recognizeImage = vi.fn<(dataUrl: string) => Promise<string>>();
const clearRect = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  recognizeImage.mockReset();
  clearRect.mockReset();
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { mangaOcrRecognizeImage: recognizeImage },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    beginPath: vi.fn(), clearRect, lineTo: vi.fn(), moveTo: vi.fn(), stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,practice');
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('CharacterMetadataPanel', () => {
  it('renders grounded facts and every contributing source without placeholders', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<CharacterMetadataPanel character={{
      lang: 'ja', char: '猫', strokes: 11, radical: '犬',
      components: ['犭', '苗'], readings: ['ビョウ', 'ねこ'], meanings: ['cat'],
      jlpt: 'N3', grade: 8, frequency: 1702,
      sources: [
        { dictId: 'kanjidic', dictTitle: 'KANJIDIC2', licence: 'CC BY-SA 4.0' },
        { dictId: 'user', dictTitle: 'My characters', attribution: 'Local import' },
      ],
    }} />));

    expect(host.textContent).toContain('猫');
    expect(host.textContent).toContain('11');
    expect(host.textContent).toContain('犭 · 苗');
    expect(host.querySelector('.lexicon-character-components')?.textContent).toContain('犭');
    expect(host.textContent).toContain('ビョウ · ねこ');
    expect(host.textContent).toContain('KANJIDIC2');
    expect(host.textContent).toContain('CC BY-SA 4.0');
    expect(host.textContent).toContain('Local import');
    expect(host.textContent).not.toContain('undefined');
  });

  it('submits a bounded canvas image and recovers from recognition failure', async () => {
    recognizeImage.mockResolvedValueOnce('noise 猫 trailing').mockRejectedValueOnce(new Error('offline'));
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<CharacterMetadataPanel character={{
      lang: 'ja', char: '猫', components: [], readings: [], meanings: [], sources: [],
    }} />));

    const buttons = [...host.querySelectorAll('button')];
    const recognize = buttons.find((button) => button.textContent === 'manga.hw.recognize');
    const clear = buttons.find((button) => button.textContent === 'manga.hw.clear');
    expect(host.querySelector('canvas')?.getAttribute('width')).toBe('180');
    expect(recognize).toBeTruthy();

    await act(async () => recognize?.click());
    expect(recognizeImage).toHaveBeenCalledWith('data:image/png;base64,practice');
    expect(host.querySelector('output')?.textContent).toBe('猫');

    await act(async () => recognize?.click());
    expect(host.querySelector('output')?.textContent).toBe('manga.hw.failed');
    await act(async () => clear?.click());
    expect(clearRect).toHaveBeenCalledWith(0, 0, 180, 180);
    expect(host.querySelector('output')).toBeNull();
  });
});
