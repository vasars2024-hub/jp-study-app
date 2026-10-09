// @vitest-environment jsdom
/**
 * The Translate study panel: sentence-by-sentence alignment, every word into the
 * dictionary popup, the grammar the passage uses linked into the Grammar explorer,
 * per-sentence mining, and the reading-aid toggle.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
}));
vi.mock('../extensionBridgeUi', () => ({ openGrammarPractice: vi.fn() }));
vi.mock('../localStorageWrite', () => ({ writeLocalStorage: vi.fn(() => true) }));
vi.mock('../localGrammarAnalysis', () => ({
  localSentenceAnalysis: (raw: string) => (raw.includes('なければならない')
    ? {
      sentence: raw,
      translations: {},
      nuance: [],
      pitfalls: [],
      annotations: [{
        text: 'なければならない', start: raw.indexOf('なければならない'), end: raw.indexOf('なければならない') + 8,
        category: 'grammar', headword: '〜なければならない', level: 'N4', meaning: 'must',
        explanation: 'obligation', examples: [], vocabulary: [], grammarId: 'n4-nakereba',
      }],
    }
    : null),
}));
vi.mock('../components/SubtitleCueLine', () => ({
  default: ({ text, className, annotations, onSelectAnnotation, furigana }: {
    text: string; className?: string; furigana: boolean;
    annotations?: Array<{ text: string }>; onSelectAnnotation?: (i: number) => void;
  }): ReactNode => (
    <div className={className} data-furigana={String(furigana)}>
      {[...text].map((ch, i) => <span key={i} data-surface={ch}>{ch}</span>)}
      {annotations?.map((a, i) => (
        <button key={a.text} type="button" className="sa-seg" onClick={() => onSelectAnnotation?.(i)}>{a.text}</button>
      ))}
    </div>
  ),
}));

import { openGrammarPractice } from '../extensionBridgeUi';
import TranslateStudyPanel, { collectGrammarPoints } from '../components/translate/TranslateStudyPanel';
import type { TranslateController } from '../components/translate/TranslateContent';

let root: Root | null = null;
let host: HTMLDivElement;

function controller(over: Partial<TranslateController> = {}): TranslateController {
  return {
    source: 'ja', target: 'en', busy: false, style: 'natural',
    segments: [
      { source: '行かなければならない。', target: 'I have to go.' },
      { source: '鳥。', target: '' },
    ],
    mineSegment: vi.fn(), mineResult: vi.fn(), copyResult: vi.fn(),
    ...over,
  } as unknown as TranslateController;
}

async function mount(state: TranslateController) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<TranslateStudyPanel state={state} />));
  // The grammar library is a dynamic import.
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.mocked(openGrammarPractice).mockClear();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('TranslateStudyPanel', () => {
  it('renders nothing without a finished translation', async () => {
    await mount(controller({ segments: [] }));
    expect(host.innerHTML).toBe('');
  });

  it('shows one row per sentence, and says which sentence the model could not translate', async () => {
    await mount(controller());
    const rows = host.querySelectorAll('.xlate-pair');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.xlate-dst')?.textContent).toBe('I have to go.');
    expect(rows[1].querySelector('.xlate-dst')?.textContent).toBe('xlate.segment.untranslated');
    // A sentence with nothing to mine cannot be mined.
    const mine = rows[1].querySelectorAll<HTMLButtonElement>('.xlate-pair-actions button')[1];
    expect(mine.disabled).toBe(true);
  });

  it('mines one sentence from its own row', async () => {
    const state = controller();
    await mount(state);
    const mine = host.querySelectorAll('.xlate-pair')[0].querySelectorAll<HTMLButtonElement>('.xlate-pair-actions button')[1];
    await act(async () => mine.click());
    expect(state.mineSegment).toHaveBeenCalledWith({ source: '行かなければならない。', target: 'I have to go.' });
  });

  it('a click on a word opens the dictionary popup with the sentence as context', async () => {
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('dict:lookup', on);
    await mount(controller());
    const word = host.querySelector<HTMLElement>('.xlate-pair [data-surface="行"]');
    expect(word).not.toBeNull();
    await act(async () => word?.click());
    window.removeEventListener('dict:lookup', on);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ query: '行', context: '行かなければならない。' });
  });

  it('lists the grammar the passage uses and opens it in the Grammar explorer', async () => {
    await mount(controller());
    const chip = host.querySelector<HTMLButtonElement>('.xlate-grammar-chip');
    expect(chip?.textContent).toContain('〜なければならない');
    expect(chip?.textContent).toContain('N4');
    await act(async () => chip?.click());
    expect(openGrammarPractice).toHaveBeenCalledWith({ lang: 'ja', level: 'N4', query: '〜なければならない' });
  });

  it('a grammar span shows its explanation and does not also look a word up', async () => {
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push(e);
    window.addEventListener('dict:lookup', on);
    await mount(controller());
    await act(async () => host.querySelector<HTMLButtonElement>('.sa-seg')?.click());
    window.removeEventListener('dict:lookup', on);
    expect(seen).toHaveLength(0);
    expect(host.querySelector('.xlate-grammar-detail')?.textContent).toContain('obligation');
  });

  it('the reading aid toggles and is remembered', async () => {
    await mount(controller());
    const toggle = [...host.querySelectorAll<HTMLButtonElement>('.xlate-study-bar button')]
      .find((b) => b.textContent === 'xlate.aid.ja');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => toggle?.click());
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.xlate-line')?.getAttribute('data-furigana')).toBe('false');
  });

  it('a source outside the study languages renders plain text with no grammar lookup', async () => {
    await mount(controller({ source: 'en', target: 'ja', segments: [{ source: 'I must go.', target: '行かなければ。' }] }));
    expect(host.querySelector('p.xlate-line')?.textContent).toBe('I must go.');
    expect(host.querySelector('.xlate-grammar')).toBeNull();
  });
});

describe('collectGrammarPoints', () => {
  it('lists each point once, in reading order', () => {
    const annotation = (grammarId: string, headword: string) => ({
      text: headword, start: 0, end: 1, category: 'grammar' as const, headword, level: 'N5',
      meaning: 'm', explanation: '', examples: [], vocabulary: [], grammarId,
    });
    const result = (annotations: ReturnType<typeof annotation>[]) => ({
      sentence: '', translations: {}, nuance: [], pitfalls: [], annotations,
    });
    expect(collectGrammarPoints([
      result([annotation('a', 'A'), annotation('b', 'B')]),
      null,
      result([annotation('a', 'A')]),
    ]).map((p) => p.headword)).toEqual(['A', 'B']);
  });
});
