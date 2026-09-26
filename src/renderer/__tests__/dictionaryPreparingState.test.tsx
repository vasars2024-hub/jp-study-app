// @vitest-environment jsdom
//
// A lookup made while the offline dictionary is still being imported says so
// (with the import's progress) instead of "no match", and a failed online
// fallback is a translated sentence, never the raw "Jisho returned 403".
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

vi.mock('../components/AnkiSetup', () => ({ default: () => <div className="anki-setup-stub" /> }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key), lang: 'en' }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';
import { DICT_LOOKUP_LIMIT } from '../../shared/dictionaryLookup';

function stubApi(resultFor: (limit: number) => DictResult): { limits: number[] } {
  const limits: number[] = [];
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async (_q: string, limit?: number) => {
      limits.push(limit ?? -1);
      return resultFor(limit ?? DICT_LOOKUP_LIMIT);
    }),
    lookupChinese: vi.fn(async () => ({ query: '', entries: [] }) as DictResult),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    ankiMineNote: vi.fn(async () => ({ ok: true, noteId: 1 })),
    searchExamples: vi.fn(async () => ({ query: '', examples: [] })),
    dictConjugation: vi.fn(async () => ({ query: '', forms: [] })),
  };
  return { limits };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

describe('a lookup during the first dictionary import', () => {
  it('says the dictionary is being prepared, with its progress, not "no match"', async () => {
    stubApi(() => ({ query: '猫', entries: [], preparing: { percent: 37 } }) as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    expect(host.textContent).toContain('dict.results.preparingPercent {"percent":37}');
    expect(host.textContent).not.toContain('dict.results.noMatch');
  });

  it('says so without a number before the import has reported one', async () => {
    stubApi(() => ({ query: '猫', entries: [], preparing: { percent: null } }) as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    expect(host.textContent).toContain('dict.results.preparing');
    expect(host.textContent).not.toContain('percent');
  });
});

describe('a failed online fallback', () => {
  it('shows the translated reason, never the raw service error', async () => {
    stubApi(() => ({ query: 'おはよう', entries: [], error: 'Jisho returned 403', errorCode: 'unavailable' }) as DictResult);
    await render(<DictionaryResults query="おはよう" variant="page" lang="ja" />);
    expect(host.textContent).toContain('dict.lookup.unavailable');
    expect(host.textContent).not.toContain('403');
  });
});
