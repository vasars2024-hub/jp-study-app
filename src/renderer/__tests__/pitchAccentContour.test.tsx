// @vitest-environment jsdom
/**
 * Pitch accent on the flashcard answer side (Japanese only), from the pitch dictionary the
 * app already holds — the same `dict:pitch` data the Blanc pitch panel reads and the same
 * downsteps the dictionary popup's pitch row is drawn from.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PitchAccentContour from '../components/lexicon/PitchAccentContour';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

async function render(props: { word: string; reading?: string; lang: string }, reply: unknown) {
  const dictPitch = vi.fn(async () => reply);
  (window as unknown as { api: unknown }).api = { dictPitch };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<PitchAccentContour {...props} />));
  await act(async () => { await Promise.resolve(); });
  return dictPitch;
}

const highs = () =>
  Array.from(host.querySelectorAll('.pitch-contour .pitch-mora')).map((m) =>
    `${m.textContent}${m.classList.contains('is-high') ? 'H' : 'L'}${m.classList.contains('is-drop') ? '\\' : ''}`,
  );

describe('pitch accent contour', () => {
  it('draws the contour of a nakadaka word, with the drop after the accent mora', async () => {
    const api = await render(
      { word: '食べる', reading: 'たべる', lang: 'ja' },
      { available: true, entries: [{ reading: 'たべる', positions: [2] }] },
    );
    expect(api).toHaveBeenCalledWith('食べる', 'たべる');
    expect(highs()).toEqual(['たL', 'べH\\', 'るL']);
    const contour = host.querySelector('.pitch-contour');
    expect(contour?.getAttribute('data-pattern')).toBe('nakadaka');
    expect(contour?.getAttribute('aria-label')).toMatch(/たべる/);
  });

  it('keeps a small kana in its mora and marks heiban with no drop', async () => {
    await render(
      { word: '今日', reading: 'きょう', lang: 'ja' },
      { available: true, entries: [{ reading: 'きょう', positions: [1] }] },
    );
    expect(highs()).toEqual(['きょH\\', 'うL']);
    await render(
      { word: '学校', reading: 'がっこう', lang: 'ja' },
      { available: true, entries: [{ reading: 'がっこう', positions: [0] }] },
    );
    expect(highs().slice(-4)).toEqual(['がL', 'っH', 'こH', 'うH']);
  });

  it('renders nothing for Chinese or Russian, and does not ask', async () => {
    const zh = await render({ word: '学习', reading: 'xuéxí', lang: 'zh' }, { available: true, entries: [] });
    expect(zh).not.toHaveBeenCalled();
    expect(host.textContent).toBe('');
  });

  it('renders nothing without a pitch dictionary or an entry', async () => {
    await render({ word: '食べる', reading: 'たべる', lang: 'ja' }, { available: false, entries: [] });
    expect(host.querySelector('.pitch-contour')).toBeNull();
    await render({ word: '食べる', reading: 'たべる', lang: 'ja' }, undefined);
    expect(host.querySelector('.pitch-contour')).toBeNull();
  });
});
