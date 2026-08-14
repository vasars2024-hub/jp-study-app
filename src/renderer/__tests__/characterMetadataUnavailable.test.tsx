// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

// The subject is the gating around the character panel, so the panel itself is
// stubbed to a marker: these tests care which of the two renders, not what the
// grounded panel puts inside itself.
vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({
  default: () => <div className="stub-character-panel" />,
}));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';

const ENTRY = {
  word: '猫',
  reading: 'ねこ',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['n'], definitions: ['cat'] }],
};

function stubApi(result: DictResult): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: result.query, examples: [] })),
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

const note = () => host.querySelector('.lexicon-character-unavailable');
const panel = () => host.querySelector('.stub-character-panel');

describe('Ungrounded character lookup', () => {
  it('explains the gap when a one-character lookup has no character facts', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    expect(panel()).toBeNull();
    const shown = note();
    expect(shown).not.toBeNull();
    // The looked-up character is named, so the note cannot be mistaken for a
    // global failure, and the route to fix it is spelled out.
    expect(shown?.textContent).toContain('lexicon.character.unavailable:猫');
    expect(host.querySelector('.lexicon-character-unavailable-hint')?.textContent)
      .toContain('lexicon.character.unavailable.hint:');
  });

  it('stays silent for a multi-character lookup, which has no character panel at all', async () => {
    stubApi({ query: '猫が好き', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫が好き" variant="page" lang="ja" />);

    expect(panel()).toBeNull();
    expect(note()).toBeNull();
  });

  it('yields to the grounded panel when character facts do exist', async () => {
    stubApi({
      query: '猫',
      entries: [ENTRY],
      character: {
        lang: 'ja', char: '猫', strokes: 11, components: [], readings: [], meanings: [],
        sources: [{ dictId: 'kanjidic', dictTitle: 'KANJIDIC2' }],
      },
    } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    expect(panel()).not.toBeNull();
    expect(note()).toBeNull();
  });
});
