// @vitest-environment jsdom
/**
 * The Read depth's view: does the panel render the passage the shared model
 * built, and do its four promises — furigana, typography, annotations,
 * vocabulary harvest — actually do something?
 *
 * `window.api` is installed before the import, not before the render: the
 * panel's import graph reaches modules that read it at module-eval time.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReadingLensCapture } from '../../shared/readingLens';
import type { ReadingLensReadSourceLine } from '../../shared/readingLensRead';

function installApiStub(): void {
  const api: Record<string, unknown> = { lookupTerm: async () => ({ entries: [] }) };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      return async (): Promise<unknown> => ({});
    },
  });
}

let ReadPanel: typeof import('../components/lens/LensReadPanel').default;
let root: Root | null = null;
let host: HTMLDivElement;

const CAPTURE: ReadingLensCapture = {
  schemaVersion: 1,
  captureId: 'reading-lens:test-read-panel',
  source: 'screen',
  sourceLabel: 'screen',
  sourceRef: '',
  capturedAt: 1_700_000_000_000,
  language: 'ja',
  engine: 'auto',
  hash: 'test-read-panel',
  text: '',
  lines: [],
};

const LINES: ReadingLensReadSourceLine[] = [
  {
    text: '猫が寝る。',
    box: [0, 0, 200, 20],
    vertical: false,
    confidence: 0.95,
    tokens: [
      { surface: '猫', lemma: '猫', content: true, proper: false, pos: '名詞', reading: 'ネコ' },
      { surface: 'が', lemma: 'が', content: false, proper: false, pos: '助詞' },
      { surface: '寝る', lemma: '寝る', content: true, proper: false, pos: '動詞', reading: 'ネル' },
      { surface: '。', lemma: '。', content: false, proper: false, pos: '記号' },
    ],
  },
  {
    text: '猫は白い',
    box: [0, 22, 200, 20],
    vertical: false,
    confidence: 0.4,
    tokens: [
      { surface: '猫', lemma: '猫', content: true, proper: false, pos: '名詞', reading: 'ネコ' },
      { surface: 'は', lemma: 'は', content: false, proper: false, pos: '助詞' },
      { surface: '白い', lemma: '白い', content: true, proper: false, pos: '形容詞', reading: 'シロイ' },
    ],
  },
];

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  ReadPanel = (await import('../components/lens/LensReadPanel')).default;
});

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

async function render(
  lookups: { surface: string; context: string }[] = [],
  lines: readonly ReadingLensReadSourceLine[] = LINES,
): Promise<void> {
  await act(async () => {
    root?.render(
      <ReadPanel
        capture={CAPTURE}
        lines={lines}
        onLookup={(surface, context) => lookups.push({ surface, context })}
        onClose={() => undefined}
      />,
    );
  });
}

function buttonBy(text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent === text);
}

describe('LensReadPanel', () => {
  it('renders the passage as separate paragraphs, not one welded line', async () => {
    await render();
    // Furigana is on by default and `textContent` would read the ruby back as
    // part of the line (猫ねこが…), so the assertion turns it off first.
    await act(async () => buttonBy('Furigana')?.click());
    const paragraphs = [...host.querySelectorAll('.lens-read-para')];
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('猫が寝る。');
    expect(paragraphs[1].textContent).toBe('猫は白い');
  });

  it('marks the paragraph OCR was unsure about and leaves the confident one alone', async () => {
    await render();
    const paragraphs = [...host.querySelectorAll('.lens-read-para')];
    expect(paragraphs[0].className).toContain('lens-confidence-high');
    expect(paragraphs[1].className).toContain('lens-confidence-low');
  });

  it('puts readings over the kanji and takes them away again', async () => {
    await render();
    expect(host.querySelectorAll('rt').length).toBeGreaterThan(0);

    const toggle = [...host.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-pressed') === 'true' && b.textContent === 'Furigana',
    );
    expect(toggle).toBeDefined();
    await act(async () => toggle?.click());
    expect(host.querySelectorAll('rt')).toHaveLength(0);
    // The passage text itself is untouched — only the ruby went.
    expect(host.querySelector('.lens-read-para')?.textContent).toContain('猫が寝る。');
  });

  it('resizes the passage and remembers it', async () => {
    await render();
    const body = () => host.querySelector<HTMLElement>('.lens-read-body');
    const before = body()?.style.fontSize;
    await act(async () => buttonBy('A+')?.click());
    expect(body()?.style.fontSize).not.toBe(before);
    expect(JSON.parse(localStorage.getItem('jp-study-lens-read') ?? '{}').size).toBe(22);
  });

  it('hands the clicked word its own paragraph as context', async () => {
    const lookups: { surface: string; context: string }[] = [];
    await render(lookups);
    const words = [...host.querySelectorAll<HTMLButtonElement>('.lens-read-word')];
    const shiroi = words.find((w) => w.textContent?.startsWith('白'));
    await act(async () => shiroi?.click());
    expect(lookups).toHaveLength(1);
    expect(lookups[0].surface).toBe('白い');
    expect(lookups[0].context).toBe('猫は白い');
  });

  it('lists the distinct words with their counts, particles excluded', async () => {
    await render();
    const rows = [...host.querySelectorAll('.lens-read-harvest-row')];
    const words = rows.map((row) => row.querySelector('.lens-read-harvest-word')?.textContent);
    expect(words).toEqual(['猫', '寝る', '白い']);
    expect(rows[0].textContent).toContain('2');
    expect(words).not.toContain('が');
  });

  it('says so honestly when there is nothing to read', async () => {
    await render([], []);
    expect(host.querySelector('.lens-read-body')?.textContent).toBe(
      'This capture has no passage to read.',
    );
    expect(host.querySelector('.lens-read-harvest')?.textContent).toContain(
      'No vocabulary here',
    );
  });

  it('refuses to highlight nothing and says why — no selection, no mark', async () => {
    await render();
    const swatch = host.querySelector<HTMLButtonElement>('.lens-read-swatch-yellow');
    await act(async () => swatch?.click());

    expect(host.querySelector('.lens-read-notice')?.textContent).toBe(
      'Select some text in the passage first.',
    );
    expect(host.querySelector('.lens-read-marks')).toBeNull();
    expect(localStorage.getItem(`jp-annotations:lens:${CAPTURE.captureId}`)).toBeNull();
  });

  it('paints a real selection, persists it under the capture id, and takes it back off', async () => {
    await render();
    const run = host.querySelector<HTMLElement>('[data-lens-start="0"]');
    expect(run).not.toBeNull();
    const range = document.createRange();
    range.selectNodeContents(run as HTMLElement);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    await act(async () => host.querySelector<HTMLButtonElement>('.lens-read-swatch-green')?.click());

    const stored = JSON.parse(
      localStorage.getItem(`jp-annotations:lens:${CAPTURE.captureId}`) ?? '[]',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('猫');
    expect(stored[0].color).toBe('green');
    expect(host.querySelector('.lens-read-marked-green')).not.toBeNull();

    await act(async () => host.querySelector<HTMLButtonElement>('.lens-read-mark-remove')?.click());
    expect(localStorage.getItem(`jp-annotations:lens:${CAPTURE.captureId}`)).toBeNull();
    expect(host.querySelector('.lens-read-marked-green')).toBeNull();
  });
});
