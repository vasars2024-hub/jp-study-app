// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../components/DictionaryResults', () => ({
  default: ({ query }: { query: string }) => <div data-testid="dictionary-results">{query}</div>,
}));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string, vars?: { kind?: string }) => vars?.kind ? `${key}:${vars.kind}` : key }),
}));

import LexiconWorkbenchResults from '../components/lexicon/LexiconWorkbenchResults';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('LexiconWorkbenchResults', () => {
  it('keeps lexical input on the full dictionary surface', async () => {
    const lookup = vi.fn();
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<LexiconWorkbenchResults query="猫" lang="ja" lookupAttempt={1} />));
    expect(host.querySelector('[data-testid="dictionary-results"]')?.textContent).toBe('猫');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('renders grounded offline interlinear rows for sentence-scale input', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫を見た。', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 2, matchedCount: 1,
      truncated: false,
      parts: [
        { kind: 'token', text: '猫', start: 0, end: 1, match: { reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] } },
        { kind: 'token', text: 'を見た', start: 1, end: 4 },
        { kind: 'separator', text: '。', start: 4, end: 5 },
      ],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={2} />);
      await Promise.resolve();
    });
    expect(lookup).toHaveBeenCalledWith('猫を見た。', { sourceLangs: ['ja'], glossLangs: ['en'] });
    expect(host.querySelector('.lexicon-interlinear-flow')?.textContent).toContain('猫catを見た。');
    expect(host.querySelector('ruby.is-grounded')?.textContent).toContain('cat');
  });
});
