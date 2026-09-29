// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ aero: false, run: vi.fn() }));

vi.mock('../components/translate/TranslateContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/translate/TranslateContent')>();
  return {
    ...actual,
    useTranslate: () => ({ ...actual.useTranslate(), input: '日本語', run: state.run }),
  };
});
vi.mock('../components/SentenceAnalysisPanel', () => ({ default: () => null }));
vi.mock('../components/lexicon/LexiconWorkbenchResults', () => ({ default: () => null }));
vi.mock('../lexiconHandoffClient', () => ({
  takeLexiconHandoff: vi.fn(async () => ({ ok: true, handoff: null })),
  onLexiconHandoffStaged: vi.fn(() => () => undefined),
}));
vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
  Toolbar: ({ children }: { children: ReactNode }) => <>{children}</>,
  ToolbarSpacer: () => null,
  useAeroMaterials: () => state.aero,
}));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

import TranslateView from '../views/TranslateView';

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  state.run.mockClear();
  document.body.replaceChildren();
});

describe.each([false, true])('Translate keyboard submission (Aero: %s)', (aero) => {
  async function mount() {
    state.aero = aero;
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root?.render(<TranslateView />));
    return host.querySelector('textarea')!;
  }

  it.each([{ ctrlKey: true }, { metaKey: true }])('submits once without inserting a newline: %j', async (modifier) => {
    const input = await mount();
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...modifier });
    await act(async () => { input.dispatchEvent(event); });
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])('leaves IME confirmation alone: %j', async (composition) => {
    const input = await mount();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true, ...modifier, ...composition,
      });
      await act(async () => { input.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(state.run).not.toHaveBeenCalled();
  });

  it('keeps plain Enter available for multiline text', async () => {
    const input = await mount();
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(event); });
    expect(state.run).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
