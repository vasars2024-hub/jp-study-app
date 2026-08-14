// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictEntry, DictResult } from '../../shared/types';

// The frequency badge is the whole subject, so the panel's incidental
// neighbours are stubbed exactly as the example-credit test stubs them.
vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';

function entry(extra: Partial<DictEntry>): DictEntry {
  return {
    word: '本',
    reading: 'ほん',
    isCommon: true,
    jlpt: ['N5'],
    senses: [{ partsOfSpeech: ['n'], definitions: ['book'], tags: [] }],
    ...extra,
  };
}

function stubApi(entries: DictEntry[]): void {
  const result: DictResult = { query: '本', entries };
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: '本', examples: [] })),
  };
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

function badge(): HTMLElement | null {
  return host.querySelector('.dict-badge.freq');
}

describe('Corpus frequency attribution', () => {
  it('names the list a rank came from', async () => {
    stubApi([entry({ frequency: 357, frequencySource: 'JPDB v2.2' })]);
    await render(<DictionaryResults query="本" variant="page" lang="ja" />);

    expect(badge()?.textContent).toContain('#357');
    expect(host.querySelector('.dict-freq-source')?.textContent).toBe('JPDB v2.2');
    // The source reaches the interpolated key, not a hand-built literal.
    expect(badge()?.getAttribute('title')).toBe('dict.results.freqTitleSourced:JPDB v2.2');
  });

  it('shows the rank unattributed rather than naming a source it does not have', async () => {
    stubApi([entry({ frequency: 357 })]);
    await render(<DictionaryResults query="本" variant="page" lang="ja" />);

    expect(badge()?.textContent).toContain('#357');
    expect(host.querySelector('.dict-freq-source')).toBeNull();
    expect(badge()?.getAttribute('title')).toBe('dict.results.freqTitle');
  });

  it('renders no badge at all when the dictionaries ranked nothing', async () => {
    stubApi([entry({})]);
    await render(<DictionaryResults query="本" variant="page" lang="ja" />);

    expect(badge()).toBeNull();
    expect(host.querySelector('.dict-freq-source')).toBeNull();
  });

  it('attributes each entry to its own list', async () => {
    stubApi([
      entry({ frequency: 357, frequencySource: 'JPDB v2.2' }),
      entry({ word: '書物', reading: 'しょもつ', frequency: 12000, frequencySource: 'BCCWJ' }),
    ]);
    await render(<DictionaryResults query="本" variant="page" lang="ja" />);

    const sources = [...host.querySelectorAll('.dict-freq-source')].map((n) => n.textContent);
    expect(sources).toEqual(['JPDB v2.2', 'BCCWJ']);
  });
});
