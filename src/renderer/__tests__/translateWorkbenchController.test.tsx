// @vitest-environment jsdom
/**
 * The Translate controller's new behaviour: sentence alignment from main, the
 * natural/literal toggle (which re-translates a finished result), one-click and
 * Alt+M mining, a real history re-run, and the clipboard watcher.
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
vi.mock('../localStorageWrite', () => ({ writeLocalStorage: vi.fn(() => true) }));
vi.mock('../components/ui', () => ({ confirmDialog: vi.fn() }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

import { translateTo } from '../translator';
import { mineToStudy } from '../studyMining';
import { writeLocalStorage } from '../localStorageWrite';
import {
  CLIPBOARD_WATCH_INTERVAL_MS,
  handleTranslateHotkey,
  useTranslate,
  type TranslateController,
} from '../components/translate/TranslateContent';

let root: Root;
let controller: TranslateController;
const toasts: Array<{ message: string; kind: string }> = [];
function Harness() { controller = useTranslate(); return null; }
const onToast = (e: Event) => toasts.push((e as CustomEvent).detail);

beforeEach(async () => {
  vi.mocked(translateTo).mockReset();
  vi.mocked(mineToStudy).mockClear();
  vi.mocked(writeLocalStorage).mockClear();
  localStorage.clear();
  toasts.length = 0;
  window.addEventListener('os:toast', onToast);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  window.removeEventListener('os:toast', onToast);
  await act(async () => root.unmount());
  vi.useRealTimers();
});

async function translate(text: string, segments?: Array<{ source: string; target: string }>, result = 'I like cats. I like dogs.') {
  vi.mocked(translateTo).mockImplementation(async (_text, _s, _t, _p, _h, options) => {
    if (segments) options?.onSegments?.(segments);
    return result;
  });
  await act(async () => controller.setInput(text));
  await act(async () => { await controller.run(); });
}

describe('alignment', () => {
  it('shows the sentence pairs main reported', async () => {
    const pairs = [{ source: '猫が好き。', target: 'I like cats.' }, { source: '犬が好き。', target: 'I like dogs.' }];
    await translate('猫が好き。犬が好き。', pairs);
    expect(controller.segments).toEqual(pairs);
  });

  it('falls back to its own split when main reports none', async () => {
    await translate('猫が好き。犬が好き。');
    expect(controller.segments).toEqual([
      { source: '猫が好き。', target: 'I like cats.' },
      { source: '犬が好き。', target: 'I like dogs.' },
    ]);
  });

  it('is empty after a swap, so no stale pairs are shown over repurposed text', async () => {
    await translate('猫が好き。犬が好き。');
    await act(async () => controller.swap());
    expect(controller.segments).toEqual([]);
  });
});

describe('natural / literal', () => {
  it('passes the style, remembers it, and re-translates a finished result', async () => {
    await translate('猫が好き。');
    expect(vi.mocked(translateTo).mock.calls[0][5]?.style).toBe('natural');
    await act(async () => controller.setStyle('literal'));
    expect(controller.style).toBe('literal');
    expect(writeLocalStorage).toHaveBeenCalledWith('jp-translate-style-v1', 'literal');
    expect(translateTo).toHaveBeenCalledTimes(2);
    expect(vi.mocked(translateTo).mock.calls[1][0]).toBe('猫が好き。');
    expect(vi.mocked(translateTo).mock.calls[1][5]?.style).toBe('literal');
  });
});

describe('mining', () => {
  it('mines the finished translation as a sentence card', async () => {
    await translate('猫が好きです。', undefined, 'I like cats.');
    await act(async () => { controller.mineResult(); await Promise.resolve(); });
    expect(mineToStudy).toHaveBeenCalledWith(expect.objectContaining({
      word: '猫が好きです。', meaning: 'I like cats.', sentence: '猫が好きです。', studyKind: 'sentence', sourceId: 'translate',
    }));
    expect(toasts.at(-1)).toMatchObject({ kind: 'ok' });
  });

  it('says so instead of mining nothing', async () => {
    await act(async () => controller.mineResult());
    expect(mineToStudy).not.toHaveBeenCalled();
    expect(toasts.at(-1)).toEqual({ message: 'xlate.mine.nothing', kind: 'warn' });
  });

  it('mines one aligned sentence', async () => {
    await act(async () => controller.mineSegment({ source: '犬が好き。', target: 'I like dogs.' }));
    expect(mineToStudy).toHaveBeenCalledWith(expect.objectContaining({ sentence: '犬が好き。', meaning: 'I like dogs.' }));
  });
});

describe('history re-run', () => {
  it('translates the entry again in its own direction', async () => {
    vi.mocked(translateTo).mockResolvedValue('кошка');
    await act(async () => controller.retranslateEntry({
      id: 'x', sourceLang: 'ja', targetLang: 'ru', sourceText: '猫', resultText: 'old', ts: 1, origin: 'app',
    }));
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(translateTo).mock.calls[0].slice(0, 3)).toEqual(['猫', 'ja', 'ru']);
    expect(controller).toMatchObject({ input: '猫', output: 'кошка', target: 'ru' });
  });
});

describe('clipboard watch', () => {
  it('seeds on the current clipboard, then translates new source-language text', async () => {
    vi.useFakeTimers();
    const reads = ['already there', '猫が好きです。', '猫が好きです。', 'https://example.com'];
    const clipboardReadText = vi.fn(async () => reads.shift() ?? '');
    Object.defineProperty(window, 'api', { value: { clipboardReadText }, configurable: true, writable: true });
    vi.mocked(translateTo).mockResolvedValue('I like cats.');
    await act(async () => controller.setClipboardWatch(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(translateTo).not.toHaveBeenCalled();
    for (let i = 0; i < 3; i += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(CLIPBOARD_WATCH_INTERVAL_MS); });
    }
    expect(translateTo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(translateTo).mock.calls[0][0]).toBe('猫が好きです。');
    expect(controller.input).toBe('猫が好きです。');
    await act(async () => controller.setClipboardWatch(false));
    const before = clipboardReadText.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(CLIPBOARD_WATCH_INTERVAL_MS * 3); });
    expect(clipboardReadText.mock.calls.length).toBe(before);
  });
});

describe('handleTranslateHotkey', () => {
  const key = (over: Partial<Parameters<typeof handleTranslateHotkey>[0]>) => ({
    key: 'm', code: 'KeyM', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false,
    preventDefault: vi.fn(), ...over,
  });
  it('Alt+M mines and Alt+C copies', () => {
    const state = { mineResult: vi.fn(), copyResult: vi.fn() };
    const m = key({});
    expect(handleTranslateHotkey(m, state)).toBe(true);
    expect(state.mineResult).toHaveBeenCalledOnce();
    expect(m.preventDefault).toHaveBeenCalled();
    expect(handleTranslateHotkey(key({ key: 'c', code: 'KeyC' }), state)).toBe(true);
    expect(state.copyResult).toHaveBeenCalledOnce();
  });
  it('leaves IME composition, other chords and plain keys alone', () => {
    const state = { mineResult: vi.fn(), copyResult: vi.fn() };
    expect(handleTranslateHotkey(key({ nativeEvent: { isComposing: true } }), state)).toBe(false);
    expect(handleTranslateHotkey(key({ ctrlKey: true }), state)).toBe(false);
    expect(handleTranslateHotkey(key({ altKey: false }), state)).toBe(false);
    expect(handleTranslateHotkey(key({ key: 'x', code: 'KeyX' }), state)).toBe(false);
    expect(state.mineResult).not.toHaveBeenCalled();
  });
});
