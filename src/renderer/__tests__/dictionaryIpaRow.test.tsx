// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictEntry, DictResult } from '../../shared/types';

// IPA from an installed IPA dictionary is shown next to pitch, and only when
// the entry carries some. The panel's incidental neighbours are stubbed exactly
// as the frequency-attribution test stubs them.
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

function ipaRow(): HTMLElement | null {
  return host.querySelector('.dict-ipa');
}

describe('IPA in dictionary results', () => {
  it('shows every transcription under the IPA label', async () => {
    stubApi([entry({ ipa: ['[ho̞ɴ]', '[hoɴ]'], pitchHtml: '<span>ほん</span>' })]);
    await render(<DictionaryResults query="本" variant="page" lang="ja" />);
    const row = ipaRow();
    expect(row?.querySelector('.dict-pitch-label')?.textContent).toBe('dict.results.ipa');
    expect(row?.querySelector('.dict-ipa-text')?.textContent).toBe('[ho̞ɴ] / [hoɴ]');
    // Next to pitch: the pitch row comes first, then IPA.
    const rows = [...host.querySelectorAll('.dict-pitch')];
    expect(rows.indexOf(row as Element)).toBe(rows.findIndex((el) => !el.classList.contains('dict-ipa')) + 1);
  });

  it('renders nothing when the entry has no IPA', async () => {
    stubApi([entry({}), entry({ word: '猫', reading: 'ねこ', ipa: [] })]);
    await render(<DictionaryResults query="本" variant="page" lang="ja" />);
    expect(ipaRow()).toBeNull();
  });
});
