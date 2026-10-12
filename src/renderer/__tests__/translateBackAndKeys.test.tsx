// @vitest-environment jsdom
/**
 * The workbench's study checks and keys:
 *
 * - back-translation translates each aligned sentence's translation back into
 *   the source language, with the REVERSE pair's engine, row by row, never
 *   into the history, and a new passage drops the old checks;
 * - "Re-run" on a history row asks main for a fresh translation, not the cache;
 * - Escape stops a running translation (and nothing else), Alt+B checks all;
 * - the aligned view shows each check under its pair.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../translator', () => ({ translateTo: vi.fn(), onModelProgress: vi.fn(() => () => undefined) }));
vi.mock('../notebookTimeline', () => ({ appendNotebookEvent: vi.fn(), saveTranslationNote: vi.fn() }));
vi.mock('../translationHistory', () => ({
  appendTranslationHistory: vi.fn(), loadTranslationHistory: () => [],
  onTranslationHistoryChanged: () => () => undefined,
  clearTranslationHistory: vi.fn(), removeTranslationHistory: vi.fn(), togglePinTranslationHistory: vi.fn(),
}));
vi.mock('../studyMining', () => ({ mineToStudy: vi.fn(async () => ({ created: true })) }));
vi.mock('../flashcardDeck', () => ({ createDeckFolder: vi.fn() }));
vi.mock('../components/ui', () => ({ confirmDialog: vi.fn() }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key), lang: 'en' }) }));
// The aligned view's heavy neighbours are not what is under test here.
vi.mock('../components/SubtitleCueLine', () => ({ default: ({ text }: { text: string }) => <span>{text}</span> }));
vi.mock('../components/translate/TranslateEngineBar', () => ({
  TranslateEngineBar: () => null,
  TranslateResultSource: () => null,
}));
vi.mock('../extensionBridgeUi', () => ({ openGrammarPractice: vi.fn() }));

import { translateTo } from '../translator';
import { appendTranslationHistory } from '../translationHistory';
import { handleTranslateHotkey, useTranslate, type TranslateController } from '../components/translate/TranslateContent';
import TranslateStudyPanel from '../components/translate/TranslateStudyPanel';

let root: Root;
let host: HTMLDivElement;
let controller: TranslateController;
function Harness({ panel = false }: { panel?: boolean }) {
  controller = useTranslate();
  return panel ? <TranslateStudyPanel state={controller} /> : null;
}

async function mount(panel = false): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness panel={panel} />));
}

beforeEach(() => {
  vi.mocked(translateTo).mockReset();
  vi.mocked(appendTranslationHistory).mockClear();
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

/** Translate a two-sentence passage to a finished, aligned result. */
async function translatePassage(): Promise<void> {
  vi.mocked(translateTo).mockImplementationOnce(async (_text, _s, _t, _p, _h, options) => {
    options?.onSegments?.([
      { source: '猫が好き。', target: 'I like cats.' },
      { source: '犬も好き。', target: 'I like dogs too.' },
    ]);
    return 'I like cats. I like dogs too.';
  });
  await act(async () => controller.setInput('猫が好き。犬も好き。'));
  await act(async () => { await controller.run(); });
  expect(controller.segments).toHaveLength(2);
}

