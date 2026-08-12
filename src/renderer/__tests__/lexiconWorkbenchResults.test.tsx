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

  it('lets the user override an ambiguous automatic lens', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫', detectedLangs: ['ja'], glossLangs: ['en'], tokenCount: 1, matchedCount: 0,
      truncated: false, parts: [{ kind: 'token', text: '猫', start: 0, end: 1 }],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<LexiconWorkbenchResults query="猫" lang="ja" lookupAttempt={1} />));
    const translate = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'lexicon.lens.interlinear');
    await act(async () => {
      translate?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(lookup).toHaveBeenCalledWith('猫', { sourceLangs: ['ja'], glossLangs: ['en'] });
    expect(host.querySelector('[data-testid="dictionary-results"]')).toBeNull();
  });

  it('lets the Translate compatibility route pin its lens and target gloss language', async () => {
    const lookup = vi.fn().mockResolvedValue({
      text: '猫', detectedLangs: ['ja'], glossLangs: ['ru'], tokenCount: 1, matchedCount: 0,
      truncated: false,
      parts: [{ kind: 'token', text: '猫', start: 0, end: 1 }],
    });
    Object.defineProperty(window, 'api', { configurable: true, value: { lookupOfflineInterlinear: lookup } });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <LexiconWorkbenchResults
          query="猫"
          lang="ja"
          glossLang="ru"
          lookupAttempt={0}
          lens="translate"
        />,
      );
      await Promise.resolve();
    });
    expect(lookup).toHaveBeenCalledWith('猫', { sourceLangs: ['ja'], glossLangs: ['ru'] });
    expect(host.querySelector('.lexicon-interlinear-flow')?.textContent).toBe('猫');
    expect(host.querySelector('[data-testid="dictionary-results"]')).toBeNull();
  });

  it('has a real catalog string for every lens label and overridable scale', async () => {
    const { en } = await import('../../shared/i18n/catalogs/en');
    const keys = [
      'lexicon.lens.group',
      'lexicon.lens.auto',
      'lexicon.lens.lookup',
      'lexicon.lens.interlinear',
      // A manual lens sends character/word input through the interlinear meta line.
      'lexicon.kind.character',
      'lexicon.kind.word',
      'lexicon.kind.sentence',
      'lexicon.kind.paragraph',
      'lexicon.kind.document',
    ];
    const catalog = en as Record<string, string>;
    expect(keys.filter((key) => !catalog[key])).toEqual([]);
  });
});
