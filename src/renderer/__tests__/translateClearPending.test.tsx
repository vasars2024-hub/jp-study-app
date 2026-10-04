// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../translator', () => ({ translateTo: vi.fn(), onModelProgress: vi.fn() }));
vi.mock('../notebookTimeline', () => ({ appendNotebookEvent: vi.fn(), saveTranslationNote: vi.fn() }));
vi.mock('../translationHistory', () => ({
  appendTranslationHistory: vi.fn(), loadTranslationHistory: () => [],
  onTranslationHistoryChanged: () => () => undefined,
  clearTranslationHistory: vi.fn(), removeTranslationHistory: vi.fn(),
}));
vi.mock('../components/ui', () => ({ confirmDialog: vi.fn() }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

import { translateTo, onModelProgress } from '../translator';
import { appendTranslationHistory } from '../translationHistory';
import { useTranslate, type TranslateController } from '../components/translate/TranslateContent';

let root: Root;
let controller: TranslateController;
function Harness() { controller = useTranslate(); return null; }

beforeEach(async () => {
  vi.resetAllMocks();
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  await act(async () => controller.setInput('猫'));
});

afterEach(async () => { await act(async () => root.unmount()); });

it.each(['resolve', 'reject'] as const)('keeps a cleared pane empty when the pending translation %ss', async (outcome) => {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  vi.mocked(translateTo).mockReturnValue(new Promise<string>((yes, no) => { resolve = yes; reject = no; }));
  const unsubscribe = vi.fn();
  vi.mocked(onModelProgress).mockReturnValue(unsubscribe);
  let pending!: Promise<void>;
  await act(async () => { pending = controller.run(); });
  await act(async () => controller.clear());
  expect(unsubscribe).toHaveBeenCalledOnce();
  await act(async () => {
    vi.mocked(translateTo).mock.calls[0][3]?.(0.5);
    if (outcome === 'resolve') resolve('cat');
    else reject(new Error('late failure'));
    await pending;
  });
  expect(controller).toMatchObject({ input: '', output: '', translatedInput: '', error: '', msg: '', state: 'idle', busy: false });
  expect(appendTranslationHistory).not.toHaveBeenCalled();
});

it('keeps the new translation subscription and result after clearing an older request', async () => {
  let resolveOld!: (value: string) => void;
  let resolveNew!: (value: string) => void;
  vi.mocked(translateTo)
    .mockReturnValueOnce(new Promise<string>((resolve) => { resolveOld = resolve; }))
    .mockReturnValueOnce(new Promise<string>((resolve) => { resolveNew = resolve; }));
  const unsubscribeNew = vi.fn();
  vi.mocked(onModelProgress).mockReturnValueOnce(vi.fn()).mockReturnValueOnce(unsubscribeNew);
  let oldRequest!: Promise<void>;
  let newRequest!: Promise<void>;
  await act(async () => { oldRequest = controller.run(); });
  await act(async () => controller.clear());
  await act(async () => controller.setInput('犬'));
  await act(async () => { newRequest = controller.run(); });
  await act(async () => { resolveOld('cat'); await oldRequest; });
  expect(controller.busy).toBe(true);
  expect(controller.output).toBe('');
  expect(unsubscribeNew).not.toHaveBeenCalled();
  await act(async () => { resolveNew('dog'); await newRequest; });
  expect(controller).toMatchObject({ output: 'dog', translatedInput: '犬', state: 'done' });
  expect(unsubscribeNew).toHaveBeenCalledOnce();
  expect(appendTranslationHistory).toHaveBeenCalledOnce();
});