describe('back-translation', () => {
  it('translates every row back with the reverse pair, and records no history', async () => {
    await mount();
    await translatePassage();
    vi.mocked(appendTranslationHistory).mockClear();
    vi.mocked(translateTo).mockImplementation(async (text) => (text === 'I like cats.' ? '猫が好きだ。' : '犬も好きだ。'));

    await act(async () => controller.backTranslateAll?.());
    await act(async () => { await Promise.resolve(); });

    const calls = vi.mocked(translateTo).mock.calls.slice(1);
    expect(calls.map((c) => [c[0], c[1], c[2], c[5]?.provider])).toEqual([
      ['I like cats.', 'en', 'ja', 'pair'],
      ['I like dogs too.', 'en', 'ja', 'pair'],
    ]);
    expect(controller.backTranslations).toEqual({
      0: { status: 'done', text: '猫が好きだ。' },
      1: { status: 'done', text: '犬も好きだ。' },
    });
    expect(appendTranslationHistory).not.toHaveBeenCalled();
  });

  it('reports a failed row on that row only, and a new passage clears the checks', async () => {
    await mount();
    await translatePassage();
    vi.mocked(translateTo).mockRejectedValueOnce(new Error('offline'));
    await act(async () => controller.backTranslate?.(1));
    expect(controller.backTranslations?.[1]).toEqual({ status: 'error', error: 'offline' });
    expect(controller.backTranslations?.[0]).toBeUndefined();

    await act(async () => controller.clear());
    expect(controller.backTranslations).toEqual({});
  });

  it('shows each check under its pair in the aligned view', async () => {
    await mount(true);
    await translatePassage();
    vi.mocked(translateTo).mockResolvedValue('猫が好きだ。');
    await act(async () => controller.backTranslate?.(0));
    const back = host.querySelectorAll('.xlate-back');
    expect(back).toHaveLength(1);
    expect(back[0].textContent).toContain('猫が好きだ。');
    expect(back[0].getAttribute('lang')).toBe('ja');
    // Every pair offers its own check, named for the sentence it checks.
    const rowButtons = [...host.querySelectorAll('.xlate-pair-actions button')]
      .filter((b) => b.textContent === 'xlate2.back.action');
    expect(rowButtons).toHaveLength(2);
    expect(rowButtons[1].getAttribute('aria-label')).toContain('犬も好き。');
  });
});

describe('re-run is a fresh translation', () => {
  it('asks main to skip its cache for a history re-run, and not for an ordinary run', async () => {
    await mount();
    vi.mocked(translateTo).mockResolvedValue('I like cats.');
    await act(async () => controller.setInput('猫が好き。'));
    await act(async () => { await controller.run(); });
    expect(vi.mocked(translateTo).mock.calls[0][5]?.fresh).toBeUndefined();
    await act(async () => controller.retranslateEntry({
      id: 'h1', ts: 1, sourceLang: 'ja', targetLang: 'en', sourceText: '猫が好き。', resultText: 'I like cats.', origin: 'app',
    } as never));
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(translateTo).mock.calls[1][5]?.fresh).toBe(true);
  });
});

describe('keys', () => {
  const key = (k: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; composing: boolean }> = {}) => ({
    key: k,
    altKey: mods.altKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: false,
    shiftKey: false,
    nativeEvent: { isComposing: mods.composing ?? false },
    preventDefault: vi.fn(),
  });

  it('Escape stops a running translation, and only a running one', () => {
    const cancel = vi.fn();
    const base = { mineResult: vi.fn(), copyResult: vi.fn(), cancel };
    expect(handleTranslateHotkey(key('Escape'), { ...base, busy: false })).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(handleTranslateHotkey(key('Escape'), { ...base, busy: true })).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('leaves an Escape that ends an IME composition alone', () => {
    const cancel = vi.fn();
    expect(handleTranslateHotkey(key('Escape', { composing: true }), {
      mineResult: vi.fn(), copyResult: vi.fn(), cancel, busy: true,
    })).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('Alt+B back-translates every sentence; Alt+M and Alt+C still mine and copy', () => {
    const state = { mineResult: vi.fn(), copyResult: vi.fn(), backTranslateAll: vi.fn() };
    expect(handleTranslateHotkey(key('b', { altKey: true }), state)).toBe(true);
    expect(state.backTranslateAll).toHaveBeenCalledTimes(1);
    handleTranslateHotkey(key('m', { altKey: true }), state);
    handleTranslateHotkey(key('c', { altKey: true }), state);
    expect(state.mineResult).toHaveBeenCalledTimes(1);
    expect(state.copyResult).toHaveBeenCalledTimes(1);
    // A shell without back-translation does not swallow Alt+B.
    expect(handleTranslateHotkey(key('b', { altKey: true }), { mineResult: vi.fn(), copyResult: vi.fn() })).toBe(false);
  });
});
