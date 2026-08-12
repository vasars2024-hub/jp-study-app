// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  take: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  setInput: vi.fn(),
  setTab: vi.fn(),
}));

vi.mock('../lexiconHandoffClient', () => ({
  takeLexiconHandoff: mocks.take,
  onLexiconHandoffStaged: mocks.subscribe,
}));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/SentenceAnalysisPanel', () => ({ default: () => null }));
vi.mock('../components/lexicon/LexiconWorkbenchResults', () => ({ default: () => null }));
vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
  Toolbar: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ToolbarSpacer: () => null,
  useAeroMaterials: () => false,
}));
vi.mock('../components/translate/TranslateContent', () => ({
  LANG_LABELS: { ja: 'Japanese', en: 'English' },
  LANG_ORDER: ['ja', 'en'],
  PLACEHOLDERS: { ja: '', en: '' },
  TranslateHistoryList: () => null,
  useTranslate: () => ({
    tab: 'translate', source: 'ja', target: 'en', input: '', output: '', msg: '', error: '',
    busy: false, state: 'idle', run: vi.fn(), swap: vi.fn(), clear: vi.fn(),
    pickSource: vi.fn(), pickTarget: vi.fn(), setInput: mocks.setInput, setTab: mocks.setTab,
  }),
}));

import TranslateView from '../views/TranslateView';

afterEach(() => {
  mocks.take.mockReset();
  mocks.subscribe.mockClear();
  mocks.setInput.mockClear();
  mocks.setTab.mockClear();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('Translate Lexicon handoff receiver', () => {
  it('claims only the translate lens and puts a sentence into the active Workbench', async () => {
    window.history.replaceState(null, '', '/?popout=translate');
    mocks.take.mockResolvedValue({
      ok: true,
      handoff: { text: '今日は寒いですね。', kind: 'sentence', lens: 'translate' },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => root.render(<TranslateView />));
    await act(async () => undefined);

    expect(mocks.take).toHaveBeenCalledWith('translate');
    expect(mocks.setTab).toHaveBeenCalledWith('translate');
    expect(mocks.setInput).toHaveBeenCalledWith('今日は寒いですね。');
    await act(async () => root.unmount());
  });
});
