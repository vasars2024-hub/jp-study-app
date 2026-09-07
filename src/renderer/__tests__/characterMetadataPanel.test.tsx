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

  /** One completed pen stroke, which the Recognize button now requires. */
  async function drawOneStroke(host: HTMLElement): Promise<void> {
    const canvas = host.querySelector('canvas');
    if (!canvas) throw new Error('Expected the handwriting canvas to render.');
    Object.assign(canvas, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    await act(async () => {
      canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      canvas.dispatchEvent(new Event('pointermove', { bubbles: true }));
      canvas.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
  }

  async function mountPractice(): Promise<HTMLElement> {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<CharacterMetadataPanel character={{
      lang: 'ja', char: '猫', components: [], readings: [], meanings: [], sources: [],
    }} />));
    return host;
  }

  const recognizeButton = (host: HTMLElement): HTMLButtonElement | undefined =>
    [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'manga.hw.recognize');

  it('submits a bounded canvas image and recovers from recognition failure', async () => {
    recognizeImage.mockResolvedValueOnce('noise 猫 trailing').mockRejectedValueOnce(new Error('offline'));
    const host = await mountPractice();

    const recognize = recognizeButton(host);
    const clear = [...host.querySelectorAll('button')].find((button) => button.textContent === 'manga.hw.clear');
    expect(host.querySelector('canvas')?.getAttribute('width')).toBe('180');
    expect(recognize).toBeTruthy();

    await drawOneStroke(host);
    await act(async () => recognize?.click());
    expect(recognizeImage).toHaveBeenCalledWith('data:image/png;base64,practice');
    expect(host.querySelector('output')?.textContent).toBe('猫');

    await act(async () => recognize?.click());
    expect(host.querySelector('output')?.textContent).toBe('manga.hw.failed');
    await act(async () => clear?.click());
    expect(clearRect).toHaveBeenCalledWith(0, 0, 180, 180);
    expect(host.querySelector('output')).toBeNull();
  });

  /**
   * Measured live 2026-09-07: Recognize on an untouched canvas ran a real model
   * pass and printed `それは、` — a four-character phrase — as the glyph the
   * reader had "drawn". Two halves, and both are asserted, because either alone
   * still leaves a lie on screen: the button must not fire at all, and a
   * multi-character answer must not be shown as a character.
   */
  it('refuses to recognize an untouched canvas, and says why', async () => {
    const host = await mountPractice();

    const recognize = recognizeButton(host);
    expect(recognize?.disabled).toBe(true);
    expect(recognize?.getAttribute('title')).toBe('lexicon.character.drawFirst');

    await act(async () => recognize?.click());

    expect(recognizeImage).not.toHaveBeenCalled();
    expect(host.querySelector('output')).toBeNull();

    await drawOneStroke(host);
    expect(recognizeButton(host)?.disabled).toBe(false);
    expect(recognizeButton(host)?.getAttribute('title')).toBeNull();
  });

  it('reports a multi-character answer as nothing recognized, not as the character', async () => {
    recognizeImage.mockResolvedValueOnce('それは、');
    const host = await mountPractice();
    await drawOneStroke(host);

    await act(async () => recognizeButton(host)?.click());

    expect(host.querySelector('output')?.textContent).toBe('manga.hw.noChar');
  });

  it('NEGATIVE CONTROL: a single drawn kana is still reported', async () => {
    // The CJK filter does not match kana, so the "not a glyph" rule has to be
    // about LENGTH. A one-character answer is a glyph whatever script it is in.
    recognizeImage.mockResolvedValueOnce('ぬ');
    const host = await mountPractice();
    await drawOneStroke(host);

    await act(async () => recognizeButton(host)?.click());

    expect(host.querySelector('output')?.textContent).toBe('ぬ');
  });

  it('counts completed pen strokes against the grounded total and resets them', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<CharacterMetadataPanel character={{
      lang: 'ja', char: '猫', strokes: 11, components: [], readings: [], meanings: [], sources: [],
    }} />));

    const canvas = host.querySelector('canvas');
    expect(canvas).not.toBeNull();
    if (!canvas) throw new Error('Expected the handwriting canvas to render.');
    Object.assign(canvas, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    expect(host.querySelector('.lexicon-character-practice-strokes')?.textContent)
      .toBe('lexicon.character.strokes: 0 / 11');

    await act(async () => {
      canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      canvas.dispatchEvent(new Event('pointermove', { bubbles: true }));
      canvas.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(host.querySelector('.lexicon-character-practice-strokes')?.textContent)
      .toBe('lexicon.character.strokes: 1 / 11');

    await act(async () => host.querySelector<HTMLButtonElement>('.lexicon-character-practice-actions button')?.click());
    expect(host.querySelector('.lexicon-character-practice-strokes')?.textContent)
      .toBe('lexicon.character.strokes: 0 / 11');
  });

  it('shows only returned dictionary words that contain the character', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const entry = (word: string, reading: string) => ({
      word, reading, isCommon: false, jlpt: [], senses: [],
    });
    await act(async () => root?.render(<CharacterMetadataPanel
      character={{
        lang: 'ja', char: '猫', components: [], readings: [], meanings: [], sources: [],
      }}
      entries={[entry('子猫', 'こねこ'), entry('犬', 'いぬ')]}
    />));

    const words = host.querySelector('.lexicon-character-words');
    expect(words?.textContent).toContain('lexicon.character.wordsContaining');
    expect(words?.textContent).toContain('子猫');
    expect(words?.textContent).toContain('こねこ');
    expect(words?.textContent).not.toContain('犬');
  });
});
