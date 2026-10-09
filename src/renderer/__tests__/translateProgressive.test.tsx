// @vitest-environment jsdom
/**
 * Progressive display, the result's engine, and the glossary on the way out:
 *
 * - each sentence main reports fills the result pane before the passage ends;
 * - the finished result carries which engine produced it (and history keeps it);
 * - only the glossary terms that occur in the passage are sent with the request;
 * - a failure clears the half-shown sentences instead of leaving them as a result.
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
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key) }) }));

import { translateTo, type TranslateRunOptions } from '../translator';
import { appendTranslationHistory } from '../translationHistory';
import { useTranslate, type TranslateController } from '../components/translate/TranslateContent';
import { TRANSLATE_GLOSSARY_STORAGE_KEY } from '../translateGlossaryStore';

let root: Root;
let controller: TranslateController;
function Harness() { controller = useTranslate(); return null; }

beforeEach(async () => {
  vi.mocked(translateTo).mockReset();
  vi.mocked(appendTranslationHistory).mockClear();
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
});

function deferredTranslate(): { options: () => TranslateRunOptions; finish: (text: string) => void; fail: (e: Error) => void } {
  let resolve: (text: string) => void = () => undefined;
  let reject: (e: Error) => void = () => undefined;
  let captured: TranslateRunOptions = {};
  vi.mocked(translateTo).mockImplementation((_text, _s, _t, _p, _h, options) => {
    captured = options ?? {};
    return new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  });
  return { options: () => captured, finish: (text) => resolve(text), fail: (e) => reject(e) };
}

describe('progressive display', () => {
  it('fills the result pane sentence by sentence, then settles on the finished text and its engine', async () => {
    const run = deferredTranslate();
    await act(async () => controller.setInput('猫が好き。犬も好き。'));
    let pending: Promise<void> = Promise.resolve();
    await act(async () => { pending = controller.run(); });

    await act(async () => run.options().onSegment?.(0, { source: '猫が好き。', target: 'I like cats.' }, 2));
    expect(controller.state).toBe('translating');
    expect(controller.output).toBe('I like cats.');
    expect(controller.liveSegments).toHaveLength(1);
    expect(controller.msg).toBe('xlate2.progress.sentences{"done":1,"total":2}');

    await act(async () => run.options().onSegment?.(1, { source: '犬も好き。', target: 'I like dogs too.' }, 2));
    expect(controller.output).toBe('I like cats. I like dogs too.');

    await act(async () => {
      run.options().onMeta?.({ provider: 'deepl' });
      run.finish('I like cats. I like dogs too.');
      await pending;
    });
    expect(controller.state).toBe('done');
    expect(controller.meta).toEqual({ provider: 'deepl' });
    expect(controller.liveSegments).toEqual([]);
    expect(vi.mocked(appendTranslationHistory).mock.calls[0][0]).toMatchObject({ provider: 'deepl' });
  });

  it('a failure clears the sentences shown while it ran', async () => {
    const run = deferredTranslate();
    await act(async () => controller.setInput('猫が好き。犬も好き。'));
    let pending: Promise<void> = Promise.resolve();
    await act(async () => { pending = controller.run(); });
    await act(async () => run.options().onSegment?.(0, { source: '猫が好き。', target: 'I like cats.' }, 2));
    await act(async () => {
      run.fail(new Error('DeepL could not translate this'));
      await pending;
    });
    expect(controller.state).toBe('error');
    expect(controller.output).toBe('');
    expect(controller.error).toContain('DeepL');
  });
});

describe('glossary on the request', () => {
  it('sends only the terms that occur in the passage, for this pair', async () => {
    localStorage.setItem(TRANSLATE_GLOSSARY_STORAGE_KEY, JSON.stringify([
      { id: 'a', source: '先輩', target: 'senpai', addedAt: 1 },
      { id: 'b', source: '東京', target: 'Tokyo', addedAt: 1 },
      { id: 'c', source: '猫', target: 'kitty', sourceLang: 'ja', targetLang: 'ru', addedAt: 1 },
    ]));
    vi.mocked(translateTo).mockResolvedValue('My senpai likes cats.');
    await act(async () => controller.setInput('先輩は猫が好き。'));
    await act(async () => { await controller.run(); });
    expect(vi.mocked(translateTo).mock.calls[0][5]?.glossary).toEqual([{ source: '先輩', target: 'senpai' }]);
    // The workbench asks for the pair's chosen engine; main resolves it and enforces consent.
    expect(vi.mocked(translateTo).mock.calls[0][5]?.provider).toBe('pair');
  });

  it('sends no glossary field at all when nothing matches', async () => {
    vi.mocked(translateTo).mockResolvedValue('I like cats.');
    await act(async () => controller.setInput('猫が好き。'));
    await act(async () => { await controller.run(); });
    expect(vi.mocked(translateTo).mock.calls[0][5]).not.toHaveProperty('glossary');
  });
});
