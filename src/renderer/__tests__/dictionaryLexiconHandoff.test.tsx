// @vitest-environment jsdom
import { StrictMode, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  take: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
}));

vi.mock('../lexiconHandoffClient', () => ({
  takeLexiconHandoff: bridge.take,
  onLexiconHandoffStaged: bridge.subscribe,
}));

vi.mock('../components/DictionaryResults', () => ({
  default: ({ query }: { query: string }) => <div data-testid="dictionary-results">{query}</div>,
}));

vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
}));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock('../studyEnvironment', () => ({
  STUDY_LANG_KEY: 'jp-study-language',
  getStudyLang: () => 'ja',
  setStudyLang: () => undefined,
  onStudyLangChanged: () => () => undefined,
}));

import DictionaryView from '../views/DictionaryView';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  bridge.take.mockReset();
  bridge.subscribe.mockClear();
});

describe('Dictionary Lexicon handoff receiver', () => {
  it('keeps the first single-use claim through the StrictMode effect replay', async () => {
    let resolveFirst!: (value: unknown) => void;
    bridge.take
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue({ ok: true, handoff: null });

    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<StrictMode><DictionaryView /></StrictMode>);
    });
    expect(bridge.take).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveFirst({
        ok: true,
        handoff: {
          route: 'lexicon',
          text: '食べる',
          kind: 'word',
          lens: 'lookup',
          source: 'screen',
          sourceLabel: 'screen',
          stagedAt: 10,
        },
      });
      await Promise.resolve();
    });

    expect(host.querySelector<HTMLInputElement>('.dict-search input')?.value).toBe('食べる');
    expect(host.querySelector('[data-testid="dictionary-results"]')?.textContent).toBe('食べる');
  });
});
