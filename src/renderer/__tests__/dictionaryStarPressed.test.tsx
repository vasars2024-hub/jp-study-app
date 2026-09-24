// @vitest-environment jsdom
//
// D165: the Flashcards star is a toggle, and it said so only to a sighted user.
//
// It carried the `on` class, a filled glyph and a `title` that swapped between
// "Save to Flashcards" and "Saved to Flashcards" — three signals, none of them
// programmatic, and a `title` that changes in place is not announced. So a
// screen-reader user could not tell a saved word from an unsaved one, and had no
// way to know their click had landed.
//
// Asserted through the real store rather than a stub: the pressed state has to
// follow what `savedWords` actually holds, not a local flag that happens to flip.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

vi.mock('../components/AnkiSetup', () => ({ default: () => <div className="anki-setup-stub" /> }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';
import { loadClipboardHistory } from '../clipboardHistory';
import { loadSaved, savedWordsKey } from '../savedWords';

const ENTRY = {
  word: '食べる',
  reading: 'たべる',
  isCommon: true,
  jlpt: [] as string[],
  senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'] }],
};

function stubApi(): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => ({ query: '食べる', entries: [ENTRY] }) as DictResult),
    lookupChinese: vi.fn(async () => ({ query: '', entries: [] }) as DictResult),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    ankiMineNote: vi.fn(async () => ({ ok: true, noteId: 1 })),
    searchExamples: vi.fn(async () => ({ query: '', examples: [] })),
    dictConjugation: vi.fn(async () => ({ query: '', forms: [] })),
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  stubApi();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

/** The star, not the clipboard button that shares its class. */
function star(): HTMLButtonElement {
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('.dict-star')];
  const found = buttons.find((b) => (b.getAttribute('title') ?? '').includes('Flashcards'));
  if (!found) throw new Error(`no Flashcards star among ${buttons.length} .dict-star buttons`);
  return found;
}

describe('the Flashcards star', () => {
  it('exposes its saved state, not only its appearance', async () => {
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);

    expect(star().getAttribute('aria-pressed')).toBe('false');

    await act(async () => star().click());

    expect(star().getAttribute('aria-pressed')).toBe('true');
    // A star is a deck card now (savedWords.ts), not a row in a third store.
    expect(loadSaved()).toEqual([expect.objectContaining({ word: '食べる' })]);
  });

  it('follows the store back down when the word is unsaved again', async () => {
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);
    await act(async () => star().click());
    expect(star().getAttribute('aria-pressed')).toBe('true');

    await act(async () => star().click());

    expect(star().getAttribute('aria-pressed')).toBe('false');
    expect(loadSaved()).toEqual([]);
  });

  it('starts pressed for a word that was already saved before this render', async () => {
    localStorage.setItem(
      savedWordsKey('ja'),
      JSON.stringify([{ word: '食べる', reading: 'たべる', meaning: 'to eat', addedAt: 1 }]),
    );

    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);

    expect(star().getAttribute('aria-pressed')).toBe('true');
  });
});

describe('dictionary clipboard copy', () => {
  it('reports a rejected clipboard write and records no false history entry', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard locked'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);
    const copy = host.querySelector<HTMLButtonElement>('[title="dict.results.copyClipboard"]');
    expect(copy).not.toBeNull();
    await act(async () => copy?.click());
    expect(writeText).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('dict.results.copyFailed');
    expect(loadClipboardHistory()).toEqual([]);
  });
});
